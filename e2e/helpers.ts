import { expect, type Page } from "@playwright/test";

export const STORAGE_KEY = "smm-erp-demo";

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
export async function openAs(page: Page, user: UserId, hash = "") {
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

export const state = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);

/** Sahifa gorizontal aylantirilmasligi kerak (mobil uchun eng ko'p uchraydigan nuqson). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
