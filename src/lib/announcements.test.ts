// Rahbariyat e'lonlari: kimga boradi, kim yubora oladi, o'qiganlar hisobi, Telegram, cheklovlar.
import { describe, expect, it } from "vitest";
import * as sys from "./actions-system";
import { denyReason } from "./action-rules";
import { makeCtx as realCtx } from "./ctx";
import { redactFor } from "./redact";
import { demoState } from "./test-utils";
import type { ErpState } from "./types";

const user = (s: ErpState, id: string) => s.users.find((u) => u.id === id)!;
/** Haqiqiy kontekst: bildirishnomalar holatga yoziladi, Telegram xabarlari `outbox`ga. */
const makeCtx = (s: ErpState, id: string) => {
  const r = realCtx(s, user(s, id));
  return { c: r.ctx, outbox: r.outbox };
};
const withTelegram = (s: ErpState) => {
  s.settings.telegram = { enabled: true, botToken: "111:TOKEN" };
  for (const u of s.users) u.telegramChatId = u.id === "u_dz" ? undefined : `chat_${u.id}`;
};

describe("E'lon yuborish", () => {
  it("hammaga: faol xodimlarga (o'ziga va arxivdagilarga emas) tizimda va Telegram'da; yuboruvchi va rol ko'rinadi", () => {
    const s = demoState();
    withTelegram(s);
    user(s, "u_mt2").active = false;
    const { c, outbox } = makeCtx(s, "u_boss");
    const id = sys.sendAnnouncement(c, { text: "  Ertaga 10:00 da yig'ilish  " });
    const expected = s.users.filter((u) => u.active && u.id !== "u_boss").map((u) => u.id);
    const notes = s.notifications.filter((n) => n.ann === id);
    expect(notes.map((n) => n.userId).sort()).toEqual([...expected].sort());
    expect(notes[0]!.text).toMatch(/^📣 E'lon — Sherzod Alimov \(Rahbar.*\):\nErtaga 10:00 da yig'ilish$/);
    const a = s.announcements[0]!;
    expect(a).toMatchObject({ id, by: "u_boss", audience: "all", text: "Ertaga 10:00 da yig'ilish", readBy: [] });
    expect(a.to.sort()).toEqual([...expected].sort());
    // Telegram: chat ID'si borlarga (dizaynerda yo'q)
    expect(a.tg).toBe(expected.length - 1);
    expect(outbox.length).toBe(expected.length - 1);
  });

  it("rol bo'yicha va tanlangan xodimlarga", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    sys.sendAnnouncement(c, { text: "SMM'lar uchun", roles: ["smm"] });
    const smm = s.users.filter((u) => u.active && u.role === "smm").map((u) => u.id);
    expect(s.announcements[0]).toMatchObject({ audience: "roles", roles: ["smm"], to: smm });
    s.announcements[0]!.at = "2000-01-01T00:00:00"; // daqiqalik cheklov o'tdi
    sys.sendAnnouncement(c, { text: "Ikki kishiga", userIds: ["u_dz", "u_mt1", "u_mk"] });
    expect(s.announcements[0]).toMatchObject({ audience: "users", to: ["u_mt1", "u_dz"].filter((x) => s.users.some((u) => u.id === x)) });
    expect(s.announcements[0]!.to).not.toContain("u_mk");
  });

  it("noto'g'ri: bo'sh matn, juda uzun, hech kim tanlanmagan, faol qabul qiluvchi yo'q, daqiqada ikkinchi e'lon", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_admin");
    expect(() => sys.sendAnnouncement(c, { text: "   " })).toThrow(/matnini/);
    expect(() => sys.sendAnnouncement(c, { text: "x".repeat(2001) })).toThrow(/2000/);
    expect(() => sys.sendAnnouncement(c, { text: "a", roles: [] })).toThrow(/Kimga/);
    expect(() => sys.sendAnnouncement(c, { text: "a", userIds: ["u_admin"] })).toThrow(/faol xodim yo'q/);
    sys.sendAnnouncement(c, { text: "birinchi" });
    expect(() => sys.sendAnnouncement(c, { text: "ikkinchi" })).toThrow(/1 daqiqa/);
    expect(s.announcements).toHaveLength(1);
  });

  it("faqat admin, rahbar va marketolog yubora oladi", () => {
    const s = demoState();
    const ok = (id: string) => denyReason("sendAnnouncement", user(s, id), s, [{ text: "x" }]) === null;
    for (const id of ["u_admin", "u_boss", "u_mk"]) expect(ok(id), id).toBe(true);
    for (const id of ["u_smm1", "u_op1", "u_mol", "u_dz", "u_mt1"]) expect(ok(id), id).toBe(false);
  });
});

describe("Kim o'qidi", () => {
  it("xodim o'qisa (bittasini yoki hammasini) — e'lonning o'qiganlar ro'yxatiga qo'shiladi, ikki marta emas", () => {
    const s = demoState();
    sys.sendAnnouncement(makeCtx(s, "u_boss").c, { text: "E'lon" });
    const a = s.announcements[0]!;
    const n = s.notifications.find((x) => x.ann === a.id && x.userId === "u_dz")!;
    sys.markRead(makeCtx(s, "u_dz").c, n.id);
    sys.markRead(makeCtx(s, "u_dz").c, n.id);
    sys.markAllRead(makeCtx(s, "u_mt1").c);
    expect(a.readBy.sort()).toEqual(["u_dz", "u_mt1"]);
    // Boshqaning bildirishnomasini o'qib bo'lmaydi
    const other = s.notifications.find((x) => x.ann === a.id && x.userId === "u_smm1")!;
    sys.markRead(makeCtx(s, "u_dz").c, other.id);
    expect(a.readBy).not.toContain("u_smm1");
  });

  it("e'lonlar hisobotini faqat yuboradiganlar oladi (serverdan boshqa xodimlarga yuborilmaydi)", () => {
    const s = demoState();
    sys.sendAnnouncement(makeCtx(s, "u_boss").c, { text: "E'lon" });
    expect(redactFor(s, user(s, "u_mk")).announcements).toHaveLength(1);
    expect(redactFor(s, user(s, "u_admin")).announcements).toHaveLength(1);
    expect(redactFor(s, user(s, "u_dz")).announcements).toEqual([]);
    expect(redactFor(s, user(s, "u_mol")).announcements).toEqual([]);
    // Xodim e'lonning o'zini bildirishnomasida ko'radi
    expect(redactFor(s, user(s, "u_dz")).notifications.some((n) => n.text.includes("E'lon"))).toBe(true);
  });
});
