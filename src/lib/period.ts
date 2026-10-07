// Hisob davri: birinchi reklama joylangan sanadan boshlanadi va keyingi oyning shu sanasida yopiladi.
import { addMonths, fmtDate } from "./dates";
import type { Project } from "./types";

export interface Period {
  index: number;
  start: string;
  end: string;
}

export function periodAt(p: Project, index: number): Period | null {
  if (!p.periodStart) return null;
  return { index, start: addMonths(p.periodStart, index), end: addMonths(p.periodStart, index + 1) };
}

export function currentPeriod(p: Project, today: string): Period | null {
  if (!p.periodStart || p.periodStart > today) return null;
  let i = 0;
  while (addMonths(p.periodStart, i + 1) <= today) i++;
  return periodAt(p, i);
}

export function periodLabel(per: Period): string {
  return `${per.index + 1}-davr (${fmtDate(per.start)} – ${fmtDate(per.end)})`;
}
