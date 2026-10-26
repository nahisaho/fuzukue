---
feature: markdown
tier: T2
approval: auto
---
# Markdown renderer
Goal: Render GFM and major Qiita notation offline; not reproduce service-specific page layouts.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MARKDOWN-001 | When GFM or Qiita content is rendered, the system shall display tables, tasks, strikethrough, highlighted code with filename, footnotes, :::note info/warn/alert, and details blocks. | TEST-MARKDOWN-001 |
| REQ-MARKDOWN-002 | When inline/block TeX or a math/Mermaid fence is rendered, the system shall display math/diagrams offline and expose invalid syntax as a visible diagnostic. | TEST-MARKDOWN-002 |
| REQ-MARKDOWN-003 | If document HTML contains active content or unsafe links, then the system shall remove scripts, events, frames and unsafe protocols without granting document content native IPC privileges. | TEST-MARKDOWN-003 |
| REQ-MARKDOWN-004 | When prose contains TeX delimited by backslash parentheses or backslash brackets, the system shall render inline or display math respectively, retain dollar/fenced math, preserve literal code and expose invalid math diagnostics. | TEST-MARKDOWN-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-MARKDOWN-001` | Each agreed extension has semantic output | Qiita note displayed as literal ::: | TEST-MARKDOWN-001 | tdd red/green PASS; multiline-details Red reproduced and fixed |
| `REQ-MARKDOWN-002` | TeX becomes KaTeX; valid diagram SVG; bad diagram reported | Raw TeX or silent invalid graph | TEST-MARKDOWN-002 | tdd red/green PASS; missing-radical SVG Red reproduced; browser labels verified |
| `REQ-MARKDOWN-003` | Script/event/javascript removed, normal links retained | Script survives sanitization | TEST-MARKDOWN-003 | tdd red/green PASS; raw-image metadata Red reproduced and fixed |
| `REQ-MARKDOWN-004` | Backslash-parenthesis/bar-r and backslash-bracket/fraction produce KaTeX, including in browser/print; code stays literal | Delimiters vanish into plain text, dollars regress or code becomes math | TEST-MARKDOWN-004; browser rendering | pending Red/Green |
Risk stages: contract/input/execution/integration use fixtures; verdict uses assertions; history not applicable.
Oracle: GFM/Qiita syntax and KaTeX/Mermaid browser output.
## Design
Bundled markdown-it/plugins, KaTeX, Mermaid and DOMPurify; no CDN. Sanitize HTML before inserting it and sanitize generated diagram SVG.
Configure the existing texmath plugin with both dollars and brackets; do not preprocess source or enable trusted TeX. Scratch spike confirmed both bracket forms and both dollar forms render with the installed plugin.
Document links never navigate the privileged webview; only HTTP(S) links may open the system browser. Mermaid strict mode; raw HTML styles/forms/frames disabled.
## Assumptions / risks
Major notation, not full GitHub/Qiita compatibility; TeX uses KaTeX subset. Browser fixtures retire extension assumptions; unsupported syntax stays readable.
