import { expect, test, type Page } from "@playwright/test";
import { openAs, watch, type UserId } from "./helpers";

/** Sahifadagi yozuvlar bir-birining ustiga chiqib ketmaganini tekshiradi (ko'rinadigan qismlari bo'yicha). */
async function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type R = { l: number; t: number; r: number; b: number };
    const items: { text: string; rect: R; el: Element }[] = [];
    const clipOf = (el: Element): R | null => {
      let clip: R | null = null;
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return { l: 0, t: 0, r: 0, b: 0 };
        if (cs.position === "fixed" || cs.position === "sticky") return { l: 0, t: 0, r: 0, b: 0 };
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const b = p.getBoundingClientRect();
          const c = { l: cs.overflowX !== "visible" ? b.left : -1e9, r: cs.overflowX !== "visible" ? b.right : 1e9, t: cs.overflowY !== "visible" ? b.top : -1e9, b: cs.overflowY !== "visible" ? b.bottom : 1e9 };
          clip = clip ? { l: Math.max(clip.l, c.l), t: Math.max(clip.t, c.t), r: Math.min(clip.r, c.r), b: Math.min(clip.b, c.b) } : c;
        }
      }
      return clip;
    };
    const walker = document.createTreeWalker(document.querySelector("main") ?? document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest("script,style,noscript,option,select,svg,[class*='sr-only']")) continue;
      // yopiq <details> ichidagi matn ko'rinmaydi (summary bundan mustasno)
      const det = el.closest("details");
      if (det && !det.open && !el.closest("summary")) continue;
      const clip = clipOf(el);
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of Array.from(range.getClientRects())) {
        let rect: R = { l: q.left, t: q.top, r: q.right, b: q.bottom };
        if (clip) rect = { l: Math.max(rect.l, clip.l), t: Math.max(rect.t, clip.t), r: Math.min(rect.r, clip.r), b: Math.min(rect.b, clip.b) };
        if (rect.r - rect.l < 3 || rect.b - rect.t < 3) continue;
        items.push({ text, rect, el });
      }
    }
    const out: string[] = [];
    for (const it of items) {
      const box = it.el.closest(".tile, .glass, .glass-strong");
      if (!box) continue;
      const b = box.getBoundingClientRect();
      if (it.rect.r > b.right + 2 || it.rect.l < b.left - 2) out.push(`«${it.text.slice(0, 40)}» kartadan chiqib ketgan`);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (a.el === b.el) continue;
        const w = Math.min(a.rect.r, b.rect.r) - Math.max(a.rect.l, b.rect.l);
        const h = Math.min(a.rect.b, b.rect.b) - Math.max(a.rect.t, b.rect.t);
        if (w < 3 || h < 4) continue;
        const small = Math.min((a.rect.r - a.rect.l) * (a.rect.b - a.rect.t), (b.rect.r - b.rect.l) * (b.rect.b - b.rect.t));
        if ((w * h) / small < 0.2) continue;
        out.push(`«${a.text.slice(0, 40)}» ⟷ «${b.text.slice(0, 40)}»`);
      }
    }
    return [...new Set(out)];
  });
}

const BOSS_PAGES = [
  "/",
  "/crm",
  "/crm/analitika",
  "/takliflar",
  "/taklif/tk_kids",
  "/loyihalar",
  "/loyiha/p_mebel",
  "/loyiha/p_gym",
  "/loyiha/p_dent",
  "/loyiha/p_moda",
  "/hisobot/p_mebel",
  "/hujjat/shartnoma/p_gym",
  "/kontent",
  "/tasdiqlash",
  "/syomka",
  "/montaj",
  "/dizayn",
  "/target",
  "/moliya",
  "/moliya/pnl",
  "/moliya/cashflow",
  "/moliya/kirim-chiqim",
  "/moliya/fakturalar",
  "/moliya/debitor",
  "/moliya/akt",
  "/moliya/reja",
  "/hujjatlar",
  "/hisobim",
  "/bildirishnomalar",
  "/moliya/ish-haqi",
  "/moliya/kalendar",
  "/tarix",
  "/integratsiyalar",
  "/jarayon",
  
];

const ROLE_PAGES: [UserId, string[]][] = [
  ["u_boss", BOSS_PAGES],
  ["u_mk", ["/", "/loyihalar", "/kontent", "/tasdiqlash", "/loyiha/p_mebel"]],
  ["u_smm1", ["/", "/kontent", "/mening", "/montaj", "/loyiha/p_gym"]],
  ["u_tg", ["/", "/target", "/mening"]],
  ["u_mol", ["/", "/moliya", "/moliya/fakturalar", "/moliya/ish-haqi"]],
  ["u_op1", ["/", "/crm"]],
  ["u_admin", ["/", "/admin"]],
];

const SIZES = [
  { name: "noutbuk 1280", width: 1280, height: 720 },
  { name: "planshet 820", width: 820, height: 1180 },
  { name: "telefon 390", width: 390, height: 844 },
];

for (const size of SIZES) {
  test(`yozuvlar ustma-ust tushmaydi: ${size.name}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.emulateMedia({ colorScheme: "dark" });
    await watch(page);
    const bad: string[] = [];
    for (const [user, pages] of ROLE_PAGES) {
      await openAs(page, user);
      for (const path of pages) {
        await page.evaluate((h) => (location.hash = h), path);
        await page.waitForTimeout(150);
        const o = await overlaps(page);
        for (const x of o) bad.push(`${user} ${path}: ${x}`);
      }
    }
    expect(bad).toEqual([]);
  });
}

test("boshqaruv paneli turli ekran kengligida ham ustma-ust tushmaydi", async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: "dark" });
  await watch(page);
  await openAs(page, "u_boss");
  const bad: string[] = [];
  for (let w = 1000; w <= 1700; w += 50) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    for (const x of await overlaps(page)) bad.push(`${w}: ${x}`);
    if (w === 1550) await page.screenshot({ path: process.env.SHOT! });
  }
  console.log(bad.join("\n"));
  expect(bad).toEqual([]);
});
