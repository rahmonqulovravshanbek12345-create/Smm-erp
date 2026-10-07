// Unit testlar uchun yordamchilar: belgilangan sanadagi demo holat va soxta Ctx.
import { buildSeed } from "./seed";
import type { Ctx } from "./store";
import { syncAll } from "./store-sync";
import type { ErpState } from "./types";

export const TODAY = "2026-10-07";

export function demoState(today = TODAY): ErpState {
  const s = buildSeed(today);
  syncAll(s, today);
  return s;
}

export function makeCtx(s: ErpState, userId = "u_boss", today = TODAY) {
  const notes: { to: string[]; text: string }[] = [];
  const logs: string[] = [];
  const me = s.users.find((u) => u.id === userId)!;
  const c: Ctx = {
    s,
    me,
    today,
    notify: (ids, text) => notes.push({ to: ids.filter((x): x is string => Boolean(x) && x !== me.id), text }),
    log: (text) => logs.push(text),
  };
  return { c, notes, logs };
}

/** Obyekt ichidagi har bir son chekli bo'lishi kerak (NaN/Infinity — formuladagi 0 ga bo'lish belgisi). */
export function nonFinite(value: unknown, path = "$", out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(`${path} = ${value}`);
  } else if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    if (value instanceof Map) for (const [k, v] of value) nonFinite(v, `${path}[${String(k)}]`, out, seen);
    else for (const [k, v] of Object.entries(value)) nonFinite(v, `${path}.${k}`, out, seen);
  }
  return out;
}

export function emptyState(today = TODAY): ErpState {
  const s = demoState(today);
  return {
    ...s,
    leads: [],
    projects: [],
    posts: [],
    shoots: [],
    tasks: [],
    targetReports: [],
    reports: [],
    transactions: [],
    invoices: [],
    bills: [],
    accruals: [],
    budget: [],
    proposals: [],
    integrationLog: [],
    notifications: [],
    activity: [],
    accounts: s.accounts.map((a) => ({ ...a, opening: 0 })),
  };
}
