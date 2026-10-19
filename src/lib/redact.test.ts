// Xodimga summalar yuborilmaydi, lekin ish holati va «to'lov kechikkan» belgisi to'liq holat bilan bir xil bo'lishi kerak.
import { describe, expect, it } from "vitest";
import { projectDebt } from "./finance";
import { seesMoney, visibleProjects } from "./permissions";
import { redactFor } from "./redact";
import { workBlockedReason } from "./rules";
import { TODAY, demoState } from "./test-utils";

describe("redactFor", () => {
  const full = demoState();
  for (const u of full.users.filter((x) => x.active)) {
    it(`${u.id} (${u.role}): o'z loyihalarida ish holati to'liq holat bilan bir xil`, () => {
      const r = redactFor(full, u, TODAY);
      for (const p of visibleProjects(full, u)) {
        const rp = r.projects.find((x) => x.id === p.id);
        expect(rp, p.id).toBeTruthy();
        expect(workBlockedReason(r, rp!), p.id).toBe(workBlockedReason(full, p));
        if (seesMoney(u)) expect(projectDebt(r, p.id, TODAY), p.id).toEqual(projectDebt(full, p.id, TODAY));
      }
    });
  }

  const staff = full.users.filter((u) => u.active && !seesMoney(u));
  it("summalarni ko'rmaydigan rollar bor", () => {
    expect(staff.length).toBeGreaterThan(3);
  });
  for (const u of staff) {
    it(`${u.id} (${u.role}): narxlar, fakturalar va mijoz to'lovlari yuborilmaydi`, () => {
      const r = redactFor(full, u, TODAY);
      expect(r.invoices).toEqual([]);
      expect(r.transactions.every((t) => t.userId === u.id && !t.invoiceId)).toBe(true);
      for (const p of r.projects) {
        expect(p.monthlyFee, p.id).toBe(0);
        expect(p.prepayAmount, p.id).toBeUndefined();
        for (const x of p.services) {
          expect(x.price, `${p.id}/${x.id}`).toBe(0);
          expect(x.priceUsd).toBeUndefined();
          expect(x.prepayAmount).toBeUndefined();
          expect(x.prepayPct).toBeUndefined();
          expect(x.adPct).toBeUndefined();
          if (x.assigneeId !== u.id) expect(x.assigneeFee).toBeUndefined();
        }
      }
      // To'liq nusxa buzilmaydi
      expect(full.invoices.length).toBeGreaterThan(0);
      expect(full.projects.some((p) => p.monthlyFee > 0)).toBe(true);
    });

    it(`${u.id} (${u.role}): kechikkan to'lov faqat kunlar bilan ko'rinadi`, () => {
      const r = redactFor(full, u, TODAY);
      for (const p of r.projects) {
        const debt = projectDebt(full, p.id, TODAY);
        expect(p.overdueDays, p.id).toBe(debt.amount > 0 ? debt.days : undefined);
      }
    });
  }

  it("moliyaviy rollar to'liq ma'lumotni oladi", () => {
    for (const u of full.users.filter((x) => x.active && seesMoney(x))) {
      const r = redactFor(full, u, TODAY);
      expect(r.invoices.length, u.id).toBe(full.invoices.length);
      expect(
        r.projects.find((p) => p.monthlyFee > 0),
        u.id,
      ).toBeTruthy();
    }
  });

  it("o'z ijrochi haqi o'ziga ko'rinadi, boshqaning yo'q", () => {
    const p = full.projects.find((x) => x.services.some((s) => s.assigneeId && s.assigneeFee !== undefined))!;
    const svc = p.services.find((s) => s.assigneeId && s.assigneeFee !== undefined)!;
    const owner = full.users.find((u) => u.id === svc.assigneeId)!;
    if (!seesMoney(owner)) {
      const mine = redactFor(full, owner, TODAY)
        .projects.find((x) => x.id === p.id)!
        .services.find((s) => s.id === svc.id)!;
      expect(mine.assigneeFee).toBe(svc.assigneeFee);
    }
  });
});
