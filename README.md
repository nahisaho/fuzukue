# Fuzukue

A Rust-powered Windows Markdown viewer with a quiet Japanese interface, TeX math, Mermaid diagrams and direct PDF export.
Open a local document, read it without editing the original, and save a document-only PDF.

[日本語](README-ja.md) · [Changes](CHANGELOG) · [MIT license](LICENSE)

## Read Markdown without the clutter

Fuzukue pairs a Tauri 2/Rust desktop backend with a WebView2 reading surface.
The interface includes a heading outline, light/dark themes, native file dialogs and drag-and-drop.
Rendering libraries and math fonts are bundled: local documents, math and diagrams do not need an internet connection.

| Content | Supported syntax |
| --- | --- |
| GitHub-style Markdown | Tables, task lists, strikethrough, autolinks, fenced code |
| Qiita-style extensions | `:::note info/warn/alert`, code fences such as `rust:main.rs`, footnotes, HTML details |
| TeX | `$...$`, `$$...$$`, `\(...\)` (for example `\(\bar r\)`), `\[...\]`, fenced `math` blocks; KaTeX's supported commands |
| Diagrams | Fenced `mermaid` blocks, rendered locally in strict mode |
| Images | Relative local PNG/SVG paths and HTTP(S) image URLs |
| PDF | Direct A4 save using WebView2; no print dialog or PDF printer required |

## Install on Windows

Fuzukue targets Windows 10/11 x64 and Microsoft Edge WebView2 Evergreen Runtime.
Download the Windows files from [v0.1.0 releases](https://github.com/nahisaho/fuzukue/releases/tag/v0.1.0).
Run the `Fuzukue_0.1.0_x64-setup.exe` installer, or keep `fuzukue.exe`, `LICENSE` and `THIRD_PARTY_NOTICES.txt` together in a local folder and run the executable directly.
Node.js, Rust and Visual Studio are only needed to build from source.

The installer can download WebView2 when it is missing; this step needs internet access.
The standalone executable requires WebView2 to be installed already.
Both executable and installer are unsigned, so Windows may show an unknown-publisher or SmartScreen warning. Follow your organization's application policy; do not bypass a managed block.
To verify a downloaded file against the release's `SHA256SUMS.txt`, use PowerShell:

```powershell
Get-FileHash .\Fuzukue_0.1.0_x64-setup.exe -Algorithm SHA256
```

Compare the returned hash with the line for that filename in `SHA256SUMS.txt`; do not run a file whose hash differs.

**Known issue:** black rendering outside linked images has been reported and remains unresolved.
Interactive Windows PDF and rendering validation is incomplete; see the checklist below before relying on exported output.

## Open a document and save a PDF

Choose **ファイルを開く**, press `Ctrl+O`, or drop one `.md`/`.markdown` file onto the window.
Use the sidebar to jump to headings and the sun button to change the theme.
Choose **PDFに保存** or press `Ctrl+Shift+S`, then select a destination.
The exit icon closes the application. A cancelled file/save dialog leaves the document unchanged.

The welcome screen's sample document demonstrates math, diagrams, tasks and Qiita notes.
Open a real local file before exporting; the sample is not a backend document.

## Prerequisites for Windows development

- Windows 10/11 x64 with an up-to-date Microsoft Edge WebView2 Evergreen Runtime.
- Node.js 24 or newer and npm.
- Stable Rust 1.90 or newer, using the `x86_64-pc-windows-msvc` toolchain.
- Visual Studio 2022 Build Tools with **Desktop development with C++** and a Windows SDK.

The installer bootstrapper installs WebView2 if needed; that installation requires internet access.
Development requires WebView2 to be installed already.
Use **Developer PowerShell for VS 2022** so that `where.exe link` finds the MSVC linker. Changing folders in ordinary PowerShell does not activate the C++ build environment.

## Start the Windows application

Run these commands in PowerShell at the repository root:

```powershell
npm ci
npm run desktop:dev
```

Dependencies are pinned to versions available from the npm mirror used during validation.
If an organization-managed registry returns `E404`, keep its settings unchanged and report the failing package URL; do not delete the lockfile or bypass registry policy.

Use a local Windows folder such as `C:\src\fuzukue`, not `\\wsl.localhost\...`.
Do not share `node_modules` or `src-tauri/target` between Windows and WSL.
A Windows `npm ci` over WSL-installed packages can fail with `ENOTEMPTY` on Linux `.bin` entries.
When copying an existing WSL checkout, exclude those generated directories and run `npm ci` in the Windows copy.

For example, while PowerShell is in the existing checkout, copy it to a new Windows folder:

```powershell
$src = (Get-Location).Path
$dst = "$HOME\source\fuzukue-win"
if (Test-Path $dst) { throw "Choose a new destination folder." }
robocopy $src $dst /E /XD node_modules target .git dist test-results playwright-report /R:1 /W:1
if ($LASTEXITCODE -ge 8) { throw "Project copy failed." }
Set-Location $dst
npm ci
npm run desktop:dev
```

The desktop launcher reserves a free IPv4 loopback port and shares the actual URL with Tauri.
It does not require port 5173 or stop an existing server, and it closes its own server when Tauri exits.
`npm run tauri -- dev` uses the same launcher; use these npm scripts rather than bypassing them with `npx tauri dev`.

## Build an unsigned Windows installer

```powershell
npm run desktop:build
```

The executable is `src-tauri/target/release/fuzukue.exe`.
The NSIS installer is written under `src-tauri/target/release/bundle/nsis/`.
Build outputs are unsigned. GitHub Actions builds Windows artifacts, but publishing a release requires a separate approval.

## Preview and test on Linux

```sh
npm ci
npm run dev
```

Browser preview supports the sample document and themes, not native file dialogs, drag-and-drop or direct PDF saving.
The desktop application intentionally targets Windows; Linux Rust tests exercise the portable core without GTK/WebKit dependencies.
If port 5173 is already occupied for browser preview, use `npm run dev -- --port 0` and open the URL printed by Vite.
PowerShell can also run Linux tools through a profile or WSL: the shell name alone does not identify the Node/Rust platform.
To diagnose tool selection in PowerShell, run `node -p process.platform` and `rustc -vV`; native Windows development requires `win32` and a Windows Rust host.

```sh
npm test
npm run test:rust
npm run lint
npm run build
npm run test:e2e
```

If Playwright reports a missing browser, run `npx playwright install chromium`.
Browser tests use an isolated port and a test-only native bridge replacement.
They exercise real KaTeX/Mermaid/image rendering and print CSS, but do not prove native WebView2 PDF behavior.

Optional Windows cross-target type-check from Linux:

```sh
rustup target add x86_64-pc-windows-gnu
cargo check --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-gnu
```

## File and network boundaries

Documents must be UTF-8, optionally with a BOM, and at most 16 MiB.
Local images have the same size limit. Their percent-decoded paths must remain within the opened document's canonical parent directory, including after symlink resolution.
Absolute paths, drive-letter paths, UNC paths, `file:`/`data:` URLs and outside-directory images are rejected.
Place shared images beneath the document directory, for example `![Plot](images/plot.svg)`.

Remote HTTP(S) images load automatically and therefore contact their hosts; requests omit the referrer.
Missing, unsupported or timed-out images and invalid math/diagrams produce visible diagnostics.
PDF saving is blocked until rendering succeeds. Retry transient remote failures by reopening the document.
Videos, SNS posts and service-specific interactive embeds are not supported.
External HTTP(S) links open in the system browser, never inside the privileged reading window.
Active document HTML, raw SVG markup, inline styles, frames and scripts are stripped; local SVG files are sanitized and displayed only as images.
Local SVG preserves supported paint, line and typography styles by converting them to validated presentation attributes, plus fragment-only `use` references for glyphs. Arbitrary CSS, SVG stylesheets, scripts, animation and external SVG resources remain disabled.

## PDF behavior and remaining validation

PDF output excludes application controls and uses a white print palette even in dark mode.
Rust prints to a same-directory temporary file, waits for WebView2's completion result, validates the PDF signature, then atomically replaces the selected destination.
Cancellation or capture/persistence failure does not truncate an existing destination; temporary files are cleaned up on normal failure.
Power loss/process termination may leave a temporary file. A stalled WebView2 capture deliberately retains the busy state rather than restoring CSS during capture; restart the app if the runtime stops responding.

This implementation has Linux unit/browser checks and Windows-target compilation.
Interactive Windows validation is incomplete: a report of black rendering outside linked images remains unresolved.
The following Windows smoke checklist remains to be completed:

1. Open a UTF-8 file with a Japanese filename using both the native dialog and drag-and-drop.
2. Check local PNG/SVG, remote images, invalid images, all agreed Markdown extensions, TeX radicals and Mermaid text labels.
3. Save a multi-page PDF in light/dark themes; inspect page count, Japanese fonts, equations, diagrams, images and absence of app controls.
4. Cancel saving, replace an existing PDF, and attempt to save over a locked/read-only PDF; verify the original bytes survive failures.
5. Verify invalid files preserve the previous document, repeated actions are rejected while busy, and the exit control closes the app.

This is a viewer, not an editor or exact GitHub/Qiita service clone.
File watching, multiple tabs, file associations, online metadata cards and uncommon TeX packages are not implemented.

## Contributing and license

Report reproducible problems in English through [GitHub Issues](https://github.com/nahisaho/fuzukue/issues), including the app version, Windows/WebView2 versions and a minimal non-sensitive Markdown example.
Run the test commands above before proposing changes. Do not include private documents, credentials or generated build directories.

Fuzukue's own code is released under the [MIT license](LICENSE).
Bundled third-party components retain their respective licenses; their texts, versions and source locations are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
See [CHANGELOG](CHANGELOG) for release changes and known limitations.

Target version: 0.1.0; last updated: 2026-10-26.
