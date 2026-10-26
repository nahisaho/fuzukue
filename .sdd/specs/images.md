---
feature: images
tier: T2
approval: auto
---
# Linked images
Goal: Show local and remote PNG/SVG images without arbitrary filesystem access.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-IMAGES-001 | When local PNG/SVG is referenced, the system shall load at most 16 MiB using a percent-decoded path confined to the opened document's canonical parent tree. | TEST-IMAGES-001 |
| REQ-IMAGES-002 | If a local reference escapes that tree, uses a forbidden scheme, is stale, missing or unsupported, then the system shall reject it and show an image diagnostic. | TEST-IMAGES-002 |
| REQ-IMAGES-003 | When HTTP(S) images are referenced, the system shall load them without a referrer and display failures; videos/SNS embeds shall remain ordinary links. | TEST-IMAGES-003 |
| REQ-IMAGES-004 | When local SVG uses safe inline presentation styles or same-document use references, the system shall preserve its colors and glyphs while removing raw CSS, active content and external resource references. | TEST-IMAGES-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-IMAGES-001` | Encoded Unicode/space paths load; correct MIME | Encoded filename fails | TEST-IMAGES-001 | tdd red/green PASS; rejected-open mutation failed; browser PNG/SVG PASS |
| `REQ-IMAGES-002` | Traversal/symlink escape/stale id rejected | ../private.png disclosed | TEST-IMAGES-002 | tdd red/green PASS; cargo test test_images_002 killed removed-confinement mutation |
| `REQ-IMAGES-003` | Remote image reaches loaded/error state | Failed image silently vanishes | TEST-IMAGES-003 | tdd red/green PASS; empty-hydration mutation rejected; browser remote PNG PASS |
| `REQ-IMAGES-004` | Synthetic SVG retains white background, colored geometry and local glyphs; PNG bytes unchanged | SVG becomes a solid black rectangle, loses labels or retains an external reference | TEST-IMAGES-004; browser pixel assertions | pending Red/Green and policy mutation checks |
Risk stages: input/trust/integration tested; execution/verdict by runners; no persistent history.
Oracle: canonical path confinement and browser image events.
## Design
Rust read_image(documentId, reference) requires a matching document generation and a relative path; rejects schemes, drive letters, absolute/UNC paths and canonical escapes, returning base64/MIME. No filesystem/asset protocol exposed.
Frontend handles HTTP(S) via img with no-referrer; local SVG is sanitized (no scripts, foreignObject, events or external hrefs) and displayed only as img data URL. All images reach success/error or bounded timeout.
Promote only grammar-checked paint, numeric and typography styles to SVG presentation attributes; still remove all style attributes/tags. Permit use href/xlink:href only as local fragments; reject external/escaped URL values in resource-bearing attributes. Policy tests enumerate valid/invalid style categories and reference kinds.
Spike: supplied PNG rendered correctly; corresponding SVG sampled 100% opaque black before the fix. Detached DOMPurify preserved a white paint attribute and local glyph reference while removing raw styles, scripts and external hrefs. Supplied images remain outside the repository.
## Assumptions / risks
Outside-directory and UNC paths intentionally rejected. Remote URLs contact third parties and need internet. Symlink tests retire confinement assumptions; Windows junctions need native smoke tests.
