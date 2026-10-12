// Kirish va hujumlarga qarshi himoya: parolni taxmin qilish, boshqa saytdan so'rov, sessiya, 2FA.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totpAt } from "../src/crypto";
import { PASS, action, client, giveLogin, loginAs, setup, type Ctx } from "./helpers";

let t: Ctx;
beforeAll(async () => {
  t = await setup({ require2fa: "admin,rahbar,moliya" });
  await giveLogin(t.db, "u_mt1", "rustam");
  await giveLogin(t.db, "u_smm1", "madina", PASS, true);
  await giveLogin(t.db, "u_admin", "admin");
});
afterAll(() => t.close());

describe("Login va parol", () => {
  it("noto'g'ri parol va mavjud bo'lmagan login — bir xil javob", async () => {
    const c = client(t.app);
    const a = await c.req("POST", "/api/auth/login", { login: "rustam", password: "notogri-parol1" });
    const b = await c.req("POST", "/api/auth/login", { login: "yoq-login", password: "notogri-parol1" });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
    expect(a.cookies.find((x) => x.name === "__Host-erp")).toBeUndefined();
  });

  it("5 ta xatodan keyin login bloklanadi — to'g'ri parol bilan ham kirib bo'lmaydi", async () => {
    await giveLogin(t.db, "u_dz", "nilufar");
    for (let i = 0; i < 5; i++) {
      // Har urinish boshqa IP'dan — blok IP'ga emas, loginga qo'yiladi
      const r = await client(t.app).req("POST", "/api/auth/login", { login: "nilufar", password: `xato-parol-${i}` });
      expect(r.statusCode).toBe(401);
    }
    const r = await client(t.app).req("POST", "/api/auth/login", { login: "nilufar", password: PASS });
    expect(r.statusCode).toBe(429);
    expect(r.json().error).toMatch(/daqiqadan keyin/);
    // Mavjud bo'lmagan login ham xuddi shunday bloklanadi (kim borligini bilib bo'lmaydi)
    for (let i = 0; i < 5; i++) await client(t.app).req("POST", "/api/auth/login", { login: "hech-kim", password: `xato-${i}-parol` });
    expect((await client(t.app).req("POST", "/api/auth/login", { login: "hech-kim", password: PASS })).statusCode).toBe(429);
  });

  it("bitta IP'dan juda ko'p urinish — IP cheklanadi", async () => {
    const c = client(t.app);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await c.req("POST", "/api/auth/login", { login: `user${i}`, password: "xato-parol-1" })).statusCode);
    expect(codes.slice(0, 10).every((x) => x === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it("sessiya cookie: HttpOnly, Secure, SameSite=Strict, __Host-", async () => {
    const r = await client(t.app).req("POST", "/api/auth/login", { login: "rustam", password: PASS });
    expect(r.statusCode).toBe(200);
    const raw = String(r.headers["set-cookie"]);
    expect(raw).toMatch(/__Host-erp=[A-Za-z0-9_-]{43};/);
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/Secure/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\//);
    expect(raw).not.toMatch(/Domain=/);
  });

  it("birinchi kirishda parol almashtirilmaguncha ma'lumot berilmaydi; zaif parol qabul qilinmaydi", async () => {
    const c = await loginAs(t.app, "madina");
    const me = await c.req("GET", "/api/me");
    expect(me.json()).toMatchObject({ blocked: "password", user: { id: "u_smm1", role: "smm" } });
    expect((await c.req("GET", "/api/state")).statusCode).toBe(403);
    expect((await action(c, "markAllRead", [])).statusCode).toBe(403);
    for (const weak of ["qisqa1", "1234567890", "faqatharflar", "madina12345x", "aaaaaaaaaa1"]) {
      const r = await c.req("POST", "/api/auth/password", { current: PASS, next: weak });
      expect(r.statusCode, weak).toBe(400);
    }
    expect((await c.req("POST", "/api/auth/password", { current: "notogri-joriy1", next: "Yangi-parol-77" })).statusCode).toBe(400);
    expect((await c.req("POST", "/api/auth/password", { current: PASS, next: "Yangi-parol-77" })).statusCode).toBe(200);
    expect((await c.req("GET", "/api/state")).statusCode).toBe(200);
    // Eski parol endi ishlamaydi
    expect((await client(t.app).req("POST", "/api/auth/login", { login: "madina", password: PASS })).statusCode).toBe(401);
  });

  it("parol almashtirilganda boshqa qurilmalardagi sessiyalar yopiladi", async () => {
    await giveLogin(t.db, "u_mt2", "shoxrux");
    const phone = await loginAs(t.app, "shoxrux");
    const laptop = await loginAs(t.app, "shoxrux");
    expect((await laptop.req("POST", "/api/auth/password", { current: PASS, next: "Boshqa-parol-55" })).statusCode).toBe(200);
    expect((await phone.req("GET", "/api/state")).statusCode).toBe(401);
    expect((await laptop.req("GET", "/api/state")).statusCode).toBe(200);
  });

  it("chiqish: sessiya serverda o'chadi, eski cookie qayta ishlamaydi", async () => {
    const c = await loginAs(t.app, "rustam");
    const stolen = { ...c.cookies };
    expect((await c.req("POST", "/api/auth/logout")).statusCode).toBe(200);
    const thief = client(t.app);
    thief.cookies = stolen;
    expect((await thief.req("GET", "/api/state")).statusCode).toBe(401);
  });

  it("soxta yoki tasodifiy sessiya tokeni — kirib bo'lmaydi", async () => {
    const c = client(t.app);
    c.cookies["__Host-erp"] = "A".repeat(43);
    expect((await c.req("GET", "/api/state")).statusCode).toBe(401);
    c.cookies["__Host-erp"] = "x".repeat(5000);
    expect((await c.req("GET", "/api/state")).statusCode).toBe(401);
  });
});

describe("Boshqa saytdan so'rov (CSRF)", () => {
  it("maxsus sarlavhasiz yoki begona Origin bilan o'zgartiruvchi so'rov rad etiladi", async () => {
    const c = await loginAs(t.app, "rustam");
    expect((await c.req("POST", "/api/action", { name: "markAllRead", args: [] }, { "x-erp": "" })).statusCode).toBe(403);
    expect((await c.req("POST", "/api/action", { name: "markAllRead", args: [] }, { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await c.req("POST", "/api/auth/logout", {}, { origin: "null" })).statusCode).toBe(403);
    expect((await c.req("POST", "/api/action", { name: "markAllRead", args: [] })).statusCode).toBe(200);
  });

  it("forma (text/plain) orqali yuborilgan so'rov qabul qilinmaydi", async () => {
    const c = await loginAs(t.app, "rustam");
    const r = await c.req("POST", "/api/action", undefined, { "content-type": "text/plain" });
    expect([400, 415]).toContain(r.statusCode);
  });
});

describe("Ikki bosqichli kirish (2FA)", () => {
  it("admin 2FA yoqmaguncha ishlay olmaydi; yoqqach kod so'raladi; bir kodni ikki marta ishlatib bo'lmaydi", async () => {
    const c = await loginAs(t.app, "admin");
    expect((await c.req("GET", "/api/me")).json().blocked).toBe("2fa");
    expect((await c.req("GET", "/api/state")).statusCode).toBe(403);
    const setupRes = await c.req("POST", "/api/auth/2fa/setup");
    const { secret, uri, svg } = setupRes.json();
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(svg).toMatch(/^<svg/);
    expect((await c.req("POST", "/api/auth/2fa/enable", { code: "000000" })).statusCode).toBe(400);
    const step = Math.floor(Date.now() / 30_000);
    expect((await c.req("POST", "/api/auth/2fa/enable", { code: totpAt(secret, step) })).statusCode).toBe(200);
    expect((await c.req("GET", "/api/state")).statusCode).toBe(200);

    // Qayta kirish: parol to'g'ri — lekin kodsiz hech narsa ochilmaydi
    const d = client(t.app);
    expect((await d.req("POST", "/api/auth/login", { login: "admin", password: PASS })).json()).toEqual({ need2fa: true });
    expect((await d.req("GET", "/api/state")).statusCode).toBe(401);
    // Oldingi qadam kodi allaqachon ishlatilgan
    expect((await d.req("POST", "/api/auth/totp", { code: totpAt(secret, step) })).statusCode).toBe(401);
    expect((await d.req("POST", "/api/auth/totp", { code: totpAt(secret, step + 1) })).statusCode).toBe(200);
    expect((await d.req("GET", "/api/state")).statusCode).toBe(200);
  });

  it("2FA kodini taxmin qilish — bloklanadi", async () => {
    await giveLogin(t.db, "u_boss", "rahbar");
    const c = await loginAs(t.app, "rahbar");
    const { secret } = (await c.req("POST", "/api/auth/2fa/setup")).json();
    const step = Math.floor(Date.now() / 30_000);
    await c.req("POST", "/api/auth/2fa/enable", { code: totpAt(secret, step) });
    const d = client(t.app);
    await d.req("POST", "/api/auth/login", { login: "rahbar", password: PASS });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await d.req("POST", "/api/auth/totp", { code: String(100000 + i) })).statusCode);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
  });
});

describe("Yangi qurilma", () => {
  it("yangi qurilmadan kirilsa — xodimning Telegram'iga ogohlantirish", async () => {
    await t.store.system((s) => {
      s.settings.telegram = { enabled: true, botToken: "123456:TEST_token-for_tests_only_00000" };
      s.users.find((u) => u.id === "u_mt1")!.telegramChatId = "777";
    });
    const first = await loginAs(t.app, "rustam");
    const before = t.sent.length;
    // Shu qurilma (cookie) bilan qayta kirish — ogohlantirish yo'q
    await first.req("POST", "/api/auth/login", { login: "rustam", password: PASS });
    // Boshqa qurilma
    await loginAs(t.app, "rustam");
    await new Promise((r) => setTimeout(r, 50));
    const alerts = t.sent.slice(before).filter((m) => m.text.includes("yangi qurilmadan"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.chatId).toBe("777");
  });
});

describe("Audit jurnali", () => {
  it("kirishlar yoziladi va jurnalni o'zgartirib/o'chirib bo'lmaydi", async () => {
    const { rows } = await t.db.query("SELECT count(*)::int AS n FROM audit_log WHERE kind = 'login'");
    expect(rows[0].n).toBeGreaterThan(5);
    await expect(t.db.query("UPDATE audit_log SET ok = true")).rejects.toThrow(/faqat qo'shiladi/);
    await expect(t.db.query("DELETE FROM audit_log")).rejects.toThrow(/faqat qo'shiladi/);
  });
});
