// Loyiha narxlari, fakturalar va mijoz to'lovlari faqat moliyaviy rollarga yuboriladi; xodim brauzeriga umuman kelmaydi.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ErpState } from "../../src/lib/types";
import { giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let smm: Client;
let tg: Client;
let mk: Client;
let fin: Client;

const stateOf = async (c: Client) => {
  const r = await c.req("GET", "/api/state");
  expect(r.statusCode).toBe(200);
  return r.json().state as ErpState;
};

beforeAll(async () => {
  t = await setup();
  for (const [id, login] of [
    ["u_smm1", "madina"],
    ["u_tg", "targetolog"],
    ["u_mk", "aziza"],
    ["u_mol", "moliya"],
  ] as const)
    await giveLogin(t.db, id, login);
  smm = await loginAs(t.app, "madina");
  tg = await loginAs(t.app, "targetolog");
  mk = await loginAs(t.app, "aziza");
  fin = await loginAs(t.app, "moliya");
});
afterAll(() => t.close());

describe("Xodimga summalar yuborilmaydi", () => {
  for (const [name, who] of [
    ["SMM menejer", () => smm],
    ["Targetolog", () => tg],
  ] as const) {
    it(`${name}: javobning xom matnida narx, faktura va to'lov summalari yo'q`, async () => {
      const full = t.store.current().state as ErpState;
      const s = await stateOf(who());
      expect(s.projects.length).toBeGreaterThan(0);
      expect(s.invoices).toEqual([]);
      expect(s.transactions.every((x) => !x.invoiceId)).toBe(true);
      for (const p of s.projects) {
        expect(p.monthlyFee).toBe(0);
        expect(p.prepayAmount).toBeUndefined();
        for (const x of p.services) {
          expect(x.price).toBe(0);
          expect(x.priceUsd).toBeUndefined();
        }
      }
      // Asl holat buzilmagan
      expect(full.projects.some((p) => p.monthlyFee > 0)).toBe(true);
      expect(full.invoices.length).toBeGreaterThan(0);
    });
  }

  it("marketolog va moliya to'liq narx va fakturalarni oladi", async () => {
    for (const c of [mk, fin]) {
      const s = await stateOf(c);
      expect(s.invoices.length).toBeGreaterThan(0);
      expect(s.projects.some((p) => p.monthlyFee > 0)).toBe(true);
    }
  });

  it("xodim amal bajarsa ham asl narxlar saqlanib qoladi (brauzer nusxasi bazaga yozilmaydi)", async () => {
    const before = JSON.stringify((t.store.current().state as ErpState).projects.map((p) => [p.id, p.monthlyFee, p.services.map((x) => x.price)]));
    await stateOf(smm);
    const after = JSON.stringify((t.store.current().state as ErpState).projects.map((p) => [p.id, p.monthlyFee, p.services.map((x) => x.price)]));
    expect(after).toBe(before);
  });
});
