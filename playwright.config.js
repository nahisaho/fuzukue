import { defineConfig } from "@playwright/test";
import { createServer } from "node:net";

if (!process.env.FUZUKUE_TEST_PORT) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.FUZUKUE_TEST_PORT = String(server.address().port);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
const port = Number(process.env.FUZUKUE_TEST_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid FUZUKUE_TEST_PORT");
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30000,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1280, height: 900 } },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000
  }
});
