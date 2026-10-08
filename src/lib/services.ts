// Xizmatlar: oylik (SMM, target, performance) va bir martalik bosqichli (video, branding, sayt).
// Bitta mijozda bir nechta xizmat bo'lishi mumkin; har birining o'z narxi, mas'uli va holati bor.
import { isSettled } from "./money";
import type { ErpState, Invoice, InvoiceLine, Project, ProjectService, Role, ServiceKind, ServiceStage } from "./types";

/** Xizmat ma'lumotlari (loyiha yaratishda yoki keyin qo'shishda). */
export type ServiceInput = Omit<ProjectService, "id" | "status" | "createdAt" | "stages" | "deliveredAt">;

export interface ServiceMeta {
  id: ServiceKind;
  label: string;
  /** Kartalar va jadvallar uchun qisqa nom. */
  short: string;
  billing: "monthly" | "once";
  /** Bir martalik xizmat bosqichlari (shablon). */
  stages: string[];
  /** Bir martalik xizmat ijrochisi qaysi roldan tanlanadi. */
  assigneeRoles: Role[];
  hint: string;
}

export const SERVICE_META: ServiceMeta[] = [
  {
    id: "smm",
    label: "SMM xizmati",
    short: "SMM",
    billing: "monthly",
    stages: [],
    assigneeRoles: ["smm"],
    hint: "Kontent reja, syomka, montaj, dizayn va joylash",
  },
  {
    id: "target",
    label: "Target xizmati",
    short: "Target",
    billing: "monthly",
    stages: [],
    assigneeRoles: ["targetolog"],
    hint: "Meta (Instagram/Facebook) reklamasi: sozlash va kunlik nazorat",
  },
  {
    id: "performance",
    label: "Performance marketing",
    short: "Performance",
    billing: "monthly",
    stages: [],
    assigneeRoles: ["targetolog"],
    hint: "Bir nechta kanal (Meta, Google, Yandex, TikTok), KPI: lidlar soni va lid narxi",
  },
  {
    id: "video",
    label: "Video production",
    short: "Video",
    billing: "once",
    stages: ["Brif", "Ssenariy", "Syomka", "Montaj", "Mijoz tasdig'i", "Topshirish"],
    assigneeRoles: ["montajyor", "syomka"],
    hint: "Rolik yoki syomka kuni bo'yicha buyurtma",
  },
  {
    id: "branding",
    label: "Branding",
    short: "Branding",
    billing: "once",
    stages: ["Brif va tadqiqot", "Konsepsiya (2–3 variant)", "Tanlov va tuzatishlar", "Logo va fayllar", "Brendbuk", "Topshirish"],
    assigneeRoles: ["dizayner"],
    hint: "Logo, firma uslubi, brendbuk",
  },
  {
    id: "web",
    label: "Sayt qilish",
    short: "Sayt",
    billing: "once",
    stages: ["Brif va TZ", "Struktura / prototip", "Dizayn", "Dasturlash", "Kontent va test", "Ishga tushirish", "Topshirish (akt)"],
    assigneeRoles: ["webdev"],
    hint: "Landing, korporativ sayt yoki internet-do'kon",
  },
];

export const SERVICE_KINDS = SERVICE_META.map((m) => m.id);
export const serviceMeta = (k: ServiceKind) => SERVICE_META.find((m) => m.id === k)!;
export const serviceLabel = (k: ServiceKind) => serviceMeta(k).label;
export const isRecurring = (k: ServiceKind) => serviceMeta(k).billing === "monthly";

/** Lid qiziqqan xizmat matni → xizmat turi. */
export function serviceKindOf(label?: string): ServiceKind {
  return SERVICE_META.find((m) => m.label === label)?.id ?? "smm";
}

export const AD_CHANNELS = [
  { id: "meta", label: "Meta (Instagram/Facebook)" },
  { id: "google", label: "Google Ads" },
  { id: "yandex", label: "Yandex Direct" },
  { id: "tiktok", label: "TikTok Ads" },
] as const;

export const stagesFor = (k: ServiceKind): ServiceStage[] => serviceMeta(k).stages.map((name) => ({ name }));

/** Faol (bekor qilinmagan) xizmatlar. Eski ma'lumotda xizmatlar yo'q bo'lsa — SMM deb qaraladi. */
export function servicesOf(p: Project): ProjectService[] {
  return (p.services ?? []).filter((x) => x.status !== "cancelled");
}

export const hasService = (p: Project, k: ServiceKind) => servicesOf(p).some((x) => x.kind === k);
/** Xizmat reklama ishini o'z ichiga oladimi (target, performance yoki target kiritilgan SMM paketi). */
export const serviceHasAds = (x: Pick<ProjectService, "kind" | "withTarget">) =>
  x.kind === "target" || x.kind === "performance" || (x.kind === "smm" && Boolean(x.withTarget));
/** Kontent reja kerakmi (SMM xizmati bor). */
export const hasContent = (p: Project) => !p.services?.length || hasService(p, "smm");
/** Reklama ishi bormi (target yoki performance). */
export const hasAds = (p: Project) => servicesOf(p).some((x) => x.status === "active" && serviceHasAds(x)) || (!p.services?.length && Boolean(p.targetologId));
export const recurringServices = (p: Project) => servicesOf(p).filter((x) => isRecurring(x.kind) && x.status === "active");
export const oneTimeServices = (p: Project) => servicesOf(p).filter((x) => !isRecurring(x.kind));
/** Oylik xizmati bor loyiha — hisob davri, abonent fakturasi va loyiha oyligi shu loyihalar uchun. */
export const hasRecurring = (p: Project) => !p.services?.length || recurringServices(p).length > 0;

/** Performance: reklama byudjetidan foiz qismi (so'm). */
export function adPctAmount(svc: ProjectService, p: Project, usdRate: number): number {
  if (svc.kind !== "performance" || !svc.adPct || !p.adBudgetUsd) return 0;
  return Math.round((p.adBudgetUsd * usdRate * svc.adPct) / 100 / 1000) * 1000;
}

/** Oylik faktura qatorlari: har oylik xizmat va performance foizi alohida qator. */
export function recurringLines(p: Project, usdRate: number): InvoiceLine[] {
  if (!p.services?.length) return p.monthlyFee > 0 ? [{ kind: "smm", title: `SMM xizmati (${p.tariff})`, amount: p.monthlyFee }] : [];
  const out: InvoiceLine[] = [];
  for (const svc of recurringServices(p)) {
    out.push({ kind: svc.kind, title: `${serviceLabel(svc.kind)}${svc.title ? ` — ${svc.title}` : ""}`, amount: svc.price });
    const pct = adPctAmount(svc, p, usdRate);
    if (pct) out.push({ kind: svc.kind, title: `Performance: reklama byudjetidan ${svc.adPct}%`, amount: pct });
  }
  return out;
}

export const recurringFee = (p: Project, usdRate: number) => recurringLines(p, usdRate).reduce((a, l) => a + l.amount, 0);

/** Kartada ko'rsatiladigan qisqa tavsif: «SMM: Biznes · Target · Sayt». */
export function servicesSummary(services: ProjectService[]): string {
  const act = services.filter((x) => x.status !== "cancelled");
  if (!act.length) return "—";
  return act.map((x) => (x.kind === "smm" && x.title ? `SMM: ${x.title}` : serviceMeta(x.kind).short)).join(" · ");
}

/** Joriy bosqich indeksi (hammasi bajarilgan bo'lsa — bosqichlar soni). */
export function stageIndex(svc: ProjectService): number {
  const st = svc.stages ?? [];
  const i = st.findIndex((x) => !x.doneAt);
  return i < 0 ? st.length : i;
}

export const serviceOf = (s: ErpState, id?: string): { project: Project; service: ProjectService } | null => {
  if (!id) return null;
  for (const project of s.projects) {
    const service = project.services?.find((x) => x.id === id);
    if (service) return { project, service };
  }
  return null;
};

/** Faktura qatorlari: saqlangan bo'lsa — o'zi; bir martalik xizmat — shu xizmat; eski oylik faktura — SMM. */
export function invoiceLines(s: ErpState, inv: Invoice): InvoiceLine[] {
  if (inv.lines?.length) return inv.lines;
  const svc = serviceOf(s, inv.serviceId);
  if (svc) return [{ kind: svc.service.kind, title: serviceLabel(svc.service.kind), amount: inv.amount }];
  return [{ kind: "smm", title: "SMM xizmati", amount: inv.amount }];
}

/** Bir martalik xizmat bo'yicha oldindan to'lov kelganmi (faktura bo'lmasa — ha). */
export function servicePrepayPaid(s: ErpState, serviceId: string, paidOf: (inv: Invoice) => number): boolean {
  const pre = s.invoices.find((i) => i.serviceId === serviceId && i.kind === "prepay");
  return !pre || isSettled(pre.amount, paidOf(pre));
}

/** Xizmat ijrochisi (bir martalik — o'zi; oylik — loyiha jamoasidan). */
export function serviceOwner(p: Project, svc: ProjectService): string | undefined {
  if (svc.kind === "smm") return p.smmId || undefined;
  if (svc.kind === "target" || svc.kind === "performance") return p.targetologId;
  return svc.assigneeId;
}
