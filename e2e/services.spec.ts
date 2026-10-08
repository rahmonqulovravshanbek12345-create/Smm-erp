import { expect, test, type Page } from "@playwright/test";
import { openAs, state, watch } from "./helpers";

const dialog = (page: Page) => page.locator("[role=dialog]");

test("Post bir nechta platformada: har biri alohida joylanadi, rejada 1 ta post", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_smm1", "/kontent");
  await page.getByRole("button", { name: "Ro'yxat" }).click();
  await page.getByText("Yotoqxona to'plami obzori").first().click();
  const rows = dialog(page).locator("li", { hasText: "Telegram" });
  await rows.getByRole("button", { name: "Joylandi" }).click();
  let s = await state(page);
  let post = s.posts.find((x: { topic: string }) => x.topic === "Yotoqxona to'plami obzori");
  expect(post.status).toBe("approved");
  expect(Object.keys(post.publishedOn).sort()).toEqual(["instagram", "telegram"]);
  await dialog(page).locator("li", { hasText: "TikTok" }).getByRole("button", { name: "Joylandi" }).click();
  s = await state(page);
  post = s.posts.find((x: { topic: string }) => x.topic === "Yotoqxona to'plami obzori");
  expect(post.status).toBe("published");
  expect(s.notifications.some((n: { text: string }) => n.text.includes("Instagram, Telegram, TikTok"))).toBe(true);
  expect(p.errors).toEqual([]);
});

test("Yangi post: bir nechta platforma tanlanadi va tur bo'yicha topshiriqqa sanaladi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_smm2", "/kontent");
  const before = await state(page);
  await page.getByRole("button", { name: "+ Post" }).click();
  await dialog(page).getByLabel("Turi").selectOption({ label: "Video (reels)" });
  await dialog(page)
    .getByRole("button", { name: /TikTok/ })
    .click();
  await dialog(page)
    .getByRole("button", { name: /YouTube/ })
    .click();
  await dialog(page).getByPlaceholder("Masalan: Yangi kolleksiya obzori").fill("Uch platformali video");
  await dialog(page).getByRole("button", { name: "Saqlash" }).click();
  const s = await state(page);
  const post = s.posts.find((x: { topic: string }) => x.topic === "Uch platformali video");
  expect(post.platforms).toEqual(["instagram", "tiktok", "youtube"]);
  expect(post.typeId).toBe("ct_video");
  expect(s.posts.length).toBe(before.posts.length + 1);
  expect(p.errors).toEqual([]);
});

test("Marketolog oylik topshiriq beradi → SMM menejerga xabar, tarixda o'zgarish", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/loyiha/p_gym");
  await page.getByRole("button", { name: "Kontent reja" }).click();
  await expect(page.getByText(/Oylik topshiriq ·/)).toBeVisible();
  await page.getByRole("button", { name: "O'zgartirish" }).click();
  await dialog(page).getByLabel("Video (reels) — bu oy").fill("9");
  await dialog(page).getByRole("button", { name: "+ Yangi tur qo'shish" }).click();
  await dialog(page).getByPlaceholder("Masalan: Jonli efir").fill("Jonli efir");
  await dialog(page).getByRole("button", { name: "Qo'shish", exact: true }).click();
  await dialog(page).getByLabel("Jonli efir — bu oy").fill("2");
  await dialog(page).getByRole("button", { name: "Saqlash va SMM'ga yuborish" }).click();
  const s = await state(page);
  const q = s.quotas.find((x: { projectId: string }) => x.projectId === "p_gym");
  expect(q.counts.ct_video).toBe(9);
  expect(Object.values(q.counts)).toContain(2);
  expect(q.history[0].text).toContain("Video 6 → 9");
  expect(s.notifications.some((n: { userId: string; text: string }) => n.userId === "u_smm2" && n.text.includes("o'zgardi"))).toBe(true);
  expect(p.errors).toEqual([]);
});

test("Sayt: veb-dasturchi bosqichlarni o'tkazadi → topshirildi → qoldiq faktura va ish haqi", async ({ page }) => {
  const p = await watch(page);
  page.on("dialog", (d) => d.accept());
  await openAs(page, "u_web", "/mening");
  const card = page
    .locator("div", { hasText: "Sayt qilish — Korporativ sayt" })
    .filter({ has: page.getByRole("button", { name: /Keyingi bosqich|Topshirildi/ }) })
    .last();
  for (let i = 0; i < 4; i++) await card.getByRole("button", { name: /Keyingi bosqich/ }).click();
  await card.getByRole("button", { name: /Topshirildi/ }).click();
  const s = await state(page);
  const prj = s.projects.find((x: { id: string }) => x.id === "p_mebel");
  const svc = prj.services.find((x: { kind: string }) => x.kind === "web");
  expect(svc.status).toBe("done");
  expect(
    s.invoices.some((i: { serviceId?: string; kind: string; amount: number }) => i.serviceId === svc.id && i.kind === "remainder" && i.amount === 7_500_000),
  ).toBe(true);
  expect(
    s.accruals.some(
      (a: { sourceId?: string; userId: string; amount: number }) => a.sourceId === `svc:${svc.id}` && a.userId === "u_web" && a.amount === 4_000_000,
    ),
  ).toBe(true);
  expect(p.errors).toEqual([]);
});

test("Faqat branding mijozi: kontent reja yo'q, bosqichlar va 50% oldindan faktura", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/loyihalar");
  await page.getByRole("button", { name: "+ Yangi loyiha" }).click();
  await dialog(page).getByLabel("Mijoz (loyiha nomi)").fill("Test Branding");
  await dialog(page).getByPlaceholder("SH-2026/060").fill("SH-2026/300");
  await dialog(page).getByRole("button", { name: "+ Xizmat qo'shish" }).click();
  await dialog(page).getByRole("button", { name: "+ Branding" }).click();
  // SMM xizmatini olib tashlaymiz — mijoz faqat branding oladi
  await dialog(page).getByRole("button", { name: "Olib tashlash" }).first().click();
  await dialog(page).getByRole("button", { name: "Loyiha kartasini yaratish" }).click();
  await expect(page).toHaveURL(/#\/loyiha\//);
  await expect(page.locator("main")).toContainText("Branding");
  await expect(page.getByRole("button", { name: "Kontent reja" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Keyingi bosqich/ })).toBeVisible();
  const s = await state(page);
  const prj = s.projects.find((x: { name: string }) => x.name === "Test Branding");
  expect(prj.monthlyFee).toBe(0);
  const invs = s.invoices.filter((i: { projectId: string }) => i.projectId === prj.id);
  expect(invs).toHaveLength(1);
  expect(invs[0].serviceId).toBe(prj.services[0].id);
  expect(invs[0].amount).toBe(prj.services[0].price / 2);
  expect(p.errors).toEqual([]);
});

test("Tariflar: xizmatlar bo'yicha tablar; taklif bir nechta xizmatdan", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/takliflar");
  await page.getByRole("button", { name: /Tariflar va paketlar/ }).click();
  await page.getByRole("tab", { name: /Sayt qilish/ }).click();
  await expect(page.getByText("Korporativ sayt").first()).toBeVisible();
  await expect(page.getByText("Internet-do'kon").first()).toBeVisible();
  await page.getByRole("tab", { name: /Performance/ }).click();
  await expect(page.getByText("+ reklama byudjetidan 10%")).toBeVisible();
  expect(p.errors).toEqual([]);
});

test("Loyiha kartasida alohida «Oylik topshiriq» tabi: shu oy va keyingi oy", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/loyiha/p_baraka");
  await page.getByRole("button", { name: "Oylik topshiriq" }).click();
  await expect(page.getByText(/Oylik topshiriq · Oktyabr 2026/)).toBeVisible();
  await page.getByRole("button", { name: /Noyabr 2026/ }).click();
  await expect(page.getByText(/Oylik topshiriq · Noyabr 2026/)).toBeVisible();
  await page.getByRole("button", { name: "Topshiriq berish" }).click();
  await dialog(page).getByLabel("Video (reels) — bu oy").fill("4");
  await dialog(page).getByRole("button", { name: "Saqlash va SMM'ga yuborish" }).click();
  const s = await state(page);
  const q = s.quotas.find((x: { projectId: string; month: string }) => x.projectId === "p_baraka" && x.month === "2026-11");
  expect(q.counts.ct_video).toBe(4);
  expect(p.errors).toEqual([]);
});

test("Kontent reja (barcha loyihalar): har qatorda «Topshiriq berish» tugmasi va eslatma", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/kontent");
  const row = page.locator("li", { hasText: "Burger House" }).filter({ has: page.getByRole("button", { name: "Topshiriq berish" }) });
  await expect(row).toBeVisible();
  await expect(row.getByText("berilmagan")).toBeVisible();
  await row.getByRole("button", { name: "Topshiriq berish" }).click();
  await dialog(page).getByLabel("Video (reels) — bu oy").fill("4");
  await dialog(page).getByRole("button", { name: "Saqlash va SMM'ga yuborish" }).click();
  await expect(page.locator("li", { hasText: "Burger House" }).getByRole("button", { name: "O'zgartirish" })).toBeVisible();
  const s = await state(page);
  expect(s.quotas.some((x: { projectId: string }) => x.projectId === "p_burger")).toBe(true);
  // SMM menejerga tugma ko'rinmaydi
  await openAs(page, "u_smm1", "/kontent");
  await expect(page.getByRole("button", { name: "Topshiriq berish" })).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test("Marketolog «Bildirishnomalar»da topshiriq eslatmasini ko'radi", async ({ page }) => {
  await watch(page);
  await openAs(page, "u_mk", "/bildirishnomalar");
  await expect(page.getByText(/oylik topshiriq berilmagan/).first()).toBeVisible();
});

test("To'lov oynasi: USD hisob tanlansa, avtomatik summa dollarga o'giriladi (so'm dollar bo'lib yozilmaydi)", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mol", "/moliya/fakturalar");
  const s0 = await state(page);
  const inv = s0.invoices.find((i: { projectId: string; kind: string }) => i.projectId === "p_dent" && i.kind === "prepay");
  await page.locator("tr", { hasText: inv.number }).getByRole("button", { name: "To'lov" }).click();
  await dialog(page).getByLabel("Hisob (kassa)").selectOption("acc_usd");
  await dialog(page).getByRole("button", { name: "Qabul qilish" }).click();
  const s = await state(page);
  const tx = s.transactions.find((t: { invoiceId?: string }) => t.invoiceId === inv.id);
  expect(tx.accountId).toBe("acc_usd");
  // 4 000 000 so'm ≈ 316 USD; 4 000 000 USD bo'lib yozilmasligi kerak
  expect(tx.amount).toBeLessThan(1000);
  expect(tx.amount * tx.rate).toBeCloseTo(inv.amount, -3);
  expect(p.errors).toEqual([]);
});

test("To'lov summasi qolgan qarzdan ancha oshib ketsa — rad etiladi", async ({ page }) => {
  await watch(page);
  await openAs(page, "u_mol", "/moliya/fakturalar");
  const s0 = await state(page);
  const inv = s0.invoices.find((i: { projectId: string; kind: string }) => i.projectId === "p_dent" && i.kind === "prepay");
  await page.locator("tr", { hasText: inv.number }).getByRole("button", { name: "To'lov" }).click();
  await dialog(page)
    .getByLabel(/Summa/)
    .fill(String(inv.amount * 10));
  await dialog(page).getByRole("button", { name: "Qabul qilish" }).click();
  await expect(page.getByText(/ancha oshib ketdi/)).toBeVisible();
  const s = await state(page);
  expect(s.transactions.some((t: { invoiceId?: string }) => t.invoiceId === inv.id)).toBe(false);
});

test("Targetolog: «Biznes»/«Premium» paketdagi mijozlar ham Target sahifasida ko'rinadi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_tg", "/target");
  const options = await page.getByLabel("Loyiha").last().locator("option").allInnerTexts();
  for (const name of ["Sharq Mebel", "FitLife Gym", "Baraka Market", "Burger House", "Avto Lux"]) expect(options, name).toContain(name);
  expect(options).not.toContain("Nur Optika");
  expect(p.errors).toEqual([]);
});

test("Admin: xodimni arxivlash — ogohlantirish, tasdiq, qaytarish", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_admin", "/admin");
  const name: string = (await state(page)).users.find((u: { id: string }) => u.id === "u_dz").name;
  const row = page.locator("tr", { hasText: name }).first();
  await row.getByRole("button", { name: "Arxivlash" }).click();
  await expect(dialog(page).getByText(`Arxivlash: ${name}`)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Arxivlash" }).click();
  await expect(page.locator("tr", { hasText: name }).getByText("Arxivda")).toBeVisible();
  let s = await state(page);
  expect(s.users.find((u: { name: string }) => u.name === name).active).toBe(false);
  await page.locator("tr", { hasText: name }).getByRole("button", { name: "Qaytarish" }).click();
  s = await state(page);
  expect(s.users.find((u: { name: string }) => u.name === name).active).toBe(true);
  expect(p.errors).toEqual([]);
});

test("SMM menejer montajyorga TZ beradi: deadline soati bilan", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_smm1", "/kontent");
  await page.getByRole("button", { name: "+ Montaj TZ" }).click();
  await expect(dialog(page).getByLabel("Deadline soati")).toHaveValue("18:00");
  await dialog(page).getByLabel("Deadline soati").fill("14:30");
  await dialog(page).getByLabel("Vazifa nomi").fill("Soatli TZ sinov");
  await dialog(page)
    .getByRole("button", { name: /Yuborish|Saqlash|TZ/ })
    .last()
    .click();
  const s = await state(page);
  const task = s.tasks.find((x: { title: string }) => x.title === "Soatli TZ sinov");
  expect(task.deadlineTime).toBe("14:30");
  await openAs(page, "u_mt1", "/montaj");
  await expect(page.getByText(/, 14:30/).first()).toBeVisible();
  expect(p.errors).toEqual([]);
});
