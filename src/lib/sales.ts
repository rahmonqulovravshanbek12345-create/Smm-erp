// Sotuv analitikasi: voronka, manbalar, operatorlar, rad sabablari, CAC va LTV.
import { diffDays, monthKey, shiftMonthKey } from "./dates";
import { ART, pnl, signedUZS } from "./finance";
import type { ErpState, Lead, User } from "./types";

export const FUNNEL = [
  { step: 0, label: "Lid keldi" },
  { step: 1, label: "Bog'lanildi" },
  { step: 2, label: "Uchrashuv belgilandi" },
  { step: 3, label: "Ofisga keldi" },
  { step: 4, label: "Shartnoma" },
];

export interface GroupRow {
  key: string;
  label: string;
  leads: number;
  contacted: number;
  meetings: number;
  contracts: number;
  lowquality: number;
  conv: number;
  mrr: number;
}

const created = (l: Lead) => l.createdAt.slice(0, 10);

export function salesAnalytics(s: ErpState, months: string[], today: string) {
  const from = `${months[0]}-01`;
  const to = `${shiftMonthKey(months[months.length - 1]!, 1)}-01`;
  const leads = s.leads.filter((l) => created(l) >= from && created(l) < to);
  const step = (l: Lead) => l.maxStep ?? 0;
  const funnel = FUNNEL.map((f) => ({ ...f, count: leads.filter((l) => step(l) >= f.step).length }));
  const contracts = leads.filter((l) => l.stage === "contract" || step(l) >= 4);
  const projectOf = (l: Lead) => s.projects.find((p) => p.id === l.projectId);

  const group = (keyOf: (l: Lead) => string, labelOf: (k: string) => string): GroupRow[] => {
    const map = new Map<string, Lead[]>();
    for (const l of leads) map.set(keyOf(l), [...(map.get(keyOf(l)) ?? []), l]);
    return [...map.entries()]
      .map(([key, ls]) => {
        const c = ls.filter((l) => step(l) >= 4);
        return {
          key,
          label: labelOf(key),
          leads: ls.length,
          contacted: ls.filter((l) => step(l) >= 1).length,
          meetings: ls.filter((l) => step(l) >= 2).length,
          contracts: c.length,
          lowquality: ls.filter((l) => l.stage === "lowquality").length,
          conv: ls.length ? (c.length / ls.length) * 100 : 0,
          mrr: c.reduce((a, l) => a + (projectOf(l)?.monthlyFee ?? 0), 0),
        };
      })
      .sort((a, b) => b.leads - a.leads);
  };
  const userName = (id: string) => s.users.find((u: User) => u.id === id)?.name ?? "—";
  const bySource = group((l) => l.source, (k) => k);
  const byOperator = group((l) => l.operatorId, userName).map((r) => ({
    ...r,
    bonus: s.accruals.filter((a) => a.userId === r.key && a.kind === "bonus" && a.date >= from && a.date < to).reduce((x, a) => x + a.amount, 0),
  }));

  const reasons = (stage: "unfit" | "lowquality") => {
    const m = new Map<string, number>();
    for (const l of leads) if (l.stage === stage) m.set(l.rejectReason ?? "Sabab ko'rsatilmagan", (m.get(l.rejectReason ?? "Sabab ko'rsatilmagan") ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  // Oylar bo'yicha: yangi lidlar va tuzilgan shartnomalar (shartnoma sanasi bo'yicha)
  const monthly = months.map((m) => ({
    month: m,
    leads: s.leads.filter((l) => monthKey(created(l)) === m).length,
    contracts: s.projects.filter((p) => monthKey(p.contractDate) === m).length,
  }));

  // Lid → shartnoma, o'rtacha kun
  const cycles = contracts.flatMap((l) => {
    const p = projectOf(l);
    return p ? [Math.max(0, diffDays(p.contractDate, created(l)))] : [];
  });
  const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 0;

  // Mijoz jalb qilish narxi
  const marketing = -s.transactions
    .filter((t) => t.articleId === ART.marketing && t.date >= from && t.date < to)
    .reduce((a, t) => a + signedUZS(s, t), 0);
  const operatorCost = s.accruals
    .filter((a) => a.date >= from && a.date < to && s.users.find((u) => u.id === a.userId)?.role === "operator")
    .reduce((x, a) => x + a.amount, 0);
  const newClients = s.projects.filter((p) => p.contractDate >= from && p.contractDate < to).length;
  const cacAds = newClients ? marketing / newClients : 0;
  const cacFull = newClients ? (marketing + operatorCost) / newClients : 0;

  // LTV = o'rtacha oylik to'lov × yalpi marja × o'rtacha hamkorlik muddati (hozirgacha, konservativ)
  const withPeriod = s.projects.filter((p) => p.periodStart && p.periodStart <= today);
  const arpa = withPeriod.length ? withPeriod.reduce((a, p) => a + p.monthlyFee, 0) / withPeriod.length : 0;
  const lifetimes = withPeriod.map((p) => diffDays(p.status === "closed" && p.closedAt ? p.closedAt : today, p.periodStart!) / 30.4);
  const avgLife = lifetimes.length ? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length : 0;
  const pl = pnl(s, months, today);
  const grossPct = pl.sum.revenue ? pl.sum.gross / pl.sum.revenue : 0;
  const ltv = arpa * grossPct * avgLife;

  return {
    leads,
    funnel,
    contracts: contracts.length,
    conv: leads.length ? (contracts.length / leads.length) * 100 : 0,
    qualified: leads.filter((l) => l.stage !== "lowquality").length,
    bySource,
    byOperator,
    unfit: reasons("unfit"),
    lowquality: reasons("lowquality"),
    monthly,
    avgCycle,
    marketing,
    operatorCost,
    newClients,
    cacAds,
    cacFull,
    arpa,
    avgLife,
    grossPct,
    ltv,
  };
}

