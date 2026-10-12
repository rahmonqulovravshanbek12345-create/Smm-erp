import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Serverli tizim: haqiqiy server + PostgreSQL. Har test oldidan baza demo holatiga qaytariladi (testlar ketma-ket).
const localChromium = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const PORT = 4174;
const DB = process.env.TEST_DATABASE_URL ?? "postgres://erp:erptest@127.0.0.1:55432/erp_test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1440, height: 900 },
    // Server Toshkent vaqtida ishlaydi — brauzer ham (yarim tunda «bugun» farq qilmasin)
    timezoneId: "Asia/Tashkent",
    acceptDownloads: true,
    trace: "retain-on-failure",
    launchOptions: !process.env.CI && existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: "node server/dist/e2e-server.mjs",
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: DB,
      APP_ORIGIN: `http://127.0.0.1:${PORT}`,
      SECRET_KEY: Buffer.alloc(32, 9).toString("base64"),
      STATIC_DIR: "dist-server",
      COOKIE_SECURE: "0",
      REQUIRE_2FA_ROLES: "",
      RATE_LIMITS: "0",
      JOBS: "0",
      PORT: String(PORT),
      LOG_LEVEL: "warn",
      E2E_SERVER: "1",
    },
  },
});
