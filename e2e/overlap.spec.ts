import { expect, test, type Page } from "@playwright/test";
import { openAs, settle, watch, type UserId } from "./helpers";

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
          const c = {
            l: cs.overflowX !== "visible" ? b.left : -1e9,
            r: cs.overflowX !== "visible" ? b.right : 1e9,
            t: cs.overflowY !== "visible" ? b.top : -1e9,
            b: cs.overflowY !== "visible" ? b.bottom : 1e9,
          };
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
      if (it.rect.r > b.right + 2 || it.rect.l < b.left - 2)
        out.push(
          `«${it.text.slice(0, 40)}» kartadan chiqib ketgan (matn ${Math.round(it.rect.l)}–${Math.round(it.rect.r)}, karta ${Math.round(b.left)}–${Math.round(b.right)}, <${it.el.tagName.toLowerCase()} class="${String(it.el.className).slice(0, 50)}">)`,
        );
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
        await settle(page);
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

/** Juda uzun nomlar (bo'sh joyli va bo'sh joysiz) sahifani gorizontal kengaytirmasligi kerak. */
test("uzun nomlar: sahifa gorizontal kengaymaydi (390 va 1280)", async ({ page }) => {
  test.setTimeout(300_000);
  await watch(page);
  await openAs(page, "u_boss");
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    const long = "Juda uzun nomli mijoz kompaniyasi masuliyati cheklangan jamiyati Toshkent filiali";
    const noSpace = "https://instagram.com/juda_uzun_profil_nomi_bosh_joysiz_yozilgan_matn_123456789";
    s.projects[0].name = long;
    s.projects[0].legalName = long;
    s.projects[1].name = noSpace;
    s.projects[0].links = noSpace;
    s.leads[0].name = noSpace;
    s.leads[1].name = long;
    s.users[2].name = "Abdurahmonova Gulnoraxon Shavkatjon qizi (katta mutaxassis)";
    s.posts[0].topic = noSpace;
    localStorage.setItem(key, JSON.stringify(s));
  }, "smm-erp-demo");
  const ids = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!)
        .projects.slice(0, 2)
        .map((p: { id: string }) => p.id),
    "smm-erp-demo",
  );
  const pages = [
    "/",
    "/crm",
    "/loyihalar",
    `/loyiha/${ids[0]}`,
    `/loyiha/${ids[1]}`,
    "/kontent",
    "/target",
    "/moliya",
    "/moliya/debitor",
    "/moliya/fakturalar",
    "/moliya/ish-haqi",
    "/hujjatlar",
    `/hisobot/${ids[0]}`,
    `/hujjat/shartnoma/${ids[0]}`,
    "/takliflar",
  ];
  const bad: string[] = [];
  for (const w of [390, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await openAs(page, "u_boss");
    for (const path of pages) {
      await page.evaluate((h) => (location.hash = h), path);
      await page.waitForTimeout(200);
      await settle(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) bad.push(`${w}px ${path}: +${over}px`);
    }
  }
  expect(bad).toEqual([]);
});
