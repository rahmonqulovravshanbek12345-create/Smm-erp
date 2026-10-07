import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Lokal muhitda oldindan o'rnatilgan Chromium ishlatiladi; CI'da `npx playwright install chromium`.
const localChromium = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173/Smm-erp/",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    launchOptions: !process.env.CI && existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: "node scripts/serve-pages.mjs",
    url: "http://127.0.0.1:4173/Smm-erp/",
    reuseExistingServer: !process.env.CI,
  },
});
