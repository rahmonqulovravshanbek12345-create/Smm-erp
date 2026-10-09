import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { horizontalOverflow, openAs, settle, watch } from "./helpers";

const PAGES = [
  "/",
  "/crm",
  "/crm/analitika",
  "/takliflar",
  "/taklif/tk_kids",
  "/loyihalar",
  "/loyiha/p_mebel",
  "/hisobot/p_mebel",
  "/hujjat/shartnoma/p_gym",
  "/kontent",
  "/moliya",
  "/moliya/pnl",
  "/moliya/kirim-chiqim",
  "/moliya/ish-haqi",
  "/moliya/kalendar",
  "/integratsiyalar",
];

const SIZES = [
  { name: "mobil", width: 375, height: 812 },
  { name: "planshet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const size of SIZES) {
  test(`${size.name} ${size.width}px: gorizontal scroll yo'q, skrinshotlar`, async ({ page }, info) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const p = await watch(page);
    await openAs(page, "u_boss");
    const bad: string[] = [];
    for (const path of PAGES) {
      await page.evaluate((h) => (location.hash = h), path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await settle(page);
      const over = await horizontalOverflow(page);
      if (over > 1) bad.push(`${path}: +${over}px`);
      const shot = await page.screenshot({ fullPage: true });
      await info.attach(`${size.name}${path.replace(/\//g, "_")}.png`, { body: shot, contentType: "image/png" });
    }
    expect(bad).toEqual([]);
    expect(p.errors).toEqual([]);
  });
}

test("mobil: pastki menyu va «Yana» oynasi ishlaydi", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await watch(page);
  await openAs(page, "u_boss");
  const tabbar = page.locator("nav").last();
  await expect(tabbar).toBeVisible();
  await tabbar.getByText("Yana").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

for (const path of ["/", "/crm", "/takliflar", "/taklif/tk_kids", "/moliya", "/moliya/pnl", "/integratsiyalar", "/admin"]) {
  test(`accessibility (axe): ${path}`, async ({ page }) => {
    await watch(page);
    await openAs(page, path === "/admin" ? "u_admin" : "u_boss", path);
    await expect(page.locator("main h1").first()).toBeVisible();
    await settle(page);
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = res.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} ta — ${v.nodes[0]?.target.join(" ")}`);
    expect(summary).toEqual([]);
  });
}

test("hujjat tili va kodirovkasi", async ({ page }) => {
  await page.goto("./");
  expect(await page.getAttribute("html", "lang")).toBe("uz");
  expect(await page.evaluate(() => document.characterSet)).toBe("UTF-8");
  await expect(page.locator("main")).toContainText("o'");
});

test.describe("qorong'i rejim", () => {
  test.use({ colorScheme: "dark" });
  for (const path of ["/", "/takliflar", "/moliya/pnl", "/taklif/tk_kids"]) {
    test(`accessibility (axe, dark): ${path}`, async ({ page }) => {
      await watch(page);
      await openAs(page, "u_boss", path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await settle(page);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = res.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      const summary = serious.map(
        (v) => `${v.id} (${v.impact}): ${v.nodes.length} ta — ${v.nodes[0]?.target.join(" ")} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? {})}`,
      );
      expect(summary).toEqual([]);
    });
  }
});
