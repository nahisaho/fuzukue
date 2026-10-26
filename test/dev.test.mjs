import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { assertNativeWorkspace, createDevServer, runDesktopDev } from "../scripts/tauri.mjs";

/** @id TEST-DEV-001 @verifies REQ-DEV-001 */
test("TEST-DEV-001 real reserved server and Tauri share the actual origin", async () => {
  const occupied = createServer((_request, response) => response.end("existing process"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const occupiedUrl = `http://127.0.0.1:${occupied.address().port}`;
  let server;
  try {
    server = await createDevServer();
    assert.ok(server.httpServer?.listening);
    assert.equal(server.httpServer.address().address, "127.0.0.1");
    const origin = new URL(server.resolvedUrls.local[0]).origin;
    assert.notEqual(origin, occupiedUrl);
    assert.equal((await fetch(origin)).status, 200);
    assert.equal(await (await fetch(occupiedUrl)).text(), "existing process");
    const signals = new EventEmitter();
    const code = await runDesktopDev(["--no-watch", "--", "app-arg"], {
      startServer: async () => server,
      signals,
      log: () => {},
      launch: (args) => {
        assert.equal(args[0], "dev");
        const configIndex = args.indexOf("--config");
        assert.ok(configIndex > 0 && configIndex < args.indexOf("--"));
        const config = JSON.parse(args[configIndex + 1]);
        assert.equal(config.build.devUrl, origin);
        assert.equal(config.build.beforeDevCommand, null);
        const child = new EventEmitter();
        setImmediate(() => child.emit("close", 0, null));
        return child;
      }
    });
    assert.equal(code, 0);
    assert.equal(server.httpServer.listening, false);
    assert.equal(signals.listenerCount("SIGINT"), 0);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  } finally {
    await server?.close();
    await new Promise((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
  }
});

/** @id TEST-DEV-002 @verifies REQ-DEV-002 */
test("TEST-DEV-002 child failure, spawn errors and signals clean up Vite", async () => {
  for (const outcome of ["exit", "error", "throw", "signal"]) {
    let closed = 0;
    const signals = new EventEmitter();
    const server = {
      resolvedUrls: { local: ["http://127.0.0.1:23456/"] },
      close: async () => { closed++; }
    };
    const promise = runDesktopDev([], {
      startServer: async () => server,
      signals,
      log: () => {},
      launch: () => {
        if (outcome === "throw") throw new Error("spawn failed");
        const child = new EventEmitter();
        child.kill = (signal) => {
          assert.equal(signal, "SIGINT");
          setImmediate(() => child.emit("close", null, signal));
          return true;
        };
        setImmediate(() => {
          if (outcome === "error") child.emit("error", new Error("spawn failed"));
          else if (outcome === "signal") signals.emit("SIGINT");
          else child.emit("close", 9, null);
        });

        return child;
      }
    });
    if (outcome === "error" || outcome === "throw") await assert.rejects(promise, /spawn failed/);
    else assert.equal(await promise, outcome === "exit" ? 9 : 130);
    assert.equal(closed, 1, outcome);
    assert.equal(signals.listenerCount("SIGINT"), 0);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  }
});

/** @id TEST-DEV-004 @verifies REQ-DEV-004 */
test("TEST-DEV-004 Windows UNC workspace is rejected with actionable guidance", () => {
  assert.doesNotThrow(() => assertNativeWorkspace("win32", "C:\\src\\fuzukue"));
  assert.doesNotThrow(() => assertNativeWorkspace("linux", "/home/example/fuzukue"));
  for (const path of ["\\\\wsl.localhost\\Ubuntu\\home\\example\\fuzukue", "//server/share/fuzukue"]) {
    assert.throws(() => assertNativeWorkspace("win32", path), /local Windows directory.*npm ci/);
  }
});
