/**
 * Browser regression suite: the production build, served at the GitHub Pages path, driven in
 * Chromium at phone and desktop size. Run `pnpm build` first, then `pnpm e2e`.
 */
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (!existsSync("dist/index.html")) {
  throw new Error("No production build found. Run `SUBTITLE_STUDIO_BASE=/Subtitle-Studio/ pnpm build` first.");
}

const PORT = 4174;
// Must match the base the build was made with (the repository name on GitHub Pages).
const BASE = process.env.SUBTITLE_STUDIO_BASE ?? "/Subtitle-Studio/";
// Use a preinstalled Chromium when one is provided (e.g. in a sandbox); CI installs its own.
const executablePath = process.env.E2E_CHROMIUM;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // In CI, failures also appear as annotations on the run (readable without downloading logs).
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}${BASE}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1400, height: 900 }, browserName: "chromium" } },
  ],
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}${BASE}`,
    env: { SUBTITLE_STUDIO_BASE: BASE },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
