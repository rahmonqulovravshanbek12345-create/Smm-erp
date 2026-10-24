// Marketolog serverda ham rahbar + moliyachi huquqiga ega; qisqa sessiya (pul bilan ishlaydi) va tizim sozlamalari yopiq.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionLife } from "../src/auth";
import { action, giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let mk: Client;

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_mk", "aziza");
  mk = await loginAs(t.app, "aziza");
});
afterAll(() => t.close());

describe("Marketolog: to'liq huquq", () => {
  it("pul amallari bajariladi: stavka, hisoblash, to'lov, tranzaksiya — o'ziga ham", async () => {
    const pay = { userId: "u_mk", fixed: 5_000_000, perProject: 0, rates: {} };
    expect((await action(mk, "savePayProfile", [pay])).statusCode).toBe(200);
    expect((await action(mk, "savePayProfile", [{ ...pay, userId: "u_mt1" }])).statusCode).toBe(200);
    expect((await action(mk, "addManualAccrual", [{ userId: "u_mt1", date: "2026-10-01", kind: "bonus", amount: 100_000, title: "Bonus" }])).statusCode).toBe(
      200,
    );
    expect((await action(mk, "payEmployee", [{ userId: "u_mt1", amount: 50_000, date: "2026-10-07", accountId: "acc_bank", note: "" }])).statusCode).toBe(200);
    expect((await action(mk, "payEmployee", [{ userId: "u_mk", amount: 50_000, date: "2026-10-07", accountId: "acc_bank", note: "" }])).statusCode).toBe(200);
  });

  it("holatda moliya ma'lumotlari to'liq keladi", async () => {
    const s = (await mk.req("GET", "/api/state")).json().state;
    expect(s.invoices.length).toBeGreaterThan(0);
    expect(s.accounts.some((a: { opening: number }) => a.opening > 0)).toBe(true);
    expect(s.payProfiles.length).toBeGreaterThan(1);
  });

  it("tizim sozlamalari va xodim boshqaruvi baribir yopiq", async () => {
    const before = t.store.current().version;
    for (const [name, args] of [
      ["addUser", [{ name: "Xaker", role: "admin" }]],
      ["setUserRole", ["u_mt1", "admin"]],
      ["setTelegramToken", ["1:xxxxxxxxxxxxxxxxxxxxxxxx"]],
      ["setCompanyName", ["Yolg'on"]],
    ] as [string, unknown[]][])
      expect((await action(mk, name, args)).statusCode, name).toBe(403);
    expect(t.store.current().version).toBe(before);
  });

  it("sessiya muddati: pul bilan ishlagani uchun rahbar/moliya kabi 7 kun", () => {
    expect(sessionLife("marketolog")).toEqual(sessionLife("moliya"));
    expect(sessionLife("marketolog").days).toBe(7);
    expect(sessionLife("smm").days).toBeGreaterThan(7);
  });
});
