import { expect, test } from "@playwright/test";
import { STORAGE_KEY, openAs, state, watch } from "./helpers";

test("buzilgan demo ma'lumot oq ekran emas, tiklash oynasini chiqaradi", async ({ page }) => {
  await watch(page);
  await page.goto("./");
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ version: s.version, currentUserId: "u_boss", users: [] }));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Nimadir noto'g'ri ketdi");
  await page.getByRole("button", { name: "Demo'ni qayta tiklash" }).click();
  await expect(page.locator("main h1").first()).toBeVisible();
  expect((await state(page)).users.length).toBeGreaterThan(5);
});

test("foydalanuvchi kiritgan HTML/skript matn sifatida ko'rsatiladi (XSS yo'q)", async ({ page }) => {
  const p = await watch(page);
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs++;
    void d.dismiss();
  });
  await openAs(page, "u_boss", "/crm");
  await page.getByRole("button", { name: "+ Yangi lid" }).click();
  const payload = `<img src=x onerror="alert('xss')">`;
  await page.locator("[role=dialog]").getByLabel("Ism / kompaniya").fill(payload);
  await page.locator("[role=dialog]").getByLabel("Telefon").fill("+998 00 000 00 01");
  await page.locator("[role=dialog]").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText(payload).first()).toBeVisible();
  expect(await page.locator("main img[src='x']").count()).toBe(0);
  expect(dialogs).toBe(0);
  expect(p.errors.filter((e) => !e.includes("/x"))).toEqual([]);
});

test("javascript: havolasi bosilganda skript ishlamaydi", async ({ page }) => {
  await watch(page);
  await openAs(page, "u_boss");
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    const p = s.projects.find((x: { id: string }) => x.id === "p_mebel");
    p.links = "javascript:alert(document.domain)";
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);
  await openAs(page, "u_boss", "/loyiha/p_mebel");
  const href = await page.locator("main a[target=_blank]").first().getAttribute("href");
  expect(href).toMatch(/^https:\/\//);
});
