import { expect, test } from "./fixtures";
import { openAs, watch } from "./helpers";

test("Berilgan dizayn TZ o'zgartiriladi: nom, deadline va tur (Stories); ijrochi tugmani ko'rmaydi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/dizayn");
  await page.getByRole("button", { name: "O'zgartirish: Guruh mashg'ulotlari jadvali" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("TZ'ni o'zgartirish")).toBeVisible();
  // Tur ro'yxatida oddiy post, Stories va oblojka bor
  const turi = dlg.getByRole("combobox").filter({ has: page.locator("option", { hasText: "Oblojka" }) });
  await expect(turi.locator("option", { hasText: "Stories" })).toHaveCount(1);
  await turi.selectOption({ label: "Stories" });
  await dlg.getByLabel("Deadline sanasi").fill("2030-01-15");
  await dlg.getByLabel("Deadline soati").fill("15:30");
  await dlg.getByText("Vazifa nomi").locator("..").locator("input").fill("Guruh jadvali — yangi");
  await dlg.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("TZ o'zgartirildi — ijrochiga xabar ketdi")).toBeVisible();
  await expect(page.getByText("Guruh jadvali — yangi")).toBeVisible();
  await expect(page.getByText(/· stories/)).toBeVisible();

  // Ijrochi (dizayner) o'zgartirish tugmasini ko'rmaydi
  await openAs(page, "u_dz", "/dizayn");
  await expect(page.getByText("Guruh jadvali — yangi")).toBeVisible();
  await expect(page.getByRole("button", { name: /^O'zgartirish:/ })).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test("Boshlanmagan TZ bekor qilinadi (tasdiq bilan); boshlanganida tugma yo'q", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/dizayn");
  // Jarayondagi vazifada «Bekor qilish» yo'q
  await expect(page.getByRole("button", { name: "Bekor qilish: Showroom tur — oblojka" })).toHaveCount(0);
  await page.getByRole("button", { name: "Bekor qilish: Guruh mashg'ulotlari jadvali" }).click();
  await page.getByRole("button", { name: "Yo'q" }).click();
  await expect(page.getByText("Guruh mashg'ulotlari jadvali")).toBeVisible();
  await page.getByRole("button", { name: "Bekor qilish: Guruh mashg'ulotlari jadvali" }).click();
  await page.getByRole("button", { name: "Ha, bekor qilish" }).click();
  await expect(page.getByText("Vazifa bekor qilindi")).toBeVisible();
  await expect(page.getByText("Guruh mashg'ulotlari jadvali")).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test("Montaj: ochiq vazifada o'zgartirish tugmasi bor, qabul qilinganida yo'q", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/montaj");
  await expect(page.getByText("Yangi kolleksiya — Reels")).toBeVisible();
  await expect(page.getByRole("button", { name: "O'zgartirish: Yangi kolleksiya — Reels" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^O'zgartirish:/ }).first()).toBeVisible();
  expect(p.errors).toEqual([]);
});
