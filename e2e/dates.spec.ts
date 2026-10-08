import { expect, test } from "@playwright/test";
import { openAs, watch, type UserId } from "./helpers";

// Demo boshqa sanalarda ochilganda ham (oy oxiri, yil almashishi, fevral) hisob-kitob sahifalari buzilmasligi kerak.
const DATES = ["2026-12-31", "2027-01-31", "2027-03-01"];
const ROUTES = [
  "/",
  "/moliya",
  "/moliya/fakturalar",
  "/moliya/pnl",
  "/moliya/cashflow",
  "/moliya/debitor",
  "/moliya/akt",
  "/moliya/kalendar",
  "/moliya/ish-haqi",
  "/moliya/reja",
  "/crm/analitika",
  "/takliflar",
  "/kontent",
  "/loyihalar",
  "/loyiha/p_mebel",
  "/loyiha/p_avtolux",
  "/loyiha/p_optika",
  "/hisobot/p_mebel",
  "/bildirishnomalar",
];
const ROLES: UserId[] = ["u_boss", "u_mol"];

for (const date of DATES) {
  test(`bugun = ${date}: asosiy sahifalar buzilmaydi`, async ({ page }) => {
    await page.clock.install({ time: new Date(`${date}T10:00:00`) });
    const p = await watch(page);
    for (const uid of ROLES) {
      await openAs(page, uid);
      for (const path of ROUTES) {
        await page.evaluate((h) => (location.hash = h), path);
        await expect(page.locator("main h1").first(), `${uid} ${path}`).toBeVisible();
        const text = await page.locator("main").innerText();
        expect(text, `${date} ${uid} ${path}`).not.toMatch(/\bNaN\b|undefined|Infinity|Invalid Date|\[object Object\]/);
      }
    }
    expect(p.errors).toEqual([]);
  });
}
