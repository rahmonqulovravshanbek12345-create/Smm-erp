// Huquqlar matritsasi (TZ, 7-bo'lim). Admin barcha modullarga to'liq kiradi.
import type { ErpState, Project, Role, User } from "./types";

export type Module =
  | "dashboard"
  | "crm"
  | "projects"
  | "marketing"
  | "content"
  | "approvals"
  | "shoots"
  | "montaj"
  | "dizayn"
  | "target"
  | "finance"
  | "notifications"
  | "activity"
  | "admin"
  | "myday"
  | "myaccount"
  | "process"
  | "payroll"
  | "integrations";

/**
 * none — ko'rinmaydi; own — faqat o'ziga tegishli; view — ko'rish;
 * approve — ko'rish va tasdiqlash; edit — ko'rish va tahrir; full — to'liq.
 */
export type Access = "none" | "own" | "view" | "approve" | "edit" | "full";

const MATRIX: Record<Module, Partial<Record<Role, Access>>> = {
  dashboard: { marketolog: "full" },
  crm: { operator: "full", marketolog: "edit" },
  projects: { marketolog: "full", smm: "view", targetolog: "view", moliya: "view" },
  marketing: { marketolog: "full", smm: "view", targetolog: "view" },
  content: {
    marketolog: "approve",
    smm: "full",
    targetolog: "view",
    syomka: "view",
    montajyor: "own",
    dizayner: "own",
  },
  approvals: { marketolog: "full" },
  shoots: { smm: "full", syomka: "own", marketolog: "view" },
  montaj: { smm: "full", montajyor: "own", marketolog: "view" },
  dizayn: { smm: "full", dizayner: "own", marketolog: "view" },
  target: { smm: "full", targetolog: "own", marketolog: "view" },
  finance: { marketolog: "view", moliya: "full" },
  notifications: {
    operator: "own",
    marketolog: "own",
    smm: "own",
    targetolog: "own",
    syomka: "own",
    montajyor: "own",
    dizayner: "own",
    webdev: "own",
    moliya: "own",
  },
  activity: { marketolog: "view" },
  admin: {},
  myday: { operator: "own", marketolog: "own", smm: "own", targetolog: "own", syomka: "own", montajyor: "own", dizayner: "own", webdev: "own", moliya: "own" },
  myaccount: {
    operator: "own",
    marketolog: "own",
    smm: "own",
    targetolog: "own",
    syomka: "own",
    montajyor: "own",
    dizayner: "own",
    webdev: "own",
    moliya: "own",
  },
  process: {
    operator: "view",
    marketolog: "view",
    smm: "view",
    targetolog: "view",
    syomka: "view",
    montajyor: "view",
    dizayner: "view",
    webdev: "view",
    moliya: "view",
  },
  payroll: { moliya: "full", marketolog: "view" },
  integrations: { marketolog: "view", targetolog: "view", moliya: "view" },
};

export function access(role: Role, mod: Module): Access {
  if (role === "admin") return mod === "myday" || mod === "myaccount" ? "none" : "full";
  // Rahbar hamma narsani ko'radi va boshqaradi (tizim sozlamalaridan tashqari).
  if (role === "rahbar") return mod === "admin" || mod === "myday" || mod === "myaccount" ? "none" : "full";
  return MATRIX[mod][role] ?? "none";
}

export const canView = (role: Role, mod: Module) => access(role, mod) !== "none";
export const canEdit = (role: Role, mod: Module) => {
  const a = access(role, mod);
  return a === "edit" || a === "full";
};

/** Moliya loyiha kartasining moliya qismini to'liq tahrirlaydi. */
export const canEditFinance = (role: Role) => role === "admin" || role === "moliya" || role === "rahbar";

/** Matritsa jadvalini ko'rsatish uchun (Admin sahifasi). */
export const MATRIX_VIEW: { module: Module; label: string }[] = [
  { module: "crm", label: "CRM" },
  { module: "projects", label: "Loyiha kartasi" },
  { module: "marketing", label: "Marketolog bo'limi" },
  { module: "content", label: "Kontent jadval" },
  { module: "shoots", label: "Syomka" },
  { module: "montaj", label: "Montaj" },
  { module: "dizayn", label: "Dizayn" },
  { module: "target", label: "Target" },
  { module: "finance", label: "Moliya" },
  { module: "payroll", label: "Ish haqi (barcha xodimlar)" },
  { module: "dashboard", label: "Nazorat paneli" },
  { module: "integrations", label: "Integratsiyalar" },
];

export const ACCESS_LABELS: Record<Access, string> = {
  none: "—",
  own: "o'z vazifasi",
  view: "ko'rish",
  approve: "ko'rish/tasdiq",
  edit: "ko'rish/tahrir",
  full: "to'liq",
};

/** "Har xodim faqat o'z vazifalari va o'z loyihalarini ko'radi. Marketolog va admin hammasini ko'radi." */
export function seesEverything(user: User): boolean {
  return user.role === "admin" || user.role === "rahbar" || user.role === "marketolog" || user.role === "moliya";
}

export function visibleProjects(s: ErpState, user: User): Project[] {
  if (seesEverything(user)) return s.projects;
  const ids = new Set<string>();
  for (const p of s.projects) {
    if (p.smmId === user.id || p.targetologId === user.id || p.marketologId === user.id) ids.add(p.id);
  }
  for (const p of s.projects) if (p.services?.some((x) => x.assigneeId === user.id && x.status !== "cancelled")) ids.add(p.id);
  for (const t of s.tasks) if (t.assigneeId === user.id) ids.add(t.projectId);
  for (const sh of s.shoots) if (sh.operatorId === user.id) ids.add(sh.projectId);
  return s.projects.filter((p) => ids.has(p.id));
}

export function homeFor(role: Role): string {
  switch (role) {
    case "admin":
    case "marketolog":
      return "/";
    case "rahbar":
      return "/moliya";
    case "moliya":
      return "/moliya";
    default:
      return "/mening";
  }
}
