# Fuzukue

Fuzukue は、Rust を使った Windows 向け Markdown ビューアーです。
Markdown を日本語の画面で読み、数式や図を含む文書を PDF に保存できます。

[English](README.md) · [変更履歴](CHANGELOG) · [MIT ライセンス](LICENSE)

## Markdown を読むための機能

Tauri 2 と Rust をバックエンドに使い、WebView2 で文書を表示します。
見出し一覧、ライト・ダークテーマ、ファイル選択ダイアログ、ドラッグ＆ドロップに対応しています。
描画ライブラリと数式用フォントは同梱しているため、ローカルの文書・数式・図はインターネットに接続せずに表示できます。

| 内容 | 対応する書式 |
| --- | --- |
| GitHub 形式の Markdown | 表、タスクリスト、取り消し線、自動リンク、コードフェンス |
| Qiita 形式の拡張 | `:::note info/warn/alert`、`rust:main.rs` などのコードフェンス、脚注、HTML の details |
| TeX 数式 | `$...$`、`$$...$$`、`\(...\)`（例：`\(\bar r\)`）、`\[...\]`、`math` コードフェンス。KaTeX が対応するコマンドを使用可能 |
| 図 | `mermaid` コードフェンス。strict モードでローカル描画 |
| 画像 | 相対パスのローカル PNG・SVG、HTTP(S) の画像 URL |
| PDF | WebView2 で A4 の PDF に直接保存。印刷ダイアログや PDF プリンターは不要 |

## Windows にインストールする

Windows 10/11 x64 と Microsoft Edge WebView2 Evergreen Runtime が必要です。
[v0.1.0 のリリースページ](https://github.com/nahisaho/fuzukue/releases/tag/v0.1.0)から Windows 用のファイルをダウンロードしてください。
`Fuzukue_0.1.0_x64-setup.exe` を実行するとインストールできます。
インストーラーを使わない場合は、`fuzukue.exe`、`LICENSE`、`THIRD_PARTY_NOTICES.txt` を同じローカルフォルダーに置き、実行ファイルを起動してください。
Node.js、Rust、Visual Studio は、ソースからビルドする場合だけ必要です。

WebView2 がない場合、インストーラーはインターネット経由で取得します。
実行ファイルを直接使う場合は、あらかじめ WebView2 をインストールしてください。
配布物は署名していないため、Windows が発行元不明や SmartScreen の警告を表示する場合があります。
組織のアプリ利用規則に従い、管理側のブロックは回避しないでください。
ダウンロードしたファイルを検証するには、PowerShell で計算した値と、リリースに添付した `SHA256SUMS.txt` の値を照合します。

```powershell
Get-FileHash .\Fuzukue_0.1.0_x64-setup.exe -Algorithm SHA256
```

**既知の問題：** 画像以外の部分も黒く表示されるとの報告があり、原因は未解明です。
Windows 実機での描画と PDF の確認も完了していません。保存した PDF を利用する前に、後述の確認項目に沿って内容を点検してください。

## 文書を開いて PDF に保存する

**ファイルを開く**、`Ctrl+O`、または `.md`・`.markdown` ファイルのドラッグ＆ドロップで文書を開きます。
見出し一覧から文書内を移動でき、太陽のボタンでテーマを切り替えられます。
**PDFに保存** または `Ctrl+Shift+S` を選び、保存先を指定してください。
終了アイコンでアプリを閉じます。ファイル選択や保存先選択をキャンセルしても、表示中の文書は変わりません。

起動時のサンプルには、数式、図、タスクリスト、Qiita のノート記法が含まれています。
サンプルは PDF に保存できないため、保存する際は実際のローカルファイルを開いてください。

## Windows 開発環境の準備

- Windows 10/11 x64 と、最新の Microsoft Edge WebView2 Evergreen Runtime。
- Node.js 24 以降と npm。
- Rust 1.90 以降の安定版と `x86_64-pc-windows-msvc` ツールチェーン。
- Visual Studio 2022 Build Tools の **C++ によるデスクトップ開発** と Windows SDK。

開発時は WebView2 をあらかじめインストールしてください。
**Developer PowerShell for VS 2022** を使い、`where.exe link` で MSVC リンカーが見つかることを確認してください。
通常の PowerShell でフォルダーを移動するだけでは、C++ のビルド環境は有効になりません。

## ソースから Windows アプリを起動する

リポジトリのルートで実行します。

```powershell
npm ci
npm run desktop:dev
```

依存パッケージは、検証に使った npm ミラーから取得できるバージョンに固定しています。
組織管理のレジストリで `E404` が出た場合は、設定を変えずに、取得できなかったパッケージの URL を報告してください。
ロックファイルの削除やレジストリの制限回避はしないでください。

`\\wsl.localhost\...` ではなく、`C:\src\fuzukue` などの Windows ローカルフォルダーを使ってください。
Windows と WSL で `node_modules` や `src-tauri/target` を共有すると、`ENOTEMPTY` などのエラーが発生する場合があります。
既存の WSL 環境からコピーする場合は、生成済みのフォルダーを除外し、Windows 側で `npm ci` を実行してください。

既存のチェックアウトを PowerShell で開いている場合は、次の手順で新しいフォルダーにコピーできます。

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

デスクトップ用の起動スクリプトは、IPv4 ループバックの空きポートを確保し、その URL を Tauri に渡します。
ポート 5173 を使っている別のサーバーを停止する必要はありません。
アプリの終了時には、起動スクリプト自身のサーバーを閉じます。
`npm run tauri -- dev` も同じ仕組みを使います。`npx tauri dev` で直接起動せず、上記の npm スクリプトを使ってください。

## Windows 用の実行ファイルをビルドする

```powershell
npm run desktop:build
```

実行ファイルは `src-tauri/target/release/fuzukue.exe` に生成されます。
NSIS インストーラーの出力先は `src-tauri/target/release/bundle/nsis/` です。
ビルド結果に電子署名は付きません。
GitHub Actions は Windows 用の配布物を生成しますが、リリースの公開には別途承認が必要です。

## Linux でプレビューとテストを実行する

```sh
npm ci
npm run dev
```

ブラウザーのプレビューでは、サンプル文書とテーマを確認できます。
ネイティブのファイル選択、ドラッグ＆ドロップ、PDF への直接保存は使えません。
デスクトップアプリは Windows 専用です。Linux の Rust テストでは、GTK・WebKit に依存しない共通処理を検証します。
プレビュー用のポート 5173 が使用中の場合は、`npm run dev -- --port 0` で起動し、Vite が表示する URL を開いてください。

PowerShell からでも、プロファイルや WSL を経由して Linux のツールが動く場合があります。
`node -p process.platform` と `rustc -vV` で確認してください。
Windows 向けの開発には、`win32` の Node.js と Windows ホストの Rust が必要です。

```sh
npm test
npm run test:rust
npm run lint
npm run build
npm run test:e2e
```

Playwright のブラウザーが見つからない場合は、`npx playwright install chromium` を実行してください。
ブラウザーテストは専用のポートと、ネイティブ機能を置き換えたテスト用の処理を使います。
KaTeX・Mermaid・画像の描画と印刷用 CSS は検証しますが、実際の WebView2 による PDF 保存を保証するものではありません。

Linux から Windows 向けの型チェックを行う場合は、次を実行します。

```sh
rustup target add x86_64-pc-windows-gnu
cargo check --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-gnu
```

## ファイルとネットワークの制限

文書は UTF-8（BOM は任意）の `.md`・`.markdown` ファイルに限り、上限は 16 MiB です。
ローカル画像も 16 MiB までです。パーセント符号化を復号し、シンボリックリンクを解決した後も、開いた文書の親ディレクトリ配下にある必要があります。
絶対パス、ドライブ文字付きパス、UNC パス、`file:`・`data:` URL、親ディレクトリの外にある画像は拒否します。
共有する画像は、`![Plot](images/plot.svg)` のように文書のディレクトリ配下に置いてください。

HTTP(S) の画像は自動で読み込むため、外部ホストに通信します。リファラーは送信しません。
存在しない画像、未対応の画像、タイムアウト、無効な数式や図は、画面に診断を表示します。
描画が成功するまで PDF の保存はできません。一時的な通信エラーの場合は、文書を開き直してください。
動画、SNS 投稿、サービス固有の埋め込みには対応していません。
外部の HTTP(S) リンクは、アプリ内ではなく既定のブラウザーで開きます。

文書内のスクリプト、フレーム、インラインスタイル、直接記述した SVG などは除去します。
ローカル SVG は安全性を検査し、画像としてのみ表示します。
対応する塗り・線・文字のスタイルは検証済みの表示属性に変換し、同じ SVG 内の断片を参照する `use` 要素は保持します。
任意の CSS、SVG のスタイルシート、スクリプト、アニメーション、外部リソースは使えません。

## PDF の動作と未完了の確認

PDF にアプリの操作部品は含めません。ダークテーマでも白い印刷用の配色を使います。
Rust は保存先と同じディレクトリの一時ファイルに出力し、WebView2 の完了通知と PDF のシグネチャを確認してから、保存先を置き換えます。
キャンセルや通常の保存失敗では、既存のファイルを切り詰めず、一時ファイルを削除します。
停電やプロセスの強制終了では、一時ファイルが残る場合があります。
WebView2 が応答しない場合は、出力中の CSS を維持するため処理中の状態が続きます。その場合はアプリを再起動してください。

Linux の単体・ブラウザーテストと Windows 向けのコンパイルは実施しています。
画像以外も黒く表示される問題は未解決で、Windows 実機での確認は完了していません。
次の項目は、実機での確認が必要です。

1. 日本語のファイル名を持つ UTF-8 文書を、ダイアログとドラッグ＆ドロップで開く。
2. ローカル PNG・SVG、外部画像、無効な画像、対応する Markdown、TeX の根号、Mermaid の文字を確認する。
3. ライト・ダークテーマで複数ページの PDF を保存し、ページ数、日本語フォント、数式、図、画像、操作部品が含まれないことを確認する。
4. 保存をキャンセルし、既存 PDF の置換やロック中・読み取り専用の PDF への保存を試し、失敗時に元の内容が残ることを確認する。
5. 無効なファイルを開いても前の文書が残ること、処理中の重複操作が拒否されること、終了ボタンでアプリを閉じられることを確認する。

Fuzukue はビューアーであり、エディターや GitHub・Qiita の完全な再現を目指すものではありません。
ファイルの変更監視、複数タブ、ファイルの関連付け、外部ページのメタデータカード、一部の TeX パッケージには対応していません。

## 不具合の報告とライセンス

不具合は [GitHub Issues](https://github.com/nahisaho/fuzukue/issues) に英語で報告してください。
アプリ・Windows・WebView2 のバージョンと、機密情報を含まない最小の Markdown を添えてください。
変更を提案する際は、上記のテストを実行し、非公開の文書、認証情報、ビルド生成物を含めないでください。

Fuzukue 自体のコードには [MIT ライセンス](LICENSE)を適用します。
同梱する第三者のコンポーネントには、それぞれのライセンスが適用されます。
ライセンス本文、バージョン、ソースの取得先は [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)、リリースごとの変更点は [CHANGELOG](CHANGELOG) を参照してください。

対象バージョン：0.1.0。最終更新：2026-10-26。
