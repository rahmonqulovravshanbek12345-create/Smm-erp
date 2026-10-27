// Facebook Lead Ads → CRM: webhook imzosi, takroriy lidlar, navbat bilan taqsimlash, zaxira tekshiruvi, maxfiy kalitlar.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SECRET_MASK } from "../../src/lib/redact";
import type { ErpState } from "../../src/lib/types";
import { action, client, giveLogin, loginAs, ORIGIN, setup, type Client, type Ctx } from "./helpers";

const SECRET = "app-secret-QQQ-0123456789";
const PAGE_TOKEN = "EAAB-PAGE-TOKEN-ZZZ";
const VERIFY = "verify_token_0123456789abcdef";
const PAGE = "1122334455";
const URL = "/api/webhooks/meta-leads";

let t: Ctx;
let admin: Client;
let smm: Client;

const sign = (raw: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
const payload = (...ids: string[]) =>
  JSON.stringify({
    object: "page",
    entry: [{ id: PAGE, time: 1, changes: ids.map((id) => ({ field: "leadgen", value: { leadgen_id: id, page_id: PAGE, form_id: "777" } })) }],
  });
const post = (raw: string, headers: Record<string, string> = { "x-hub-signature-256": sign(raw) }) =>
  t.app.inject({ method: "POST", url: URL, remoteAddress: "127.0.0.1", headers: { "content-type": "application/json", ...headers }, payload: raw });
const fbLead = (id: string, phone: string, name = "Aziza Karimova") => ({
  id,
  created_time: "2026-10-14T09:00:00+0000",
  field_data: [
    { name: "full_name", values: [name] },
    { name: "phone_number", values: [phone] },
    { name: "biznes_turi", values: ["Kafe"] },
  ],
  campaign_name: "Kafe — oktyabr",
  platform: "ig",
});
const leads = () => t.store.current().state.leads;
const fromFb = () => leads().filter((l) => l.externalId?.startsWith("fb:"));
const stateOf = async (c: Client) => (await c.req("GET", "/api/state")).json().state as ErpState;

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_admin", "admin");
  await giveLogin(t.db, "u_smm1", "madina");
  admin = await loginAs(t.app, "admin");
  smm = await loginAs(t.app, "madina");
});
afterAll(() => t.close());

describe("Sozlash (faqat admin)", () => {
  it("oddiy xodim sozlay olmaydi", async () => {
    const r = await action(smm, "saveLeadAdsSettings", [{ enabled: false, pageId: PAGE }]);
    expect(r.statusCode).toBe(403);
  });

  it("to'liq bo'lmasa yoqilmaydi; noto'g'ri qiymatlar rad etiladi", async () => {
    expect((await action(admin, "saveLeadAdsSettings", [{ enabled: true }])).statusCode).toBe(422);
    expect((await action(admin, "saveLeadAdsSettings", [{ pageId: "abc" }])).statusCode).toBe(422);
    expect((await action(admin, "saveLeadAdsSettings", [{ verifyToken: "qisqa" }])).statusCode).toBe(422);
    expect((await action(admin, "saveLeadAdsSettings", [{ assignTo: "u_yoq" }])).statusCode).toBe(422);
    expect(t.store.current().state.settings.integrations.leads.enabled).toBe(false);
  });

  it("webhook yoqilmagan: so'rov 404, tasdiqlash so'zi sozlangunicha rad etiladi", async () => {
    expect((await post(payload("100001"))).statusCode).toBe(404);
    const g = await t.app.inject({ method: "GET", url: `${URL}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123`, remoteAddress: "127.0.0.1" });
    expect(g.statusCode).toBe(403);
  });

  it("admin to'liq sozlab yoqadi; maxfiy kalitlar brauzerga qaytmaydi, bazada shifrlangan", async () => {
    const r = await action(admin, "saveLeadAdsSettings", [{ pageId: PAGE, pageToken: PAGE_TOKEN, appSecret: SECRET, verifyToken: VERIFY, enabled: true }]);
    expect(r.statusCode).toBe(200);
    const shown = (await stateOf(admin)).settings.integrations.leads;
    expect(shown.pageToken.startsWith(SECRET_MASK)).toBe(true);
    expect(shown.appSecret.startsWith(SECRET_MASK)).toBe(true);
    expect(JSON.stringify(shown)).not.toContain(PAGE_TOKEN);
    expect(JSON.stringify(shown)).not.toContain(SECRET);
    const { rows } = await t.db.query<{ d: string }>("SELECT data::text AS d FROM app_state WHERE id = 1");
    expect(rows[0]!.d).not.toContain(PAGE_TOKEN);
    expect(rows[0]!.d).not.toContain(SECRET);
    // «••••» qaytib kelsa token o'zgarmaydi
    await action(admin, "saveLeadAdsSettings", [{ pageToken: shown.pageToken, appSecret: shown.appSecret }]);
    expect(t.store.current().state.settings.integrations.leads.pageToken).toBe(PAGE_TOKEN);
    // audit jurnalida sirlar yo'q
    const audit = await t.db.query<{ d: string }>("SELECT detail::text AS d FROM audit_log WHERE action = 'saveLeadAdsSettings'");
    expect(audit.rows.map((x) => x.d).join()).not.toContain(SECRET);
  });
});

describe("Webhook (Meta → server)", () => {
  it("Meta ulashda tasdiqlash: to'g'ri so'z — challenge; noto'g'ri — 403", async () => {
    const ok = await t.app.inject({
      method: "GET",
      url: `${URL}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=987654`,
      remoteAddress: "127.0.0.1",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("987654");
    const bad = await t.app.inject({
      method: "GET",
      url: `${URL}?hub.mode=subscribe&hub.verify_token=boshqa&hub.challenge=987654`,
      remoteAddress: "127.0.0.1",
    });
    expect(bad.statusCode).toBe(403);
    const xss = await t.app.inject({
      method: "GET",
      url: `${URL}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=%3Cscript%3E`,
      remoteAddress: "127.0.0.1",
    });
    expect(xss.statusCode).toBe(403);
  });

  it("hujum: imzosiz, noto'g'ri imzoli yoki boshqa kalit bilan imzolangan so'rov rad etiladi, lid yaratilmaydi", async () => {
    t.graph.byId["100001"] = fbLead("100001", "+998 90 123 45 67");
    const raw = payload("100001");
    expect((await post(raw, {})).statusCode).toBe(403);
    expect((await post(raw, { "x-hub-signature-256": "sha256=abcdef" })).statusCode).toBe(403);
    expect((await post(raw, { "x-hub-signature-256": sign(raw, "boshqa-kalit") })).statusCode).toBe(403);
    expect((await post(raw, { "x-hub-signature-256": sign(raw).replace("sha256=", "sha1=") })).statusCode).toBe(403);
    await t.leads.idle();
    expect(fromFb()).toHaveLength(0);
    expect(t.graph.calls).toHaveLength(0);
  });

  it("katta so'rov rad etiladi", async () => {
    const raw = JSON.stringify({ pad: "x".repeat(300_000) });
    expect((await post(raw)).statusCode).toBe(413);
  });

  it("brauzer himoyasi (CSRF) boshqa yo'llarda o'z kuchida qoladi", async () => {
    const r = await t.app.inject({
      method: "POST",
      url: "/api/action",
      remoteAddress: "127.0.0.1",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });
    expect(r.statusCode).toBe(403);
    const c = client(t.app);
    expect((await c.req("POST", "/api/action", {}, { origin: "https://boshqa.sayt" })).statusCode).toBe(403);
    void ORIGIN;
  });

  it("to'g'ri imzo: lid CRM'ga tushadi (telefon tartiblangan, operatorga bildirishnoma)", async () => {
    const raw = payload("100001");
    const r = await post(raw);
    expect(r.statusCode).toBe(200);
    await t.leads.idle();
    const l = fromFb();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ name: "Aziza Karimova", phone: "+998 90 123 45 67", source: "Meta Ads", service: "Kafe — oktyabr", stage: "new" });
    expect(l[0]!.note).toContain("biznes turi: Kafe");
    expect(l[0]!.note).toContain("Instagram");
    const ntf = t.store.current().state.notifications.filter((n) => n.userId === l[0]!.operatorId && n.text.includes("Aziza Karimova"));
    expect(ntf.length).toBeGreaterThan(0);
  });

  it("bir xil lid ikki marta kelsa (Meta qayta yuboradi) — takroriy yaratilmaydi", async () => {
    const before = leads().length;
    await post(payload("100001"));
    await t.leads.idle();
    expect(leads()).toHaveLength(before);
  });

  it("shu telefondan boshqa lid — yangi lid ochilmaydi, mavjudiga yozuv qo'shiladi", async () => {
    t.graph.byId["100002"] = fbLead("100002", "90 123-45-67", "Aziza K.");
    const before = leads().length;
    await post(payload("100002"));
    await t.leads.idle();
    expect(leads()).toHaveLength(before);
    const l = fromFb()[0]!;
    expect(l.history[0]!.text).toContain("yana ariza");
  });

  it("yangi lidlar operatorlarga navbat bilan taqsimlanadi", async () => {
    const ids = ["200001", "200002", "200003", "200004"];
    ids.forEach((id, i) => (t.graph.byId[id] = fbLead(id, `+998 91 000 00 0${i}`, `Mijoz ${i}`)));
    await post(payload(...ids));
    await t.leads.idle();
    const owners = fromFb()
      .filter((l) => l.name.startsWith("Mijoz"))
      .map((l) => l.operatorId);
    expect(owners).toHaveLength(4);
    expect(new Set(owners)).toEqual(new Set(["u_op1", "u_op2"]));
    expect(owners.filter((o) => o === "u_op1")).toHaveLength(2);
  });

  it("belgilangan xodimga: hamma lid o'shaga", async () => {
    await action(admin, "saveLeadAdsSettings", [{ assignTo: "u_op2" }]);
    t.graph.byId["300001"] = fbLead("300001", "+998 93 111 22 33", "Yagona");
    await post(payload("300001"));
    await t.leads.idle();
    expect(fromFb().find((l) => l.name === "Yagona")!.operatorId).toBe("u_op2");
    await action(admin, "saveLeadAdsSettings", [{ assignTo: "rotate" }]);
  });

  it("boshqa sahifa lidi e'tiborsiz; Meta lidni bera olmasa — 200 (Meta qayta yubormasin), zaxira tekshiruvi qayta urinadi", async () => {
    const other = JSON.stringify({ object: "page", entry: [{ id: "999", changes: [{ field: "leadgen", value: { leadgen_id: "400001", page_id: "999" } }] }] });
    const before = t.graph.calls.length;
    expect((await post(other)).statusCode).toBe(200);
    await t.leads.idle();
    expect(t.graph.calls).toHaveLength(before);
    // Meta lidni bermadi (token muddati tugagan kabi) — so'rov baribir 200, lid yaratilmaydi
    t.graph.fail = "Meta: token muddati tugagan";
    const n = leads().length;
    expect((await post(payload("400002"))).statusCode).toBe(200);
    await t.leads.idle();
    expect(leads()).toHaveLength(n);
    t.graph.fail = undefined;
  });

  it("noto'g'ri tuzilma (kutilmagan JSON) xato bermaydi", async () => {
    for (const body of [
      '{"entry":"x"}',
      '{"entry":[{"changes":"x"}]}',
      "[]",
      "null",
      '{"entry":[{"changes":[{"field":"leadgen","value":{"leadgen_id":"<b>","page_id":"1122334455"}}]}]}',
    ]) {
      expect((await post(body)).statusCode).toBe(200);
    }
    expect((await post("{bu json emas")).statusCode).toBe(400);
  });
});

describe("Zaxira tekshiruvi (webhook yetmay qolganda)", () => {
  it("yetmay qolgan lidni topib yozadi; qayta ishlasa takrorlamaydi", async () => {
    t.graph.forms["777"] = [fbLead("500001", "+998 94 555 66 77", "Yo'qolgan lid"), fbLead("100001", "+998 90 123 45 67")];
    const r = await t.leads.poll();
    expect(r.error).toBeUndefined();
    expect(r.found).toBe(2);
    expect(r.created).toBe(1);
    expect(fromFb().some((l) => l.name === "Yo'qolgan lid")).toBe(true);
    const cfg = t.store.current().state.settings.integrations.leads;
    expect(cfg.lastPollAt).toBeTruthy();
    expect(cfg.lastError).toBeUndefined();
    const again = await t.leads.poll();
    expect(again.created).toBe(0);
  });

  it("Meta xatosi: xabar saqlanadi, token xabarga tushmaydi", async () => {
    t.graph.fail = "Meta: Invalid OAuth access token";
    const r = await t.leads.poll();
    expect(r.error).toContain("Invalid OAuth");
    const cfg = t.store.current().state.settings.integrations.leads;
    expect(cfg.lastError).toContain("Invalid OAuth");
    expect(cfg.lastError).not.toContain(PAGE_TOKEN);
    t.graph.fail = undefined;
  });

  const sinceOf = () =>
    Number(
      t.graph.calls
        .filter((x) => x.startsWith("since:"))
        .at(-1)!
        .slice(6),
    );
  const setPollAt = (iso: string) => {
    t.store.current().state.settings.integrations.leads.lastPollAt = iso;
  };

  it("Meta xato bersa, tekshiruv vaqti oldinga surilmaydi: keyingi muvaffaqiyatli tekshiruv xato davridagi lidlarni ham qidiradi", async () => {
    const old = new Date(Date.now() - 5 * 3_600_000).toISOString();
    setPollAt(old);
    t.graph.fail = "Meta: (#200) Requires pages_manage_ads permission";
    expect((await t.leads.poll()).error).toBeTruthy();
    expect((await t.leads.poll()).error).toBeTruthy();
    expect(t.store.current().state.settings.integrations.leads.lastPollAt).toBe(old);
    t.graph.fail = undefined;
    t.graph.calls.length = 0;
    const r = await t.leads.poll();
    expect(r.error).toBeUndefined();
    expect(sinceOf()).toBe(Math.floor((Date.parse(old) - 2 * 3_600_000) / 1000));
    const cfg = t.store.current().state.settings.integrations.leads;
    expect(Date.parse(cfg.lastPollAt!)).toBeGreaterThan(Date.parse(old));
    expect(cfg.lastError).toBeUndefined();
  });

  it("qidirish oynasi ko'pi bilan 7 kun (uzoq uzilishdan keyin eski lidlar to'lib ketmaydi)", async () => {
    setPollAt(new Date(Date.now() - 30 * 86_400_000).toISOString());
    t.graph.calls.length = 0;
    await t.leads.poll();
    const ago = Date.now() / 1000 - sinceOf();
    expect(ago).toBeGreaterThan(7 * 86_400 - 120);
    expect(ago).toBeLessThan(7 * 86_400 + 120);
  });
});

describe("Admin tugmalari va qoidalar", () => {
  it("test va qo'lda tekshirish — faqat admin", async () => {
    expect((await smm.req("POST", "/api/integrations/leads/test")).statusCode).toBe(403);
    expect((await smm.req("POST", "/api/integrations/leads/poll")).statusCode).toBe(403);
    const r = await admin.req("POST", "/api/integrations/leads/test");
    expect(r.statusCode).toBe(200);
    expect(r.json().name).toContain("Friday");
    expect((await admin.req("POST", "/api/integrations/leads/poll")).statusCode).toBe(200);
  });

  it("brauzerdan lid yaratish amali (intakeLead) hech kimga ochiq emas — soxta lid yuborib bo'lmaydi", async () => {
    for (const c of [admin, smm]) {
      const r = await action(c, "intakeLead", [{ externalId: "fb:soxta", name: "Soxta", phone: "+998 90 000 00 00", service: "", note: "" }]);
      expect(r.statusCode).toBe(403);
    }
    expect(leads().some((l) => l.externalId === "fb:soxta")).toBe(false);
  });

  it("oddiy lid formasi externalId qabul qilmaydi", async () => {
    const op = await (async () => {
      await giveLogin(t.db, "u_op1", "dilnoza");
      return loginAs(t.app, "dilnoza");
    })();
    const r = await action(op, "saveLead", [
      { name: "Qo'lda", phone: "+998 90 111 22 33", source: "Instagram", service: "", note: "", operatorId: "u_op1", externalId: "fb:100001" },
    ]);
    expect(r.statusCode).toBe(400);
  });
});

describe("Telegram", () => {
  it("yangi lid haqidagi xabar operatorning Telegram'iga ham yetib boradi", async () => {
    const prev = structuredClone(t.store.current().state);
    await t.store.system((s) => {
      s.settings.telegram = { ...s.settings.telegram, enabled: true, botToken: "111:TG-TOKEN-0123456789abcdef" };
      for (const u of s.users) u.telegramChatId = `chat_${u.id}`;
    });
    t.sent.length = 0;
    t.graph.byId["100009"] = fbLead("100009", "+998 93 555 66 77", "Telegram Sinov");
    expect((await post(payload("100009"))).statusCode).toBe(200);
    await t.leads.idle();
    await t.idle();
    const op = fromFb().find((l) => l.name === "Telegram Sinov")!.operatorId;
    const msgs = t.sent.filter((m) => m.text.includes("Telegram Sinov"));
    expect(msgs.map((m) => m.chatId)).toEqual([`chat_${op}`]);
    expect(msgs[0]!.text).toContain("Yangi lid (Facebook)");
    await t.store.system((s) => {
      s.settings.telegram = prev.settings.telegram;
      for (const u of s.users) u.telegramChatId = prev.users.find((x) => x.id === u.id)?.telegramChatId;
    });
  });
});
