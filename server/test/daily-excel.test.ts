// Kunlik Excel: butun ERP ma'lumoti faqat adminga, tokenlarsiz, Telegram orqali.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let admin: Client;
let smm: Client;

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_admin", "admin");
  await giveLogin(t.db, "u_smm1", "madina");
  admin = await loginAs(t.app, "admin");
  smm = await loginAs(t.app, "madina");
  await t.store.system((s) => {
    s.settings.telegram = { enabled: true, botToken: "111:SECRET-TG-TOKEN" };
    s.settings.integrations.meta.token = "EAA-SECRET-META";
    s.users.find((u) => u.id === "u_admin")!.telegramChatId = "900";
    s.users.find((u) => u.id === "u_smm1")!.telegramChatId = "901";
  });
});
afterAll(() => t.close());

describe("Kunlik Excel", () => {
  it("faqat faol adminning chatiga ketadi; fayl yaroqli va tokensiz", async () => {
    t.docs.length = 0;
    const res = await admin.req("POST", "/api/integrations/telegram/excel");
    expect(res.statusCode).toBe(200);
    expect(t.docs.map((d) => d.chatId)).toEqual(["900"]);
    const d = t.docs[0]!;
    expect(d.filename).toMatch(/^erp-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect([...d.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const raw = Buffer.from(d.bytes).toString("utf8");
    expect(raw).not.toContain("SECRET-TG-TOKEN");
    expect(raw).not.toContain("SECRET-META");
    expect(raw).toContain("Loyihalar");
  });

  it("oddiy xodim ishga tushira olmaydi (403), hech narsa ketmaydi", async () => {
    t.docs.length = 0;
    const res = await smm.req("POST", "/api/integrations/telegram/excel");
    expect(res.statusCode).toBe(403);
    expect(t.docs).toHaveLength(0);
  });

  it("kirmagan odam — 401", async () => {
    const { client } = await import("./helpers");
    const res = await client(t.app).req("POST", "/api/integrations/telegram/excel");
    expect(res.statusCode).toBe(401);
  });

  it("Telegram o'chiq bo'lsa — 400 va hech narsa yuborilmaydi", async () => {
    await t.store.system((s) => {
      s.settings.telegram.enabled = false;
    });
    t.docs.length = 0;
    const res = await admin.req("POST", "/api/integrations/telegram/excel");
    expect(res.statusCode).toBe(400);
    expect(t.docs).toHaveLength(0);
    await t.store.system((s) => {
      s.settings.telegram.enabled = true;
    });
  });

  it("arxivlangan admin chatiga ketmaydi", async () => {
    await t.store.system((s) => {
      s.users.push({ id: "u_adm2", name: "Eski admin", role: "admin", active: false, telegramChatId: "902" });
    });
    t.docs.length = 0;
    expect((await admin.req("POST", "/api/integrations/telegram/excel")).statusCode).toBe(200);
    expect(t.docs.map((d) => d.chatId)).toEqual(["900"]);
  });

  it("Telegram yetkazmasa — 502", async () => {
    const { createNotifier } = await import("../src/notifier");
    const n = createNotifier(
      t.store,
      async () => true,
      async () => false,
    );
    const r = await n.dailyExcel();
    expect(r.admins).toBe(1);
    expect(r.sent).toBe(0);
  });
});
