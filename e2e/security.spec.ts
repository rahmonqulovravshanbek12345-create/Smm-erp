import { expect, test } from "@playwright/test";
import { STORAGE_KEY, openAs, state, watch } from "./helpers";

test("buzilgan demo ma'lumot oq ekran emas: zaxiraga olinadi va demo qayta ochiladi", async ({ page }) => {
  await watch(page);
  await page.goto("./");
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ version: s.version, currentUserId: "u_boss", users: [] }));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText(/zaxiraga olindi/)).toBeVisible();
  expect((await state(page)).users.length).toBeGreaterThan(5);
  const backup = await page.evaluate((key) => localStorage.getItem(`${key}-backup`), STORAGE_KEY);
  expect(JSON.parse(backup!).users).toEqual([]);
});

test("eski yoki qisman saqlangan ma'lumot (ro'yxatlar yetishmaydi) ilovani yiqitmaydi", async ({ page }) => {
  const p = await watch(page);
  await page.goto("./");
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    delete s.tariffs;
    delete s.proposals;
    delete s.accruals;
    delete s.payProfiles;
    delete s.notifications;
    delete s.integrationLog;
    delete s.settings.integrations;
    for (const x of s.posts) delete x.platforms;
    s.leads.push({ ...s.leads[0], id: "lead_keep", name: "Saqlanib qolishi kerak" });
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);
  for (const path of ["/", "/takliflar", "/integratsiyalar", "/kontent", "/moliya/ish-haqi", "/crm"]) {
    await page.goto(`./#${path}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Nimadir noto'g'ri ketdi" })).toHaveCount(0);
  }
  expect((await state(page)).leads.some((l: { id: string }) => l.id === "lead_keep")).toBe(true);
  expect(p.errors).toEqual([]);
});

test("ikkita oyna: birida qo'shilgan ma'lumot ikkinchisida yo'qolib ketmaydi", async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto("./");
  await expect(a.locator("#root")).not.toBeEmpty();
  const b = await ctx.newPage();
  await b.goto("./");
  await expect(b.locator("#root")).not.toBeEmpty();
  // A oynada o'zgarish (to'g'ridan-to'g'ri saqlash orqali — boshqa oyna o'zgartirgandek)
  await a.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    s.leads.push({ ...s.leads[0], id: "lead_a", name: "A oynadagi lid" });
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);
  // B oyna yangi holatni oladi va o'z o'zgarishini uning ustiga qo'shadi
  await expect(b.getByText("Ma'lumot boshqa oynada yangilandi")).toBeVisible();
  const leads = await b.evaluate((key) => JSON.parse(localStorage.getItem(key)!).leads.map((l: { id: string }) => l.id), STORAGE_KEY);
  expect(leads).toContain("lead_a");
  await ctx.close();
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
