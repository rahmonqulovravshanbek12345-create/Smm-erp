// Telegram Mini App: imzo tekshiruvi, parol + Telegram bilan kirish, sessiya bog'liqligi, pul va sozlamalarsiz cheklov.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErpState } from "../../src/lib/types";
import { sha256 } from "../src/crypto";
import { signInitData, verifyInitData } from "../src/tg-auth";
import { action, client, giveLogin, loginAs, PASS, setup, type Client, type Ctx } from "./helpers";

const TOKEN = "123456:MINIAPP-test-token_0000000000000";
const now = () => Math.floor(Date.now() / 1000);
const init = (tgId: string | number, o: { age?: number; token?: string; extra?: Record<string, string> } = {}) =>
  signInitData(o.token ?? TOKEN, {
    auth_date: String(now() - (o.age ?? 5)),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: Number(tgId), first_name: "Sinov", language_code: "uz" }),
    ...o.extra,
  });

describe("Telegram imzosi (initData)", () => {
  const ok = (data: unknown, max = 3600) => verifyInitData(data, TOKEN, max);

  it("to'g'ri imzo — Telegram ID va vaqt", () => {
    expect(ok(init(5001))).toMatchObject({ tgId: "5001" });
  });

  it("o'zgartirilgan, boshqa bot imzolagan, eskirgan yoki kelajakdagi ma'lumot rad etiladi", () => {
    const good = init(5001);
    expect(ok(good.replace("5001", "5002"))).toBeNull();
    expect(ok(init(5001, { token: "999:boshqa-bot" }))).toBeNull();
    expect(ok(init(5001, { age: 7200 }))).toBeNull();
    expect(ok(init(5001, { age: -3600 }))).toBeNull();
    expect(verifyInitData(good, "", 3600)).toBeNull();
  });

  it("buzilgan tuzilma: xeshsiz, takrorlangan maydon, foydalanuvchisiz, juda uzun, matn emas", () => {
    const good = init(5001);
    expect(ok(good.replace(/&?hash=[0-9a-f]+/, ""))).toBeNull();
    expect(ok(`${good}&user=${encodeURIComponent(JSON.stringify({ id: 1 }))}`)).toBeNull();
    expect(ok(signInitData(TOKEN, { auth_date: String(now()), query_id: "x" }))).toBeNull();
    expect(ok(signInitData(TOKEN, { auth_date: String(now()), user: JSON.stringify({ id: "5001" }) }))).toBeNull();
    expect(ok("a".repeat(5000))).toBeNull();
    expect(ok(undefined)).toBeNull();
    expect(ok(["x"])).toBeNull();
  });

  it("«signature» maydoni xeshga kirgan yoki kirmagan bo'lsa ham qabul qilinadi (Telegram versiyalari)", () => {
    expect(ok(init(5001, { extra: { signature: "c2lnbmF0dXJl" } }))).toMatchObject({ tgId: "5001" });
    // signature xeshdan keyin qo'shilgan (xesh u bilan hisoblanmagan)
    const without = init(5001);
    expect(ok(`${without}&signature=c2lnbmF0dXJl`)).toMatchObject({ tgId: "5001" });
  });
});

let t: Ctx;
let admin: Client;
let boss: Client;

/** Mini App so'rovlari: token + har safar Telegram imzosi. */
const mini = (token: string, tgId: string | number, initData: string | null = init(tgId)) => {
  const c = client(t.app);
  const headers = { authorization: `Bearer ${token}`, ...(initData === null ? {} : { "x-tg-init": initData }) };
  return {
    get: (url: string) => c.req("GET", url, undefined, headers),
    post: (url: string, body?: unknown) => c.req("POST", url, body, headers),
    act: (name: string, args: unknown[]) => c.req("POST", "/api/action", { name, args }, headers),
  };
};
const tgLogin = (login: string, tgId: string | number, password = PASS, initData = init(tgId)) =>
  client(t.app).req("POST", "/api/tg/login", { initData, login, password });
const tokenFor = async (login: string, tgId: string | number) => {
  const r = await tgLogin(login, tgId);
  expect(r.statusCode, r.body).toBe(200);
  return r.json().token as string;
};
const setMini = (on: boolean) =>
  t.store.system((s) => {
    s.settings.telegram = { ...s.settings.telegram, enabled: true, botToken: TOKEN, miniApp: { on, at: new Date().toISOString() } };
  });

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_admin", "admin");
  await giveLogin(t.db, "u_boss", "rahbar");
  await giveLogin(t.db, "u_dz", "dizayner");
  await giveLogin(t.db, "u_mt1", "rustam");
  await setMini(true);
  await t.store.system((s) => {
    const chats: Record<string, string> = { u_admin: "5003", u_boss: "5002", u_dz: "5001", u_mt1: "5004" };
    for (const u of s.users) u.telegramChatId = chats[u.id];
  });
  admin = await loginAs(t.app, "admin");
  boss = await loginAs(t.app, "rahbar");
});
afterAll(() => t.close());

describe("Kirish: parol + Telegram akkaunt", () => {
  it("to'g'ri parol va xodimga bog'langan Telegram — 12 soatlik token; me: via=tg", async () => {
    const token = await tokenFor("dizayner", 5001);
    const me = await mini(token, 5001).get("/api/me");
    expect(me.json()).toMatchObject({ user: { id: "u_dz" }, via: "tg" });
    const { rows } = await t.db.query("SELECT kind, tg_id, expires_at - created_at AS life FROM sessions WHERE kind = 'tg' AND user_id = 'u_dz'");
    expect(rows[0]).toMatchObject({ kind: "tg", tg_id: "5001" });
    expect(rows[0].life.hours).toBe(12);
  });

  it("noto'g'ri parol — 401, xato hisoblanadi", async () => {
    const r = await tgLogin("dizayner", 5001, "notogri-parol");
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe("Login yoki parol noto'g'ri");
  });

  it("parol to'g'ri, lekin begona Telegram akkaunt — rad etiladi va xodimga ogohlantirish boradi", async () => {
    t.sent.length = 0;
    const r = await tgLogin("dizayner", 7777);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toContain("bog'lanmagan");
    await t.idle();
    expect(t.sent.map((m) => m.chatId)).toEqual(["5001"]);
    expect(t.sent[0]!.text).toContain("boshqa Telegram akkauntdan");
  });

  it("eskirgan yoki soxta Telegram imzosi — parol tekshirilmaydi", async () => {
    expect((await tgLogin("dizayner", 5001, PASS, init(5001, { age: 7200 }))).statusCode).toBe(401);
    expect((await tgLogin("dizayner", 5001, PASS, init(5001, { token: "1:soxta" }))).statusCode).toBe(401);
  });

  it("Mini App o'chiq bo'lsa kirib bo'lmaydi", async () => {
    await setMini(false);
    expect((await tgLogin("dizayner", 5001)).statusCode).toBe(403);
    await setMini(true);
  });

  it("vaqtinchalik parol hali almashtirilmagan — avval saytda", async () => {
    await giveLogin(t.db, "u_mt1", "rustam", PASS, true);
    const r = await tgLogin("rustam", 5004);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toContain("saytda");
    await giveLogin(t.db, "u_mt1", "rustam");
  });
});

describe("Har bir so'rov: token + shu akkauntning Telegram imzosi", () => {
  it("imzosiz, boshqa akkaunt imzosi bilan yoki buzilgan token — 401", async () => {
    const token = await tokenFor("dizayner", 5001);
    expect((await mini(token, 5001, null).get("/api/state")).statusCode).toBe(401);
    expect((await mini(token, 5002).get("/api/state")).statusCode).toBe(401);
    expect((await mini("x".repeat(40), 5001).get("/api/state")).statusCode).toBe(401);
    expect((await mini(token, 5001).get("/api/state")).statusCode).toBe(200);
  });

  it("Mini App tokeni sayt cookie'si sifatida ishlamaydi", async () => {
    const token = await tokenFor("dizayner", 5001);
    const c = client(t.app);
    c.cookies["__Host-erp"] = token;
    expect((await c.req("GET", "/api/state")).statusCode).toBe(401);
  });

  it("xodimning chat ID'si o'zgarsa — sessiya yopiladi", async () => {
    const token = await tokenFor("rustam", 5004);
    expect((await mini(token, 5004).get("/api/state")).statusCode).toBe(200);
    await t.store.system((s) => {
      s.users.find((u) => u.id === "u_mt1")!.telegramChatId = "6004";
    });
    expect((await mini(token, 5004).get("/api/state")).statusCode).toBe(401);
    const { rowCount } = await t.db.query("SELECT 1 FROM sessions WHERE id = $1", [sha256(token)]);
    expect(rowCount).toBe(0);
    await t.store.system((s) => {
      s.users.find((u) => u.id === "u_mt1")!.telegramChatId = "5004";
    });
  });

  it("chiqish — token bekor bo'ladi", async () => {
    const token = await tokenFor("dizayner", 5001);
    expect((await mini(token, 5001).post("/api/auth/logout")).statusCode).toBe(200);
    expect((await mini(token, 5001).get("/api/state")).statusCode).toBe(401);
  });
});

describe("Mini App'da pul va sozlamalar yo'q", () => {
  it("rahbarga Mini App'da fakturalar, kassa, narxlar va takliflar yuborilmaydi (saytda — bor)", async () => {
    const web = (await boss.req("GET", "/api/state?v=-1")).json().state as ErpState;
    expect(web.invoices.length).toBeGreaterThan(0);
    expect(web.projects.some((p) => p.monthlyFee > 0)).toBe(true);
    const token = await tokenFor("rahbar", 5002);
    const s = (await mini(token, 5002).get("/api/state?v=-1")).json().state as ErpState;
    expect(s.invoices).toEqual([]);
    expect(s.bills).toEqual([]);
    expect(s.proposals).toEqual([]);
    expect(s.transactions.every((x) => x.userId === "u_boss")).toBe(true);
    expect(s.projects.length).toBe(web.projects.length);
    expect(s.projects.every((p) => p.monthlyFee === 0 && p.services.every((x) => x.price === 0))).toBe(true);
    expect(s.tasks.length).toBe(web.tasks.length);
  });

  it("ruxsat etilgan amal bajariladi va tarixda «Telegram orqali» deb yoziladi", async () => {
    const task = t.store.current().state.tasks.find((x) => x.assigneeId === "u_dz" && x.status === "new")!;
    const token = await tokenFor("dizayner", 5001);
    const r = await mini(token, 5001).act("startTask", [task.id]);
    expect(r.statusCode, r.body).toBe(200);
    expect(t.store.current().state.tasks.find((x) => x.id === task.id)!.status).toBe("progress");
    expect(t.store.current().state.activity[0]!.text).toMatch(/· Telegram orqali$/);
    const { rows } = await t.db.query("SELECT detail FROM audit_log WHERE action = 'startTask' ORDER BY id DESC LIMIT 1");
    expect(rows[0].detail.via).toBe("telegram");
  });

  it("pul va sozlama amallari rad etiladi (rol ruxsat bersa ham) — saytda ishlaydi", async () => {
    const token = await tokenFor("rahbar", 5002);
    const r = await mini(token, 5002).act("addTransaction", [{ kind: "expense", amount: 1000 }]);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toContain("faqat saytda");
    expect((await mini(token, 5002).act("setCompanyName", ["Boshqa nom"])).statusCode).toBe(403);
    expect((await action(admin, "setCompanyName", [t.store.current().state.settings.companyName])).statusCode).toBe(200);
  });

  it("admin bo'limlari, parol va 2FA sozlamalari Mini App tokeni bilan yopiq", async () => {
    const token = await tokenFor("admin", 5003);
    const m = mini(token, 5003);
    expect((await m.get("/api/admin/export")).statusCode).toBe(403);
    expect((await m.get("/api/admin/logins")).statusCode).toBe(403);
    expect((await m.post("/api/auth/password", { current: PASS, next: "Yangi-parol-2026-xx" })).statusCode).toBe(403);
    expect((await m.post("/api/integrations/telegram/miniapp", { on: false })).statusCode).toBe(403);
  });
});

describe("Admin: Mini App'ni yoqish/o'chirish", () => {
  it("yoqilganda botga «ERP» tugmasi qo'yiladi; o'chirilganda tugma olinadi va hamma Mini App sessiyalari yopiladi", async () => {
    t.tg.calls.length = 0;
    expect((await admin.req("POST", "/api/integrations/telegram/miniapp", { on: true })).statusCode).toBe(200);
    expect(t.tg.calls).toEqual(["menu:https://erp.test/tg"]);
    expect(t.store.current().state.settings.telegram.miniApp?.on).toBe(true);
    const token = await tokenFor("dizayner", 5001);
    expect((await admin.req("POST", "/api/integrations/telegram/miniapp", { on: false })).statusCode).toBe(200);
    expect(t.tg.calls.at(-1)).toBe("menu:default");
    expect(t.store.current().state.settings.telegram.miniApp?.on).toBe(false);
    expect((await t.db.query("SELECT 1 FROM sessions WHERE kind = 'tg'")).rowCount).toBe(0);
    await setMini(true);
    expect((await mini(token, 5001).get("/api/state")).statusCode).toBe(401);
  });

  it("faqat admin; Telegram xato bersa — 502 va holat «o'chiq» qoladi", async () => {
    expect((await boss.req("POST", "/api/integrations/telegram/miniapp", { on: true })).statusCode).toBe(403);
    await setMini(false);
    t.tg.webhookError = "Bad Request: invalid url";
    const r = await admin.req("POST", "/api/integrations/telegram/miniapp", { on: true });
    expect(r.statusCode).toBe(502);
    expect(t.store.current().state.settings.telegram.miniApp).toMatchObject({ on: false, error: "Bad Request: invalid url" });
    delete t.tg.webhookError;
    await setMini(true);
  });
});

describe("Sahifa", () => {
  it("/tg — faqat Telegram veb-versiyasi oynada ocha oladi; / — hech kim", async () => {
    const tg = await client(t.app).req("GET", "/tg");
    expect(tg.statusCode).toBe(200);
    expect(tg.headers["content-security-policy"]).toContain("frame-ancestors https://web.telegram.org");
    expect(tg.headers["x-frame-options"]).toBeUndefined();
    const root = await client(t.app).req("GET", "/");
    expect(root.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(root.headers["x-frame-options"]).toBe("DENY");
  });
});
