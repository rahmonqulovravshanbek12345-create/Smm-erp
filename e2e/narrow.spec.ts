import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openAs, watch } from "./helpers";

// Tor telefon (va Telegram Mini App): jadval va izohlarda matn harflab ustunga bo'linib ketmasin, sahifa yonga chiqmasin
test.use({ viewport: { width: 360, height: 800 } });

/** Matn uchun 30px dan tor joy qolgan, lekin baland bo'lib ketgan bloklar (harflab bo'lingan matn). */
const squeezed = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("main *")) {
      if (el.children.length) continue;
      const t = (el.textContent ?? "").trim();
      if (t.length < 5) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const w = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (r.width > 0 && w < 30 && r.height > 70) out.push(`${t.slice(0, 30)} (${Math.round(w)}px)`);
    }
    return out;
  });

for (const hash of ["/", "/moliya/cashflow", "/moliya/debitor"]) {
  test(`360px: ${hash} — jadval va izoh matni harflab bo'linmaydi`, async ({ page }) => {
    const p = await watch(page);
    await openAs(page, "u_admin", hash);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await squeezed(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(p.errors).toEqual([]);
  });
}
