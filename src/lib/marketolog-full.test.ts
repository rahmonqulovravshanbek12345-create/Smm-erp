// Marketolog — agentlikda ham rahbar, ham moliyachi: rahbar va moliya qila oladigan hamma ishni qiladi (tizim sozlamalaridan tashqari).
import { describe, expect, it } from "vitest";
import { denyReason } from "./action-rules";
import { access, canEdit, canEditFinance, canPayUser, canView, type Module } from "./permissions";
import { demoState } from "./test-utils";
import type { ErpState } from "./types";

const user = (s: ErpState, id: string) => s.users.find((u) => u.id === id)!;

describe("Marketolog: bo'limlar", () => {
  it("admin bo'limidan tashqari hammasiga to'liq kiradi; o'z kuni va hisobi ham bor", () => {
    const mods = [
      "dashboard",
      "crm",
      "projects",
      "marketing",
      "content",
      "approvals",
      "shoots",
      "montaj",
      "dizayn",
      "target",
      "finance",
      "payroll",
      "integrations",
      "activity",
      "process",
    ] as Module[];
    for (const m of mods) expect(access("marketolog", m), m).toBe("full");
    expect(canView("marketolog", "admin")).toBe(false);
    expect(access("marketolog", "myday")).toBe("own");
    expect(access("marketolog", "myaccount")).toBe("own");
    expect(access("marketolog", "notifications")).toBe("full");
  });

  it("pulni ham tahrirlay oladi, o'ziga ham (moliyadagi cheklov unga yo'q)", () => {
    expect(canEditFinance("marketolog")).toBe(true);
    expect(canEdit("marketolog", "finance")).toBe(true);
    expect(canPayUser({ id: "u_mk", role: "marketolog" }, "u_mk")).toBe(true);
    expect(canPayUser({ id: "u_mol", role: "moliya" }, "u_mol")).toBe(false); // moliyachi uchun cheklov o'z joyida
  });
});

describe("Marketolog: amallar", () => {
  const s = demoState();
  const mk = user(s, "u_mk");
  const prj = s.projects[0]!;
  const tx = { date: "2026-10-07", accountId: "acc_cash", dir: "out" as const, amount: 1000, articleId: "a_other_out", note: "" };

  it("moliya amallari: tranzaksiya, to'lov, oylik stavka, byudjet, hisob — ruxsat (o'ziga ham)", () => {
    const pay = { userId: "u_mk", amount: 1_000_000, date: "2026-10-07", accountId: "acc_cash", note: "" };
    expect(denyReason("addTransaction", mk, s, [tx])).toBeNull();
    expect(denyReason("addTransaction", mk, s, [{ ...tx, userId: "u_mk" }])).toBeNull();
    expect(denyReason("payEmployee", mk, s, [pay])).toBeNull();
    expect(denyReason("payEmployee", mk, s, [{ ...pay, userId: "u_mt1" }])).toBeNull();
    expect(denyReason("savePayProfile", mk, s, [{ userId: "u_mk", fixed: 1, perProject: 0, rates: {} }])).toBeNull();
    expect(denyReason("setBudget", mk, s, ["2026-10", "revenue", 1])).toBeNull();
    expect(denyReason("voidInvoice", mk, s, ["x", "sabab"])).toBeNull();
    expect(denyReason("updateProject", mk, s, [prj.id, {}])).toBeNull();
  });

  it("rahbar ishlari: syomka/vazifa topshirish, integratsiya sozlamalari", () => {
    expect(
      denyReason("createTask", mk, s, [{ kind: "montaj", projectId: prj.id, assigneeId: "u_mt1", title: "x", brief: "", deadline: "2026-12-01" }]),
    ).toBeNull();
    expect(denyReason("createShoot", mk, s, [{ projectId: prj.id } as never])).toBeNull();
    expect(denyReason("setUsdRate", mk, s, [12000, "2026-10-07", "manual"])).toBeNull();
  });

  it("faqat adminniki o'z joyida: xodim qo'shish, rol, Telegram tokeni", () => {
    expect(denyReason("addUser", mk, s, [{ name: "X", role: "smm" } as never])).not.toBeNull();
    expect(denyReason("setUserRole", mk, s, ["u_mt1", "admin"])).not.toBeNull();
    expect(denyReason("setTelegramToken", mk, s, ["1:x"])).not.toBeNull();
  });
});
