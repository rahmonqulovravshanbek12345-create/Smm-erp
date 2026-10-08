// Xodimni arxivlash: nimalar bog'langanini ko'rsatadi (arxivlashdan oldin ogohlantirish uchun).
import { employeeBalance } from "./finance";
import type { ErpState, Project, Task } from "./types";

export interface UserLoad {
  /** Kompaniya xodimga qarzdor (musbat) yoki avans berilgan (manfiy). */
  balance: number;
  /** Xodim mas'ul bo'lgan, yopilmagan loyihalar. */
  projects: Project[];
  /** Hali qabul qilinmagan vazifalar. */
  openTasks: Task[];
}

export function userLoad(s: ErpState, userId: string, today: string): UserLoad {
  const projects = s.projects.filter(
    (p) =>
      p.status !== "closed" &&
      (p.marketologId === userId ||
        p.smmId === userId ||
        p.targetologId === userId ||
        p.services?.some((x) => x.status === "active" && x.assigneeId === userId)),
  );
  const openTasks = s.tasks.filter((t) => t.assigneeId === userId && t.status !== "accepted");
  return { balance: employeeBalance(s, userId, today), projects, openTasks };
}
