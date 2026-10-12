// Xavfsizlik auditi topilmalari: har bir test hujumni takrorlaydi va uning rad etilishini tekshiradi.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErpState, Lead } from "../../src/lib/types";
import { action, giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let op1: Client;
let boss: Client;
const state = async (c: Client) => (await c.req("GET", "/api/state")).json().state as ErpState;
const leadInput = (l: Lead, patch: Partial<Lead> = {}) => {
  const { id, name, phone, source, service, note, operatorId, nextContactDate, meeting, rejectReason } = { ...l, ...patch };
  return { id, name, phone, source, service, note, operatorId, nextContactDate, meeting, rejectReason };
};

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_op1", "op1");
  await giveLogin(t.db, "u_boss", "boss");
  op1 = await loginAs(t.app, "op1");
  boss = await loginAs(t.app, "boss");
});
afterAll(() => t.close());

describe("M1: operator boshqa operatorning lidini o'ziga o'tkaza olmaydi", () => {
  const gym = () => t.store.current().state.leads.find((l) => l.id === "l_gym")!;

  it("lid egasini o'ziga almashtirish rad etiladi — begona loyiha, faktura va to'lovlar ko'rinmaydi", async () => {
    expect(gym().operatorId).toBe("u_op2");
    expect((await state(op1)).projects.some((p) => p.id === "p_gym")).toBe(false);
    const r = await action(op1, "saveLead", [leadInput(gym(), { operatorId: "u_op1" })]);
    expect(r.statusCode).toBe(403);
    expect(gym().operatorId).toBe("u_op2");
    const s = await state(op1);
    expect(s.projects.some((p) => p.id === "p_gym")).toBe(false);
    expect(s.invoices.some((i) => i.projectId === "p_gym")).toBe(false);
  });

  it("operator lid ma'lumotini egasini o'zgartirmasdan tahrirlay oladi (umumiy CRM)", async () => {
    const r = await action(op1, "saveLead", [leadInput(gym(), { note: "Qayta qo'ng'iroq qilindi" })]);
    expect(r.statusCode).toBe(200);
    expect(gym().note).toBe("Qayta qo'ng'iroq qilindi");
    expect(gym().operatorId).toBe("u_op2");
  });

  it("rahbar lid egasini almashtira oladi", async () => {
    const r = await action(boss, "saveLead", [leadInput(gym(), { operatorId: "u_op1" })]);
    expect(r.statusCode).toBe(200);
    expect(gym().operatorId).toBe("u_op1");
  });
});

describe("M4: Telegram va Meta tokenlari bazada (va zaxirada) shifrlangan", () => {
  const TG = "7000000001:AAH-maxfiy_tg_token_faqat_test_uchun";
  const META = "EAAG-maxfiy-meta-token-faqat-test-uchun-123";
  let admin: Client;
  beforeAll(async () => {
    await giveLogin(t.db, "u_admin", "admin");
    admin = await loginAs(t.app, "admin");
  });

  it("token bazadagi JSON'da ochiq matn bo'lib turmaydi, ilova esa uni ishlata oladi", async () => {
    expect((await action(admin, "setTelegramToken", [TG])).statusCode).toBe(200);
    expect((await action(admin, "saveMetaSettings", [{ token: META }])).statusCode).toBe(200);
    const { rows } = await t.db.query<{ data: unknown }>("SELECT data FROM app_state WHERE id = 1");
    const raw = JSON.stringify(rows[0]!.data);
    expect(raw.includes(TG)).toBe(false);
    expect(raw.includes(META)).toBe(false);
    expect(raw.includes("maxfiy")).toBe(false);
    // Xotirada (bildirishnoma yuborish uchun) — haqiqiy qiymat
    expect(t.store.current().state.settings.telegram.botToken).toBe(TG);
    expect(t.store.current().state.settings.integrations.meta.token).toBe(META);
  });

  it("server qayta ishga tushganda (bazadan o'qish) token tiklanadi", async () => {
    await t.store.load();
    expect(t.store.current().state.settings.telegram.botToken).toBe(TG);
    expect(t.store.current().state.settings.integrations.meta.token).toBe(META);
  });

  it("boshqa SECRET_KEY bilan token ochilmaydi — server baribir ishga tushadi (token bo'sh)", async () => {
    const { StateStore } = await import("../src/store");
    const { makeSealer } = await import("../src/crypto");
    const other = new StateStore(t.db, { sealer: makeSealer(Buffer.alloc(32, 99).toString("base64")) });
    expect(await other.load()).toBe(true);
    expect(other.current().state.settings.telegram.botToken).toBe("");
    expect(other.current().state.settings.integrations.meta.token).toBe("");
  });
});

describe("L1: 2FA standart holatda hamma xodimlarga majburiy", () => {
  it("REQUIRE_2FA_ROLES berilmasa — barcha rollar", async () => {
    const { loadConfig } = await import("../src/config");
    const cfg = loadConfig({ DATABASE_URL: "x", APP_ORIGIN: "https://erp.test", SECRET_KEY: Buffer.alloc(32, 1).toString("base64"), STATIC_DIR: "x" });
    for (const r of ["admin", "rahbar", "moliya", "marketolog", "operator", "smm", "targetolog", "syomka", "montajyor", "dizayner", "webdev"])
      expect(cfg.REQUIRE_2FA_ROLES).toContain(r);
    expect(
      loadConfig({
        DATABASE_URL: "x",
        APP_ORIGIN: "https://erp.test",
        SECRET_KEY: Buffer.alloc(32, 1).toString("base64"),
        STATIC_DIR: "x",
        REQUIRE_2FA_ROLES: "admin",
      }).REQUIRE_2FA_ROLES,
    ).toEqual(["admin"]);
  });
});

describe("L2: eski (kuchsizroq) parol xeshi kirishda yangilanadi", () => {
  it("scrypt N=2^15 xesh → muvaffaqiyatli kirishdan keyin N=2^16", async () => {
    const { scryptSync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16);
    const key = scryptSync("Eski-parol-2025", salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 2 ** 15 * 8 * 2 });
    const old = `scrypt$32768$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    await t.db.query("INSERT INTO credentials (user_id, login, pass_hash, must_change) VALUES ('u_web', 'eski', $1, false)", [old]);
    await loginAs(t.app, "eski", "Eski-parol-2025");
    const { rows } = await t.db.query<{ pass_hash: string }>("SELECT pass_hash FROM credentials WHERE user_id = 'u_web'");
    expect(rows[0]!.pass_hash.startsWith("scrypt$65536$8$1$")).toBe(true);
    await loginAs(t.app, "eski", "Eski-parol-2025");
  });
});

describe("L3: chiqishda __Host- cookie brauzerdan ham o'chadi", () => {
  it("Set-Cookie: bo'sh qiymat + Secure (aks holda brauzer __Host- cookie'ni o'chirmaydi)", async () => {
    const c = await loginAs(t.app, "op1");
    const r = await c.req("POST", "/api/auth/logout");
    const raw = ([] as string[]).concat(r.headers["set-cookie"] ?? []).find((x) => x.startsWith("__Host-erp="))!;
    expect(raw).toMatch(/^__Host-erp=;/);
    expect(raw).toMatch(/Secure/);
    expect(raw).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});

describe("L4: parolni almashtirishda ham blok amal qiladi", () => {
  it("5 ta noto'g'ri joriy paroldan keyin to'g'risi ham 429 (o'g'irlangan sessiya bilan parol tanlab bo'lmaydi)", async () => {
    await giveLogin(t.db, "u_dz", "dizayn1");
    const c = await loginAs(t.app, "dizayn1");
    for (let i = 0; i < 5; i++)
      expect((await c.req("POST", "/api/auth/password", { current: `xato-parol-${i}`, next: "Yangi-parol-2026x" })).statusCode).toBe(400);
    expect((await c.req("POST", "/api/auth/password", { current: "Sinov-parol-2026", next: "Yangi-parol-2026x" })).statusCode).toBe(429);
  });
});

describe("L6: audit jurnali", () => {
  it("TRUNCATE va yaqin yozuvni o'chirish taqiqlangan; 2 yildan eskisini faqat saqlash muddati ishi o'chiradi", async () => {
    await expect(t.db.query("TRUNCATE audit_log")).rejects.toThrow(/faqat qo'shiladi/);
    await expect(t.db.query("DELETE FROM audit_log")).rejects.toThrow(/faqat qo'shiladi/);
    await t.db.query(
      "INSERT INTO audit_log (at, kind, ok) VALUES (now() - interval '800 days', 'eski-sinov', true), (now() - interval '10 days', 'yangi-sinov', true)",
    );
    await expect(t.db.query("DELETE FROM audit_log WHERE kind = 'eski-sinov'")).rejects.toThrow(/faqat qo'shiladi/);
    const { pruneAudit } = await import("../src/db");
    expect(await pruneAudit(t.db)).toBeGreaterThanOrEqual(1);
    const { rows } = await t.db.query<{ kind: string }>("SELECT kind FROM audit_log WHERE kind IN ('eski-sinov', 'yangi-sinov')");
    expect(rows.map((r) => r.kind)).toEqual(["yangi-sinov"]);
  });

  it("mavjud bo'lmagan login (masalan, adashib yozilgan parol) jurnalga yozilmaydi", async () => {
    const { client } = await import("./helpers");
    await client(t.app).req("POST", "/api/auth/login", { login: "MeningParolim2026", password: "x" });
    await client(t.app).req("POST", "/api/auth/login", { login: "op1", password: "xato" });
    const { rows } = await t.db.query<{ detail: { login: string } }>(
      "SELECT detail FROM audit_log WHERE kind = 'login' AND ok = false ORDER BY id DESC LIMIT 2",
    );
    expect(rows.map((r) => r.detail.login)).toEqual(["op1", "(mavjud emas)"]);
    const all = await t.db.query("SELECT 1 FROM audit_log WHERE detail::text ILIKE '%meningparolim%'");
    expect(all.rowCount).toBe(0);
  });
});

describe("L7: moliya xodimi o'ziga oylik yoza olmaydi", () => {
  let mol: Client;
  beforeAll(async () => {
    await giveLogin(t.db, "u_mol", "moliya");
    mol = await loginAs(t.app, "moliya");
  });
  it("o'z stavkasi, bonus, to'lov va hisoblash tasdig'i — 403; boshqa xodimga — mumkin; rahbar uchun — mumkin", async () => {
    const pay = { fixed: 99_000_000, perProject: 0, rates: {} };
    expect((await action(mol, "savePayProfile", [{ ...pay, userId: "u_mol" }])).statusCode).toBe(403);
    expect(
      (await action(mol, "addManualAccrual", [{ userId: "u_mol", date: "2026-10-01", kind: "bonus", amount: 5_000_000, title: "Bonus" }])).statusCode,
    ).toBe(403);
    expect((await action(mol, "payEmployee", [{ userId: "u_mol", amount: 1_000_000, date: "2026-10-01", accountId: "acc_bank", note: "" }])).statusCode).toBe(
      403,
    );
    expect(
      (
        await action(mol, "addTransaction", [
          { date: "2026-10-01", accountId: "acc_bank", dir: "out", amount: 1_000_000, articleId: "a_salary", userId: "u_mol", note: "" },
        ])
      ).statusCode,
    ).toBe(403);
    const own = t.store.current().state.accruals.find((a) => a.userId === "u_mol" && !a.approved);
    if (own) expect((await action(mol, "approveAccruals", [[own.id]])).statusCode).toBe(403);
    expect((await action(mol, "addManualAccrual", [{ userId: "u_mt1", date: "2026-10-01", kind: "bonus", amount: 100_000, title: "Bonus" }])).statusCode).toBe(
      200,
    );
    expect((await action(boss, "savePayProfile", [{ ...pay, fixed: 8_000_000, userId: "u_mol" }])).statusCode).toBe(200);
  });
});

describe("L8: tashqi so'rovlar vaqt chegarasi bilan", () => {
  it("Telegram so'rovi AbortSignal bilan yuboriladi (osilib qolmaydi)", async () => {
    const { sendTelegram } = await import("../../src/lib/telegram");
    const orig = globalThis.fetch;
    let signal: unknown;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      signal = init?.signal;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await sendTelegram("1:x", "1", "salom");
    } finally {
      globalThis.fetch = orig;
    }
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("L11: Meta kabineti faqat mavjud loyihaga ulanadi", () => {
  it("mavjud bo'lmagan loyiha ID — 422", async () => {
    const r = await action(boss, "setMetaAccount", ["__proto__", "act_1234567890"]);
    expect(r.statusCode).toBe(422);
  });
});

describe("L12: rahbariyat va moliya sessiyasi qisqaroq", () => {
  it("rahbar: 7 kun, 1 kun harakatsizlikda tugaydi; operator: 14 kun harakatsizlikkacha ishlaydi", async () => {
    const b = await loginAs(t.app, "boss");
    const o = await loginAs(t.app, "op1");
    const { rows } = await t.db.query<{ user_id: string; idle_minutes: number; days: number }>(
      "SELECT user_id, idle_minutes, round(extract(epoch FROM expires_at - created_at) / 86400) AS days FROM sessions WHERE user_id IN ('u_boss', 'u_op1') ORDER BY created_at DESC",
    );
    const boss1 = rows.find((r) => r.user_id === "u_boss")!;
    const op = rows.find((r) => r.user_id === "u_op1")!;
    expect([Number(boss1.days), boss1.idle_minutes]).toEqual([7, 1440]);
    expect([Number(op.days), op.idle_minutes]).toEqual([30, 20160]);
    await t.db.query("UPDATE sessions SET last_seen = now() - interval '25 hours' WHERE user_id IN ('u_boss', 'u_op1')");
    expect((await b.req("GET", "/api/state")).statusCode).toBe(401);
    expect((await o.req("GET", "/api/state")).statusCode).toBe(200);
  });
});
