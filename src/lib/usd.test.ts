// Dollardagi shartnoma: narx dollarda, to'lov kunidagi kurs, so'mda pul o'tkazishda ustama, naqdda ustamasiz.
import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { check } from "./audit-check";
import { addDays } from "./dates";
import {
  FX_LINE,
  invoiceOutstanding,
  invoiceOutstandingUsd,
  invoicePaid,
  invoicePaidUsd,
  invoiceSettled,
  invoiceStatus,
  pnl,
  receivables,
  reconClient,
} from "./finance";
import { normalizeState } from "./normalize";
import { syncAll } from "./store-sync";
import { TODAY, demoState, makeCtx } from "./test-utils";
import type { ErpState } from "./types";

const ctx = (s: ErpState, uid = "u_mol", today = TODAY) => makeCtx(s, uid, today).c;

const input = (over: Partial<act.ProjectInput> = {}): act.ProjectInput => ({
  name: "Dollar Klinika",
  contactName: "Ali",
  phone: "+998 00 111 22 33",
  industry: "Tibbiyot",
  links: "",
  contractNo: "SH-USD/001",
  contractDate: TODAY,
  prepayType: 100,
  services: [{ kind: "smm", title: "Biznes", price: 0, priceUsd: 1000 }],
  prepayDueDate: TODAY,
  remainderDueDate: "",
  marketologId: "u_mk",
  smmId: "u_smm1",
  currency: "USD",
  ...over,
});

function setup(over: Partial<act.ProjectInput> = {}) {
  const s = demoState();
  s.settings.usdRate = 12_500;
  const id = act.createProject(ctx(s, "u_mk"), input(over));
  const p = s.projects.find((x) => x.id === id)!;
  const invs = s.invoices.filter((i) => i.projectId === id);
  return { s, p, invs };
}

describe("Dollardagi shartnoma: faktura", () => {
  it("narx dollarda saqlanadi, faktura dollar va so'mdagi qiymat bilan chiqadi", () => {
    const { s, p, invs } = setup();
    expect(p.currency).toBe("USD");
    expect(p.services[0]!.priceUsd).toBe(1000);
    expect(p.services[0]!.price).toBe(12_500_000);
    expect(p.monthlyFee).toBe(12_500_000);
    expect(invs).toHaveLength(1);
    expect(invs[0]!.usd).toBe(1000);
    expect(invs[0]!.amount).toBe(12_500_000);
    expect(invs[0]!.lines?.[0]?.usd).toBe(1000);
    expect(check(s, TODAY)).toEqual([]);
  });

  it("kurs o'zgarsa — keyingi faktura yangi kurs bilan, dollar summasi o'zgarmaydi", () => {
    const { s, p } = setup();
    act.updateProject(ctx(s, "u_mk"), p.id, { periodStart: TODAY });
    s.settings.usdRate = 13_000;
    let d = TODAY;
    for (let i = 0; i < 40; i++) syncAll(s, (d = addDays(d, 1)));
    expect(p.monthlyFee).toBe(13_000_000);
    const monthly = s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly");
    expect(monthly.length).toBeGreaterThan(0);
    expect(monthly[0]!.usd).toBe(1000);
    expect(monthly[0]!.amount).toBe(13_000_000);
    expect(check(s, d)).toEqual([]);
  });

  it("so'mdagi shartnomada dollar maydonlari tushib qoladi", () => {
    const s = demoState();
    const id = act.createProject(
      ctx(s, "u_mk"),
      input({ currency: undefined, contractNo: "SH-UZS/1", services: [{ kind: "smm", title: "B", price: 9_000_000, priceUsd: 700 }] }),
    );
    const p = s.projects.find((x) => x.id === id)!;
    expect(p.currency).toBeUndefined();
    expect(p.services[0]!.priceUsd).toBeUndefined();
    expect(p.services[0]!.price).toBe(9_000_000);
    expect(s.invoices.find((i) => i.projectId === id)!.usd).toBeUndefined();
  });

  it("dollardagi shartnomada narx dollarda bo'lishi shart va valyutani keyin o'zgartirib bo'lmaydi", () => {
    const s = demoState();
    expect(() => act.createProject(ctx(s, "u_mk"), input({ services: [{ kind: "smm", title: "B", price: 9_000_000 }] }))).toThrow(/dollarda/);
    const { s: s2, p } = setup();
    expect(() => act.updateProject(ctx(s2, "u_mk"), p.id, { currency: "UZS" })).toThrow(/valyuta/);
    expect(() => act.updateService(ctx(s2, "u_mk"), p.id, p.services[0]!.id, { price: 5_000_000 })).toThrow(/dollarda/);
    act.updateService(ctx(s2, "u_mk"), p.id, p.services[0]!.id, { price: 0, priceUsd: 1200 });
    expect(p.services[0]!.price).toBe(15_000_000);
  });
});

describe("Dollardagi shartnoma: to'lov", () => {
  it("bank orqali so'mda: to'lov kunidagi kurs + 2% ustama; faktura yopiladi, farq — daromadda alohida qator", () => {
    const { s, p, invs } = setup();
    const inv = invs[0]!;
    // To'lov kuni kurs 12 800, bank → 2%
    const amount = Math.round(1000 * 12_800 * 1.02);
    act.recordClientPayment(ctx(s), inv.id, { amount, date: TODAY, accountId: "acc_bank", fxRate: 12_800, note: "" });
    const tx = s.transactions.at(-1)!;
    expect(tx.invoiceUsd).toBe(1000);
    expect(tx.markupPct).toBe(2);
    expect(tx.fxRate).toBe(12_800);
    expect(invoiceSettled(s, inv)).toBe(true);
    expect(invoiceStatus(s, inv, TODAY)).toBe("paid");
    expect(invoiceOutstanding(s, inv)).toBe(0);
    // Faktura so'mdagi qiymati (12.5 mln) yopiladi; qolgani kurs farqi va ustama
    expect(invoicePaid(s, inv)).toBeCloseTo(12_500_000, 0);
    const P = pnl(s, [TODAY.slice(0, 7)], TODAY, p.id);
    const fx = P.lines.find((l) => l.key === "rev_fx")!;
    expect(fx.label).toBe(FX_LINE);
    expect(fx.total).toBe(amount - 12_500_000);
    // Debitorlik va akt-sverka: qarz yo'q
    const rec = receivables(s, TODAY).find((r) => r.project.id === p.id)!;
    expect(rec.balance).toBeCloseTo(0, 0);
    expect(reconClient(s, p.id, "2000-01-01", TODAY).closing).toBeCloseTo(0, 0);
    expect(check(s, TODAY)).toEqual([]);
  });

  it("naqd so'mda: ustama yo'q (standart 0%)", () => {
    const { s, invs } = setup();
    const inv = invs[0]!;
    act.recordClientPayment(ctx(s), inv.id, { amount: 12_500_000, date: TODAY, accountId: "acc_cash", fxRate: 12_500, note: "" });
    expect(s.transactions.at(-1)!.markupPct).toBe(0);
    expect(invoiceSettled(s, inv)).toBe(true);
  });

  it("dollar kartaga dollarda: to'g'ridan-to'g'ri dollar yopiladi, kurs farqi daromadga", () => {
    const { s, p, invs } = setup();
    const inv = invs[0]!;
    act.recordClientPayment(ctx(s), inv.id, { amount: 1000, date: TODAY, accountId: "acc_usd", rate: 12_700, note: "" });
    expect(s.transactions.at(-1)!.invoiceUsd).toBe(1000);
    expect(invoiceSettled(s, inv)).toBe(true);
    const fx = pnl(s, [TODAY.slice(0, 7)], TODAY, p.id).lines.find((l) => l.key === "rev_fx")!;
    expect(fx.total).toBe(200_000);
    expect(check(s, TODAY)).toEqual([]);
  });

  it("qisman to'lovlar: qolgan dollar to'g'ri, kurs har xil bo'lsa ham", () => {
    const { s, invs } = setup();
    const inv = invs[0]!;
    act.recordClientPayment(ctx(s), inv.id, { amount: 300, date: TODAY, accountId: "acc_usd", rate: 12_600, note: "" });
    expect(invoiceOutstandingUsd(s, inv)).toBe(700);
    expect(invoiceStatus(s, inv, TODAY)).toBe("partial");
    act.recordClientPayment(ctx(s), inv.id, { amount: Math.round(400 * 12_900 * 1.02), date: TODAY, accountId: "acc_bank", fxRate: 12_900, note: "" });
    expect(invoiceOutstandingUsd(s, inv)).toBe(300);
    expect(invoicePaidUsd(s, inv)).toBe(700);
    // So'mdagi qoldiq faktura kursida (12 500)
    expect(invoiceOutstanding(s, inv)).toBeCloseTo(300 * 12_500, 0);
    act.recordClientPayment(ctx(s), inv.id, { amount: Math.round(300 * 13_000), date: TODAY, accountId: "acc_cash", fxRate: 13_000, note: "" });
    expect(invoiceSettled(s, inv)).toBe(true);
    expect(check(s, TODAY)).toEqual([]);
  });

  it("dollarda ortiqcha to'lov rad etiladi", () => {
    const { s, invs } = setup();
    expect(() => act.recordClientPayment(ctx(s), invs[0]!.id, { amount: 2000, date: TODAY, accountId: "acc_usd", rate: 12_500, note: "" })).toThrow();
    expect(() => act.recordClientPayment(ctx(s), invs[0]!.id, { amount: 30_000_000, date: TODAY, accountId: "acc_bank", fxRate: 12_500, note: "" })).toThrow();
    expect(() => act.recordClientPayment(ctx(s), invs[0]!.id, { amount: 1_000_000, date: TODAY, accountId: "acc_bank", fxRate: 12, note: "" })).toThrow(
      /kurs/i,
    );
  });
});

describe("Dollardagi bir martalik xizmat", () => {
  it("oldindan 50% va qoldiq dollarda; qoldiq topshirilgan kungi kursda", () => {
    const { s, p } = setup({
      services: [{ kind: "web", title: "Landing", price: 0, priceUsd: 2000.5, prepayPct: 50, assigneeId: "u_web" }],
    });
    const svc = p.services[0]!;
    const pre = s.invoices.find((i) => i.serviceId === svc.id && i.kind === "prepay")!;
    expect(pre.usd).toBe(1000.25);
    act.recordClientPayment(ctx(s), pre.id, { amount: 1000.25, date: TODAY, accountId: "acc_usd", rate: 12_500, note: "" });
    s.settings.usdRate = 13_100;
    const c = ctx(s, "u_mk");
    for (let i = 0; i < (svc.stages?.length ?? 0); i++) act.advanceServiceStage(c, p.id, svc.id);
    expect(svc.deliveredAt).toBeTruthy();
    const rest = s.invoices.find((i) => i.serviceId === svc.id && i.kind !== "prepay")!;
    expect(rest.usd).toBe(1000.25);
    expect(rest.amount).toBe(Math.round(1000.25 * 13_100));
    expect(check(s, TODAY)).toEqual([]);
  });

  it("narxni chiqarilgan fakturadan kam qilib bo'lmaydi (dollarda)", () => {
    const { s, p } = setup({
      services: [{ kind: "web", title: "Landing", price: 0, priceUsd: 2000, prepayPct: 100, assigneeId: "u_web" }],
    });
    expect(() => act.updateService(ctx(s, "u_mk"), p.id, p.services[0]!.id, { price: 0, priceUsd: 1500 })).toThrow(/\$2 000/);
  });
});

describe("Eski / buzilgan ma'lumot", () => {
  it("noto'g'ri dollar qiymatlari tozalanadi, hisob so'mda davom etadi", () => {
    const { s, invs } = setup();
    const raw = JSON.parse(JSON.stringify(s)) as ErpState;
    const inv = raw.invoices.find((i) => i.id === invs[0]!.id)!;
    (inv as unknown as { usd: unknown }).usd = "abc";
    (raw.projects.at(-1)!.services[0] as unknown as { priceUsd: unknown }).priceUsd = -5;
    (raw.projects.at(-1) as unknown as { currency: unknown }).currency = "EUR";
    const n = normalizeState(raw, demoState())!;
    const ni = n.invoices.find((i) => i.id === inv.id)!;
    expect(ni.usd).toBeUndefined();
    expect(n.projects.at(-1)!.currency).toBeUndefined();
    expect(n.projects.at(-1)!.services[0]!.priceUsd).toBeUndefined();
    expect(invoiceOutstanding(n, ni)).toBe(ni.amount);
  });
});
