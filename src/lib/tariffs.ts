// Tariflar katalogi va tijorat takliflari: narx, chegirma, raqamlash, holat va agentlik ko'rsatkichlari.
import { addDays } from "./dates";
import { PLATFORM_LABELS } from "./labels";
import type { ErpState, Lead, Project, Proposal, ProposalStatus, Tariff } from "./types";

export const DEFAULT_TARIFFS: Tariff[] = [
  {
    id: "t_start",
    name: "Start",
    tagline: "Endi boshlayotgan biznes uchun: Instagram'da muntazam, chiroyli sahifa",
    price: 8_000_000,
    posts: 12,
    videos: 4,
    designs: 8,
    stories: 15,
    shoots: 1,
    platforms: ["instagram"],
    target: false,
    adBudgetUsd: 0,
    prepayType: 50,
    features: ["Brif va kontent strategiya", "Kontent reja va mijoz tasdig'i", "Ssenariy, montaj va dizayn", "Oylik natijalar hisoboti"],
    active: true,
  },
  {
    id: "t_biznes",
    name: "Biznes",
    tagline: "Sotuvni oshirmoqchi bo'lganlar uchun: kontent + Meta Ads target",
    price: 12_000_000,
    posts: 15,
    videos: 6,
    designs: 9,
    stories: 20,
    shoots: 2,
    platforms: ["instagram"],
    target: true,
    adBudgetUsd: 400,
    prepayType: 50,
    features: [
      "Brif va kontent strategiya",
      "Kontent reja va mijoz tasdig'i",
      "Ssenariy, montaj va dizayn",
      "Konkurentlar tahlili",
      "Meta Ads: sozlash va kunlik nazorat",
      "Kunlik target hisoboti",
      "Oylik natijalar hisoboti",
    ],
    active: true,
  },
  {
    id: "t_premium",
    name: "Premium",
    tagline: "Bozorda yetakchi bo'lish uchun: to'liq marketing jamoasi sizda",
    price: 18_000_000,
    posts: 24,
    videos: 10,
    designs: 14,
    stories: 30,
    shoots: 4,
    platforms: ["instagram", "telegram"],
    target: true,
    adBudgetUsd: 1000,
    prepayType: 100,
    features: [
      "Brif va kontent strategiya",
      "Kontent reja va mijoz tasdig'i",
      "Ssenariy, montaj va dizayn",
      "Konkurentlar tahlili",
      "Meta Ads: sozlash va kunlik nazorat",
      "Kunlik target hisoboti",
      "Oylik natijalar hisoboti",
      "Telegram kanal yuritish",
      "Retarget va look-alike kampaniyalar",
      "Har oy strategik sessiya",
    ],
    active: true,
  },
];

/** Barcha tariflardagi imkoniyatlar ro'yxati — taqqoslash jadvali uchun. */
export function allFeatures(tariffs: Tariff[]): string[] {
  const out: string[] = [];
  for (const t of tariffs) for (const f of t.features) if (!out.includes(f)) out.push(f);
  return out;
}

export const tariffOf = (s: ErpState, id?: string) => (id ? s.tariffs.find((t) => t.id === id) : undefined);

/** Loyiha kartasiga yoziladigan nom: «Biznes (Instagram + target)». */
export function tariffLabel(t: Tariff): string {
  const parts = t.platforms.map((p) => PLATFORM_LABELS[p]);
  if (t.target) parts.push("target");
  return `${t.name} (${parts.join(" + ")})`;
}

const roundK = (n: number) => Math.round(n / 1000) * 1000;
export const discounted = (price: number, pct: number) => roundK(price * (1 - pct / 100));
export const proposalPrice = (p: Proposal, t: Tariff) => discounted(t.price, p.discountPct);

export function nextProposalNumber(s: ErpState, date: string): string {
  const year = date.slice(0, 4);
  const n = s.proposals.filter((p) => p.number.startsWith(`TK-${year}/`)).length;
  return `TK-${year}/${String(n + 1).padStart(3, "0")}`;
}

export type ProposalView = ProposalStatus | "expired";

/** Yuborilgan, lekin amal qilish muddati o'tgan taklif — «Muddati o'tdi». */
export function proposalView(p: Proposal, today: string): ProposalView {
  return p.status === "sent" && p.validUntil < today ? "expired" : p.status;
}

export const PROPOSAL_STATUS: Record<ProposalView, { label: string; tone: "gray" | "blue" | "green" | "red" | "amber" }> = {
  draft: { label: "Qoralama", tone: "gray" },
  sent: { label: "Yuborildi", tone: "blue" },
  accepted: { label: "Qabul qilindi", tone: "green" },
  rejected: { label: "Rad etildi", tone: "red" },
  expired: { label: "Muddati o'tdi", tone: "amber" },
};

export function acceptedProposalOf(s: ErpState, leadId: string): Proposal | undefined {
  return s.proposals.filter((p) => p.leadId === leadId && p.status === "accepted").sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Takliflar voronkasi: yuborilgan → qabul qilingan, o'rtacha summa, ochiq takliflar qiymati. */
export function proposalStats(s: ErpState, today: string, since: string) {
  const list = s.proposals.filter((p) => p.date >= since && p.status !== "draft");
  const value = (p: Proposal) => {
    const t = tariffOf(s, p.acceptedTariffId ?? p.recommendedId);
    return t ? proposalPrice(p, t) : 0;
  };
  const accepted = list.filter((p) => p.status === "accepted");
  const rejected = list.filter((p) => p.status === "rejected");
  const open = list.filter((p) => proposalView(p, today) === "sent");
  const decided = accepted.length + rejected.length;
  const byTariff = new Map<string, number>();
  for (const p of accepted) if (p.acceptedTariffId) byTariff.set(p.acceptedTariffId, (byTariff.get(p.acceptedTariffId) ?? 0) + 1);
  return {
    sent: list.length,
    accepted: accepted.length,
    rejected: rejected.length,
    open: open.length,
    expired: list.filter((p) => proposalView(p, today) === "expired").length,
    winRate: decided ? accepted.length / decided : 0,
    avgAccepted: accepted.length ? accepted.reduce((a, p) => a + value(p), 0) / accepted.length : 0,
    openValue: open.reduce((a, p) => a + value(p), 0),
    byTariff,
  };
}

/** Har tarif nechta loyihada va qancha oylik tushum beradi. */
export function tariffUsage(s: ErpState): Map<string, { projects: Project[]; mrr: number }> {
  const m = new Map<string, { projects: Project[]; mrr: number }>();
  for (const p of s.projects) {
    if (p.status !== "active") continue;
    const key = p.tariffId ?? "custom";
    const e = m.get(key) ?? { projects: [], mrr: 0 };
    e.projects.push(p);
    e.mrr += p.monthlyFee;
    m.set(key, e);
  }
  return m;
}

/** Taklif sahifasidagi «biz haqimizda» raqamlari — ERP ma'lumotlaridan. */
export function agencyStats(s: ErpState, today: string) {
  const since = addDays(today, -182);
  const tr = s.targetReports.filter((r) => r.date >= since && r.date < today);
  const spend = tr.reduce((a, r) => a + r.spend, 0);
  const leads = tr.reduce((a, r) => a + r.leads, 0);
  return {
    clients: s.projects.filter((p) => p.status === "active").length,
    posts: s.posts.filter((p) => p.status === "published" && (p.publishedAt ?? p.date) >= since).length,
    leads,
    cpl: leads ? spend / leads : 0,
    team: s.users.filter((u) => u.active && u.role !== "admin").length,
  };
}

/** Natijalar: birinchi oy va oxirgi oy taqqoslanadi (lid narxi, oylik lidlar). */
export function caseStudies(s: ErpState, today: string, limit = 3) {
  const out: { project: Project; leadsPerMonth: number; cplFrom: number; cplTo: number; months: number }[] = [];
  for (const p of s.projects) {
    if (!p.periodStart) continue;
    const tr = s.targetReports.filter((r) => r.projectId === p.id && r.date < today).sort((a, b) => a.date.localeCompare(b.date));
    if (tr.length < 45) continue;
    const sum = (rows: typeof tr) => ({ spend: rows.reduce((a, r) => a + r.spend, 0), leads: rows.reduce((a, r) => a + r.leads, 0) });
    const first = sum(tr.slice(0, 30));
    const last = sum(tr.slice(-30));
    if (!first.leads || !last.leads) continue;
    out.push({
      project: p,
      leadsPerMonth: last.leads,
      cplFrom: first.spend / first.leads,
      cplTo: last.spend / last.leads,
      months: Math.max(1, Math.round(tr.length / 30)),
    });
  }
  return out.sort((a, b) => b.leadsPerMonth - a.leadsPerMonth).slice(0, limit);
}

/** Taklif matnining standart boshlanishi. */
export function defaultProposalNote(lead: Lead, company: string): string {
  return `Hurmatli ${lead.name} jamoasi! Uchrashuvda muhokama qilinganidek, ${company} sizning biznesingiz uchun ijtimoiy tarmoqlarni to'liq yuritish va reklama orqali mijoz oqimini oshirishni taklif qiladi. Quyida uchta paket va har birining tarkibi keltirilgan — biz sizga belgilangan paketni tavsiya qilamiz.`;
}
