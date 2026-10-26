---
feature: pdf
tier: T2
approval: auto
---
# Direct PDF export
Goal: Save the rendered document as PDF using the native Windows WebView2 renderer.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PDF-001 | When PDF is requested, the system shall wait for math/diagrams/images/fonts, reject incomplete resources, and keep print styling active until native capture completes. | TEST-PDF-001 |
| REQ-PDF-002 | When a destination is selected, the system shall directly write an A4 PDF of the document without app controls via a temporary file, reporting success only after native completion and persistence. | TEST-PDF-002 |
| REQ-PDF-003 | If saving is cancelled or fails, then the system shall preserve the document and prior destination, restore reading styling and report failures explicitly. | TEST-PDF-003 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-PDF-001` | Export blocked by broken resource; fonts awaited | Native capture before image completion | TEST-PDF-001 | tdd red/green PASS; node --test TEST-PDF-001 killed removed-readiness mutation |
| `REQ-PDF-002` | Native callback + valid PDF precede success | Success returned on merely starting print | TEST-PDF-002 | portable tdd red/green PASS; invalid-signature mutation killed; native callback runtime unverified |
| `REQ-PDF-003` | Cancellation/error restores UI; no partial overwrite | Failed capture truncates old target | TEST-PDF-003 | tdd red/green PASS; early-return mutation rejected; native cancellation runtime unverified |
Risk stages: contract/state/input/integration tested; actual Windows print output remains manual; history not applicable.
Oracle: WebView2 PrintToPdf completion result and PDF signature.
## Design
Frontend locks operations, waits for resources and applies export CSS; Rust save dialog selects target then WebView2 ICoreWebView2_7 prints to same-directory temporary PDF.
Native callback validates result; Rust checks signature then replaces via tempfile TempPath::persist (Windows MoveFileExW/REPLACE_EXISTING), cleaning temporary files on failure/cancel. Locked/read-only targets must fail without changing their bytes. A4 settings, no header/footer, white print palette. Cancel returns null; errors propagate.
## Assumptions / risks
Updated WebView2 runtime required. Isolated cargo check --target x86_64-pc-windows-gnu passed for PrintToPdf/settings/callback signatures; pagination/fonts/native output and locked targets require Windows smoke tests. Crash/power-loss temp cleanup is not guaranteed.
