import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { addDays } from "./dates";
import { employeeBalance, invoicePaid, lastMonths, pnl, prepayPaid, projectDebt, projectProfitability, receivables } from "./finance";
import { workBlockedReason } from "./rules";
import { syncAll } from "./store-sync";
import { TODAY, demoState, makeCtx } from "./test-utils";
import type { ErpState, Task } from "./types";

const ctxAt = (s: ErpState, today: string, uid = "u_boss") => makeCtx(s, uid, today).c;
const walk = (s: ErpState, from: string, to: string) => {
  // simulate the app being opened every day
  for (let d = from; d <= to; d = addDays(d, 1)) syncAll(s, d);
};

describe("A: monthly service cancelled then re-added", () => {
  it("does not back-bill the months when the service was cancelled", () => {
    const s = demoState("2026-10-07");
    const p = s.projects.find((x) => x.id === "p_gym")!; // SMM only, periods start on the 2nd
    act.cancelService(ctxAt(s, "2026-10-07", "u_mk"), p.id, p.services.find((x) => x.kind === "smm")!.id);
    walk(s, "2026-10-08", "2027-01-10");
    expect(s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly" && i.periodIndex >= 4)).toHaveLength(0);
    // client comes back on 2027-01-10
    act.addService(ctxAt(s, "2027-01-10", "u_mk"), p.id, { kind: "smm", title: "SMM", price: 12_000_000 });
    syncAll(s, "2027-01-10");
    const back = s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly" && i.dueDate < "2027-01-10");
    // BUG: invoices for Nov-02, Dec-02 and Jan-02 periods (36M, all overdue) appear
    expect(back.map((i) => `${i.dueDate}:${i.amount}`)).toEqual([
      ...s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly" && i.dueDate < "2026-10-08").map((i) => `${i.dueDate}:${i.amount}`),
    ]);
  });
});

describe("B: closing a project", () => {
  it("invoice issued 3 days ahead for the next period is not recognised/collected after closing", () => {
    const s = demoState("2026-10-07");
    const p = s.projects.find((x) => x.id === "p_gym")!; // periodStart 2026-07-02 -> next period 2026-11-02
    walk(s, "2026-10-08", "2026-10-31");
    const nov = s.invoices.find((i) => i.projectId === p.id && i.kind === "monthly" && i.dueDate === "2026-11-02");
    expect(nov).toBeTruthy(); // issued on 10-30 (3 days ahead)
    act.closeProject(ctxAt(s, "2026-10-31", "u_mk"), p.id, "2026-10-31");
    walk(s, "2026-11-01", "2026-12-15");
    const rev = pnl(s, ["2026-11", "2026-12"], "2026-12-15", p.id);
    const pay = rev.lines.filter((l) => l.key.startsWith("pay_")).reduce((a, l) => a + l.total, 0);
    // only 1 day (Nov 1) of the Oct-02..Nov-02 period belongs to Nov: ~0.39M revenue, ~0.1M salary
    expect(pay).toBeLessThan(200_000);
    // BUG: the whole 12M post-close period (Nov-02..Dec-02) is booked as revenue with zero cost ...
    expect(rev.sum.revenue).toBeLessThan(1_000_000);
    // ... and its invoice is chased as overdue client debt
    expect(projectDebt(s, p.id, "2026-12-15").amount).toBeLessThan(nov!.amount);
  });
});

describe("C/D: fixed salary", () => {
  it("C: a newly hired employee with a fixed salary is not paid for months before hire", () => {
    const s = demoState("2026-10-07");
    s.users.push({ id: "u_new", name: "Yangi Hisobchi", role: "moliya", active: true });
    act.savePayProfile(ctxAt(s, "2026-10-07"), { userId: "u_new", fixed: 4_000_000, perProject: 0, rates: {} });
    syncAll(s, "2026-10-07");
    // BUG: 5 back-dated fixed accruals (May..Sep = 20M) are created on day one
    expect(s.accruals.filter((a) => a.userId === "u_new").map((a) => a.sourceId)).toEqual([]);
    expect(employeeBalance(s, "u_new")).toBe(0);
  });

  it("D1: an employee archived on Oct 20 still gets (at least pro-rata) October salary", () => {
    const s = demoState("2026-10-20");
    act.archiveUser(ctxAt(s, "2026-10-20"), "u_op1");
    syncAll(s, "2026-11-05");
    // BUG: October fixed salary is never accrued (loop only runs for active users once the month has ended)
    expect(s.accruals.some((a) => a.sourceId === "fix:u_op1:2026-10")).toBe(true);
  });

  it("D2: restoring an archived employee does not pay for the months spent in the archive", () => {
    const s = demoState("2026-10-01");
    act.archiveUser(ctxAt(s, "2026-10-01"), "u_op1");
    walk(s, "2026-10-02", "2027-01-04");
    act.restoreUser(ctxAt(s, "2027-01-05"), "u_op1");
    syncAll(s, "2027-01-05");
    // BUG: Oct, Nov, Dec fixed salaries (6M) appear for a period the person did not work
    expect(
      s.accruals.filter((a) => a.userId === "u_op1" && a.sourceId?.startsWith("fix:") && a.sourceId >= "fix:u_op1:2026-10").map((a) => a.sourceId),
    ).toEqual([]);
  });
});

describe("E: project salary for a project with no monthly service", () => {
  it("marketolog stops getting project salary once all monthly services are cancelled", () => {
    const s = demoState("2026-10-07");
    s.payProfiles.find((x) => x.userId === "u_mk")!.perProject = 1_000_000;
    syncAll(s, "2026-10-07");
    const p = s.projects.find((x) => x.id === "p_gym")!;
    act.cancelService(ctxAt(s, "2026-10-07", "u_mk"), p.id, p.services.find((x) => x.kind === "smm")!.id);
    const before = s.accruals.filter((a) => a.userId === "u_mk" && a.projectId === p.id).length;
    walk(s, "2026-10-08", "2027-01-05");
    // no monthly invoices are issued any more ...
    expect(s.invoices.filter((i) => i.projectId === p.id && i.dueDate > "2026-10-07")).toHaveLength(0);
    // ... BUG: but the marketolog keeps accruing 1M every period (Nov-02, Dec-02, Jan-02)
    expect(s.accruals.filter((a) => a.userId === "u_mk" && a.projectId === p.id).length - before).toBeLessThanOrEqual(1);
  });
});

describe("F: late penalty orphaned", () => {
  it("deleting the piece accrual of a late task leaves an undeletable penalty", () => {
    const s = demoState("2026-10-07");
    s.settings.latePenaltyPct = 20;
    const c = ctxAt(s, "2026-10-07", "u_smm1");
    const t: Task = {
      id: "task_qa",
      projectId: "p_gym",
      kind: "montaj",
      assigneeId: "u_mt1",
      title: "QA montaj",
      brief: "",
      deadline: "2026-10-01",
      status: "review",
      createdBy: "u_smm1",
      createdAt: "2026-09-30T10:00:00Z",
    };
    s.tasks.push(t);
    const before = employeeBalance(s, "u_mt1");
    act.acceptTask(c, t.id);
    const piece = s.accruals.find((a) => a.sourceId === "task:task_qa")!;
    const pen = s.accruals.find((a) => a.sourceId === "late:task_qa")!;
    expect(piece.amount).toBe(200_000);
    expect(pen.amount).toBe(-40_000);
    // finance removes the piece accrual (allowed by UI: kind === "piece")
    act.deleteAccrual(c, piece.id);
    // BUG: the penalty stays and cannot be removed either
    expect(() => act.deleteAccrual(c, pen.id)).not.toThrow();
    expect(employeeBalance(s, "u_mt1")).toBe(before);
  });
});

describe("G/H: cancelled service invoices", () => {
  it("G: cancelling a one-time service leaves its unpaid prepay invoice as overdue debt forever", () => {
    const s = demoState("2026-10-07");
    act.addService(ctxAt(s, "2026-10-07", "u_mk"), "p_gym", { kind: "video", title: "Rolik", price: 6_000_000, prepayPct: 50, assigneeId: "u_mt1" });
    const svc = s.projects.find((p) => p.id === "p_gym")!.services.find((x) => x.kind === "video")!;
    const debt0 = projectDebt(s, "p_gym", "2026-11-20").amount;
    act.cancelService(ctxAt(s, "2026-10-07", "u_mk"), "p_gym", svc.id);
    const inv = s.invoices.find((i) => i.serviceId === svc.id)!;
    expect(invoicePaid(s, inv)).toBe(0);
    // BUG: 3M for a cancelled, never-started job is shown as overdue client debt
    expect(projectDebt(s, "p_gym", "2026-11-20").amount).toBe(debt0 - inv.amount);
  });

  it("H: client switches from SMM to Target before start — paying the new prepay unblocks work", () => {
    const s = demoState("2026-10-07");
    const c = ctxAt(s, "2026-10-07", "u_mk");
    const p = s.projects.find((x) => x.id === "p_dent")!; // SMM only, prepay unpaid, period not started
    act.cancelService(c, p.id, p.services.find((x) => x.kind === "smm")!.id);
    act.addService(c, p.id, { kind: "target", title: "Target", price: 4_000_000 });
    const preps = s.invoices.filter((i) => i.projectId === p.id && i.kind === "prepay" && !i.serviceId && i.periodIndex === 0);
    expect(preps).toHaveLength(2); // old SMM prepay (8M) + new Target prepay (4M)
    const target = preps[1]!;
    act.recordClientPayment(ctxAt(s, "2026-10-07", "u_mol"), target.id, { amount: target.amount, date: "2026-10-07", accountId: "acc_bank", note: "" });
    // BUG: prepayPaid() looks at the first (cancelled SMM) prepay invoice — work stays blocked
    expect(prepayPaid(s, p.id)).toBe(true);
    expect(workBlockedReason(s, p)).toBeNull();
    // and the 8M SMM prepay remains a receivable for a service never delivered
    // eski SMM oldindan to'lovi bekor — qarzda faqat yangi xizmatning (50% bo'lsa) qoldig'i qoladi
    const live = s.invoices.filter((i) => i.projectId === p.id && !i.voidedAt);
    expect(live.every((i) => (i.lines ?? []).every((l) => l.kind === "target"))).toBe(true);
    const rest = live.reduce((a, i) => a + i.amount - invoicePaid(s, i), 0);
    expect(receivables(s, "2026-10-07").find((r) => r.project.id === p.id)!.balance).toBe(rest);
  });
});

describe("I: monthly service added before the first period starts", () => {
  it("first period is billed for every monthly service the client has", () => {
    const s = demoState("2026-10-07");
    const c = ctxAt(s, "2026-10-07", "u_mk");
    const p = s.projects.find((x) => x.id === "p_dent")!; // SMM 8M, period not started yet
    act.addService(c, p.id, { kind: "target", title: "Target", price: 4_000_000 });
    expect(p.monthlyFee).toBe(12_000_000);
    walk(s, "2026-10-08", "2026-10-10");
    act.updateProject(ctxAt(s, "2026-10-10", "u_mk"), p.id, { periodStart: "2026-10-10" }); // ads launched
    walk(s, "2026-10-11", "2026-11-12");
    const per0 = s.invoices.filter((i) => i.projectId === p.id && !i.serviceId && i.kind !== "extra" && i.periodIndex === 0);
    const per1 = s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly" && i.periodIndex === 1);
    expect(per1.reduce((a, i) => a + i.amount, 0)).toBe(12_000_000);
    // BUG: period 0 is billed only 8M (SMM). Target's first month (4M) is never invoiced and no warning is sent,
    // while the targetolog still accrues project salary for that period.
    expect(per0.reduce((a, i) => a + i.amount, 0)).toBe(12_000_000);
  });
});

describe("J: project profitability — cost by employee", () => {
  it("'other direct cost' = direct − Σ costByUser is never negative", () => {
    const s = demoState();
    const months = lastMonths(TODAY, 3);
    const bad = projectProfitability(s, months, TODAY)
      .map((x) => ({ id: x.project.id, other: Math.round(x.direct - x.costByUser.reduce((a, c) => a + c.amount, 0)) }))
      .filter((x) => x.other < 0);
    // BUG: p_gym ≈ −1.58M, p_moda ≈ −2.89M (Pnl.tsx «Boshqa to'g'ridan-to'g'ri xarajat» row)
    expect(bad).toEqual([]);
  });
});

describe("K: archived employee keeps accruing project salary", () => {
  it("no project salary for a period that started after the employee was archived", () => {
    const s = demoState("2026-10-07");
    act.archiveUser(ctxAt(s, "2026-10-07"), "u_smm2"); // SMM of p_gym and p_baraka
    walk(s, "2026-10-08", "2026-12-05");
    const after = s.accruals.filter((a) => a.userId === "u_smm2" && a.kind === "project" && a.date > "2026-11-10");
    // BUG: per:p_gym:4 (Nov-02..Dec-02) and per:p_baraka:5 (Oct-25..Nov-25) are accrued — 4M for an archived person
    expect(after.map((a) => a.sourceId)).toEqual([]);
  });
});
