import { createHmac } from "node:crypto";
import { expect, test } from "./fixtures";
import { openAs, SERVER } from "./helpers";

// e2e serveri SECRET_KEY = 32 ta bayt «9» (playwright.server.config.ts)
const SECRET = createHmac("sha256", Buffer.alloc(32, 9)).update("telegram-webhook").digest("hex");
const HEADER = "x-telegram-bot-api-secret-token";

test("Demo: botga ulanish ustuni ko'rinmaydi (faqat serverli tizimda)", async ({ page }) => {
  test.skip(SERVER, "Demo uchun");
  await openAs(page, "u_admin", "/admin");
  await expect(page.getByRole("heading", { name: "Foydalanuvchilar" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Telegram bot" })).toHaveCount(0);
});

test("Server: xodim botni bloklasa admin jadvalda ko'radi va xabar oladi; so'rov maxfiy so'z bilan tekshiriladi", async ({ page }) => {
  test.skip(!SERVER, "Faqat serverli tizimda");
  await openAs(page, "u_admin", "/admin");
  // Xodim ismi jadvalda tahrirlanadigan maydon, shuning uchun qator shu maydon bo'yicha topiladi
  const row = page.locator("tr").filter({ has: page.getByLabel("Madina Rashidova: ism-familiya") });
  await expect(page.getByRole("columnheader", { name: "Telegram bot" })).toBeVisible();
  await expect(row).toContainText("Ulanmagan");

  // Chat ID kiritildi, lekin bot haqida hali hech narsa bilinmaydi
  await page.getByLabel("Madina Rashidova: Telegram chat ID").fill("1001");
  await page.getByLabel("Madina Rashidova: Telegram chat ID").blur();
  await expect(page.getByText("Chat ID saqlandi")).toBeVisible();
  await expect(row).toContainText("Noma'lum");

  // Telegram yuborgan yangilanish: maxfiy so'zsiz rad etiladi, to'g'ri so'z bilan qabul qilinadi
  const blocked = { update_id: 1, my_chat_member: { chat: { id: 1001, type: "private" }, new_chat_member: { status: "kicked" } } };
  expect((await page.request.post("./api/webhooks/telegram", { data: blocked, headers: { [HEADER]: "noto'g'ri" } })).status()).toBe(403);
  await page.reload();
  await expect(row).toContainText("Noma'lum");

  expect((await page.request.post("./api/webhooks/telegram", { data: blocked, headers: { [HEADER]: SECRET } })).ok()).toBe(true);
  await page.reload();
  await expect(row).toContainText("Bloklagan");

  // Admin xabar oladi
  await page.goto("./#/bildirishnomalar");
  await expect(page.getByText(/Madina Rashidova.*Telegram botni to'xtatdi/).first()).toBeVisible();

  // Qayta /start bosdi — ulangan
  const start = { update_id: 2, message: { chat: { id: 1001, type: "private" }, text: "/start" } };
  expect((await page.request.post("./api/webhooks/telegram", { data: start, headers: { [HEADER]: SECRET } })).ok()).toBe(true);
  await page.goto("./#/admin");
  await page.reload();
  await expect(row).toContainText("Ulangan");
});
