// Loyiha jamoasi tarixi: lavozimga kim qaysi sanadan biriktirilgani. Sana kelganda joriy xodim o'zi almashadi,
// o'tgan sanadagi ish esa eski xodimda qoladi (hisoblangan ish haqi va yozilgan ishlar userId bo'yicha saqlanadi).
import { isTaskOpen } from "./rules";
import { newId } from "./ctx";
import type { ErpState, Project, TeamChange, TeamRole } from "./types";

export const TEAM_ROLES: TeamRole[] = ["marketolog", "smm", "targetolog"];
export const TEAM_START = "2020-01-01";
const FIELD = { marketolog: "marketologId", smm: "smmId", targetolog: "targetologId" } as const;

export const currentOf = (p: Project, role: TeamRole): string | undefined => p[FIELD[role]];

/** Tarix bo'lmasa — joriy xodimlardan boshlang'ich yozuvlar yaratadi (eski loyihalar uchun). */
export function seedTeamHistory(p: Project, by = "system"): TeamChange[] {
  const at = new Date().toISOString();
  const out: TeamChange[] = [];
  for (const role of TEAM_ROLES) {
    const userId = currentOf(p, role);
    if (userId) out.push({ id: newId("tm"), role, userId, from: TEAM_START, by, at });
  }
  return out;
}

/** Berilgan sanada lavozimda kim turgani (tarix bo'yicha). Yozuv bo'lmasa — joriy qiymat. */
export function teamOn(p: Project, role: TeamRole, date: string): string | undefined {
  const rows = (p.teamHistory ?? [])
    .filter((x) => x.role === role && x.from <= date)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.at < b.at ? -1 : 1));
  return rows.length ? rows[rows.length - 1]!.userId : currentOf(p, role);
}

/** Sanasi kelgan yozuvlarni joriy maydonlarga qo'yadi. Almashgan lavozimlar ro'yxatini qaytaradi. */
export function applyTeam(s: ErpState, p: Project, today: string): { role: TeamRole; from?: string; to: string }[] {
  if (!p.teamHistory?.length) return [];
  const moves: { role: TeamRole; from?: string; to: string }[] = [];
  for (const role of TEAM_ROLES) {
    const to = teamOn(p, role, today);
    if (!to || to === currentOf(p, role)) continue;
    const prev = currentOf(p, role);
    (p as unknown as Record<string, string>)[FIELD[role]] = to;
    moves.push({ role, from: prev, to });
    // Targetolog o'zgarsa — ochiq target vazifalari yangi xodimga o'tadi
    if (role === "targetolog" && prev) {
      for (const t of s.tasks) if (t.projectId === p.id && t.kind === "target" && isTaskOpen(t) && t.assigneeId === prev) t.assigneeId = to;
    }
  }
  return moves;
}

export function applyTeamAll(s: ErpState, today: string): void {
  for (const p of s.projects) applyTeam(s, p, today);
}
