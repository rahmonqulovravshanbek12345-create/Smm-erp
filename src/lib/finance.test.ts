import { describe, expect, it } from "vitest";
import { addDays, monthKey } from "./dates";
import {
  accountBalance,
  cashFlow,
  employeeBalance,
  employeeLedger,
  invoicePaid,
  invoicePeriod,
  invoiceRevenueByMonth,
  invoiceStatus,
  lastMonths,
  mrr,
  payables,
  paymentCalendar,
  payrollSheet,
  pnl,
  projectProfitability,
  receivables,
  unrecognizedRevenue,
} from "./finance";
import { TODAY, demoState, emptyState, nonFinite } from "./test-utils";

const s = demoState();
const months = lastMonths(TODAY, 6);
const close = (a: number, b: number, eps = 1) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

describe("Hisoblar (kassa, bank, karta)", () => {
  it("hech bir hisob tarixda manfiy qoldiqqa tushmaydi", () => {
    const dates = [...new Set(s.transactions.map((t) => t.date))].sort();
    for (const acc of s.accounts) {
      for (const d of dates) expect(accountBalance(s, acc.id, d), `${acc.name} ${d}`).toBeGreaterThanOrEqual(-0.5);
    }
  });
});

describe("Daromadni tan olish (hisoblash usuli)", () => {
  it("davr to'liq o'tgach faktura summasi oylarga to'liq taqsimlanadi", () => {
    // Xizmat davri hali boshlanmagan (birinchi reklama yo'q) fakturalar daromad emas — ular avans
    for (const inv of s.invoices.filter((i) => invoicePeriod(s, i))) {
      const all = [...invoiceRevenueByMonth(s, inv, "2099-01-01").values()].reduce((a, v) => a + v, 0);
      close(all, inv.amount, 0.01);
    }
  });
  it("davri boshlanmagan faktura umuman tan olinmaydi", () => {
    const pending = s.invoices.filter((i) => !invoicePeriod(s, i));
    expect(pending.length).toBeGreaterThan(0);
    for (const inv of pending) {
      expect(invoiceRevenueByMonth(s, inv, "2099-01-01").size).toBe(0);
      expect(unrecognizedRevenue(s, inv, TODAY)).toBe(inv.amount);
    }
  });
  it("bugungacha tan olingan + tan olinmagan = faktura summasi (P&L va avans bir xil qoidada)", () => {
    for (const inv of s.invoices) {
      const recognized = [...invoiceRevenueByMonth(s, inv, TODAY).values()].reduce((a, v) => a + v, 0);
      close(recognized + unrecognizedRevenue(s, inv, TODAY), inv.amount, 0.01);
    }
  });
});

describe("Foyda va zarar", () => {
  const r = pnl(s, months, TODAY);
  it("oraliq natijalar formulaga mos", () => {
    for (const m of months) {
      close(r.totals.gross[m]!, r.totals.revenue[m]! - r.totals.direct[m]!);
      close(r.totals.operating[m]!, r.totals.gross[m]! - r.totals.overhead[m]!);
      close(r.totals.net[m]!, r.totals.operating[m]! - r.totals.tax[m]!);
    }
  });
  it("bo'lim jami = qatorlar yig'indisi, davr jami = oylar yig'indisi", () => {
    for (const sec of ["revenue", "direct", "overhead", "tax"] as const) {
      for (const m of months) {
        const lines = r.lines.filter((l) => l.section === sec).reduce((a, l) => a + (l.values[m] ?? 0), 0);
        close(lines, r.totals[sec][m]!);
      }
      close(
        months.reduce((a, m) => a + r.totals[sec][m]!, 0),
        r.sum[sec],
      );
    }
  });
  it("loyihalar kesimidagi daromad kompaniya daromadiga teng", () => {
    const byProject = s.projects.reduce((a, p) => a + pnl(s, months, TODAY, p.id).sum.revenue, 0);
    close(byProject, r.sum.revenue);
    for (const row of projectProfitability(s, months, TODAY)) {
      close(row.revenue, pnl(s, months, TODAY, row.project.id).sum.revenue);
    }
  });
  it("demo ma'lumotda kutilgan holatlar: kompaniya foydada, Moda House zararda", () => {
    expect(r.sum.net).toBeGreaterThan(0);
    const moda = projectProfitability(s, months, TODAY).find((x) => x.project.id === "p_moda")!;
    expect(moda.net).toBeLessThan(0);
  });
});

describe("Pul oqimi", () => {
  const cf = cashFlow(s, months);
  it("qoldiqlar zanjiri uzilmaydi: boshi + sof oqim = oxiri", () => {
    months.forEach((m, i) => {
      close(cf.closing[m]!, cf.opening[m]! + cf.net[m]!);
      if (i > 0) close(cf.opening[m]!, cf.closing[months[i - 1]!]!);
    });
  });
  it("sof oqim = bo'limlar + valyuta farqi", () => {
    for (const m of months) close(cf.net[m]!, cf.sections.reduce((a, x) => a + (x.net[m] ?? 0), 0) + (cf.fx[m] ?? 0));
  });
});

describe("Debitorlik va kreditorlik", () => {
  it("saldo = faktura − to'lov; muddat guruhlari = to'lanmagan qoldiq", () => {
    for (const row of receivables(s, TODAY)) {
      close(row.balance, row.invoiced - row.paid);
      const outstanding = s.invoices
        .filter((i) => i.projectId === row.project.id && i.issueDate <= TODAY)
        .reduce((a, i) => a + Math.max(0, i.amount - invoicePaid(s, i)), 0);
      close(row.notDue + row.d30 + row.d60 + row.d60plus, outstanding);
      expect(row.advance).toBeGreaterThanOrEqual(0);
    }
  });
  it("demo: FitLife'da 1–30 kunlik, Moda House'da 60+ kunlik qarz bor", () => {
    const ar = receivables(s, TODAY);
    expect(ar.find((r) => r.project.id === "p_gym")!.d30).toBeGreaterThan(0);
    expect(ar.find((r) => r.project.id === "p_moda")!.d60plus).toBeGreaterThan(0);
  });
  it("xodimlar kreditorligi xodim balansiga teng", () => {
    for (const e of payables(s, TODAY).employees) close(e.balance, employeeBalance(s, e.user.id, TODAY));
  });
  it("muddati o'tmagan va to'lanmagan faktura «kutilmoqda», o'tgani «muddati o'tgan»", () => {
    const inv = { ...s.invoices[0]!, id: "x", amount: 1000, dueDate: addDays(TODAY, 3) };
    expect(invoiceStatus(s, inv, TODAY)).toBe("pending");
    expect(invoiceStatus(s, { ...inv, dueDate: addDays(TODAY, -1) }, TODAY)).toBe("overdue");
    expect(invoiceStatus(s, { ...inv, dueDate: "" }, TODAY)).toBe("pending");
  });
});

describe("Ish haqi", () => {
  it("FIFO: xodim kitobidagi balans umumiy balansga teng, to'langan qism hisoblangandan oshmaydi", () => {
    for (const u of s.users) {
      const l = employeeLedger(s, u.id);
      close(l.balance, employeeBalance(s, u.id));
      for (const row of l.rows) expect(row.paid).toBeLessThanOrEqual(Math.max(0, row.amount) + 0.01);
    }
  });
  it("vedomost: oxirgi qoldiq = boshlang'ich + hisoblangan − to'langan; oylar ulanadi", () => {
    const ms = lastMonths(TODAY, 4);
    ms.forEach((m, i) => {
      const sheet = payrollSheet(s, m);
      for (const row of sheet) {
        close(row.closing, row.opening + row.accrued - row.paid);
        if (i > 0) {
          const prev = payrollSheet(s, ms[i - 1]!).find((r) => r.user.id === row.user.id);
          if (prev) close(row.opening, prev.closing);
        }
      }
    });
  });
});

describe("To'lov kalendari", () => {
  it("prognoz qoldiq har kuni oldingisi + kunlik sof oqim", () => {
    const cal = paymentCalendar(s, TODAY);
    let b = cal.free;
    for (const d of cal.days) {
      close(
        d.net,
        d.items.reduce((a, x) => a + x.amount, 0),
      );
      b += d.net;
      close(d.balance, b);
      expect(d.date >= TODAY).toBe(true);
    }
  });
});

describe("Chekka holatlar", () => {
  it("bo'sh tizimda hech bir hisobot yiqilmaydi va NaN/Infinity chiqmaydi", () => {
    const e = emptyState();
    const res = {
      pnl: pnl(e, months, TODAY),
      cf: cashFlow(e, months),
      ar: receivables(e, TODAY),
      ap: payables(e, TODAY),
      cal: paymentCalendar(e, TODAY),
      mrr: mrr(e, TODAY),
      prof: projectProfitability(e, months, TODAY),
    };
    expect(nonFinite(res)).toEqual([]);
  });
  it("demo holatdagi barcha hisobotlarda NaN/Infinity yo'q", () => {
    expect(
      nonFinite({ pnl: pnl(s, months, TODAY), cf: cashFlow(s, months), cal: paymentCalendar(s, TODAY), prof: projectProfitability(s, months, TODAY) }),
    ).toEqual([]);
  });
  it("MRR — faqat faol, davri boshlangan loyihalar", () => {
    const expected = s.projects.filter((p) => p.status === "active" && p.periodStart && p.periodStart <= TODAY).reduce((a, p) => a + p.monthlyFee, 0);
    expect(mrr(s, TODAY)).toBe(expected);
    expect(monthKey(TODAY)).toBe("2026-10");
  });
});
