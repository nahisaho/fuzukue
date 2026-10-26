---
feature: shell
tier: T1
approval: auto
---
# Reading shell
Goal: A polished Japanese Windows 10/11 x64 Markdown viewer. Non-goals: editing, tabs.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SHELL-001 | When the app starts, the system shall display an empty reading view with open, disabled PDF, theme and exit controls. | TEST-SHELL-001 |
| REQ-SHELL-002 | When a theme is selected or a document is rendered, the system shall apply light/dark appearance and expose a heading outline with unique anchors. | TEST-SHELL-002 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-SHELL-001` | Empty document cannot export | Enabled PDF before open | TEST-SHELL-001 | tdd red/green: assertion failure then PASS; empty-shell mutation rejected |
| `REQ-SHELL-002` | Duplicate headings have different anchors | Both headings point to the same id | TEST-SHELL-002 | tdd red/green PASS; empty-outline mutation rejected |
Risk stages: contract/inputs/integration covered by browser tests; execution/verdict by runner; history not applicable to new app.
Oracle: agreed single-document reading UI.
## Assumptions / risks
System fonts, responsive sidebar and default light theme; browser screenshots retire visual-layout assumptions. Windows native appearance remains a manual check.
