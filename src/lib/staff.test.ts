import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { employeeBalance, payables, payrollStaff } from "./finance";
import { userLoad } from "./staff";
import { TODAY, demoState, makeCtx } from "./test-utils";

describe("Xodimni arxivlash", () => {
  it("arxivlanadi, tarixga yoziladi, qaytarilishi mumkin; o'zini arxivlay olmaydi", () => {
    const s = demoState();
    const ctx = makeCtx(s, "u_admin");
    act.archiveUser(ctx.c, "u_dz");
    expect(s.users.find((u) => u.id === "u_dz")!.active).toBe(false);
    expect(ctx.logs.some((l) => l.includes("arxivlandi"))).toBe(true);
    act.restoreUser(makeCtx(s, "u_admin").c, "u_dz");
    expect(s.users.find((u) => u.id === "u_dz")!.active).toBe(true);
    expect(() => act.archiveUser(makeCtx(s, "u_admin").c, "u_admin")).toThrow(/O'zingizni/);
  });

  it("to'lanmagan maoshi bor xodim arxivdan keyin ham ish haqi ro'yxatida va qarzlarda qoladi", () => {
    const s = demoState();
    const uid = "u_smm1";
    s.accruals.push({
      id: "acc_t",
      userId: uid,
      date: TODAY,
      kind: "manual",
      sourceId: "t",
      title: "Test",
      qty: 1,
      rate: 700_000,
      amount: 700_000,
      approved: true,
      createdBy: "u_mol",
    });
    const before = employeeBalance(s, uid, TODAY);
    expect(before).toBeGreaterThan(0);
    const debtBefore = payables(s, TODAY).employees.reduce((a, r) => a + r.balance, 0);
    act.archiveUser(makeCtx(s, "u_admin").c, uid);
    expect(payrollStaff(s).some((u) => u.id === uid)).toBe(true);
    expect(employeeBalance(s, uid, TODAY)).toBe(before);
    expect(payables(s, TODAY).employees.reduce((a, r) => a + r.balance, 0)).toBe(debtBefore);
    // Qarz to'langach arxivdagi xodim ro'yxatdan chiqadi
    act.payEmployee(makeCtx(s, "u_mol").c, { userId: uid, amount: before, date: TODAY, accountId: "acc_bank", note: "" });
    expect(payrollStaff(s).some((u) => u.id === uid)).toBe(false);
  });

  it("userLoad: qarz, loyiha va ochiq vazifalarni ko'rsatadi", () => {
    const s = demoState();
    const load = userLoad(s, "u_smm1", TODAY);
    expect(load.projects.length).toBeGreaterThan(0);
    expect(load.projects.every((p) => p.status !== "closed" && (p.smmId === "u_smm1" || p.marketologId === "u_smm1" || p.targetologId === "u_smm1"))).toBe(
      true,
    );
  });
});

describe("TZ deadline soati", () => {
  it("soat bilan berilgan TZ: bildirishnomada sana va soat chiqadi, ma'lumotda saqlanadi", () => {
    const s = demoState();
    const ctx = makeCtx(s, "u_smm1");
    act.createTask(ctx.c, {
      kind: "montaj",
      projectId: "p_gym",
      assigneeId: "u_mt1",
      title: "Reels montaji",
      brief: "",
      deadline: "2026-10-10",
      deadlineTime: "15:30",
    });
    const t = s.tasks.find((x) => x.title === "Reels montaji")!;
    expect(t.deadlineTime).toBe("15:30");
    expect(ctx.notes.some((n) => n.to.includes("u_mt1") && n.text.includes("10.10.2026, 15:30"))).toBe(true);
  });
});
