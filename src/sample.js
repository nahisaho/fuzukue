export const sample = `# 読むための、小さな机。

アイデアを整理したメモも、じっくり読みたい技術文書も。
**Fuzukue** は、Markdownを心地よく読むための場所です。

## 数式も、そのままに

インラインの数式 $E = mc^2$ から、少し大きな数式まで。

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

## アイデアを、図にする

\`\`\`mermaid
flowchart LR
    A[Markdownを開く] --> B[ゆっくり読む]
    B --> C[PDFに残す]
\`\`\`

## いつもの記法で

| 記法 | 表示 |
| :--- | :--- |
| GitHub Markdown | 表・チェックリスト・打ち消し線 |
| Qiita Markdown | 注記・ファイル名付きコード・脚注 |
| 画像 | ローカル / HTTP(S) の PNG・SVG |

- [x] 読みやすい文字と、ゆったりした余白
- [x] オフラインでも使える数式と図
- [ ] 次に読みたいドキュメントを開く

:::note info
左の目次から見出しへ移動できます。右上のボタンでライト／ダークテーマを切り替えられます。
:::

\`\`\`rust:hello.rs
fn main() {
    println!("Hello, Fuzukue!");
}
\`\`\`

<details>
<summary>もう少し詳しく</summary>

ファイルは閲覧するだけで、元のMarkdownを書き換えることはありません。
PDFには本文だけを、白い用紙に読みやすく出力します。[^pdf]

</details>

[^pdf]: PDF保存はWindows版でファイルを開いてから利用できます。

---

ひと息ついて、次のページへ。
`;
