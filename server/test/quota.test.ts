// M2: bitta xodim katta matnlar bilan umumiy holatni to'ldirib, tizimni hamma uchun ishlamaydigan qila olmaydi.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { action, giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let smm: Client;
let smm2: Client;
let admin: Client;
const big = "x".repeat(20_000);
const task = (projectId: string, i: number) => ({
  kind: "montaj",
  projectId,
  assigneeId: "u_mt1",
  title: `Katta TZ ${i}`,
  brief: big,
  script: big,
  deadline: "2030-01-01",
});

beforeAll(async () => {
  t = await setup({ quotaMb: 0.5 });
  await giveLogin(t.db, "u_smm1", "madina");
  await giveLogin(t.db, "u_smm2", "smm2");
  await giveLogin(t.db, "u_admin", "admin");
  smm = await loginAs(t.app, "madina");
  smm2 = await loginAs(t.app, "smm2");
  admin = await loginAs(t.app, "admin");
});
afterAll(() => t.close());

describe("M2: xodim bo'yicha kunlik ma'lumot kvotasi", () => {
  it("hujum: katta vazifalar ketma-ket — kvota tugagach 429, holat cheksiz o'smaydi", async () => {
    const pid = t.store.current().state.projects.find((p) => p.smmId === "u_smm1")!.id;
    const start = t.store.bytes;
    const codes: number[] = [];
    for (let i = 0; i < 30; i++) codes.push((await action(smm, "createTask", [task(pid, i)])).statusCode);
    expect(codes[0]).toBe(200);
    expect(codes).toContain(429);
    const firstBlocked = codes.indexOf(429);
    expect(codes.slice(firstBlocked).every((c) => c === 429)).toBe(true);
    // 0,5 MB kvota + oxirgi o'tgan amal (~40 KB) dan oshmaydi
    expect(t.store.bytes - start).toBeLessThan(0.5 * 1024 * 1024 + 100_000);
    const r = await action(smm, "createTask", [task(pid, 99)]);
    expect(r.json().error).toMatch(/chegarasiga yetdingiz/);
  });

  it("boshqa xodimlar ishlashda davom etadi, admin cheklanmaydi", async () => {
    const pid2 = t.store.current().state.projects.find((p) => p.smmId === "u_smm2")!.id;
    expect((await action(smm2, "createTask", [task(pid2, 1)])).statusCode).toBe(200);
    expect((await action(admin, "markAllRead", [])).statusCode).toBe(200);
    expect((await action(admin, "setCompanyName", ["Friday Agency"])).statusCode).toBe(200);
  });
});

describe("M2: hajm chegaraga yaqinlashsa adminga ogohlantirish", () => {
  it("adminlarga kuniga bir marta (tizimda va Telegram'da)", async () => {
    const { warnStateSize } = await import("../src/jobs");
    const { createNotifier } = await import("../src/notifier");
    const sent: string[] = [];
    await t.store.system((s) => {
      s.settings.telegram = { enabled: true, botToken: "123456:TEST_token-for_tests_only_00000" };
      const a = s.users.find((u) => u.id === "u_admin")!;
      a.telegramChatId = "111222333";
    });
    const notifier = createNotifier(t.store, async (_tok, _chat, text) => {
      sent.push(text);
      return true;
    });
    expect(await warnStateSize(t.store, notifier, "2030-01-01", 1)).toBe(true);
    expect(await warnStateSize(t.store, notifier, "2030-01-01", 1)).toBe(false);
    await notifier.idle();
    const n = t.store.current().state.notifications.filter((x) => x.userId === "u_admin" && x.text.includes("Ma'lumotlar hajmi"));
    expect(n.length).toBe(1);
    expect(sent.some((x) => x.includes("Ma'lumotlar hajmi"))).toBe(true);
    expect(await warnStateSize(t.store, notifier, "2030-01-02", 1e12)).toBe(false);
  });
});
