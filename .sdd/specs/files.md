---
feature: files
tier: T2
approval: auto
---
# Document lifecycle
Goal: Open one local document without modifying it.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-FILES-001 | When a chosen or dropped .md/.markdown file is opened, the system shall return its canonical path and UTF-8 text, removing a UTF-8 BOM. | TEST-FILES-001 |
| REQ-FILES-002 | If input is unreadable, non-UTF-8, not Markdown or larger than 16 MiB, then the system shall return an explicit error and preserve the previous document. | TEST-FILES-002 |
| REQ-FILES-003 | While an operation is active, the system shall reject conflicting open/export actions; dialog cancellation shall preserve the document and exit shall close the app. | TEST-FILES-003 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-FILES-001` | BOM removed; Unicode path accepted | BOM visible in body | TEST-FILES-001 | tdd red/green PASS; rejected-open mutation failed assertion |
| `REQ-FILES-002` | Oversized and invalid input rejected | Invalid input replaces current file | TEST-FILES-002 | tdd red/green PASS; rejected-open mutation failed assertion |
| `REQ-FILES-003` | All busy/ready/empty action cells enumerated | Open permitted during PDF capture | TEST-FILES-003 | tdd red/green PASS; disabled-open mutation rejected; backend guard test PASS |
Risk stages: inputs/contract/state/integration covered; execution/verdict by real runners; no persistent history.
Oracle: user-selected file, UTF-8 and bounded input contract.
## Design
Rust owns dialog, document text and canonical parent; frontend owns rendered view. IPC only from the main local webview.
One frontend action policy table gates empty/ready/busy operations; backend acquires a shared nonblocking operation guard before dialogs/read/capture, rejects concurrent drops/opens/exports, and releases on every outcome. Failed/cancelled open leaves state unchanged.
## Assumptions / risks
UTF-8 only, 16 MiB maximum, no file watching or CLI association; Rust boundary tests retire input assumptions. Native dialogs/exit require Windows smoke tests.
