import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { addDays } from "./dates";
import { employeeBalance, invoicePaid, prepayPaid, syncInvoices } from "./finance";
import { TODAY, demoState, makeCtx } from "./test-utils";

const input = (over: Partial<act.ProjectInput> = {}): act.ProjectInput => ({
  name: "Test Klinika",
  contactName: "Ali",
  phone: "+998 00 111 22 33",
  industry: "Tibbiyot",
  links: "",
  contractNo: "SH-2026/099",
  contractDate: TODAY,
  tariff: "Biznes (Instagram + target)",
  tariffId: "t_biznes",
  monthlyFee: 12_000_000,
  prepayType: 50,
  prepayDueDate: TODAY,
  remainderDueDate: addDays(TODAY, 20),
  marketologId: "u_mk",
  smmId: "u_smm1",
  targetologId: "u_tg",
  ...over,
});

describe("Lid → shartnoma → loyiha", () => {
  it("50% shartnoma: ikki faktura, lid «Shartnoma», operatorga bonus, marketolog va moliyaga xabar", () => {
    const s = demoState();
    const { c, notes } = makeCtx(s, "u_mk");
    const id = act.createProject(c, input(), "l_3");
    const invs = s.invoices.filter((i) => i.projectId === id);
    expect(invs.map((i) => [i.kind, i.amount])).toEqual([
      ["prepay", 6_000_000],
      ["remainder", 6_000_000],
    ]);
    expect(s.leads.find((l) => l.id === "l_3")!.stage).toBe("contract");
    expect(s.accruals.some((a) => a.sourceId === "lead:l_3")).toBe(true);
    expect(notes.flatMap((n) => n.to)).toEqual(expect.arrayContaining(["u_smm1", "u_mol", "u_op1"]));
  });
  it("oldindan to'lovsiz ish ochilmaydi; to'lov kelgach ochiladi", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    const id = act.createProject(c, input({ prepayType: 100 }));
    const task = { projectId: id, kind: "montaj" as const, assigneeId: "u_mt1", title: "Video", brief: "", deadline: addDays(TODAY, 2) };
    expect(() => act.createTask(c, task)).toThrow(/Oldindan to'lov/);
    const pre = s.invoices.find((i) => i.projectId === id && i.kind === "prepay")!;
    act.recordClientPayment(makeCtx(s, "u_mol").c, pre.id, { amount: pre.amount, date: TODAY, accountId: "acc_bank", note: "" });
    expect(prepayPaid(s, id)).toBe(true);
    expect(() => act.createTask(c, task)).not.toThrow();
  });
});

describe("Ish haqi", () => {
  it("ish qabul qilinganda ishbay bir marta hisoblanadi, kechikish jarimasi ham bir marta", () => {
    const s = demoState();
    s.settings.latePenaltyPct = 10;
    const t = s.tasks.find((x) => x.kind === "montaj" && x.status === "review")!;
    t.deadline = addDays(TODAY, -2);
    const { c } = makeCtx(s, "u_smm1");
    const before = employeeBalance(s, t.assigneeId);
    act.acceptTask(c, t.id);
    act.acceptTask(c, t.id);
    const pay = s.accruals.filter((a) => a.sourceId === `task:${t.id}`);
    const fine = s.accruals.filter((a) => a.sourceId === `late:${t.id}`);
    expect(pay).toHaveLength(1);
    expect(fine).toHaveLength(1);
    expect(fine[0]!.amount).toBe(-Math.round(pay[0]!.amount * 0.1));
    expect(employeeBalance(s, t.assigneeId) - before).toBe(pay[0]!.amount + fine[0]!.amount);
  });
  it("xodimga to'lov balansni kamaytiradi va xodimga xabar boradi", () => {
    const s = demoState();
    const { c, notes } = makeCtx(s, "u_mol");
    const before = employeeBalance(s, "u_mt1");
    act.payEmployee(c, { userId: "u_mt1", amount: 500_000, date: TODAY, accountId: "acc_bank", note: "Avans" });
    expect(employeeBalance(s, "u_mt1")).toBe(before - 500_000);
    expect(notes.at(-1)!.to).toEqual(["u_mt1"]);
  });
  it("qo'lda yozuvni o'chirish mumkin, avtomatik oylikni — yo'q", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mol");
    act.addManualAccrual(c, { userId: "u_dz", date: TODAY, kind: "bonus", amount: 300_000, title: "Yaxshi ish" });
    const manual = s.accruals.at(-1)!;
    act.deleteAccrual(c, manual.id);
    expect(s.accruals.some((a) => a.id === manual.id)).toBe(false);
    const fixed = s.accruals.find((a) => a.createdBy === "system" && a.kind === "fixed");
    if (fixed) expect(() => act.deleteAccrual(c, fixed.id)).toThrow();
  });
});

describe("Loyihani yopish", () => {
  it("yopilgandan keyin yangi oylik fakturalar chiqmaydi, jamoa va moliyaga xabar", () => {
    const s = demoState();
    const { c, notes } = makeCtx(s, "u_boss");
    act.closeProject(c, "p_gym", TODAY);
    const before = s.invoices.filter((i) => i.projectId === "p_gym").length;
    syncInvoices(s, addDays(TODAY, 90), () => Math.random().toString(36));
    expect(s.invoices.filter((i) => i.projectId === "p_gym").length).toBe(before);
    expect(s.projects.find((p) => p.id === "p_gym")!).toMatchObject({ status: "closed", pauseWork: true });
    expect(notes.at(-1)!.to).toEqual(expect.arrayContaining(["u_mk", "u_mol"]));
  });
});

describe("Mijoz to'lovi", () => {
  it("to'lov fakturaga bog'lanadi; summasiz to'lov rad etiladi", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mol");
    const inv = s.invoices.find((i) => i.projectId === "p_gym" && invoicePaid(s, i) < i.amount)!;
    const paidBefore = invoicePaid(s, inv);
    act.recordClientPayment(c, inv.id, { amount: 1_000_000, date: TODAY, accountId: "acc_bank", note: "" });
    expect(invoicePaid(s, inv)).toBe(paidBefore + 1_000_000);
    expect(() => act.recordClientPayment(c, inv.id, { amount: 0, date: TODAY, accountId: "acc_bank", note: "" })).toThrow();
  });
});
