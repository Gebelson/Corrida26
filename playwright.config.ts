import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100/api/board",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      APP_MODE: "sandbox",
      APP_ORIGIN: "http://127.0.0.1:3100",
      LOCAL_DATABASE_PATH: join(tmpdir(), `corrida26-e2e-${process.pid}`),
      SESSION_SECRET: randomBytes(48).toString("hex"),
    },
  },
});
