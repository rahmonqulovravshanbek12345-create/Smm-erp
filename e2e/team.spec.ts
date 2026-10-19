import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openAs, state, watch } from "./helpers";

const dialog = (page: Page) => page.locator("[role=dialog]");

test("Marketolog loyiha jamoasini o'zgartiradi: lavozim, xodim, sana — tarixda ko'rinadi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/loyihalar");
  await page.getByText("FitLife Gym").first().click();
  await page.getByRole("button", { name: "Jamoani o'zgartirish" }).click();
  await dialog(page).getByLabel("Lavozim").selectOption("smm");
  await dialog(page).getByLabel("Yangi xodim").selectOption("u_smm2");
  await dialog(page).getByRole("button", { name: "Saqlash" }).click();
  const s = await state(page);
  const proj = s.projects.find((x: { id: string }) => x.id === "p_gym");
  expect(proj.teamHistory.some((x: { role: string; userId: string }) => x.role === "smm" && x.userId === "u_smm2")).toBe(true);
  await expect(page.getByText("Jamoa tarixi")).toBeVisible();
  await expect(page.getByText("Sardor Nazarov").first()).toBeVisible();
  expect(p.errors).toEqual([]);
});
