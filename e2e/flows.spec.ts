import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openAs, state, watch } from "./helpers";

const dialog = (page: Page) => page.locator("[role=dialog]");

test("Lid → tijorat taklifi → qabul → shartnoma → oldindan to'lov → ish ochiladi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_boss", "/crm");
  await page.getByRole("button", { name: "+ Yangi lid" }).click();
  await dialog(page).getByLabel("Ism / kompaniya").fill("Test Restoran");
  await dialog(page).getByLabel("Telefon").fill("+998 00 123 45 67");
  await dialog(page).getByRole("button", { name: "Saqlash" }).click();
  await page.getByText("Test Restoran").first().click();
  await dialog(page).getByRole("button", { name: "+ Tijorat taklifi" }).click();
  await page.getByRole("button", { name: "Taklifni tayyorlash" }).click();
  await expect(page).toHaveURL(/#\/taklif\//);
  await expect(page.getByRole("heading", { name: /Test Restoran/ })).toBeVisible();
  await page.getByRole("button", { name: /Yuborildi deb belgilash/ }).click();
  await page.getByRole("button", { name: /Qabul qildi/ }).click();
  await page.getByRole("button", { name: /Shartnoma → loyiha kartasi/ }).click();
  await dialog(page).getByPlaceholder("SH-2026/060").fill("SH-2026/150");
  await dialog(page).getByRole("button", { name: "Loyiha kartasini yaratish" }).click();
  await expect(page).toHaveURL(/#\/loyiha\//);
  await expect(page.locator("main")).toContainText("SMM: Biznes");
  await expect(page.locator("main")).toContainText("Oldindan to'lov hali kelmagan");

  let s = await state(page);
  const project = s.projects.find((x: { name: string }) => x.name === "Test Restoran");
  expect(project).toMatchObject({ tariffId: "t_biznes", monthlyFee: 12_000_000, prepayType: 50 });
  const prepay = s.invoices.find((i: { projectId: string; kind: string }) => i.projectId === project.id && i.kind === "prepay");

  await page.evaluate((h) => (location.hash = h), "/moliya/fakturalar");
  await page.locator("tr", { hasText: prepay.number }).getByRole("button", { name: "To'lov" }).click();
  await dialog(page).getByLabel(/Summa/).fill(String(prepay.amount));
  await dialog(page).getByRole("button", { name: "Qabul qilish" }).click();
  // Standart filtr «To'lanmaganlar» — to'langan faktura ro'yxatdan chiqadi
  await expect(page.locator("tr", { hasText: prepay.number })).toHaveCount(0);

  await page.evaluate((h) => (location.hash = h), `/loyiha/${project.id}`);
  await expect(page.locator("main")).not.toContainText("Oldindan to'lov hali kelmagan");
  s = await state(page);
  expect(s.notifications.some((n: { text: string }) => n.text.includes("Test Restoran: oldindan to'lov keldi"))).toBe(true);
  expect(p.errors).toEqual([]);
});

test("Kontent: ichki tasdiq → marketolog tasdig'i → mijoz tasdig'i → joylandi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_smm1", "/kontent");
  const s = await state(page);
  const mine = new Set(s.projects.filter((x: { smmId: string; pauseWork: boolean }) => x.smmId === "u_smm1" && !x.pauseWork).map((x: { id: string }) => x.id));
  const post = s.posts.find((x: { projectId: string; status: string }) => mine.has(x.projectId) && x.status === "design");
  expect(post, "demo'da dizayn bosqichidagi post bo'lishi kerak").toBeTruthy();

  await page.getByText(post.topic).filter({ visible: true }).first().click();
  await dialog(page)
    .getByRole("button", { name: /Ichki tasdiqqa yuborish/ })
    .click();
  await openAs(page, "u_mk", "/tasdiqlash");
  const card = page
    .locator("div", { hasText: post.topic })
    .filter({ has: page.getByRole("button", { name: "✓ Tasdiqlash" }) })
    .last();
  await card.getByRole("button", { name: "✓ Tasdiqlash" }).click();
  await openAs(page, "u_smm1", "/kontent");
  await page.getByText(post.topic).filter({ visible: true }).first().click();
  // Oyna ochiq qoladi — keyingi qadam shu yerning o'zida
  await dialog(page)
    .getByRole("button", { name: /Mijoz tasdiqladi/ })
    .click();
  await dialog(page)
    .getByRole("button", { name: /Joylandi/ })
    .click();

  const after = await state(page);
  expect(after.posts.find((x: { id: string }) => x.id === post.id).status).toBe("published");
  const texts = after.notifications.map((n: { text: string }) => n.text);
  expect(texts.some((t: string) => t.startsWith(`Tasdiqlash so'rovi: ${post.topic}`))).toBe(true);
  expect(texts.some((t: string) => t.startsWith(`Joylandi: ${post.topic}`))).toBe(true);
  expect(p.errors).toEqual([]);
});

test("Montaj qabul qilinadi → ishbay hisoblanadi → moliya to'laydi → xodim o'z hisobida ko'radi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_smm1", "/montaj");
  const before = await state(page);
  await page.getByRole("button", { name: "✓ Qabul" }).first().click();
  const mid = await state(page);
  const acr = mid.accruals.find((a: { id: string }) => !before.accruals.some((b: { id: string }) => b.id === a.id));
  expect(acr).toBeTruthy();
  expect(acr.amount).toBeGreaterThan(0);

  const worker = mid.users.find((u: { id: string }) => u.id === acr.userId);
  await openAs(page, "u_mol", "/moliya/ish-haqi");
  await page.locator("tr", { hasText: worker.name }).getByRole("button", { name: "To'lash" }).click();
  await dialog(page).getByRole("button", { name: "To'lash" }).click();
  const after = await state(page);
  expect(after.transactions.length).toBe(mid.transactions.length + 1);

  await openAs(page, acr.userId, "/hisobim");
  await expect(page.locator("main")).toContainText(acr.title);
  expect(p.errors).toEqual([]);
});

test("Telegram: barcha xodimlarga bitta chat, xabarda qabul qiluvchi ko'rsatiladi", async ({ page }) => {
  const p = await watch(page);
  const sent: { chat_id: string; text: string }[] = [];
  await page.route("https://api.telegram.org/**", async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"ok":true}' });
  });
  await openAs(page, "u_admin", "/admin");
  await page.getByPlaceholder("123456:ABC-DEF…").fill("123:TEST");
  await page.getByPlaceholder("123456:ABC-DEF…").blur();
  await page.locator("input[placeholder='masalan 123456789']").last().fill("555777");
  await page.getByRole("button", { name: "Hammaga qo'yish" }).click();
  await page.getByRole("button", { name: "Menga test xabar yuborish" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ chat_id: "555777" });
  expect(sent[0]!.text).toContain("👤 Tizim administratori · Admin");

  await openAs(page, "u_smm1", "/montaj");
  await page.getByRole("button", { name: "✓ Qabul" }).first().click();
  await expect.poll(() => sent.length, { timeout: 8000 }).toBeGreaterThanOrEqual(3);
  expect(sent.slice(1).every((m) => m.text.includes("· Montajyor"))).toBe(true);

  await openAs(page, "u_admin", "/admin");
  await page.getByRole("button", { name: "Demo'ni qayta tiklash" }).click();
  await page.getByRole("button", { name: "Ha, tiklash" }).click();
  const s = await state(page);
  expect(s.settings.telegram.botToken).toBe("123:TEST");
  expect(s.users.every((u: { telegramChatId?: string }) => u.telegramChatId === "555777")).toBe(true);
  expect(p.errors).toEqual([]);
});

test("Integratsiyalar: Meta Ads va Markaziy bank (soxta API bilan)", async ({ page }) => {
  const p = await watch(page);
  await page.route("https://graph.facebook.com/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith("/me")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"name":"SMM Studio API"}' });
    const tr = JSON.parse(u.searchParams.get("time_range")!);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          { date_start: tr.since, spend: "12.50", impressions: "1500", clicks: "40", account_currency: "USD", actions: [{ action_type: "lead", value: "3" }] },
        ],
      }),
    });
  });
  await page.route("https://cbu.uz/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '[{"Rate":"12712.34","Date":"07.10.2026"}]' }),
  );

  await openAs(page, "u_boss", "/integratsiyalar");
  const acc = page.getByLabel("Sharq Mebel: reklama kabineti ID");
  await acc.fill("act_99887766");
  await acc.blur();
  await page.getByRole("button", { name: "Hozir sinxronlash" }).click();
  await expect(page.locator("main")).toContainText("Meta Ads: Sharq Mebel — 1 kun (demo)");

  await page.getByPlaceholder("EAAB…").fill("EAABtest");
  await page.getByPlaceholder("EAAB…").blur();
  await page.getByRole("button", { name: "Ulanishni tekshirish" }).click();
  await expect(page.locator("main")).toContainText("token tekshirildi (SMM Studio API)");

  await page.getByRole("button", { name: "Markaziy bankdan yangilash" }).click();
  await expect(page.locator("main")).toContainText("1 USD = 12 712 so'm");
  expect((await state(page)).settings.usdRate).toBe(12712.34);
  expect(p.errors).toEqual([]);
});

test("Excel eksport haqiqiy .xlsx beradi, chop etish tugmasi ishlaydi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_boss", "/moliya/pnl");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^foyda-zarar-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = await readFile((await dl.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.toString("latin1")).toContain("xl/workbook.xml");

  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => void (window as unknown as { __printed: number }).__printed++;
  });
  await page.evaluate((h) => (location.hash = h), "/hujjat/dalolatnoma/p_mebel/4");
  await page.getByRole("button", { name: /PDF \/ chop etish/ }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("aside")).toBeHidden();
  await expect(page.getByRole("heading", { name: /DALOLATNOMASI/i })).toBeVisible();
  expect(p.errors).toEqual([]);
});

test("Loyihani yopish va noto'g'ri ish haqi yozuvini o'chirish", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_boss", "/loyiha/p_burger");
  await page.getByRole("button", { name: "Loyihani yopish…" }).click();
  await page.getByRole("button", { name: "Yopish", exact: true }).click();
  await expect(page.locator("main")).toContainText("Loyiha yopilgan");
  expect((await state(page)).projects.find((x: { id: string }) => x.id === "p_burger").status).toBe("closed");

  await openAs(page, "u_mol", "/moliya/ish-haqi");
  await page.getByRole("button", { name: /Hisoblashlar/ }).click();
  const before = (await state(page)).accruals.length;
  const del = page.locator('button[aria-label^="O\'chirish:"]').first();
  await expect(del).toBeVisible();
  await del.click();
  await page.getByRole("button", { name: "O'chirish", exact: true }).click();
  expect((await state(page)).accruals.length).toBe(before - 1);
  expect(p.errors).toEqual([]);
});

test("Rad etishda sabab majburiy (forma bo'sh yuborilmaydi)", async ({ page }) => {
  await watch(page);
  await openAs(page, "u_op1", "/crm");
  await page.getByText("Avto Detailing Pro").first().click();
  await dialog(page).getByRole("button", { name: "→ To'g'ri kelmadi" }).click();
  await expect(dialog(page).getByRole("button", { name: "Tasdiqlash" })).toBeDisabled();
  await dialog(page).getByPlaceholder("Masalan: byudjet to'g'ri kelmadi").fill("Narx qimmat");
  await dialog(page).getByRole("button", { name: "Tasdiqlash" }).click();
  const s = await state(page);
  expect(s.leads.find((l: { id: string }) => l.id === "l_5")).toMatchObject({ stage: "unfit", rejectReason: "Narx qimmat" });
});
