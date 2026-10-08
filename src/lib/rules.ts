// Avtomatik qoidalar: kechikish, hisob davri, to'lov holati, qarz, ogohlantirishlar.
import { addDays, diffDays, fmtDate, fmtMoney, monthKey } from "./dates";
import { invoiceStatus, prepayPaid, projectDebt } from "./finance";
import { currentPeriod, type Period } from "./period";
import { hasAds, oneTimeServices, serviceLabel, stageIndex } from "./services";
import type { ErpState, Post, PostStatus, Project, Task, User } from "./types";

export { periodAt, currentPeriod, periodLabel, type Period } from "./period";
export { projectDebt, prepayPaid, type Debt } from "./finance";

// ---------- Kontent va vazifalar ----------

const POST_ORDER: PostStatus[] = ["plan", "shoot", "editing", "design", "internal", "client", "approved", "published"];
export const postStage = (s: PostStatus) => POST_ORDER.indexOf(s);

/** Post sanasi o'tgan va hali joylanmagan bo'lsa — Kechikdi. */
export function isPostLate(p: Post, today: string): boolean {
  return p.status !== "published" && p.date < today;
}

/** Post sanasiga 2 kun qolib hali mijoz tasdig'iga yetmagan bo'lsa — ogohlantirish. */
export function postNeedsWarning(p: Post, today: string): boolean {
  const left = diffDays(p.date, today);
  return left >= 0 && left <= 2 && postStage(p.status) < postStage("client");
}

/** "Tayyor" — tekshiruvga topshirilgan yoki qabul qilingan; target uchun — reklama yoqilgan. */
export function isTaskDone(t: Task): boolean {
  if (t.kind === "target") return Boolean(t.launchedAt);
  return t.status === "review" || t.status === "accepted";
}

/** Deadline o'tgan va status "Tayyor" emas — avtomatik Kechikdi. */
export function isTaskLate(t: Task, today: string): boolean {
  return !isTaskDone(t) && t.deadline < today;
}

export function isTaskOpen(t: Task): boolean {
  return t.kind === "target" ? !t.launchedAt : t.status !== "accepted";
}

/** Yangi vazifa ochish mumkinmi: oldindan to'lov kelgan va ish qo'lda to'xtatilmagan bo'lishi kerak. */
export function workBlockedReason(s: ErpState, p: Project): string | null {
  if (p.pauseWork) return "Loyiha sozlamasida ish to'xtatilgan — yangi vazifalar ochilmaydi.";
  if (!prepayPaid(s, p.id)) return "Oldindan to'lov hali kelmagan — ish to'lovdan keyin boshlanadi.";
  return null;
}

// ---------- Reja bajarilishi ----------

export function periodPosts(s: ErpState, p: Project, today: string): { per: Period | null; posts: Post[] } {
  const per = currentPeriod(p, today);
  const all = s.posts.filter((x) => x.projectId === p.id);
  if (!per) {
    const m = monthKey(today);
    return { per, posts: all.filter((x) => monthKey(x.date) === m || x.date >= today) };
  }
  return { per, posts: all.filter((x) => x.date >= per.start && x.date < per.end) };
}

// ---------- Targetolog ----------

/** Reklama ishlayotgan loyihada kechagi kunlik hisobot kiritilmagan bo'lsa — belgi. */
export function targetReportMissing(s: ErpState, p: Project, today: string): boolean {
  if (!p.targetologId || !hasAds(p) || !p.periodStart || p.periodStart >= today || p.status === "closed") return false;
  const y = addDays(today, -1);
  return !s.targetReports.some((r) => r.projectId === p.id && r.date === y);
}

// ---------- Vaqtga bog'liq ogohlantirishlar ----------

export interface Alert {
  id: string;
  text: string;
  href: string;
  tone: "red" | "amber";
}

/** Joriy foydalanuvchi uchun hisoblanadigan eslatmalar (saqlanmaydi, har safar qayta hisoblanadi). */
export function alertsFor(s: ErpState, me: User, today: string): Alert[] {
  const out: Alert[] = [];
  const name = (id: string) => s.projects.find((p) => p.id === id)?.name ?? "—";
  const boss = me.role === "marketolog" || me.role === "admin" || me.role === "rahbar";

  for (const sh of s.shoots) {
    if (sh.status === "planned" && sh.operatorId === me.id && diffDays(sh.date, today) === 1) {
      out.push({ id: `sh1-${sh.id}`, text: `Ertaga syomka: ${name(sh.projectId)}, ${sh.time}, ${sh.location}`, href: "/syomka", tone: "amber" });
    }
  }

  for (const t of s.tasks) {
    if (!isTaskOpen(t)) continue;
    const project = s.projects.find((p) => p.id === t.projectId);
    const mine = t.assigneeId === me.id;
    const owner = project?.smmId === me.id;
    const href = t.kind === "montaj" ? "/montaj" : t.kind === "dizayn" ? "/dizayn" : "/target";
    if (isTaskLate(t, today) && (mine || owner || boss)) {
      out.push({ id: `tl-${t.id}`, text: `Deadline o'tdi: ${t.title} (${name(t.projectId)})`, href, tone: "red" });
    } else if (!isTaskDone(t) && diffDays(t.deadline, today) === 1 && (mine || owner)) {
      out.push({ id: `t1-${t.id}`, text: `Deadline ertaga: ${t.title} (${name(t.projectId)})`, href, tone: "amber" });
    }
  }

  if (boss || me.role === "smm") {
    for (const p of s.posts) {
      const project = s.projects.find((x) => x.id === p.projectId);
      if (!boss && project?.smmId !== me.id) continue;
      if (postNeedsWarning(p, today)) {
        out.push({
          id: `pw-${p.id}`,
          text: `Post sanasiga ${diffDays(p.date, today)} kun qoldi, hali mijoz tasdig'ida emas: ${p.topic}`,
          href: "/kontent",
          tone: "amber",
        });
      }
    }
  }

  if (boss || me.role === "moliya") {
    for (const p of s.projects) {
      const debt = projectDebt(s, p.id, today);
      if (debt.amount > 0) {
        out.push({ id: `debt-${p.id}`, text: `${p.name}: qarz ${fmtMoney(debt.amount)}, ${debt.days} kun kechikdi`, href: "/moliya", tone: "red" });
      }
      const per = currentPeriod(p, today);
      if (per) {
        const left = diffDays(per.end, today);
        if (left <= 3)
          out.push({
            id: `per-${p.id}-${per.index}`,
            text: `${p.name}: davr tugashiga ${left} kun qoldi — keyingi oy to'lovi`,
            href: "/moliya",
            tone: "amber",
          });
      }
      for (const inv of s.invoices) {
        if (inv.projectId !== p.id) continue;
        const st = invoiceStatus(s, inv, today);
        if (st === "paid" || st === "overdue" || !inv.dueDate || inv.kind === "monthly") continue;
        if (diffDays(inv.dueDate, today) <= 3) {
          out.push({ id: `pay-${inv.id}`, text: `${p.name}: to'lov muddati yaqin (${fmtDate(inv.dueDate)})`, href: "/moliya/fakturalar", tone: "amber" });
        }
      }
    }
  }

  for (const p of s.projects) {
    if ((boss || p.targetologId === me.id) && targetReportMissing(s, p, today)) {
      out.push({ id: `tr-${p.id}`, text: `${p.name}: kechagi target hisoboti kiritilmagan`, href: "/target", tone: "red" });
    }
  }

  // Bir martalik xizmatlar: muddati o'tgan yoki yaqinlashgan ishlar (ijrochi, marketolog va rahbarga)
  for (const p of s.projects) {
    for (const svc of oneTimeServices(p)) {
      if (svc.status !== "active" || !svc.deadline) continue;
      if (!(boss || svc.assigneeId === me.id)) continue;
      const left = diffDays(svc.deadline, today);
      const stage = svc.stages?.[stageIndex(svc)]?.name ?? "—";
      if (left < 0)
        out.push({
          id: `svc-l-${svc.id}`,
          text: `${p.name} · ${serviceLabel(svc.kind)}: muddat o'tdi (${-left} kun), bosqich: ${stage}`,
          href: boss ? `/loyiha/${p.id}` : "/mening",
          tone: "red",
        });
      else if (left <= 3)
        out.push({
          id: `svc-s-${svc.id}`,
          text: `${p.name} · ${serviceLabel(svc.kind)}: topshirishga ${left} kun qoldi, bosqich: ${stage}`,
          href: boss ? `/loyiha/${p.id}` : "/mening",
          tone: "amber",
        });
    }
  }

  if (me.role === "operator") {
    for (const l of s.leads) {
      if (l.operatorId === me.id && l.nextContactDate && l.nextContactDate <= today && !["contract", "unfit", "lowquality"].includes(l.stage)) {
        out.push({ id: `lc-${l.id}`, text: `Bugun qayta aloqa: ${l.name} (${l.phone})`, href: "/crm", tone: "amber" });
      }
    }
  }

  return out;
}
