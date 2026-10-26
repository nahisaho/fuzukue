import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("../", import.meta.url));

/** @id CODE-DEV-WORKSPACE @implements REQ-DEV-004 */
export function assertNativeWorkspace(platform, directory) {
  if (platform === "win32" && /^[\\/]{2}/.test(directory)) {
    throw new Error("Use a local Windows directory, not a WSL/UNC workspace. Copy source without node_modules or src-tauri/target, then run npm ci.");
  }
}

/** @id CODE-DEV-SERVER @implements REQ-DEV-001 */
export async function createDevServer() {
  const { createServer } = await import("vite");
  const cacheDir = await mkdtemp(join(tmpdir(), "fuzukue-vite-"));
  let server;
  try {
    server = await createServer({
      root,
      cacheDir,
      configFile: resolve(root, "vite.config.js"),
      server: { host: "127.0.0.1", port: 0, strictPort: true, open: false }
    });
    await server.listen();
    let closing;
    return {
      resolvedUrls: server.resolvedUrls,
      httpServer: server.httpServer,
      close: () => closing ??= (async () => {
        try { await server.close(); }
        finally { await rm(cacheDir, { recursive: true, force: true }); }
      })()
    };
  } catch (error) {
    try { await server?.close(); }
    finally { await rm(cacheDir, { recursive: true, force: true }); }
    throw error;
  }
}

const launchCli = (args) => {
  const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
  return spawn(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
};

/** @id CODE-DEV-CHILD @implements REQ-DEV-002 */
function waitForChild(child, signals) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signals.removeListener("SIGINT", interrupt);
      signals.removeListener("SIGTERM", terminate);
      child.removeListener("error", failed);
      child.removeListener("close", closed);
    };
    const failed = (error) => { cleanup(); reject(error); };
    const closed = (code, signal) => {
      cleanup();
      resolve(code ?? ({ SIGINT: 130, SIGTERM: 143 }[signal] ?? 1));
    };
    const stop = (signal) => {
      try {
        if (!child.kill(signal)) throw new Error(`Could not send ${signal} to the Tauri process.`);
      } catch (error) {
        failed(error);
      }
    };
    const interrupt = () => stop("SIGINT");
    const terminate = () => stop("SIGTERM");
    child.once("error", failed);
    child.once("close", closed);
    signals.once("SIGINT", interrupt);
    signals.once("SIGTERM", terminate);
  });
}

/** @id CODE-DEV-LAUNCH @implements REQ-DEV-001 REQ-DEV-002 */
export async function runDesktopDev(args = [], {
  startServer = createDevServer, launch = launchCli, signals = process, log = console.log
} = {}) {
  const server = await startServer();
  try {
    const origin = new URL(server.resolvedUrls.local[0]).origin;
    log(`[Fuzukue] Development server: ${origin}`);
    const config = JSON.stringify({ build: { devUrl: origin, beforeDevCommand: null } });
    const separator = args.indexOf("--");
    const options = separator < 0 ? args : args.slice(0, separator);
    const runnerArgs = separator < 0 ? [] : args.slice(separator);
    const child = launch(["dev", ...options, "--config", config, ...runnerArgs]);
    return await waitForChild(child, signals);
  } finally {
    await server.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "dev" || command === "build") assertNativeWorkspace(process.platform, root);
    process.exitCode = command === "dev"
      ? await runDesktopDev(args)
      : await waitForChild(launchCli([command ?? "--help", ...args]), process);
  } catch (error) {
    console.error(`[Fuzukue] ${error.message}`);
    process.exitCode = 1;
  }
}
