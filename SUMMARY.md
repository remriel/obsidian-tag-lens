# Tag Lens 1.0.0 
 
Tag Lens is a local, read-only Obsidian plugin by remriel. It opens a reader for an inline tag and groups matches by note path with source links. 
 
- **Iteration 1** built paragraph extraction, nested-tag matching, tag click interception, command palette entry points, settings, and source links. 
- **Iteration 2** added whole-section reading by default, nearest-heading ownership, full nested section context, tagged-line links, and a shared result cap. The independent verifier passed npm install, esbuild, and all 48 smoke assertions. The included bundle is the resulting 14,116-byte build. 
- **Iteration 3** reviewed click handling, source navigation, the result cap, long-result scrolling, and modal error handling. The plugin source and verified bundle were preserved. Three fixtures, a CDP runner, four evals, and the operator runbook are ready. The eval files and runner passed a JavaScript syntax check and the bundled parser was checked against the fixtures. 
 
The sandbox denied installation into the disposable vault. Obsidian already had that vault open with the debug endpoint active. The operator then installed the plugin and fixtures via plain SSH, relaunched Obsidian with the debug port, and ran all evals live — see below. The release decision belongs to the operator. [Disposable vault runbook](docs/REAL_VAULT_TEST.md)

## Live verification (operator, 2026-11-24 ~13:35 PT, Obsidian 1.15.1)

Final independent verification: `npm install` exit 0, `npm run build` exit 0 (main.js 14,116 bytes), `npm test` exit 0 ("Smoke checks passed."). All four CDP evals passed in the disposable vault, plus two operator-written extra evals:
- Plugin loaded: enabled, settings wholeSections true / maxResults 200, both commands registered.
- Search: #lens-test = 10 sections in 6 notes (pre-existing Click Test / Note B / Note C also match — vault-wide search works); #orchard = 2 sections (parent matching); #orchard/nested = 1 section (exact nested matching); fenced #lens-test produced no match; Test A tagLines 0 / 4 / 10 / 14 as designed.
- Click: Reading-view tag click opened the modal (10 sections); Orchard Notes result includes nested Grafting text, excludes Second Orchard text; no fenced-code text.
- Source link: jumped to Tag Lens Test A.md, source mode, cursor line 0 (the tagged line).
- Paragraph mode: 11 paragraphs for #lens-test with wholeSections off; setting restored and persisted.
- Edit-mode (Live Preview) click: split `#` + `lens-test` spans handled; modal opened with 10 results.
- Not verified live: long-result modal scrolling (visual only) and the Settings-tab toggle UI (persistence verified programmatically). No defects found. 
