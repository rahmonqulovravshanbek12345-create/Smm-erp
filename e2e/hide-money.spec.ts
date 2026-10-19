import { expect, test } from "./fixtures";
import { openAs, watch } from "./helpers";

test("SMM menejer loyihalarda narx, faktura va shartnoma summalarini ko'rmaydi; marketolog ko'radi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_smm1", "/loyihalar");
  const cards = page.locator('a[href*="#/loyiha/"], a[href*="/loyiha/"]');
  await expect(cards.first()).toBeVisible();
  await expect(page.locator("#root")).not.toContainText("so'm");
  await expect(page.locator("#root")).not.toContainText("/oy");
  await cards.first().click();
  await expect(page.getByRole("heading", { name: "Xizmatlar" })).toBeVisible();
  await expect(page.locator("#root")).not.toContainText("so'm");
  await expect(page.locator("#root")).not.toContainText("Oylik summa");
  await expect(page.locator("#root")).not.toContainText("Shartnoma hujjati");
  // Moliya bo'limi va shartnoma hujjatiga to'g'ridan-to'g'ri kirib bo'lmaydi
  await expect(page.getByRole("tab", { name: "Moliya" })).toHaveCount(0);
  await openAs(page, "u_smm2", "/hujjat/shartnoma/p_gym");
  await expect(page.getByText("Hujjat topilmadi")).toBeVisible();

  await openAs(page, "u_mk", "/loyihalar");
  await expect(page.locator("#root")).toContainText("/oy");
  await page.getByText("FitLife Gym").first().click();
  await expect(page.getByText("Shartnoma hujjati")).toBeVisible();
  expect(p.errors).toEqual([]);
});
