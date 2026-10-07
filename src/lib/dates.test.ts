import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, fmtDate, fmtMoney, fmtNum, monthEnd, monthKey, relDays, shiftMonthKey } from "./dates";

describe("Sanalar", () => {
  it("oy va yil chegarasidan to'g'ri o'tadi", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-03-01", "2026-02-01")).toBe(28);
    expect(diffDays("2026-03-29", "2026-03-28")).toBe(1); // yozgi vaqtga o'tish kunida ham 1 kun
  });
  it("oy qo'shishda oy oxiri saqlanadi", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(shiftMonthKey("2026-11", 3)).toBe("2027-02");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthKey("2026-10-07")).toBe("2026-10");
  });
  it("formatlar bir xil: KK.OO.YYYY, nisbiy kunlar", () => {
    expect(fmtDate("2026-10-07")).toBe("07.10.2026");
    expect(fmtDate(undefined)).toBe("—");
    expect(relDays("2026-10-07", "2026-10-07")).toBe("bugun");
    expect(relDays("2026-10-08", "2026-10-07")).toBe("ertaga");
  });
});

describe("Pul va son formati", () => {
  it("minglar bo'sh joy bilan, so'm qo'shimchasi bilan", () => {
    expect(fmtMoney(15_000_000)).toBe("15 000 000 so'm");
    expect(fmtMoney(999)).toBe("999 so'm");
    expect(fmtMoney(-1_234_567)).toBe("-1 234 567 so'm");
    expect(fmtMoney(1234.5)).toBe("1 235 so'm");
    expect(fmtNum(0)).toBe("0");
  });
  it("hisoblab bo'lmagan qiymat «NaN» bo'lib chiqmaydi", () => {
    expect(fmtMoney(Number.NaN)).toBe("—");
    expect(fmtNum(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
