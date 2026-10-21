// Xodim Telegram botga ulandi / botni blokladi: Telegram yangilanishini o'qish, holatni yozish, kimga xabar borishi.
import { describe, expect, it } from "vitest";
import { markTelegramTracking, setTelegramStatus, setTelegramToken, setUserChatId } from "./actions-system";
import { makeCtx } from "./ctx";
import { parseTelegramUpdate } from "./telegram";
import { demoState } from "./test-utils";
import type { ErpState } from "./types";

const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

/** Telegram yoqilgan demo holat: admin, rahbar, marketolog, operator va SMM'da chat ID bor. */
function setup(): ErpState {
  const s = demoState();
  s.settings.telegram = { enabled: true, botToken: TOKEN };
  const chats: Record<string, string> = { u_admin: "9001", u_boss: "9002", u_mk: "9003", u_op1: "9004", u_smm1: "1001" };
  for (const u of s.users) u.telegramChatId = chats[u.id];
  s.notifications = []; // demo'dagi tayyor bildirishnomalar xalaqit bermasin
  return s;
}
const user = (s: ErpState, id: string) => s.users.find((u) => u.id === id)!;
/** Tizim amali: birinchi faol admin nomidan (server `runAsSystem` shunday qiladi). */
const run = (s: ErpState, chat: string, status: "member" | "blocked", source: "event" | "send" | "probe") => {
  const { ctx, outbox } = makeCtx(s, user(s, "u_admin"), { today: "2026-10-07" });
  const changed = setTelegramStatus(ctx, chat, status, source);
  return { changed, outbox };
};
const notified = (s: ErpState) => [...new Set(s.notifications.map((n) => n.userId))].sort();

describe("Telegram yangilanishini o'qish", () => {
  const member = (status: string, type = "private") => ({ my_chat_member: { chat: { id: 1001, type }, new_chat_member: { status } } });

  it("shaxsiy chatda botni ishga tushirish — ulangan; bloklash yoki chiqib ketish — bloklagan", () => {
    expect(parseTelegramUpdate(member("member"))).toEqual({ chatId: "1001", status: "member" });
    expect(parseTelegramUpdate(member("kicked"))).toEqual({ chatId: "1001", status: "blocked" });
    expect(parseTelegramUpdate(member("left"))).toEqual({ chatId: "1001", status: "blocked" });
  });

  it("guruh va noma'lum holat e'tiborga olinmaydi", () => {
    expect(parseTelegramUpdate(member("member", "supergroup"))).toBeNull();
    expect(parseTelegramUpdate(member("administrator"))).toBeNull();
  });

  it("/start xabari — ulangan; boshqa matn va yaroqsiz tana — yo'q", () => {
    const msg = (text: unknown, type = "private") => ({ message: { chat: { id: 77, type }, text } });
    expect(parseTelegramUpdate(msg("/start"))).toEqual({ chatId: "77", status: "member" });
    expect(parseTelegramUpdate(msg("/start abc123"))).toEqual({ chatId: "77", status: "member" });
    expect(parseTelegramUpdate(msg("/start@friday_bot"))).toEqual({ chatId: "77", status: "member" });
    expect(parseTelegramUpdate(msg("/starting"))).toBeNull();
    expect(parseTelegramUpdate(msg("salom"))).toBeNull();
    expect(parseTelegramUpdate(msg("/start", "group"))).toBeNull();
    for (const bad of [null, undefined, 5, "x", [], {}, { message: null }, { my_chat_member: { chat: { id: "1001", type: "private" } } }])
      expect(parseTelegramUpdate(bad)).toBeNull();
  });
});

describe("Holatni yozish va xabar berish", () => {
  it("xodim botni bloklasa: holat yoziladi, admin/rahbar/marketologga xabar boradi, boshqalarga yo'q", () => {
    const s = setup();
    const { changed, outbox } = run(s, "1001", "blocked", "event");
    expect(changed).toBe(1);
    expect(user(s, "u_smm1").telegramStatus).toBe("blocked");
    expect(user(s, "u_smm1").telegramStatusAt).toBeTruthy();
    // Operator va xodimning o'ziga xabar yo'q; tizim amalini bajargan admin ham oladi
    expect(notified(s)).toEqual(["u_admin", "u_boss", "u_mk"]);
    expect(outbox.map((o) => o.chatId).sort()).toEqual(["9001", "9002", "9003"]);
    expect(s.notifications[0]!.text).toContain("Madina Rashidova");
    expect(s.notifications[0]!.text).toContain("to'xtatdi");
  });

  it("xuddi shu holat qayta kelsa — o'zgarish ham, xabar ham yo'q", () => {
    const s = setup();
    run(s, "1001", "blocked", "event");
    const before = s.notifications.length;
    const again = run(s, "1001", "blocked", "event");
    expect(again.changed).toBe(0);
    expect(again.outbox).toHaveLength(0);
    expect(s.notifications).toHaveLength(before);
  });

  it("blokdan chiqarsa — «ulandi» xabari", () => {
    const s = setup();
    run(s, "1001", "blocked", "event");
    s.notifications.length = 0;
    const r = run(s, "1001", "member", "event");
    expect(r.changed).toBe(1);
    expect(user(s, "u_smm1").telegramStatus).toBe("member");
    expect(s.notifications[0]!.text).toContain("ulandi");
    expect(notified(s)).toEqual(["u_admin", "u_boss", "u_mk"]);
  });

  it("tekshiruv (probe) holatni jim yozadi; yuborish natijasidagi birinchi «ulangan» ham jim", () => {
    const s = setup();
    expect(run(s, "1001", "blocked", "probe").changed).toBe(1);
    expect(run(s, "9004", "member", "send").changed).toBe(1);
    expect(user(s, "u_op1").telegramStatus).toBe("member");
    expect(s.notifications).toHaveLength(0);
  });

  it("yuborish natijasida «bloklangan» chiqsa — xabar boradi; Telegram'ning o'zi birinchi marta ulanganini aytsa ham", () => {
    const s = setup();
    run(s, "9004", "blocked", "send");
    expect(s.notifications.length).toBeGreaterThan(0);
    s.notifications.length = 0;
    run(s, "1001", "member", "event");
    expect(s.notifications.length).toBeGreaterThan(0);
  });

  it("arxivdagi xodim: holat yoziladi, lekin xabar bermaydi", () => {
    const s = setup();
    user(s, "u_smm1").active = false;
    expect(run(s, "1001", "blocked", "event").changed).toBe(1);
    expect(user(s, "u_smm1").telegramStatus).toBe("blocked");
    expect(s.notifications).toHaveLength(0);
  });

  it("bitta chatni bir nechta xodim ishlatsa — bitta xabar, ikkalasining ismi bilan", () => {
    const s = setup();
    user(s, "u_smm1").telegramChatId = "5555";
    user(s, "u_smm2").telegramChatId = "5555";
    const r = run(s, "5555", "blocked", "event");
    expect(r.changed).toBe(2);
    const texts = new Set(s.notifications.map((n) => n.text));
    expect(texts.size).toBe(1);
    expect([...texts][0]).toContain("Madina Rashidova");
    expect([...texts][0]).toContain("Sardor Nazarov");
  });

  it("noma'lum chat ID hech kimga tegmaydi", () => {
    const s = setup();
    expect(run(s, "424242", "blocked", "event").changed).toBe(0);
    expect(s.notifications).toHaveLength(0);
  });

  it("Telegram o'chiq bo'lsa ham tizim ichida xabar yoziladi, Telegram'ga ketmaydi", () => {
    const s = setup();
    s.settings.telegram.enabled = false;
    const r = run(s, "1001", "blocked", "event");
    expect(s.notifications.length).toBeGreaterThan(0);
    expect(r.outbox).toHaveLength(0);
  });
});

describe("Holat qachon bekor bo'ladi", () => {
  it("chat ID o'zgarsa holat noma'lum bo'ladi; o'zgarmasa — saqlanadi", () => {
    const s = setup();
    run(s, "1001", "member", "event");
    const { ctx } = makeCtx(s, user(s, "u_admin"));
    setUserChatId(ctx, "u_smm1", "1001");
    expect(user(s, "u_smm1").telegramStatus).toBe("member");
    setUserChatId(ctx, "u_smm1", "2002");
    expect(user(s, "u_smm1").telegramStatus).toBeUndefined();
    expect(user(s, "u_smm1").telegramStatusAt).toBeUndefined();
  });

  it("boshqa bot tokeni — hamma holat va kuzatuv bekor; o'sha token qayta kiritilsa — saqlanadi", () => {
    const s = setup();
    run(s, "1001", "member", "event");
    const { ctx } = makeCtx(s, user(s, "u_admin"));
    markTelegramTracking(ctx, true);
    expect(s.settings.telegram.tracking?.on).toBe(true);
    setTelegramToken(ctx, TOKEN);
    expect(user(s, "u_smm1").telegramStatus).toBe("member");
    expect(s.settings.telegram.tracking?.on).toBe(true);
    setTelegramToken(ctx, "654321:ZYXWVUTSRQPONMLKJIHGFEDCBA987654");
    expect(user(s, "u_smm1").telegramStatus).toBeUndefined();
    expect(s.settings.telegram.tracking).toBeUndefined();
  });

  it("kuzatuv xatosi yoziladi va qisqartiriladi", () => {
    const s = setup();
    const { ctx } = makeCtx(s, user(s, "u_admin"));
    markTelegramTracking(ctx, false, "x".repeat(500));
    expect(s.settings.telegram.tracking?.on).toBe(false);
    expect(s.settings.telegram.tracking?.error).toHaveLength(300);
  });
});
