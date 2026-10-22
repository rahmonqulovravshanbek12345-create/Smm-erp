// E'lonlar serverda: kim yubora oladi, Telegram'ga yetkazish, o'qiganlar hisobi va kim nimani ko'radi.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErpState } from "../../src/lib/types";
import { action, giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let mk: Client;
let smm: Client;
const stateOf = async (c: Client) => (await c.req("GET", "/api/state?v=-1")).json().state as ErpState;

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_mk", "marketolog");
  await giveLogin(t.db, "u_smm1", "madina");
  await t.store.system((s) => {
    s.settings.telegram = { enabled: true, botToken: "111:TG-TOKEN-0123456789abcdef" };
    s.notifications = [];
    const chats: Record<string, string> = { u_smm1: "1001", u_smm2: "fail" };
    for (const u of s.users) u.telegramChatId = chats[u.id];
  });
  mk = await loginAs(t.app, "marketolog");
  smm = await loginAs(t.app, "madina");
});
afterAll(() => t.close());

describe("E'lonlar", () => {
  it("marketolog SMM'larga e'lon yuboradi: tizimda va Telegram'da; yetkazilmagani hisobotda", async () => {
    t.sent.length = 0;
    const r = await action(mk, "sendAnnouncement", [{ text: "Juma kuni hisobot topshiriladi", roles: ["smm"] }]);
    expect(r.statusCode, r.body).toBe(200);
    await t.idle();
    expect(t.sent.map((m) => m.chatId).sort()).toEqual(["1001", "fail"]);
    expect(t.sent[0]!.text).toContain("Juma kuni hisobot topshiriladi");
    const a = t.store.current().state.announcements[0]!;
    expect(a).toMatchObject({ by: "u_mk", audience: "roles", tg: 2, tgFailed: 1 });
  });

  it("xodim e'lonni bildirishnomada ko'radi, lekin e'lonlar hisobotini emas; o'qisa — yuboruvchi ko'radi", async () => {
    const s = await stateOf(smm);
    expect(s.announcements).toEqual([]);
    const n = s.notifications.find((x) => x.ann)!;
    expect(n.text).toContain("📣 E'lon");
    expect((await action(smm, "markRead", [n.id])).statusCode).toBe(200);
    const m = await stateOf(mk);
    expect(m.announcements[0]!.readBy).toEqual(["u_smm1"]);
  });

  it("SMM e'lon yubora olmaydi; noto'g'ri argumentlar rad etiladi", async () => {
    expect((await action(smm, "sendAnnouncement", [{ text: "salom" }])).statusCode).toBe(403);
    expect((await action(mk, "sendAnnouncement", [{ text: "x", roles: ["boshliq"] }])).statusCode).toBe(400);
    expect((await action(mk, "sendAnnouncement", [{ text: "x", extra: 1 }])).statusCode).toBe(400);
    // Daqiqada bittadan ko'p emas
    const r = await action(mk, "sendAnnouncement", [{ text: "yana" }]);
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain("1 daqiqa");
  });
});
