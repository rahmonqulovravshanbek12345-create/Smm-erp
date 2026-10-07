import { expect, test } from "@playwright/test";
import { USERS, horizontalOverflow, openAs, watch, type UserId } from "./helpers";

// Har bir rol uchun: menyudagi har bir sahifa ochiladi, sarlavha bor, xato yo'q, ruxsatsiz sahifaga yo'naltirilmaydi.
const FINANCE = [
  "/moliya",
  "/moliya/kirim-chiqim",
  "/moliya/fakturalar",
  "/moliya/pnl",
  "/moliya/cashflow",
  "/moliya/debitor",
  "/moliya/akt",
  "/moliya/kalendar",
  "/moliya/ish-haqi",
  "/moliya/reja",
];
const DYNAMIC: Partial<Record<UserId, string[]>> = {
  u_boss: [
    ...FINANCE,
    "/integratsiyalar",
    "/loyiha/p_mebel",
    "/hisobot/p_mebel",
    "/hujjat/shartnoma/p_gym",
    "/hujjat/dalolatnoma/p_mebel/4",
    "/taklif/tk_kids",
    "/takliflar?t=tariflar",
  ],
  u_mk: ["/loyiha/p_gym", "/hisobot/p_baraka", "/taklif/tk_kids"],
  u_op1: ["/taklif/tk_kids"],
  u_mol: [...FINANCE, "/loyiha/p_moda", "/hujjat/faktura/inv_h1"],
};

for (const uid of Object.keys(USERS) as UserId[]) {
  test(`${USERS[uid]} (${uid}): barcha sahifalar xatosiz ochiladi`, async ({ page }) => {
    const p = await watch(page);
    await openAs(page, uid);
    const links = await page.locator("aside nav a[href^='#/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!.slice(1)))]);
    expect(links.length).toBeGreaterThan(2);
    for (const path of [...links, ...(DYNAMIC[uid] ?? [])]) {
      await page.evaluate((h) => (location.hash = h), path);
      await expect(page.locator("main h1").first(), path).toBeVisible();
      expect(await page.evaluate(() => location.hash), `${path} — ruxsat bor sahifadan yo'naltirildi`).toBe(`#${path}`);
      expect(await horizontalOverflow(page), `${path} — gorizontal scroll`).toBeLessThanOrEqual(1);
      const text = await page.locator("main").innerText();
      expect(text, `${path} — ekranda NaN/undefined`).not.toMatch(/\bNaN\b|undefined|\[object Object\]/);
    }
    expect(p.errors).toEqual([]);
    expect(p.external).toEqual([]);
  });
}

test("ruxsatsiz sahifa rolning bosh sahifasiga yo'naltiradi", async ({ page }) => {
  await watch(page);
  await openAs(page, "u_mt1", "/moliya/pnl");
  await expect(page).toHaveURL(/#\/mening$/);
  await openAs(page, "u_op1", "/admin");
  await expect(page).not.toHaveURL(/#\/admin/);
});

test("akkaunt menyusi orqali rolni almashtirish", async ({ page }) => {
  const p = await watch(page);
  await page.goto("./");
  await page.locator("aside button", { hasText: "Sherzod Alimov" }).click();
  await page.getByRole("button", { name: /Gulnora Mirzayeva/ }).click();
  await expect(page.locator("aside")).toContainText("Moliya");
  await expect(page.locator("main h1").first()).toBeVisible();
  expect(p.errors).toEqual([]);
});
