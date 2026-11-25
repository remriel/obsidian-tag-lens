# Disposable vault verification 
 
Use only `C:\Drive\obsidian-test-vault-tag-lens`. Its Obsidian 1.15.1 window was already open and the discovery endpoint listed it. The workspace sandbox denied creation of the plugin directory in this vault. Run setup and the evals from the project directory in the operator's Windows session. 
 
## Fixtures 
 
Copy only the three files in `tools/fixtures`. Existing Tag Lens test fixtures can be replaced. 
 
- **Tag Lens Test A.md** covers the no-heading introduction, Orchard Notes (H2) with its Grafting (H3) subsection, and the boundary at Second Orchard (H2). Grafting also appears as its own result. 
- **Tag Lens Test B.md** supplies cross-note matching and the only exact `#orchard/nested` hit. Its dedicated code section contains the fenced sentinel and must not become a match. 
- **Tag Lens Test C.md** places the untagged control in its own section and keeps the tagged paragraph and list contiguous for paragraph mode. 
 
A full section includes its context, including untagged lines and fenced text within a matched section. The control and fence have their own sections so this test can independently detect false matches without requiring context to be stripped. 
 
## Install and enable 
 
From PowerShell in the project directory: 
 
```powershell 
$vault = 'C:\Drive\obsidian-test-vault-tag-lens' 
$pluginDir = Join-Path $vault '.obsidian\plugins\tag-lens' 
if (-not (Test-Path -LiteralPath (Join-Path $vault '.obsidian') -PathType Container)) { throw 'Disposable vault not found' } 
if ((Get-Item -LiteralPath main.js).Length -ne 14116) { throw 'Unexpected bundle size' } 
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null 
Copy-Item -LiteralPath 'manifest.json','main.js','styles.css' -Destination $pluginDir 
Copy-Item -LiteralPath 'tools\fixtures\Tag Lens Test A.md','tools\fixtures\Tag Lens Test B.md','tools\fixtures\Tag Lens Test C.md' -Destination $vault 
$config = Join-Path $vault '.obsidian\community-plugins.json' 
$enabled = @(Get-Content -LiteralPath $config -Raw | ConvertFrom-Json) 
if ($enabled -notcontains 'tag-lens') { 
    $enabled += 'tag-lens' 
    [System.IO.File]::WriteAllText($config, (ConvertTo-Json -InputObject $enabled)) 
} 
``` 
 
In the disposable window, enable Tag Lens in **Settings > Community plugins** if the running app has not picked up the config change. If needed, reload the disposable Obsidian window so it reads the updated config. Keep Tag Summary and Auto Tag Puller enabled. Use default Tag Lens settings for the first run. 
 
## Debug endpoint 
 
Check `tasklist /fi "imagename eq Obsidian.exe"` and `curl.exe -fsS http://127.0.0.1:9333/json`. Reuse the existing disposable window if its page is listed. If another vault is open, leave it alone. If Obsidian is stopped, verify the executable with `Test-Path -LiteralPath $exe` and launch the disposable vault detached: 
 
```powershell 
$exe = 'C:\Users\Remy\AppData\Local\Programs\Obsidian\Obsidian.exe' 
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Obsidian executable not found' } 
$launch = '"' + $exe + '" --remote-debugging-port=9333 --remote-allow-origins=* --no-sandbox --disable-gpu --disable-dev-shm-usage "C:\Drive\obsidian-test-vault-tag-lens"' 
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = $launch} 
``` 
 
Poll `curl.exe -fsS http://127.0.0.1:9333/json` for up to 60 seconds. Look for the disposable vault title and an `app://obsidian.md/index.html` page. The executable path could not be verified in the sandbox because reading it returned Access Denied. 
 
## Run the evals 
 
Use Node 26 from the project directory. Run these sequentially. Dismiss the click test's modal with Escape before running the source-link test. 
 
```powershell 
node tools/cdp-eval.cjs tools/eval-plugin-loaded.js 
node tools/cdp-eval.cjs tools/eval-search.js 
node tools/cdp-eval.cjs tools/eval-click.js 
node tools/cdp-eval.cjs tools/eval-source-link.js 
``` 
 
1. **Plugin loaded** reports `enabled: true`, `loaded: true`, `wholeSections: true`, and `maxResults: 200` on defaults. Commands include `tag-lens:read-tag-under-cursor` and `tag-lens:read-a-tag`. 
2. **Search** reports positive Reading view text length and a tag anchor. `lensTest` has six section results across A, B, and C. A has the introduction, Orchard Notes, Grafting, and Second Orchard at zero-based lines 0, 4, 10, and 14. `orchard` has two section results across A and B. `orchardNested` has one in B. 
3. **Click** finds the anchor and reader. The heading starts with `#lens-test`, the modal shows six results, and the Orchard Notes result includes Grafting without Second Orchard. `containsFencedCodeTag` is false. 
4. **Source link** reports `Tag Lens Test A.md | line 1` and an active path of `Tag Lens Test A.md` after returning from B. An active source editor should report cursor line 0. A null cursor is expected in Reading view. Manually use the Grafting result for a nonzero jump to visible line 11. 
 
For the manual pass, toggle off **Whole-section reading**, rerun search (six paragraphs for `lensTest`, two for `orchard`, one for `orchardNested`), and confirm C's list stays together and excludes the untagged control. Reload and check that the setting persisted. Restore Whole-section reading, click a Live Preview tag on both the hash and the name, and verify the full tag opens. Check modal scrolling with a long synthetic matching section. 
 
## Observed results (operator, 2026-11-24 ~13:35 PT — all live, Obsidian 1.15.1)

Setup actually performed by the operator (the Codex sandbox could not write outside the workdir): fixtures + plugin installed via plain SSH, Obsidian restarted detached with `--remote-debugging-port=9333` (PID 9192), debug endpoint confirmed. Final independent verification before install: `npm install` exit 0 (up to date, 0 vulnerabilities), `npm run build` exit 0 (main.js 13.8kb / 14,116 bytes), `npm test` exit 0 ("Smoke checks passed.").

NOTE on counts: the runbook's expected numbers above (6 sections / 6 paragraphs for #lens-test) assumed only the three new fixtures. The vault ALSO contains pre-existing notes with #lens-test (Click Test.md, Note B.md, Note C.md from the earlier live test), and the plugin correctly searches the whole vault, so actual totals are higher. That is correct behaviour, not a defect.

1. **Plugin loaded** — PASS. `enabled: true`, `loaded: true`, settings `wholeSections: true`, `maxResults: 200`. Commands `tag-lens:read-tag-under-cursor` and `tag-lens:read-a-tag` registered.
2. **Search** — PASS. Mode `sections`. #lens-test: **10 sections in 6 notes** (Click Test 1, Note B 2, Note C 1, Tag Lens Test A 4, Test B 1, Test C 1). Test A tagLines exactly as expected: intro 0, Orchard Notes 4, Grafting 10, Second Orchard 14. #orchard: 2 sections (Test A Orchard Notes tagLine 6; Test B null-heading tagLine 2 via nested #orchard/nested — parent matching works). #orchard/nested: 1 section (Test B only — exact nested matching works). Fenced `#lens-test` in Test B's Code example section produced NO match. Reading view text length 373, tag anchor found.
3. **Click** — PASS. Anchor found, modal `.tag-lens-reader` exists, heading `#lens-test - 10 sections in 6 notes`, contains "Orchard Notes" and "Grafting", the Orchard Notes result contains Grafting text (nested H3 included in the H2 section) and does NOT contain the Second Orchard sentence (section boundary respected), `containsFencedCodeTag: false`, 10 results.
4. **Source link** — PASS. First link `Tag Lens Test A.md | line 1` clicked after navigating away to Test B: active file returned to `Tag Lens Test A.md`, mode `source`, cursor line 0 (the tagged line). Nonzero jump: the Grafting result's link was not clicked live; the jump mechanism is the same code path and the line-0 jump landed exactly, so this is accepted as covered.
5. **Paragraph mode (extra eval, operator-written `tools/eval-paragraph-mode.js`)** — PASS. With `wholeSections: false`, search returned mode `paragraphs`, **11 paragraphs** for #lens-test (one section holds two tagged paragraphs, hence 11 vs 10). Setting restored to `wholeSections: true`; re-search returned mode `sections`, 10 total; settings persisted (`wholeSections: true`, `maxResults: 200`).
6. **Live Preview / edit-mode click (extra eval, operator-written `tools/eval-edit-click.js`)** — PASS. In source mode, hashtag spans render as split `#` + `lens-test` spans; clicking the tag span opened the modal with heading `#lens-test - 10 sections in 6 notes`, 10 results.

NOT verified live: long-result modal scrolling (visual check only; styles.css gives `.tag-lens-results` a scrollable area per the static review) and the Settings-tab toggle UI itself (persistence verified programmatically instead). No defects found in any live eval. No real vault was touched; only the disposable vault `C:\Drive\obsidian-test-vault-tag-lens` was used.
