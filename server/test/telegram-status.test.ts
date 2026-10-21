// Xodimlar Telegram botga ulanishi/chiqib ketishi: webhook (maxfiy so'z bilan), kuzatuvni yoqish, hammasini tekshirish, xabarlar.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErpState } from "../../src/lib/types";
import { action, client, giveLogin, loginAs, ORIGIN, setup, type Client, type Ctx } from "./helpers";

const URL = "/api/webhooks/telegram";
// helpers.setup() SECRET_KEY = 32 ta bayt «7» — server shundan webhook maxfiy so'zini oladi
const SECRET = createHmac("sha256", Buffer.alloc(32, 7)).update("telegram-webhook").digest("hex");

let t: Ctx;
let admin: Client;
let smm: Client;

const post = (body: unknown, secret: string | null = SECRET) =>
  t.app.inject({
    method: "POST",
    url: URL,
    remoteAddress: "127.0.0.1",
    headers: { "content-type": "application/json", ...(secret !== null ? { "x-telegram-bot-api-secret-token": secret } : {}) },
    payload: JSON.stringify(body),
  });
const blockedBy = (chat: number) => ({ update_id: 1, my_chat_member: { chat: { id: chat, type: "private" }, new_chat_member: { status: "kicked" } } });
const startedBy = (chat: number) => ({ update_id: 2, message: { chat: { id: chat, type: "private" }, text: "/start" } });
const users = () => t.store.current().state.users;
const u = (id: string) => users().find((x) => x.id === id)!;
const notes = (userId: string) => t.store.current().state.notifications.filter((n) => n.userId === userId);
const stateOf = async (c: Client) => (await c.req("GET", "/api/state")).json().state as ErpState;

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_admin", "admin");
  await giveLogin(t.db, "u_smm1", "madina");
  admin = await loginAs(t.app, "admin");
  smm = await loginAs(t.app, "madina");
  await t.store.system((s) => {
    s.settings.telegram = { enabled: true, botToken: "111:TG-TOKEN-0123456789abcdef" };
    s.notifications = [];
    const chats: Record<string, string> = { u_admin: "9001", u_boss: "9002", u_mk: "9003", u_op1: "9004", u_smm1: "1001", u_smm2: "1002" };
    for (const x of s.users) x.telegramChatId = chats[x.id];
  });
});
afterAll(() => t.close());

describe("Webhook himoyasi", () => {
  it("maxfiy so'zsiz yoki noto'g'ri so'z bilan — rad etiladi, holat o'zgarmaydi", async () => {
    expect((await post(blockedBy(1001), null)).statusCode).toBe(403);
    expect((await post(blockedBy(1001), "x".repeat(SECRET.length))).statusCode).toBe(403);
    expect((await post(blockedBy(1001), "qisqa")).statusCode).toBe(403);
    expect(u("u_smm1").telegramStatus).toBeUndefined();
  });

  it("brauzer so'rovi sarlavhalari (X-ERP) talab qilinmaydi — Telegram brauzer emas", async () => {
    const r = await post({ update_id: 9 });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it("keraksiz yangilanish (guruh, oddiy xabar) hech narsani o'zgartirmaydi", async () => {
    const v = t.store.current().version;
    await post({ message: { chat: { id: 1001, type: "private" }, text: "salom" } });
    await post({ my_chat_member: { chat: { id: -100123, type: "supergroup" }, new_chat_member: { status: "kicked" } } });
    expect(t.store.current().version).toBe(v);
  });
});

describe("Holat va xabarlar", () => {
  it("xodim botni bloklasa: holat yoziladi; admin, rahbar va marketologga xabar boradi — operator va xodimning o'ziga yo'q", async () => {
    expect((await post(blockedBy(1001))).statusCode).toBe(200);
    await t.idle();
    expect(u("u_smm1").telegramStatus).toBe("blocked");
    for (const id of ["u_admin", "u_boss", "u_mk"]) {
      expect(notes(id), id).toHaveLength(1);
      expect(notes(id)[0]!.text).toContain("Madina Rashidova");
    }
    expect(notes("u_op1")).toHaveLength(0);
    expect(notes("u_smm1")).toHaveLength(0);
    // Telegram'ga ham ketdi (shu uch kishining chatiga)
    expect(t.sent.map((m) => m.chatId).sort()).toEqual(["9001", "9002", "9003"]);
    expect(t.sent[0]!.text).toContain("to'xtatdi");
  });

  it("xuddi shu yangilanish qayta kelsa — yangi xabar ham, bazaga yozuv ham yo'q", async () => {
    const v = t.store.current().version;
    t.sent.length = 0;
    await post(blockedBy(1001));
    await t.idle();
    expect(t.store.current().version).toBe(v);
    expect(t.sent).toHaveLength(0);
  });

  it("blokdan chiqib /start bossa — «ulandi» xabari", async () => {
    t.sent.length = 0;
    await post(startedBy(1001));
    await t.idle();
    expect(u("u_smm1").telegramStatus).toBe("member");
    expect(notes("u_admin")).toHaveLength(2);
    expect(notes("u_admin")[0]!.text).toContain("ulandi");
    expect(t.sent).toHaveLength(3);
  });

  it("chat ID kiritilmagan odam botga yozsa — hech kimga tegmaydi", async () => {
    const v = t.store.current().version;
    await post(startedBy(555555));
    expect(t.store.current().version).toBe(v);
  });

  it("holatni faqat admin ko'radi; boshqa xodim ko'rmaydi", async () => {
    expect((await stateOf(admin)).users.find((x) => x.id === "u_smm2")!.telegramChatId).toBe("1002");
    const other = (await stateOf(smm)).users.find((x) => x.id === "u_smm1")!;
    expect(other.telegramStatus).toBe("member"); // o'zinikini ko'radi
    const seen = (await stateOf(smm)).users.find((x) => x.id === "u_op1")!;
    expect(seen.telegramStatus).toBeUndefined();
    expect(seen.telegramChatId).toBe("•");
  });
});

describe("Kuzatuvni yoqish/o'chirish (faqat admin)", () => {
  it("oddiy xodim va kirmagan odam — rad etiladi", async () => {
    expect((await smm.req("POST", "/api/integrations/telegram/tracking", { on: true })).statusCode).toBe(403);
    expect((await client(t.app).req("POST", "/api/integrations/telegram/tracking", { on: true })).statusCode).toBe(401);
    expect((await admin.req("POST", "/api/integrations/telegram/tracking", { on: "ha" })).statusCode).toBe(400);
    expect(t.tg.calls).toHaveLength(0);
  });

  it("yoqish: Telegram'ga to'g'ri manzil va maxfiy so'z beriladi, holat saqlanadi", async () => {
    const r = await admin.req("POST", "/api/integrations/telegram/tracking", { on: true });
    expect(r.statusCode).toBe(200);
    expect(t.tg.calls).toEqual([`set:${ORIGIN}${URL}:${SECRET}`]);
    expect(t.store.current().state.settings.telegram.tracking?.on).toBe(true);
  });

  it("Telegram rad etsa — xato ko'rsatiladi va kuzatuv yoqilmagan bo'lib qoladi", async () => {
    t.tg.webhookError = "Bad Request: bad webhook";
    const r = await admin.req("POST", "/api/integrations/telegram/tracking", { on: true });
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toContain("bad webhook");
    const tr = t.store.current().state.settings.telegram.tracking!;
    expect(tr.on).toBe(false);
    expect(tr.error).toContain("bad webhook");
    t.tg.webhookError = undefined;
  });

  it("o'chirish", async () => {
    t.tg.calls.length = 0;
    expect((await admin.req("POST", "/api/integrations/telegram/tracking", { on: false })).statusCode).toBe(200);
    expect(t.tg.calls).toEqual(["delete"]);
    expect(t.store.current().state.settings.telegram.tracking?.on).toBe(false);
  });

  it("maxfiy so'z holatda saqlanmaydi va brauzerga chiqmaydi", async () => {
    const { rows } = await t.db.query<{ d: string }>("SELECT data::text AS d FROM app_state WHERE id = 1");
    expect(rows[0]!.d).not.toContain(SECRET);
    expect(JSON.stringify(await stateOf(admin))).not.toContain(SECRET);
  });

  it("Telegram o'chiq bo'lsa — tushunarli xato", async () => {
    await t.store.system((s) => {
      s.settings.telegram.enabled = false;
    });
    const r = await admin.req("POST", "/api/integrations/telegram/tracking", { on: true });
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toContain("yoqing");
    await t.store.system((s) => {
      s.settings.telegram.enabled = true;
    });
  });
});

describe("Hammasini tekshirish (faqat admin)", () => {
  it("oddiy xodim — rad etiladi", async () => {
    expect((await smm.req("POST", "/api/integrations/telegram/check")).statusCode).toBe(403);
  });

  it("har bir chat tekshiriladi, natija holatga jim yoziladi (xabar yubormaydi)", async () => {
    await t.store.system((s) => {
      for (const x of s.users) {
        delete x.telegramStatus;
        delete x.telegramStatusAt;
      }
      s.notifications = [];
    });
    t.sent.length = 0;
    t.tg.probes = { "9001": "member", "9004": "blocked", "1001": "member", "1002": "unknown" };
    const r = await admin.req("POST", "/api/integrations/telegram/check");
    expect(r.statusCode).toBe(200);
    expect(r.json().chats).toBeGreaterThan(3);
    await t.idle();
    expect(u("u_admin").telegramStatus).toBe("member");
    expect(u("u_op1").telegramStatus).toBe("blocked");
    expect(u("u_smm1").telegramStatus).toBe("member");
    expect(u("u_smm2").telegramStatus).toBeUndefined(); // «noma'lum» — o'zgarmaydi
    expect(t.store.current().state.notifications).toHaveLength(0);
    expect(t.sent).toHaveLength(0);
  });

  it("Telegram o'chiq bo'lsa — 400", async () => {
    await t.store.system((s) => {
      s.settings.telegram.enabled = false;
    });
    expect((await admin.req("POST", "/api/integrations/telegram/check")).statusCode).toBe(400);
    await t.store.system((s) => {
      s.settings.telegram.enabled = true;
    });
  });
});

describe("Brauzerdan holatni qo'lda o'zgartirib bo'lmaydi", () => {
  it("setTelegramStatus va markTelegramTracking — rad etiladi (hatto admin uchun)", async () => {
    expect((await action(admin, "setTelegramStatus", ["1001", "blocked", "event"])).statusCode).toBeGreaterThanOrEqual(400);
    expect((await action(admin, "markTelegramTracking", [true])).statusCode).toBeGreaterThanOrEqual(400);
    expect(u("u_smm1").telegramStatus).toBe("member");
  });

  it("chat ID o'zgartirilsa — eski holat o'chadi", async () => {
    const r = await action(admin, "setUserChatId", ["u_smm1", "7777"]);
    expect(r.statusCode).toBe(200);
    expect(u("u_smm1").telegramStatus).toBeUndefined();
  });
});
