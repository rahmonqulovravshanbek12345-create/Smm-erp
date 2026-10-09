// To'liq hayot sikli: bitta mijoz bilan ishlashning hamma bosqichi — har rol o'z oynasidan, haqiqiy tugmalar orqali,
// bir necha oy davomida. Har bosqichdan keyin moliyaviy invariantlar (mustaqil tekshiruv) bajariladi.
import { expect, test, type Page } from "@playwright/test";
import { check } from "../src/lib/audit-check";
import { openAs, settle, state, watch } from "./helpers";

const dialog = (page: Page) => page.locator("[role=dialog]");
test.use({ actionTimeout: 15_000 });
type S = Awaited<ReturnType<typeof state>>;

async function audit(page: Page, label: string) {
  const s: S = await state(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  expect(check(s, today), `${label} (${today})`).toEqual([]);
  return s;
}

async function setDay(page: Page, iso: string) {
  await page.clock.setSystemTime(new Date(`${iso}T10:00:00`));
}

test("To'liq hayot sikli: lid → shartnoma → to'lov → kontent → syomka → montaj → tasdiq → joylash → reklama → keyingi oy → ish haqi → yopish", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.clock.install({ time: new Date("2026-11-02T10:00:00") });
  const p = await watch(page);
  // Har yangi kunda ilova Markaziy bank kursini avtomatik so'raydi — testda soxta javob
  await page.route("https://cbu.uz/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: '[{"Rate":"12650.00","Date":"02.11.2026"}]',
    }),
  );

  // 1. Sotuv: lid → tijorat taklifi → qabul → loyiha kartasi
  await openAs(page, "u_boss", "/crm");
  await page.getByRole("button", { name: "+ Yangi lid" }).click();
  await dialog(page).getByLabel("Ism / kompaniya").fill("Hayot Sikli Kafe");
  await dialog(page).getByLabel("Telefon").fill("+998 00 765 43 21");
  await dialog(page).getByRole("button", { name: "Saqlash" }).click();
  await page.getByText("Hayot Sikli Kafe").first().click();
  await dialog(page).getByRole("button", { name: "+ Tijorat taklifi" }).click();
  await page.getByRole("button", { name: "Taklifni tayyorlash" }).click();
  await page.getByRole("button", { name: /Yuborildi deb belgilash/ }).click();
  await page.getByRole("button", { name: /Qabul qildi/ }).click();
  await page.getByRole("button", { name: /Shartnoma → loyiha kartasi/ }).click();
  await dialog(page).getByPlaceholder("SH-2026/060").fill("SH-2026/777");
  await dialog(page).getByRole("button", { name: "Loyiha kartasini yaratish" }).click();
  await expect(page).toHaveURL(/#\/loyiha\//);
  let s = await audit(page, "loyiha yaratildi");
  const project = s.projects.find((x: { name: string }) => x.name === "Hayot Sikli Kafe");
  expect(project.monthlyFee).toBeGreaterThan(0);
  const smm: string = project.smmId;
  const tg: string = project.targetologId;

  // 2. Moliya: oldindan to'lov(lar) qabul qilinadi → ish ochiladi
  await openAs(page, "u_mol", "/moliya/fakturalar");
  for (const inv of s.invoices.filter((i: { projectId: string; kind: string }) => i.projectId === project.id && i.kind === "prepay")) {
    await page.locator("tr", { hasText: inv.number }).getByRole("button", { name: "To'lov" }).click();
    await dialog(page).getByLabel(/Summa/).fill(String(inv.amount));
    await dialog(page).getByRole("button", { name: "Qabul qilish" }).click();
    await expect(page.locator("tr", { hasText: inv.number })).toHaveCount(0);
  }
  s = await audit(page, "oldindan to'lov");

  // 3. Marketolog: oylik topshiriq (4 ta video)
  await openAs(page, "u_mk", `/loyiha/${project.id}`);
  await page.getByRole("button", { name: "Kontent reja" }).click();
  await page
    .getByRole("button", { name: /Topshiriq berish|O'zgartirish/ })
    .first()
    .click();
  await dialog(page).getByLabel("Video (reels) — bu oy").fill("4");
  await dialog(page).getByRole("button", { name: "Saqlash va SMM'ga yuborish" }).click();
  s = await state(page);
  expect(s.quotas.find((q: { projectId: string }) => q.projectId === project.id).counts.ct_video).toBe(4);

  // 4. SMM: post (video, 2 platforma) → syomka belgilaydi
  await openAs(page, smm, "/kontent");
  await page.getByLabel("Loyiha").first().selectOption({ label: "Hayot Sikli Kafe" });
  await page.getByRole("button", { name: "+ Post" }).click();
  await dialog(page).getByLabel("Turi").selectOption({ label: "Video (reels)" });
  await dialog(page)
    .getByRole("button", { name: /Telegram/ })
    .click();
  await dialog(page).getByPlaceholder("Masalan: Yangi kolleksiya obzori").fill("Kafe ochilishi — reels");
  await dialog(page).getByLabel("Sana", { exact: true }).fill("2026-11-06");
  await dialog(page).getByRole("button", { name: "Saqlash" }).click();
  await page.getByRole("button", { name: "Ro'yxat", exact: true }).click();
  await page.getByText("Kafe ochilishi — reels").first().click();
  await dialog(page).getByRole("button", { name: "+ Syomka" }).click();
  await dialog(page).getByLabel("Vaqt").fill("11:00");
  await dialog(page).getByLabel("Joy").fill("Kafe zali");
  await dialog(page)
    .getByRole("button", { name: /Belgilash|Saqlash/ })
    .last()
    .click();
  s = await audit(page, "syomka belgilandi");
  const shoot = s.shoots.find((x: { projectId: string }) => x.projectId === project.id);
  expect(shoot.status).toBe("planned");

  // 5. Syomka operatori kadrlarni topshiradi
  await openAs(page, shoot.operatorId, "/syomka");
  const shootCard = page
    .locator("div.glass, div.tile", { hasText: "Kafe zali" })
    .filter({ has: page.getByPlaceholder("Kadrlar havolasi (Google Drive)") })
    .last();
  await shootCard.getByPlaceholder("Kadrlar havolasi (Google Drive)").fill("https://drive.google.com/drive/folders/kafe-kadrlar");
  await shootCard.getByRole("button", { name: /Montajyorga topshiril/ }).click();
  s = await audit(page, "kadrlar topshirildi");
  expect(s.shoots.find((x: { id: string }) => x.id === shoot.id).status).toBe("handed");

  // 6. SMM → montajyorga TZ (soat bilan); TZ kadrlar havolasini avtomatik oladi
  await openAs(page, smm, "/kontent");
  await page.getByLabel("Loyiha").first().selectOption({ label: "Hayot Sikli Kafe" });
  await page.getByRole("button", { name: "Ro'yxat", exact: true }).click();
  await page.getByText("Kafe ochilishi — reels").first().click();
  await dialog(page).getByRole("button", { name: "+ Montaj TZ" }).click();
  await dialog(page).getByLabel("Deadline soati").fill("16:00");
  await dialog(page).getByRole("button", { name: "TZ yuborish" }).click();
  s = await state(page);
  const task = s.tasks.find((t: { projectId: string; kind: string }) => t.projectId === project.id && t.kind === "montaj");
  expect(task.footageLink).toContain("kafe-kadrlar");
  expect(task.deadlineTime).toBe("16:00");

  // 7. Montajyor: boshlaydi → topshiradi; SMM qabul qiladi → ishbay haq hisoblanadi
  await openAs(page, task.assigneeId, "/montaj");
  // Vazifa kartasi: sarlavhadan eng yaqin karta
  const cardOf = (title: string) => page.getByText(title, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'glass')][1]");
  const card = cardOf(task.title);
  await card.getByRole("button", { name: "▶ Boshlash" }).click();
  await card.getByPlaceholder("Tayyor ish havolasi (Google Drive)").fill("https://drive.google.com/file/d/kafe-reels-v1");
  await card.getByRole("button", { name: "Tayyor — tekshiruvga" }).click();
  await openAs(page, smm, "/montaj");
  const review = cardOf(task.title);
  await review.getByRole("button", { name: "✓ Qabul" }).click();
  s = await audit(page, "montaj qabul qilindi");
  expect(s.accruals.some((a: { sourceId?: string }) => a.sourceId === `task:${task.id}`)).toBe(true);

  // 8. Tasdiq zinasi: ichki tasdiq → marketolog → mijoz → joylash (har platforma)
  await openAs(page, smm, "/kontent");
  await page.getByLabel("Loyiha").first().selectOption({ label: "Hayot Sikli Kafe" });
  await page.getByRole("button", { name: "Ro'yxat", exact: true }).click();
  await page.getByText("Kafe ochilishi — reels").first().click();
  await dialog(page).getByRole("button", { name: "Ichki tasdiqqa yuborish →" }).click();
  await openAs(page, "u_mk", "/tasdiqlash");
  await page
    .locator("div", { hasText: "Kafe ochilishi — reels" })
    .filter({ has: page.getByRole("button", { name: "✓ Tasdiqlash" }) })
    .last()
    .getByRole("button", { name: "✓ Tasdiqlash" })
    .click();
  await openAs(page, smm, "/kontent");
  await page.getByLabel("Loyiha").first().selectOption({ label: "Hayot Sikli Kafe" });
  await page.getByRole("button", { name: "Ro'yxat", exact: true }).click();
  await page.getByText("Kafe ochilishi — reels").first().click();
  await dialog(page).getByRole("button", { name: "✓ Mijoz tasdiqladi" }).click();
  // Targetologga material ham beriladi (post reklama uchun)
  await dialog(page).getByRole("button", { name: "+ Targetga berish" }).click();
  await dialog(page).getByRole("button", { name: "TZ yuborish" }).click();
  // TZ yuborilgach post oynasi qayta ochiq qoladi — joylash shu yerda
  await dialog(page)
    .getByRole("button", { name: /Hammasida joylandi|Joylandi/ })
    .first()
    .click();
  s = await audit(page, "post joylandi");
  expect(s.posts.find((x: { topic: string }) => x.topic === "Kafe ochilishi — reels").status).toBe("published");

  // 9. Targetolog reklamani yoqadi (hisob davri boshlanadi) va kunlik hisobot kiritadi
  await setDay(page, "2026-11-04");
  await openAs(page, tg, "/target");
  const tCard = page.locator("li", { hasText: "Kafe ochilishi — reels" });
  await tCard.getByRole("button", { name: "Reklamani yoqdim" }).click();
  s = await state(page);
  expect(s.projects.find((x: { id: string }) => x.id === project.id).periodStart).toBe("2026-11-04");
  await setDay(page, "2026-11-05");
  await openAs(page, tg, "/target");
  await page.getByLabel("Loyiha").last().selectOption({ label: "Hayot Sikli Kafe" });
  await page.getByLabel("Sana").last().fill("2026-11-04");
  await page.getByLabel("Sarflangan summa (so'm)").fill("150000");
  await page.getByLabel("Ko'rishlar").fill("12000");
  await page.getByLabel("Klik").fill("300");
  await page.getByLabel("Lid soni").fill("9");
  await page.getByRole("button", { name: "Qo'lda saqlash" }).click();
  s = await audit(page, "target hisobot");
  expect(s.targetReports.some((r: { projectId: string; leads: number }) => r.projectId === project.id && r.leads === 9)).toBe(true);

  // 10. Bir oy o'tdi: 2-davr fakturasi davr boshlanishidan 3 kun oldin avtomatik chiqadi → moliya qabul qiladi
  await setDay(page, "2026-12-02");
  await openAs(page, "u_mol", "/moliya/fakturalar");
  s = await audit(page, "1 oy o'tdi");
  const monthly = s.invoices.find(
    (i: { projectId: string; kind: string; periodIndex: number }) => i.projectId === project.id && i.kind === "monthly" && i.periodIndex === 1,
  );
  expect(monthly, "2-davr oylik fakturasi").toBeTruthy();
  expect(monthly.dueDate).toBe("2026-12-04");
  await page.locator("tr", { hasText: monthly.number }).getByRole("button", { name: "To'lov" }).click();
  await dialog(page).getByLabel(/Summa/).fill(String(monthly.amount));
  await dialog(page).getByRole("button", { name: "Qabul qilish" }).click();
  await audit(page, "oylik to'lov");

  // 11. 1-davr yopildi: loyiha oyligi hisoblandi → moliya ish haqini to'laydi; dalolatnoma tayyor
  await setDay(page, "2026-12-06");
  await openAs(page, "u_mol", "/moliya/ish-haqi");
  s = await audit(page, "davr yopildi");
  const perAcc = s.accruals.filter((a: { sourceId?: string }) => a.sourceId?.startsWith(`per:${project.id}:0:`));
  expect(perAcc.length, "loyiha oyligi (SMM, targetolog, marketolog)").toBeGreaterThan(0);
  const payee = s.users.find((u: { id: string }) => u.id === smm);
  await page.locator("tr", { hasText: payee.name }).getByRole("button", { name: "To'lash" }).click();
  await dialog(page).getByRole("button", { name: "To'lash" }).click();
  await audit(page, "ish haqi to'landi");
  await openAs(page, "u_boss", `/hujjat/dalolatnoma/${project.id}/0`);
  await expect(page.getByText(/BAJARILGAN ISHLAR DALOLATNOMASI/)).toBeVisible();
  await openAs(page, "u_boss", `/hisobot/${project.id}/0`);
  await expect(page.locator("main")).toContainText("Hayot Sikli Kafe");

  // 12. Mijoz bilan hamkorlik tugadi: loyiha yopiladi — keyingi davr fakturasi bekor, eslatmalar to'xtaydi
  await setDay(page, "2026-12-31");
  await openAs(page, "u_boss", `/loyiha/${project.id}`);
  await page.getByRole("button", { name: "Loyihani yopish…" }).click();
  await page.getByRole("button", { name: "Yopish", exact: true }).click();
  s = await audit(page, "loyiha yopildi");
  const afterClose = s.invoices.filter(
    (i: { projectId: string; kind: string; periodIndex: number; voidedAt?: string }) =>
      i.projectId === project.id && i.kind === "monthly" && i.periodIndex >= 2,
  );
  expect(afterClose.every((i: { voidedAt?: string }) => i.voidedAt)).toBe(true);
  await setDay(page, "2027-02-15");
  await openAs(page, "u_boss", "/");
  await settle(page);
  await audit(page, "yopilgandan 1,5 oy keyin");
  s = await state(page);
  expect(
    s.invoices.filter(
      (i: { projectId: string; voidedAt?: string; periodIndex: number; kind: string }) =>
        i.projectId === project.id && i.kind === "monthly" && !i.voidedAt && i.periodIndex >= 2,
    ),
  ).toEqual([]);
  expect(p.errors).toEqual([]);
});
