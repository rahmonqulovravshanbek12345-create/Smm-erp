// Sahifa manzili → u qaysi modulga tegishli (App.tsx dagi marshrutlarga mos). Bildirishnoma havolasi
// oluvchi uchun ochiladigan sahifaga olib borishini tekshirish uchun.
import { access, type Module } from "./permissions";
import type { Role } from "./types";

const EXACT: Record<string, Module> = {
  "/": "dashboard",
  "/takliflar": "crm",
  "/crm/analitika": "crm",
  "/crm": "crm",
  "/hujjatlar": "projects",
  "/mening": "myday",
  "/hisobim": "myaccount",
  "/jarayon": "process",
  "/moliya": "finance",
  "/moliya/kirim-chiqim": "finance",
  "/moliya/fakturalar": "finance",
  "/moliya/pnl": "finance",
  "/moliya/cashflow": "finance",
  "/moliya/debitor": "finance",
  "/moliya/akt": "finance",
  "/moliya/kalendar": "finance",
  "/moliya/ish-haqi": "payroll",
  "/moliya/reja": "finance",
  "/loyihalar": "projects",
  "/kontent": "content",
  "/tasdiqlash": "approvals",
  "/syomka": "shoots",
  "/montaj": "montaj",
  "/dizayn": "dizayn",
  "/target": "target",
  "/bildirishnomalar": "notifications",
  "/tarix": "activity",
  "/admin": "admin",
  "/integratsiyalar": "integrations",
};
const PREFIX: [string, Module][] = [
  ["/loyiha/", "projects"],
  ["/hujjat/", "projects"],
  ["/hisobot/", "projects"],
  ["/taklif/", "crm"],
];

/** Manzil mavjud sahifaga tegishli bo'lsa — uning moduli, aks holda null. */
export function moduleOfPath(href: string): Module | null {
  const path = href.split("?")[0]!;
  if (EXACT[path]) return EXACT[path]!;
  return PREFIX.find(([p]) => path.startsWith(p))?.[1] ?? null;
}

/** Rol shu manzilni ocha oladimi (ochilmasa, ilova jimgina bosh sahifaga o'tkazadi). */
export const canOpen = (role: Role, href: string): boolean => {
  const m = moduleOfPath(href);
  return m !== null && access(role, m) !== "none";
};

/** Bildirishnomaga yoziladigan havola: oluvchi ocha oladigan bo'lsagina saqlanadi. */
export const linkFor = (role: Role | undefined, href?: string): string | undefined => (href && role && canOpen(role, href) ? href : undefined);
