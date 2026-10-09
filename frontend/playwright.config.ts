import { defineConfig } from "@playwright/test";

/**
 * Browser tests against a running dev stack with demo data:
 *   backend: manage.py seed_demo && manage.py runserver 127.0.0.1:8000
 *   frontend: npm run dev
 * Uses the locally installed Chrome by default (PW_CHANNEL=msedge or "" for bundled Chromium).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
