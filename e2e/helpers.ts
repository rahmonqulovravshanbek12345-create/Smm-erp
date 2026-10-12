import { expect, type Page } from "@playwright/test";

export const STORAGE_KEY = "smm-erp-demo";

/** Serverli tizim sinovi (E2E_SERVER=1): kirish login/parol bilan, holat serverda. */
export const SERVER = process.env.E2E_SERVER === "1";
export const PASS = "Sinov-parol-2026";

export const USERS = {
  u_boss: "rahbar",
  u_admin: "admin",
  u_op1: "operator",
  u_mk: "marketolog",
  u_smm1: "smm",
  u_tg: "targetolog",
  u_sy: "syomka",
  u_mt1: "montajyor",
  u_dz: "dizayner",
  u_web: "webdev",
  u_mol: "moliya",
} as const;
export type UserId = keyof typeof USERS;

export interface Problems {
  errors: string[];
  external: string[];
}

/**
 * Brauzer xatolarini yig'adi va tashqi so'rovlarni nazorat qiladi: Google Fonts bo'sh javob bilan
 * almashtiriladi (testlar internetga bog'liq bo'lmasin), boshqa har qanday tashqi so'rov xato hisoblanadi.
 */
export async function watch(page: Page): Promise<Problems> {
  const p: Problems = { errors: [], external: [] };
  page.on("pageerror", (e) => p.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") p.errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.url().startsWith("http://127.0.0.1") && r.status() >= 400) p.errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fallback();
    p.external.push(u);
    return route.abort();
  });
  return p;
}

/** Ilovani ochadi (kerak bo'lsa toza demo bilan) va berilgan foydalanuvchi sifatida kiradi. */
export async function openAs(page: Page, user: UserId | (string & {}), hash = "") {
  if (SERVER) {
    // Serverli tizim: haqiqiy kirish (login = xodim ID'si), keyin sahifa
    await page.context().clearCookies();
    const r = await page.request.post("./api/auth/login", { data: { login: user.toLowerCase(), password: PASS }, headers: { "x-erp": "1" } });
    expect(r.ok(), `kirish: ${user} — ${await r.text()}`).toBe(true);
    // Bir xil manzil (faqat # farqi) sahifani qayta yuklamaydi — avval bo'sh sahifa
    await page.goto("about:blank");
    await page.goto(`./?u=${user}${hash ? `#${hash}` : ""}`);
    await expect(page.locator("#root")).not.toBeEmpty();
    // Ilova shu xodim bilan ochildi (kirish ekrani emas)
    await page.waitForFunction((u) => document.documentElement.dataset.me === u, user);
    return;
  }
  await page.goto("./");
  await expect(page.locator("#root")).not.toBeEmpty();
  await page.evaluate(
    ([key, uid]) => {
      const s = JSON.parse(localStorage.getItem(key)!);
      s.currentUserId = uid;
      localStorage.setItem(key, JSON.stringify(s));
    },
    [STORAGE_KEY, user] as const,
  );
  await page.goto(`./?u=${user}${hash ? `#${hash}` : ""}`);
  await expect(page.locator("#root")).not.toBeEmpty();
}

export async function go(page: Page, path: string) {
  await page.evaluate((h) => (location.hash = h), path);
  await page.waitForFunction((h) => location.hash === `#${h}` || location.hash !== "", path);
}

/** Joriy holat: demo'da brauzerdan, serverli tizimda — serverdan (yuborilayotgan amallar tugagach). */
export async function state(page: Page) {
  if (SERVER) {
    // Brauzer yuborayotgan amallar serverda saqlanib bo'lishini kutamiz, keyin serverdagi to'liq holatni olamiz
    await page.waitForFunction(() => document.documentElement.dataset.sync !== "busy");
    const r = await page.request.get("./__test/state");
    const { state: s } = (await r.json()) as { state: Record<string, unknown> };
    // Demo'dagi kabi: joriy foydalanuvchi — sahifadagi xodim
    const me = await page.evaluate(() => document.documentElement.dataset.me ?? "");
    return JSON.parse(JSON.stringify({ ...s, currentUserId: me || s.currentUserId }));
  }
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
}

/** Sahifa gorizontal aylantirilmasligi kerak (mobil uchun eng ko'p uchraydigan nuqson). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Sahifa animatsiyalari (kartalarning paydo bo'lishi) tugashini kutadi — o'lchashlar barqaror bo'lishi uchun. */
export async function settle(page: Page) {
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
    null,
    {
      timeout: 5000,
    },
  );
}

/** Brauzer soatini o'rnatadi (serverli tizimda — server «bugun»ini ham). `install` — birinchi marta. */
export async function setClock(page: Page, time: Date, install = false) {
  if (install) await page.clock.install({ time });
  else await page.clock.setSystemTime(time);
  if (SERVER) {
    const r = await page.request.post("./__test/clock", { data: { time: time.toISOString(), reseed: install }, headers: { "x-erp": "1" } });
    expect(r.ok()).toBe(true);
  }
}
