---
feature: dev-startup
tier: T1
approval: auto
---
# Collision-free desktop development
Goal: Start desktop development without requiring port 5173. Non-goals: Linux desktop support, terminating other processes.
Dependency compatibility: preserve registry policy; use mirror-available Vite 8.3.4, KaTeX 0.19.0, Tauri CLI 2.12.3 and musubix6 0.1.1 (user approved). Re-resolve transitive dependencies from that mirror; verify fresh-cache Windows retrieval, TEST-DEV-001 and the full gate. Original locked Vite 8.3.5 tarball reproduced HTTP 404.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DEV-001 | When either npm desktop:dev or npm tauri -- dev starts, the system shall bind Vite to an OS-assigned IPv4 loopback port and pass its actual origin to Tauri without a second beforeDevCommand server. | TEST-DEV-001 |
| REQ-DEV-002 | When the CLI exits, fails to spawn, or receives a termination signal, the system shall close its Vite server, remove signal handlers and propagate a nonzero outcome for failures. | TEST-DEV-002 |
| REQ-DEV-003 | While debugging, the system shall allow only the configured HTTP IPv4 loopback dev origin; release builds and other host/port/scheme origins shall not receive this allowance. | TEST-DEV-003 |
| REQ-DEV-004 | If Windows desktop dev/build runs from a UNC path, then the system shall reject startup before loading platform-specific packages with guidance to use a local Windows copy and freshly installed dependencies. | TEST-DEV-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-DEV-001` | Real HTTP server responds; CLI override matches its bound port | Fixed 5173 or duplicate beforeDevCommand | TEST-DEV-001 | assertion Red; real-server control PASS; missing-server mutation killed |
| `REQ-DEV-002` | Close on success/error/signal; original code retained | Orphan Vite or swallowed CLI error | TEST-DEV-002 | assertion Red; lifecycle controls PASS; omitted-close mutation killed |
| `REQ-DEV-003` | Configured loopback origin alone passes in debug | Different port, external host or release allowed | TEST-DEV-003 | assertion Red; valid/invalid origins PASS; always-allow mutation killed |
| `REQ-DEV-004` | Local Windows path accepted; UNC rejected with remediation | UNC starts a half-installed platform-mixed toolchain | TEST-DEV-004 | assertion Red; workspace controls PASS; removed-preflight mutation killed |
Risk stages: execution/input/integration exercised with bound servers and child events; contract pinned by CLI JSON; verdict uses assertions; history is process-local only.
Oracle: existing IPv4 loopback-only debug navigation policy and Tauri --config override contract.
## Design
A Node launcher owns Vite and the Tauri child; the OS reserves port 0 until shutdown, avoiding probe/rebind races.
Rust compares against the effective trusted build.devUrl origin, retaining the HTTP/127.0.0.1 restriction and all existing packaged navigation rules.
## Assumptions / risks
Fresh-cache Windows x64 dependency retrieval through the configured mirror passed (278 packages; --ignore-scripts). Linux npm ci through the same mirror passed with install scripts enabled. Neither check executes Windows binaries.
Real npm desktop:dev -- --no-watch with Tauri CLI 2.12.3 selected port 45227 with no beforeDevCommand, then exited 1 as expected on this Linux host. Windows native execution remains manual; Windows/WSL dependency trees must not be shared.
