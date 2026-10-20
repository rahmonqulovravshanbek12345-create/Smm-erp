import { expect, test } from "./fixtures";
import { openAs, watch } from "./helpers";

const group = (page: import("@playwright/test").Page, title: string) => page.locator("aside nav button", { hasText: title });
const link = (page: import("@playwright/test").Page, href: string) => page.locator(`aside nav a[href="#${href}"]`);

test("Menyu guruhlari: birinchi marta hammasi yopiq, ▾ bilan ochiladi va tanlov eslab qolinadi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_admin", "/");
  for (const t of ["Savdo", "Ishlab chiqarish", "Moliya", "Boshqaruv"]) await expect(group(page, t)).toHaveAttribute("aria-expanded", "false");
  // Tepadagi guruh (sarlavhasiz) doim ochiq
  await expect(link(page, "/")).toBeVisible();
  await expect(link(page, "/kontent")).toBeHidden();
  await expect(link(page, "/moliya/kirim-chiqim")).toBeHidden();

  await group(page, "Moliya").click();
  await expect(group(page, "Moliya")).toHaveAttribute("aria-expanded", "true");
  await expect(link(page, "/moliya/kirim-chiqim")).toBeVisible();
  await expect(link(page, "/kontent")).toBeHidden();

  // Sahifa yangilansa ham tanlov saqlanadi
  await page.reload();
  await expect(group(page, "Moliya")).toHaveAttribute("aria-expanded", "true");
  await expect(link(page, "/moliya/kirim-chiqim")).toBeVisible();
  await expect(group(page, "Savdo")).toHaveAttribute("aria-expanded", "false");

  await group(page, "Moliya").click();
  await expect(link(page, "/moliya/kirim-chiqim")).toBeHidden();
  expect(p.errors).toEqual([]);
});

test("Menyu guruhlari: joriy sahifa guruhi o'zi ochiladi, uni qo'lda yopsa bo'ladi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_admin", "/moliya/pnl");
  await expect(group(page, "Moliya")).toHaveAttribute("aria-expanded", "true");
  await expect(link(page, "/moliya/pnl")).toBeVisible();
  await expect(group(page, "Savdo")).toHaveAttribute("aria-expanded", "false");

  // Boshqa guruhdagi sahifaga o'tilsa, o'sha guruh ochiladi, oldingisi ochiq qoladi
  await page.evaluate(() => (location.hash = "/kontent"));
  await expect(group(page, "Ishlab chiqarish")).toHaveAttribute("aria-expanded", "true");
  await expect(link(page, "/kontent")).toBeVisible();
  await expect(group(page, "Moliya")).toHaveAttribute("aria-expanded", "true");

  await group(page, "Ishlab chiqarish").click();
  await expect(link(page, "/kontent")).toBeHidden();
  expect(p.errors).toEqual([]);
});
