# Project state 
 
## Goal and ownership 
 
Tag Lens 1.0.0 by remriel provides read-only local tag search for Obsidian. The operator owns disposable-vault execution and the release decision. Current scope excludes all real vaults, GitHub, community submission, and delegation. 
 
## Architecture and decisions 
 
- `main.ts` is the source. `esbuild.config.mjs` builds `main.js`; the 14,116-byte artifact from the independent iteration 2 build is still in place. `tests/smoke.cjs` imports it with mocked Obsidian APIs. 
- `bodyLines` skips frontmatter and tracks top-level fences. Tag matching ignores case, includes descendants for root queries, and requires exact nested tags. 
- `sectionRanges` builds overlapping heading ranges. `findSectionsForTag` assigns hits to the nearest heading or introduction. A matched parent displays its full subtree and retains its own source location. Untagged content and code fences can appear as context inside a matched section. Setext headings and Markdown containers are outside the parser's scope. 
- `searchVaultForTag` applies a shared match budget across files in either mode. The modal handles search or render failures and stops rendering after close. Its result list has a 52vh maximum height and overflow scrolling. 
- The workspace capture listener walks Live Preview hashtag spans using begin/end markers and sibling boundaries. Modified clicks and failed synchronous opens fall through. Actual editor markup and positioning via `WorkspaceLeaf.openFile({ eState: { line } })` still require a live check. 
- `tools/fixtures` isolates the fenced and untagged controls in unmatched sections. `tools/cdp-eval.cjs` only selects the disposable Obsidian page, and the eval script for source navigation starts on a different note before clicking the result. Its first source is at line zero, so the runbook also checks a nonzero jump. 
 
## Constraints and failed approaches 
 
- Preserve the corrected single-caret dependency ranges. The old double-caret ranges broke npm. 
- Sandbox npm startup returned `0xC0000142` again. The prior external npm sequence passed. The sandbox denied writing to the disposable vault and denied reading the executable path. Port 9333 already listed the disposable window, so no launch was needed. 
- Miyo folder listing required unavailable approval. No Miyo or Avernus context was loaded. Avernus archive is pending under the active real-vault exclusion. 
 
## RESUME HERE 
 
Follow [REAL_VAULT_TEST.md](REAL_VAULT_TEST.md) from an operator session with write access to the disposable vault. Install and enable the checked bundle, run the four scripts, record observations, and complete manual checks. See [PROGRESS.md](PROGRESS.md) for the ordered steps. 
