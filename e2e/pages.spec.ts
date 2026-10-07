import { expect, test } from "@playwright/test";
import { watch } from "./helpers";

// GitHub Pages: sayt https://<user>.github.io/Smm-erp/ ostida — lokal server aynan shu prefiks bilan beradi.
test.describe("GitHub Pages moslashuvi", () => {
  test("prefiks ostida ochiladi, barcha resurslar shu prefiksdan yuklanadi", async ({ page }) => {
    const p = await watch(page);
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await page.goto("./");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page).toHaveTitle(/SMM agentlik ERP/);
    const local = requested.filter((u) => u.startsWith("http://127.0.0.1"));
    expect(local.every((u) => u.startsWith("http://127.0.0.1:4173/Smm-erp/"))).toBe(true);
    expect(p.errors).toEqual([]);
    expect(p.external).toEqual([]);
  });

  test("to'g'ridan-to'g'ri ichki manzil va F5 (yangilash) 404 bermaydi", async ({ page }) => {
    const p = await watch(page);
    await page.goto("./#/moliya/pnl");
    await expect(page.getByRole("heading", { level: 1, name: "Foyda va zarar" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Foyda va zarar" })).toBeVisible();
    await page.goto("./#/taklif/tk_kids");
    await expect(page.getByRole("heading", { name: /Kids Academy/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: /Kids Academy/ })).toBeVisible();
    expect(p.errors).toEqual([]);
  });

  test("prefikssiz manzil prefiksga yo'naltiriladi, statik fayllar mavjud", async ({ page, request }) => {
    const res = await request.get("http://127.0.0.1:4173/Smm-erp", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    for (const f of ["og.jpg", "apple-touch-icon.png"]) {
      expect((await request.get(f)).status(), f).toBe(200);
    }
    await page.goto("./");
    const icon = await page.locator("link[rel=icon]").getAttribute("href");
    expect(icon).toMatch(/^data:image\/svg\+xml/);
  });

  test("noma'lum ichki yo'l bosh sahifaga qaytadi, bo'sh ekran bo'lmaydi", async ({ page }) => {
    const p = await watch(page);
    await page.goto("./#/bunday-sahifa-yoq");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(p.errors).toEqual([]);
  });
});
