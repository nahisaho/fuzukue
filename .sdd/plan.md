# Fuzukue implementation plan

| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | shell | - | Japanese reading UI, theme and outline |
| 2 | files | shell | Native open/drop, bounded UTF-8 input and exit |
| 3 | markdown | files | GFM, Qiita extensions, TeX and Mermaid |
| 4 | images | markdown | Confined local images and HTTP(S) images |
| 5 | pdf | images | Render readiness, native direct PDF save |
| 6 | dev-startup | shell | OS-assigned dev port shared by Vite and Tauri |
