import { Plugin, PluginSettingTab, Modal, Notice, Setting } from 'obsidian';

const DEFAULT_MAX_RESULTS = 200;
const TAG_NAME = /^(?=.*[\p{L}_-])[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u;

function normalizeTag(value) {
  const display = String(value ?? '').trim().replace(/^#/, '');
  return TAG_NAME.test(display) ? { key: display.toLowerCase(), display } : null;
}

// Keep original line numbers and fence state for paragraph and section extraction.
function bodyLines(text) {
  const lines = text.split(/\r?\n/);
  let start = 0;
  if (/^\uFEFF?---[ \t]*$/.test(lines[0])) {
    const end = lines.findIndex((line, index) => index > 0 && /^---[ \t]*$/.test(line));
    if (end !== -1) start = end + 1;
  }

  let fence = null;
  return lines.slice(start).map((text, index) => {
    const marker = /^ {0,3}(~{3,}|`{3,})(.*)$/.exec(text);
    const fenced = Boolean(fence || marker);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
      }
    }
    return { text, line: start + index, fenced };
  });
}

function tagsOnLine(text) {
  const tags = [];
  const pattern = /(?:^|[^\p{L}\p{N}_/#-])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)(?![\p{L}\p{N}_/-])/gu;
  for (const match of text.matchAll(pattern)) {
    const tag = normalizeTag(match[1]);
    if (tag) {
      const from = match.index + match[0].length - match[1].length - 1;
      tags.push({ ...tag, from, to: from + match[1].length + 1 });
    }
  }
  return tags;
}

function extractTags(text) {
  return bodyLines(text).flatMap(({ text, fenced }) =>
    fenced ? [] : tagsOnLine(text).map(({ key, display }) => ({ key, display }))
  );
}

function matchesTag(candidate, query) {
  return candidate === query || (!query.includes('/') && candidate.startsWith(query + '/'));
}

function paragraphBlocks(lines) {
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (!line.text.trim()) {
      current = [];
      continue;
    }
    if (!line.fenced && /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line.text)) {
      blocks.push([line]);
      current = [];
      continue;
    }
    if (!current.length) blocks.push(current);
    current.push(line);
  }
  return blocks;
}

function paragraphResult(lines) {
  return { text: lines.map(({ text }) => text).join('\n'), line: lines[0].line };
}

function splitParagraphs(text) {
  return paragraphBlocks(bodyLines(text)).map(paragraphResult);
}

function findParagraphsForTag(text, tag) {
  const query = normalizeTag(tag);
  if (!query) return [];
  return paragraphBlocks(bodyLines(text))
    .filter((lines) => lines.some(({ text, fenced }) =>
      !fenced && tagsOnLine(text).some(({ key }) => matchesTag(key, query.key))
    ))
    .map(paragraphResult);
}

function sectionRanges(text) {
  const lines = bodyLines(text);
  // A final newline terminates the last line without adding another content line.
  if (lines.at(-1)?.text === '') lines.pop();

  const ranges = [];
  const active = [];
  const owners = [];
  for (const [index, record] of lines.entries()) {
    const heading = !record.fenced && /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(record.text);
    if (heading) {
      if (active.at(-1)?.level === null) active.pop().end = index - 1;
      const level = heading[1].length;
      while (active.length && active.at(-1).level >= level) {
        active.pop().end = index - 1;
      }
      const title = (heading[2] ?? '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
      active.push({ heading: title, level, start: index, end: lines.length - 1 });
      ranges.push(active.at(-1));
    } else if (!ranges.length && record.text.trim()) {
      active.push({ heading: null, level: null, start: index, end: lines.length - 1 });
      ranges.push(active.at(-1));
    }
    owners.push(active.slice());
  }
  return { lines, ranges, owners };
}

function sectionResult(lines, { heading, level, start, end }) {
  return {
    heading,
    level,
    line: lines[start].line,
    endLine: lines[end].line,
    text: lines.slice(start, end + 1).map(({ text }) => text).join('\n'),
  };
}

function extractSections(text) {
  const { lines, ranges } = sectionRanges(text);
  return ranges.map((range) => sectionResult(lines, range));
}

function findSectionsForTag(text, tag) {
  const query = normalizeTag(tag);
  if (!query) return [];
  const { lines, ranges, owners } = sectionRanges(text);
  for (const [index, { text, line, fenced }] of lines.entries()) {
    if (fenced || !tagsOnLine(text).some(({ key }) => matchesTag(key, query.key))) continue;
    const containing = owners[index];
    // A nested-only match belongs to its nearest heading.
    containing.at(-1).matched = true;
    for (const range of containing) range.tagLine ??= line;
  }
  return ranges.filter(({ matched }) => matched)
    .map((range) => ({ ...sectionResult(lines, range), tagLine: range.tagLine }));
}

async function searchVaultForTag(files, tag, {
  limit = Infinity, onReadError = (_file, _error) => {}, mode = 'paragraphs',
} = {}) {
  const extract = mode === 'sections' ? findSectionsForTag : findParagraphsForTag;
  const resultKey = mode === 'sections' ? 'sections' : 'paragraphs';
  const results = [];
  let remaining = limit;
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of ordered) {
    if (remaining <= 0) break;
    let text;
    try {
      text = await file.read();
    } catch (error) {
      onReadError(file, error);
      continue;
    }
    const matches = extract(text, tag).slice(0, remaining);
    if (matches.length) {
      results.push({ file, path: file.path, [resultKey]: matches });
      remaining -= matches.length;
    }
  }
  return results;
}

class TagResultsModal extends Modal {
  plugin: TagLensPlugin;
  tag: string;
  closed: boolean;
  loading: Promise<void>;
  constructor(plugin, tag) {
    super(plugin.app);
    this.plugin = plugin;
    this.tag = tag;
    this.closed = false;
  }

  onOpen() {
    this.contentEl.addClass('tag-lens-reader');
    this.contentEl.createEl('h2', { text: '#' + this.tag, cls: 'tag-lens-chip' });
    this.contentEl.createEl('p', { text: 'Reading vault notes...' });
    this.loading = this.loadResults();
  }

  async loadResults() {
    try {
      const { results, skipped, mode } = await this.plugin.search(this.tag);
      if (this.closed) return;
      const content = this.contentEl;
      content.empty();
      const sectionMode = mode === 'sections';
      const noun = sectionMode ? 'section' : 'paragraph';
      const count = results.reduce((total, group) => total + group[mode].length, 0);
      const title = content.createEl('h2');
      title.createSpan({ text: '#' + this.tag, cls: 'tag-lens-chip' });
      title.createSpan({
        text: ' - ' + count + ' ' + noun + (count === 1 ? ' in ' : 's in ') +
          results.length + (results.length === 1 ? ' note' : ' notes'),
      });
      const list = content.createDiv({ cls: 'tag-lens-results' });
      if (!count) list.createEl('p', { text: 'No matching ' + noun + 's.' });
      for (const { file, path, [mode]: matches } of results) {
        const group = list.createEl('section', { cls: 'tag-lens-group' });
        group.createEl('h3', { text: path });
        for (const match of matches) {
          const line = sectionMode ? match.tagLine : match.line;
          const result = group.createEl('article', { cls: 'tag-lens-result' });
          if (sectionMode) result.createEl('h4', { text: match.heading ?? '(no heading)' });
          result.createEl('p', { text: match.text, cls: 'tag-lens-paragraph' });
          const link = result.createEl('a', {
            text: path + ' | line ' + (line + 1),
            attr: { href: '#' },
          });
          link.addEventListener('click', (event) => {
            event.preventDefault();
            this.close();
            void this.plugin.openSource(file.source, line);
          });
        }
      }
      if (skipped > 0) {
        content.createEl('p', {
          cls: 'tag-lens-footer',
          text: skipped + (skipped === 1 ? ' note could not be read.' : ' notes could not be read.'),
        });
      }
    } catch {
      if (this.closed) return;
      this.contentEl.empty();
      this.contentEl.createEl('p', { text: 'Tag Lens could not search the vault.' });
    }
  }

  onClose() {
    this.closed = true;
    this.contentEl.empty();
  }
}

class TagPromptModal extends Modal {
  plugin: TagLensPlugin;
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    this.contentEl.createEl('h2', { text: 'Read a tag' });
    const form = this.contentEl.createEl('form', { cls: 'tag-lens-prompt' });
    const input = form.createEl('input', {
      attr: { type: 'text', placeholder: '#project', 'aria-label': 'Tag', required: '' },
    });
    form.createEl('button', { text: 'Read tag', cls: 'mod-cta', attr: { type: 'submit' } });
    input.addEventListener('input', () => input.setCustomValidity(''));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const tag = normalizeTag(input.value);
      if (!tag) {
        input.setCustomValidity('Enter a single tag, such as #project or #project/ideas.');
        input.reportValidity();
        return;
      }
      this.close();
      this.plugin.openReading(tag);
    });
    input.focus();
  }

  onClose() { this.contentEl.empty(); }
}

class TagLensSettingsTab extends PluginSettingTab {
  plugin: TagLensPlugin;
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Whole-section reading')
      .setDesc('Show the full section around a matching tag. Turn off to show paragraphs.')
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.wholeSections)
        .onChange((value) => this.plugin.updateSettings({ wholeSections: value })));
    new Setting(this.containerEl)
      .setName('Maximum results per tag')
      .setDesc('Enter a positive whole number. The default is 200.')
      .addText((input) => input.setValue(String(this.plugin.settings.maxResults))
        .onChange((value) => {
          const maximum = Number(value);
          const valid = /^\d+$/.test(value.trim()) && Number.isSafeInteger(maximum) && maximum > 0;
          input.inputEl.setCustomValidity(valid ? '' : 'Enter a positive whole number.');
          if (!valid) {
            input.inputEl.reportValidity();
            return;
          }
          return this.plugin.updateSettings({ maxResults: maximum });
        }));
  }
}

class TagLensPlugin extends Plugin {
  settings: { wholeSections: boolean; maxResults: number } = { wholeSections: true, maxResults: DEFAULT_MAX_RESULTS };
  saveQueue = Promise.resolve();

  async onload() {
    const stored = await this.loadData();
    const maximum = stored?.maxResults;
    this.settings = {
      wholeSections: stored?.wholeSections !== false,
      maxResults: Number.isSafeInteger(maximum) && maximum > 0 ? maximum : DEFAULT_MAX_RESULTS,
    };
    this.addSettingTab(new TagLensSettingsTab(this));
    this.addCommand({
      id: 'read-tag-under-cursor',
      name: 'Read tag under cursor',
      callback: () => this.readAtCursor(),
    });
    this.addCommand({
      id: 'read-a-tag',
      name: 'Read a tag...',
      callback: () => this.openPrompt(),
    });
    this.registerDomEvent(this.app.workspace.containerEl, 'click', (event) => this.handleClick(event), true);
  }

  updateSettings(changes) {
    Object.assign(this.settings, changes);
    const snapshot = { ...this.settings };
    this.saveQueue = this.saveQueue.then(() => this.saveData(snapshot)).catch(() => {
      new Notice('Tag Lens could not save its settings.');
    });
    return this.saveQueue;
  }

  readAtCursor() {
    const editor = this.app.workspace.activeEditor?.editor;
    if (editor) {
      const cursor = editor.getCursor();
      const line = bodyLines(editor.getValue()).find(({ line }) => line === cursor.line);
      const tag = line && !line.fenced && tagsOnLine(line.text)
        .find(({ from, to }) => from <= cursor.ch && cursor.ch <= to);
      if (tag) return this.openReading(tag);
    }
    return this.openPrompt();
  }

  handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey) return;
    try {
      const target = event.target;
      const link = target?.closest?.('a.tag');
      let rawTag;
      if (link?.closest('.markdown-preview-view')) {
        rawTag = link.getAttribute('href');
        if (!rawTag?.startsWith('#')) return;
      } else {
        const span = target?.closest?.('.cm-hashtag');
        if (!span?.closest('.markdown-source-view')) return;
        // Live Preview can render the hash and name as adjacent spans.
        let first = span;
        while (!first.classList.contains('cm-hashtag-begin') &&
               first.previousSibling?.classList?.contains('cm-hashtag')) first = first.previousSibling;
        rawTag = first.textContent;
        while (!first.classList.contains('cm-hashtag-end') &&
               first.nextSibling?.classList?.contains('cm-hashtag') &&
               !first.nextSibling.classList.contains('cm-hashtag-begin')) {
          first = first.nextSibling;
          rawTag += first.textContent;
        }
      }
      const tag = normalizeTag(rawTag);
      if (!tag) return;
      this.openReading(tag);
      event.preventDefault();
      event.stopPropagation();
    } catch {
      // Leave Obsidian's click behavior available if the reading modal fails to open.
    }
  }

  openPrompt() { new TagPromptModal(this).open(); }

  openReading(tag) { new TagResultsModal(this, tag.display).open(); }

  async search(tag) {
    const vault = this.app.vault;
    let skipped = 0;
    const files = vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      source: file,
      read: () => vault.read(file),
    }));
    const mode = this.settings.wholeSections ? 'sections' : 'paragraphs';
    const results = await searchVaultForTag(files, tag, {
      mode,
      limit: this.settings.maxResults,
      onReadError: () => { skipped++; },
    });
    return { results, skipped, mode };
  }

  async openSource(file, line) {
    try {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file, { eState: { line } });
    } catch {
      new Notice('Tag Lens could not open the source note.');
    }
  }
}

module.exports = TagLensPlugin;
module.exports.__test = { extractTags, splitParagraphs, findParagraphsForTag, extractSections, findSectionsForTag, searchVaultForTag };
