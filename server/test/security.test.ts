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
