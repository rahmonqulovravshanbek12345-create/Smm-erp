import { signInitData } from "../server/src/tg-auth";
import { expect, test } from "./fixtures";
import { PASS, SERVER } from "./helpers";

// Telegram Mini App (/tg): Telegram o'rniga test imzolagan ma'lumot (#tgWebAppData=…) bilan ochiladi
const TOKEN = "123456:E2E-miniapp-token_000000000000000";
const launch = (tgId: number) => {
  const initData = signInitData(TOKEN, {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: tgId, first_name: "Sinov" }),
  });
  const theme = JSON.stringify({ bg_color: "#17212b", text_color: "#f5f5f5" });
  return `./tg#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=android&tgWebAppThemeParams=${encodeURIComponent(theme)}`;
};
const serverState = async (page: import("@playwright/test").Page) => {
  await page.waitForFunction(() => document.documentElement.dataset.sync !== "busy");
  return (await (await page.request.get("./__test/state")).json()).state;
};

test.use({ viewport: { width: 390, height: 844 } });

test("Server: Mini App — Telegram'dan tashqarida ochilmaydi; parol + Telegram bilan kirish; faqat kundalik ishlar", async ({ page }) => {
  test.skip(!SERVER, "Faqat serverli tizimda");
  const r = await page.request.post("./__test/miniapp", { data: { token: TOKEN, chats: { u_dz: "5001", u_boss: "5002" } }, headers: { "x-erp": "1" } });
  expect(r.ok()).toBe(true);

  // Brauzerda to'g'ridan-to'g'ri ochilsa — Telegram tasdig'i yo'q
  await page.goto("./tg");
  await expect(page.getByRole("heading", { name: "Telegram orqali oching" })).toBeVisible();

  // Dizayner: login va parol (kod so'ralmaydi). Telegram har safar sahifani yangidan ochadi
  await page.goto("about:blank");
  await page.goto(launch(5001));
  await expect(page.getByText("Kod so'ralmaydi")).toBeVisible();
  expect(page.url()).not.toContain("tgWebAppData");
  await page.getByLabel("Login").fill("u_dz");
  await page.getByLabel("Parol").fill(PASS);
  await page.getByRole("button", { name: "Kirish" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.me === "u_dz");
  // Telegram mavzusi (qorong'i) qo'llandi
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Menyuda pul va sozlamalar yo'q
  await page.getByRole("button", { name: "Yana" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("link", { name: "Dizayn" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Mening hisobim" })).toHaveCount(0);
  await expect(sheet.getByRole("link", { name: "Qanday ishlaydi" })).toHaveCount(0);
  await sheet.getByRole("link", { name: "Dizayn" }).click();

  // Vazifani boshlash — serverda saqlanadi, tarixda «Telegram orqali»
  const card = page
    .locator("article, div")
    .filter({ hasText: "Guruh mashg'ulotlari jadvali" })
    .filter({ has: page.getByRole("button", { name: "▶ Boshlash" }) })
    .last();
  await card.getByRole("button", { name: "▶ Boshlash" }).click();
  await expect(page.getByText("Jarayonda").first()).toBeVisible();
  const s1 = await serverState(page);
  expect(s1.tasks.find((t: { title: string }) => t.title === "Guruh mashg'ulotlari jadvali").status).toBe("progress");
  expect(s1.activity[0].text).toMatch(/· Telegram orqali$/);

  // Qayta yuklansa — parol so'ralmaydi (12 soat)
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.me === "u_dz");

  // Chiqish
  await page.getByRole("button", { name: /^Akkaunt:/ }).click();
  await page.getByRole("button", { name: "Chiqish" }).click();
  await expect(page.getByRole("heading", { name: "Tizimga kirish" })).toBeVisible();

  // Rahbar dizaynerning Telegram'idan kira olmaydi
  await page.getByLabel("Login").fill("u_boss");
  await page.getByLabel("Parol").fill(PASS);
  await page.getByRole("button", { name: "Kirish" }).click();
  await expect(page.getByText("ERP'dagi profilingizga bog'lanmagan")).toBeVisible();

  // O'z Telegram'idan: bosh sahifa — nazorat paneli (moliya emas); moliya sahifasi ochilmaydi
  await page.goto("about:blank");
  await page.goto(launch(5002));
  await page.getByLabel("Login").fill("u_boss");
  await page.getByLabel("Parol").fill(PASS);
  await page.getByRole("button", { name: "Kirish" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.me === "u_boss");
  await expect(page.getByRole("heading", { name: "Nazorat paneli" })).toBeVisible();
  await page.evaluate(() => (location.hash = "/moliya"));
  await expect(page.getByRole("heading", { name: "Nazorat paneli" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/");
  await page.getByRole("button", { name: "Yana" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: /Moliya|Kirim-chiqim|Ish haqi|Sozlamalar/ })).toHaveCount(0);
});
