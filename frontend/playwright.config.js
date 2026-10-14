import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Both overridable so CI (or a clean worktree of a release commit) can point
// the suite at a different checkout.
const FRONTEND_DIR = process.env.E2E_FRONTEND_DIR || here;
const API_PORT = process.env.E2E_API_PORT || "5001";
const WEB_PORT = process.env.E2E_FRONTEND_PORT || "5174";

const venvPython = [
  path.resolve(here, "../.venv/Scripts/python.exe"),
  path.resolve(here, "../.venv/bin/python"),
].find((p) => fs.existsSync(p));
const PYTHON = process.env.E2E_PYTHON || venvPython || "python";

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/playwright-report", open: "never" }],
    ["json", { outputFile: "e2e/reports/results.json" }],
  ],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    screenshot: "on",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Isolated backend: fresh DB on the disposable test Postgres (:55432).
      command: `"${PYTHON}" e2e/support/run_e2e_backend.py`,
      url: `http://localhost:${API_PORT}/ping`,
      timeout: 120_000,
      reuseExistingServer: false,
      cwd: here,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      cwd: FRONTEND_DIR,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
