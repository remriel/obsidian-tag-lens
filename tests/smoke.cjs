const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeElement {
  constructor(tag, options = {}) {
    this.tag = tag;
    this.text = options.text || '';
    this.children = [];
    this.handlers = {};
  }
  empty() { this.children = []; }
  addClass() {}
  focus() {}
  createEl(tag, options) {
    const child = new FakeElement(tag, options);
    this.children.push(child);
    return child;
  }
  createDiv(options) { return this.createEl('div', options); }
  createSpan(options) { return this.createEl('span', options); }
  addEventListener(type, handler) { this.handlers[type] = handler; }
}

let lastModal;
class Modal {
  constructor() { this.contentEl = new FakeElement('root'); }
  open() { lastModal = this; this.onOpen(); }
  close() { this.onClose(); }
}

class Plugin {
  constructor(app) { this.app = app; this.commands = []; }
  async loadData() { return null; }
  async saveData(data) { this.saved = data; }
  addCommand(command) { this.commands.push(command); }
  addSettingTab() {}
  registerDomEvent(element, name, handler, capture) {
    assert.equal(element, this.app.workspace.containerEl);
    assert.equal(name, 'click');
    assert.equal(capture, true);
    this.click = handler;
  }
}

const obsidian = { Plugin, Modal, PluginSettingTab: class {}, Setting: class {}, Notice: class {} };
const originalLoad = Module._load;
let TagLens;
try {
  Module._load = function (request, parent, isMain) {
    return request === 'obsidian' ? obsidian : originalLoad.call(this, request, parent, isMain);
  };
  TagLens = require('../main.js');
} finally {
  Module._load = originalLoad;
}

const {
  extractTags, splitParagraphs, findParagraphsForTag,
  extractSections, findSectionsForTag, searchVaultForTag,
} = TagLens.__test;

function flatten(element) {
  return [element, ...element.children.flatMap(flatten)];
}

async function run() {
  const note = [
    '---', 'tags: [#hidden]', '---', '# Heading #A/B',
    'First #a/b and #a/b/c', 'continues', '', '- One #a', '- Two', '',
    '~~~md', '#a', '', '#a/b', '~~~', '', 'Final #another',
  ].join('\r\n');
  assert.deepEqual(extractTags(note), [
    { key: 'a/b', display: 'A/B' }, { key: 'a/b', display: 'a/b' },
    { key: 'a/b/c', display: 'a/b/c' }, { key: 'a', display: 'a' },
    { key: 'another', display: 'another' },
  ]);
  assert.deepEqual(splitParagraphs(note).slice(0, 3), [
    { text: '# Heading #A/B', line: 3 },
    { text: 'First #a/b and #a/b/c\ncontinues', line: 4 },
    { text: '- One #a\n- Two', line: 7 },
  ]);
  assert.deepEqual(findParagraphsForTag(note, '#A').map(({ line }) => line), [3, 4, 7]);
  assert.deepEqual(findParagraphsForTag(note, 'a/b').map(({ line }) => line), [3, 4]);
  assert.deepEqual(findParagraphsForTag('#a/b/c', 'a/b'), []);
  assert.deepEqual(findParagraphsForTag(note, 'hidden'), []);
  assert.deepEqual(findParagraphsForTag(note, 'missing'), []);
  assert.deepEqual(extractTags('```js\n#hidden\n```\n#Shown'), [{ key: 'shown', display: 'Shown' }]);

  const sectionNote = [
    '---', 'tags: [#hidden]', '---', 'Intro #intro',
    '## Parent', 'First #parent', 'Again #parent', '### Child',
    'Child content #child/sub and #child/sub/deep', '~~~md', '## False #hidden', '~~~',
    '## Peer #peer', 'Peer content #peer', '# Next', 'Next content', '## Empty',
  ].join('\n') + '\n';
  const sections = extractSections(sectionNote);
  assert.deepEqual(sections.map(({ heading, level, line, endLine }) => [heading, level, line, endLine]), [
    [null, null, 3, 3], ['Parent', 2, 4, 11], ['Child', 3, 7, 11],
    ['Peer #peer', 2, 12, 13], ['Next', 1, 14, 16], ['Empty', 2, 16, 16],
  ]);
  assert.equal(sections[1].text, [
    '## Parent', 'First #parent', 'Again #parent', '### Child',
    'Child content #child/sub and #child/sub/deep', '~~~md', '## False #hidden', '~~~',
  ].join('\n'));
  assert.equal(sections[5].text, '## Empty');
  assert.deepEqual(findSectionsForTag(sectionNote, 'parent'), [{ ...sections[1], tagLine: 5 }]);
  assert.deepEqual(findSectionsForTag(sectionNote, '#CHILD'), [{ ...sections[2], tagLine: 8 }]);
  assert.deepEqual(findSectionsForTag(sectionNote, 'child/sub'), [{ ...sections[2], tagLine: 8 }]);
  assert.deepEqual(findSectionsForTag(sectionNote, 'child/other'), []);
  assert.deepEqual(findSectionsForTag('## Parent\n### Child\n#child/sub/deep', 'child/sub'), []);
  assert.deepEqual(findSectionsForTag(sectionNote, 'peer'), [{ ...sections[3], tagLine: 12 }]);
  assert.deepEqual(findSectionsForTag(sectionNote, 'intro'), [{ ...sections[0], tagLine: 3 }]);
  assert.deepEqual(findSectionsForTag(sectionNote, 'hidden'), []);

  const a = { path: 'A.md', read: async () => note };
  const z = { path: 'Z.md', read: async () => '#a' };
  const bad = { path: '0-bad.md', read: async () => { throw new Error('Unavailable'); } };
  const skipped = [];
  const results = await searchVaultForTag([z, bad, a], '#a', {
    limit: 2, onReadError: (file) => skipped.push(file),
  });
  assert.deepEqual(results, [{ file: a, path: 'A.md', paragraphs: findParagraphsForTag(note, 'a').slice(0, 2) }]);
  assert.deepEqual(skipped, [bad]);
  assert.deepEqual(await searchVaultForTag([a], '#missing'), []);

  const sectionA = { path: 'A-section.md', read: async () => sectionNote };
  const sectionZ = { path: 'Z-section.md', read: async () => '# Final #parent\n## Another #parent' };
  let readsAfterCap = 0;
  const unread = { path: 'zz-unread.md', read: async () => { readsAfterCap++; throw new Error('Unexpected read'); } };
  const capped = await searchVaultForTag([unread, sectionZ, sectionA], 'parent', {
    mode: 'sections', limit: 2, onReadError: (file) => skipped.push(file),
  });
  assert.deepEqual(capped, [
    { file: sectionA, path: sectionA.path, sections: [{ ...sections[1], tagLine: 5 }] },
    { file: sectionZ, path: sectionZ.path, sections: findSectionsForTag(await sectionZ.read(), 'parent').slice(0, 1) },
  ]);
  assert.deepEqual(await searchVaultForTag([unread, a], 'a', { mode: 'paragraphs', limit: 1 }), [
    { file: a, path: a.path, paragraphs: findParagraphsForTag(note, 'a').slice(0, 1) },
  ]);
  assert.equal(readsAfterCap, 0);
  assert.deepEqual(skipped, [bad]);

  let opened;
  const workspace = {
    containerEl: {},
    activeEditor: { editor: { getCursor: () => ({ line: 4, ch: 8 }), getValue: () => note } },
    getLeaf: () => ({ openFile: async (...args) => { opened = args; } }),
  };
  const app = { workspace, vault: { getMarkdownFiles: () => [z, bad, a], read: (file) => file.read() } };
  const plugin = new TagLens(app);
  await plugin.onload();
  assert.deepEqual(plugin.commands.map(({ name }) => name), ['Read tag under cursor', 'Read a tag...']);
  assert.deepEqual(plugin.settings, { wholeSections: true, maxResults: 200 });
  app.vault.getMarkdownFiles = () => [sectionZ, sectionA];
  plugin.openReading({ display: 'parent' });
  await lastModal.loading;
  const sectionView = flatten(lastModal.contentEl);
  assert.ok(sectionView.some(({ text }) => text === ' - 3 sections in 2 notes'));
  assert.ok(sectionView.some(({ tag, text }) => tag === 'h4' && text === 'Parent'));
  assert.ok(sectionView.some(({ text }) => text === sections[1].text));
  assert.ok(!sectionView.some(({ text }) => text.includes('could not be read')));
  const sectionSource = sectionView.find(({ tag }) => tag === 'a');
  assert.equal(sectionSource.text, 'A-section.md | line 6');
  sectionSource.handlers.click({ preventDefault() {} });
  assert.deepEqual(opened, [sectionA, { eState: { line: 5 } }]);

  plugin.openReading({ display: 'intro' });
  await lastModal.loading;
  const introView = flatten(lastModal.contentEl);
  assert.ok(introView.some(({ text }) => text === ' - 1 section in 1 note'));
  assert.ok(introView.some(({ tag, text }) => tag === 'h4' && text === '(no heading)'));

  app.vault.getMarkdownFiles = () => [z, bad, a];
  await plugin.updateSettings({ wholeSections: false, maxResults: 1 });
  assert.equal(plugin.saved.maxResults, 1);
  plugin.commands[0].callback();
  await lastModal.loading;
  const rendered = flatten(lastModal.contentEl);
  assert.ok(rendered.some(({ text }) => text === ' - 1 paragraph in 1 note'));
  assert.ok(rendered.some(({ text }) => text === '1 note could not be read.'));
  const source = rendered.find(({ tag }) => tag === 'a');
  source.handlers.click({ preventDefault() {} });
  assert.deepEqual(opened, [a, { eState: { line: 3 } }]);

  plugin.commands[1].callback();
  assert.ok(flatten(lastModal.contentEl).some(({ tag }) => tag === 'form'));
  workspace.activeEditor = null;
  plugin.commands[0].callback();
  assert.ok(flatten(lastModal.contentEl).some(({ tag }) => tag === 'form'));

  let prevented = false;
  let stopped = false;
  const link = { closest: () => ({}), getAttribute: () => '#A' };
  const event = {
    button: 0,
    target: { closest: () => link },
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
  };
  plugin.click(event);
  assert.ok(prevented && stopped);
  await lastModal.loading;
  assert.equal(lastModal.tag, 'A');

  prevented = false;
  plugin.openReading = () => { throw new Error('Cannot open modal'); };
  plugin.click(event);
  assert.equal(prevented, false);

  console.log('Smoke checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
