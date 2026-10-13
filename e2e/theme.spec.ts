import { expect, test } from "./fixtures";
import { openAs } from "./helpers";

test("Mavzu: bitta tugma yorug' ↔ qorong'i almashtiradi va tanlov eslab qolinadi", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openAs(page, "u_boss", "/");
  await page.locator("aside button").last().click();
  const toggle = page.getByRole("button", { name: /mavzuga o'tish/ });
  // Qurilma yorug' → tugma qorong'iga o'tishni taklif qiladi
  await expect(toggle).toHaveAttribute("aria-label", "Qorong'i mavzuga o'tish");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "Yorug' mavzuga o'tish");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("aside button").last().click();
  await page.getByRole("button", { name: "Yorug' mavzuga o'tish" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
