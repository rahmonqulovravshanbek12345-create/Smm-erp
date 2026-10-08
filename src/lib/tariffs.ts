// Tariflar katalogi va tijorat takliflari: narx, chegirma, raqamlash, holat va agentlik ko'rsatkichlari.
import { addDays } from "./dates";
import { PLATFORM_LABELS } from "./labels";
import { isRecurring, serviceLabel, type ServiceInput } from "./services";
import type { ErpState, Lead, Project, Proposal, ProposalStatus, ServiceKind, Tariff } from "./types";

export const DEFAULT_TARIFFS: Tariff[] = [
  {
    id: "t_start",
    service: "smm",
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
    service: "smm",
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
    service: "smm",
    name: "Premium",
    tagline: "Bozorda yetakchi bo'lish uchun: to'liq marketing jamoasi sizda",
    price: 18_000_000,
    posts: 28,
    videos: 10,
    designs: 14,
    texts: 4,
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

/** Boshqa xizmatlar paketlari (SMM'dan tashqari). Narxlar — namuna, «Tariflar» bo'limida o'zgartiriladi. */
const pack = (id: string, service: ServiceKind, name: string, tagline: string, price: number, features: string[], extra: Partial<Tariff> = {}): Tariff => ({
  id,
  service,
  name,
  tagline,
  price,
  posts: 0,
  videos: 0,
  designs: 0,
  stories: 0,
  shoots: 0,
  platforms: [],
  target: service === "target" || service === "performance",
  adBudgetUsd: 0,
  prepayType: isRecurring(service) ? 100 : 50,
  features,
  active: true,
  ...extra,
});

export const SERVICE_TARIFFS: Tariff[] = [
  pack(
    "t_target",
    "target",
    "Target",
    "Meta (Instagram/Facebook) reklamasi: sozlash, nazorat va kunlik hisobot",
    4_000_000,
    ["Auditoriya va kreativlar tahlili", "Meta Ads kampaniyalarini sozlash", "Kunlik nazorat va optimizatsiya", "Kunlik target hisoboti"],
    { adBudgetUsd: 300 },
  ),
  pack(
    "t_performance",
    "performance",
    "Performance",
    "Bir nechta kanalda natija uchun ishlash: lid soni va lid narxi bo'yicha KPI",
    6_000_000,
    ["Meta, Google, Yandex, TikTok reklamasi", "Pixel, analytics va CRM'ga ulash", "Oylik KPI: lidlar soni va lid narxi", "Haftalik optimizatsiya va hisobot"],
    { adBudgetUsd: 1000, adPct: 10 },
  ),
  pack("t_video_1", "video", "Bitta rolik", "Reklama yoki imij uchun bitta professional rolik", 1_500_000, [
    "Ssenariy",
    "Yarim kunlik syomka",
    "Montaj, rang, subtitr",
    "2 marta tuzatish",
  ]),
  pack("t_video_day", "video", "Syomka kuni", "Bir kunda 4–6 ta rolik: kontent zaxirasi uchun", 3_000_000, [
    "4–6 ta ssenariy",
    "To'liq kunlik syomka",
    "Montaj va subtitr",
    "Har rolikka 1 marta tuzatish",
  ]),
  pack("t_brand_logo", "branding", "Logo", "Yangi biznes uchun logotip", 5_000_000, [
    "Brif va raqobatchilar tahlili",
    "3 ta konsepsiya",
    "2 marta tuzatish",
    "Logo fayllari (SVG, PNG, PDF)",
  ]),
  pack("t_brand_style", "branding", "Firma uslubi", "Logo + ranglar, shriftlar va asosiy maketlar", 10_000_000, [
    "Logo",
    "Ranglar va shriftlar",
    "Vizitka, blank, ijtimoiy tarmoq shablonlari",
    "Qisqa qo'llanma",
  ]),
  pack("t_brand_book", "branding", "To'liq brendbuk", "Brendning to'liq vizual tizimi va qo'llanmasi", 20_000_000, [
    "Firma uslubi",
    "Brend platformasi va ovozi",
    "To'liq brendbuk (40+ sahifa)",
    "Qadoq va tashqi reklama maketlari",
  ]),
  pack("t_web_landing", "web", "Landing", "Bitta sahifali sotuv sayti", 6_000_000, [
    "1 sahifa, mobil moslashuv",
    "Ariza formasi → CRM",
    "Domen va hostingga joylash",
    "2 hafta",
  ]),
  pack("t_web_corp", "web", "Korporativ sayt", "Kompaniya sayti, 5–10 sahifa", 15_000_000, [
    "Dizayn + dasturlash",
    "2 til (uz/ru)",
    "Admin panel",
    "4 hafta, 1 oy bepul tuzatish",
  ]),
  pack("t_web_shop", "web", "Internet-do'kon", "Katalog, savat va onlayn to'lov", 30_000_000, [
    "Katalog va savat",
    "Click / Payme ulash",
    "Admin panel",
    "6–8 hafta",
  ]),
];

/** Tarif qaysi xizmatga tegishli (eski ma'lumotda — SMM). */
export const tariffService = (t: Tariff): ServiceKind => t.service ?? "smm";

/** Barcha tariflardagi imkoniyatlar ro'yxati — taqqoslash jadvali uchun. */
export function allFeatures(tariffs: Tariff[]): string[] {
  const out: string[] = [];
  for (const t of tariffs) for (const f of t.features) if (!out.includes(f)) out.push(f);
  return out;
}

export const tariffOf = (s: ErpState, id?: string) => (id ? s.tariffs.find((t) => t.id === id) : undefined);

/** Loyiha kartasiga yoziladigan nom: «Biznes (Instagram + target)». */
export function tariffLabel(t: Tariff): string {
  if (tariffService(t) !== "smm") return t.name;
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
  const value = (p: Proposal) => proposalValue(s, p);
  const accepted = list.filter((p) => p.status === "accepted");
  const rejected = list.filter((p) => p.status === "rejected");
  const open = list.filter((p) => proposalView(p, today) === "sent");
  const decided = accepted.length + rejected.length;
  const byTariff = new Map<string, number>();
  for (const p of accepted) for (const tid of acceptedIds(p)) byTariff.set(tid, (byTariff.get(tid) ?? 0) + 1);
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

/** Har paket nechta loyihada va qancha tushum beradi (oylik — oyiga, bir martalik — jami). */
export function tariffUsage(s: ErpState): Map<string, { projects: Project[]; mrr: number }> {
  const m = new Map<string, { projects: Project[]; mrr: number }>();
  for (const p of s.projects) {
    if (p.status !== "active") continue;
    for (const svc of p.services ?? []) {
      if (svc.status === "cancelled") continue;
      const key = svc.tariffId ?? `custom:${svc.kind}`;
      const e = m.get(key) ?? { projects: [], mrr: 0 };
      if (!e.projects.includes(p)) e.projects.push(p);
      e.mrr += svc.price;
      m.set(key, e);
    }
  }
  return m;
}

/** Qabul qilingan paketlar (har xizmatdan bittadan). */
export const acceptedIds = (p: Proposal): string[] => p.acceptedTariffIds ?? (p.acceptedTariffId ? [p.acceptedTariffId] : []);

/** Taklif qiymati: qabul qilinganlar yig'indisi yoki har xizmatdan tavsiya etilgan/birinchi paket. */
export function proposalValue(s: ErpState, p: Proposal): number {
  const ids = p.status === "accepted" ? acceptedIds(p) : defaultPicks(s, p);
  return ids.reduce((a, id) => {
    const t = tariffOf(s, id);
    return a + (t ? proposalPrice(p, t) : 0);
  }, 0);
}

/** Taklifdagi paketlar xizmatlar bo'yicha guruhlangan. */
export function proposalGroups(s: ErpState, p: Pick<Proposal, "tariffIds">): { kind: ServiceKind; label: string; tariffs: Tariff[] }[] {
  const out: { kind: ServiceKind; label: string; tariffs: Tariff[] }[] = [];
  for (const id of p.tariffIds) {
    const t = tariffOf(s, id);
    if (!t) continue;
    const kind = tariffService(t);
    let g = out.find((x) => x.kind === kind);
    if (!g) out.push((g = { kind, label: serviceLabel(kind), tariffs: [] }));
    g.tariffs.push(t);
  }
  return out;
}

/** Har xizmatdan bitta paket: tavsiya etilgani yoki birinchisi. */
export function defaultPicks(s: ErpState, p: Pick<Proposal, "tariffIds" | "recommendedId">): string[] {
  return proposalGroups(s, p).map((g) => (g.tariffs.some((t) => t.id === p.recommendedId) ? p.recommendedId : g.tariffs[0]!.id));
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

/** Natijalar: birinchi oy va oxirgi oy taqqoslanadi (lid narxi, oylik lidlar); faqat yaxshilanganlari. */
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
  // Taklifda faqat natija yaxshilangan holatlar ko'rsatiladi (lid narxi pasaygan)
  return out
    .filter((c) => c.cplTo < c.cplFrom)
    .sort((a, b) => b.leadsPerMonth - a.leadsPerMonth)
    .slice(0, limit);
}

/** Taklif matnining standart boshlanishi. */
export function defaultProposalNote(lead: Lead, company: string): string {
  const what: Partial<Record<ServiceKind, string>> = {
    smm: "ijtimoiy tarmoqlarni to'liq yuritish va reklama orqali mijoz oqimini oshirishni",
    target: "Meta reklamasi orqali mijoz oqimini oshirishni",
    performance: "bir nechta reklama kanalida natija (lid soni va lid narxi) uchun ishlashni",
    video: "professional video ishlab chiqarishni",
    branding: "brendingiz uchun yangi vizual uslub yaratishni",
    web: "biznesingiz uchun zamonaviy sayt yaratishni",
  };
  const kind = (["smm", "target", "performance", "video", "branding", "web"] as ServiceKind[]).find((k) => serviceLabel(k) === lead.service) ?? "smm";
  return `Hurmatli ${lead.name} jamoasi! Uchrashuvda muhokama qilinganidek, ${company} sizga ${what[kind]} taklif qiladi. Quyida paketlar va har birining tarkibi keltirilgan — biz sizga belgilangan paketni tavsiya qilamiz.`;
}

/** Katalog paketidan xizmat ma'lumoti (narx — chegirma bilan). */
export function serviceFromTariff(t: Tariff, price = t.price): ServiceInput {
  const kind = tariffService(t);
  return {
    kind,
    tariffId: t.id,
    title: t.name,
    price,
    adPct: kind === "performance" ? t.adPct : undefined,
    prepayPct: isRecurring(kind) ? undefined : t.prepayType,
  };
}

/** Qabul qilingan taklifdagi paketlar → shartnomaga xizmatlar. */
export function servicesFromProposal(s: ErpState, p: Proposal): ServiceInput[] {
  return acceptedIds(p)
    .map((id) => tariffOf(s, id))
    .filter((t): t is Tariff => Boolean(t))
    .map((t) => serviceFromTariff(t, proposalPrice(p, t)));
}
