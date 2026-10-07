// Avtomatik qoidalar: kechikish, hisob davri, to'lov holati, qarz, ogohlantirishlar.
import { addDays, addMonths, diffDays, fmtDate, fmtMoney, monthKey } from "./dates";
import type { ErpState, Payment, Post, PostStatus, Project, Task, User } from "./types";

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

// ---------- Hisob davri ----------

export interface Period {
  index: number;
  start: string;
  end: string;
}

export function periodAt(p: Project, index: number): Period | null {
  if (!p.periodStart) return null;
  return { index, start: addMonths(p.periodStart, index), end: addMonths(p.periodStart, index + 1) };
}

/** Birinchi reklama sanasidan boshlanib, keyingi oyning shu sanasida yopiladigan joriy davr. */
export function currentPeriod(p: Project, today: string): Period | null {
  if (!p.periodStart || p.periodStart > today) return null;
  let i = 0;
  while (addMonths(p.periodStart, i + 1) <= today) i++;
  return periodAt(p, i);
}

export function periodLabel(per: Period): string {
  return `${per.index + 1}-davr (${fmtDate(per.start)} – ${fmtDate(per.end)})`;
}

// ---------- To'lovlar ----------

export type PayStatus = "pending" | "paid" | "partial" | "overdue";

export const paidSum = (pay: Payment) => pay.transactions.reduce((a, t) => a + t.amount, 0);

export function paymentStatus(pay: Payment, today: string): PayStatus {
  const paid = paidSum(pay);
  if (paid >= pay.amount) return "paid";
  if (pay.dueDate && pay.dueDate < today) return "overdue";
  if (paid > 0) return "partial";
  return "pending";
}

export function projectPayments(s: ErpState, projectId: string): Payment[] {
  return s.payments
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
}

export function prepayPaid(s: ErpState, projectId: string): boolean {
  const pre = s.payments.find((p) => p.projectId === projectId && p.kind === "prepay");
  return !pre || paidSum(pre) >= pre.amount;
}

export interface Debt {
  amount: number;
  days: number;
}

/** Muddati o'tgan to'lovlar bo'yicha qarz summasi va eng uzoq kechikish (kun). */
export function projectDebt(s: ErpState, projectId: string, today: string): Debt {
  let amount = 0;
  let days = 0;
  for (const pay of s.payments) {
    if (pay.projectId !== projectId || paymentStatus(pay, today) !== "overdue") continue;
    amount += pay.amount - paidSum(pay);
    days = Math.max(days, diffDays(today, pay.dueDate));
  }
  return { amount, days };
}

/** Yangi vazifa ochish mumkinmi: oldindan to'lov kelgan va ish qo'lda to'xtatilmagan bo'lishi kerak. */
export function workBlockedReason(s: ErpState, p: Project): string | null {
  if (p.pauseWork) return "Loyiha sozlamasida ish to'xtatilgan — yangi vazifalar ochilmaydi.";
  if (!prepayPaid(s, p.id)) return "Oldindan to'lov hali kelmagan — ish to'lovdan keyin boshlanadi.";
  return null;
}

/**
 * Davr boshlangach keyingi davrlar uchun oylik to'lovlarni yaratadi.
 * To'lov davr tugashidan 3 kun oldin ro'yxatda paydo bo'ladi (eslatma bilan bir vaqtda).
 */
export function syncPayments(s: ErpState, today: string, newId: () => string): void {
  for (const p of s.projects) {
    if (!p.periodStart) continue;
    for (let i = 1; addMonths(p.periodStart, i) <= addDays(today, 3); i++) {
      const exists = s.payments.some((x) => x.projectId === p.id && x.kind === "monthly" && x.periodIndex === i);
      if (!exists) {
        s.payments.push({
          id: newId(),
          projectId: p.id,
          kind: "monthly",
          periodIndex: i,
          amount: p.monthlyFee,
          dueDate: addMonths(p.periodStart, i),
          transactions: [],
        });
      }
    }
  }
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
  if (!p.targetologId || !p.periodStart || p.periodStart >= today) return false;
  const y = addDays(today, -1);
  return !s.targetReports.some((r) => r.projectId === p.id && r.date === y);
}

// ---------- Montajyor oyligi ----------

export function acceptedMontajCount(s: ErpState, userId: string, month: string): number {
  return s.tasks.filter(
    (t) => t.kind === "montaj" && t.assigneeId === userId && t.status === "accepted" && t.acceptedAt?.startsWith(month),
  ).length;
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
  const boss = me.role === "marketolog" || me.role === "admin";

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
        out.push({ id: `pw-${p.id}`, text: `Post sanasiga ${diffDays(p.date, today)} kun qoldi, hali mijoz tasdig'ida emas: ${p.topic}`, href: "/kontent", tone: "amber" });
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
        if (left <= 3) out.push({ id: `per-${p.id}-${per.index}`, text: `${p.name}: davr tugashiga ${left} kun qoldi — keyingi oy to'lovi`, href: "/moliya", tone: "amber" });
      }
      for (const pay of s.payments) {
        if (pay.projectId !== p.id || paymentStatus(pay, today) === "paid" || paymentStatus(pay, today) === "overdue") continue;
        if (pay.dueDate && diffDays(pay.dueDate, today) <= 3 && pay.kind !== "monthly") {
          out.push({ id: `pay-${pay.id}`, text: `${p.name}: to'lov muddati yaqin (${fmtDate(pay.dueDate)})`, href: "/moliya", tone: "amber" });
        }
      }
    }
  }

  for (const p of s.projects) {
    if ((boss || p.targetologId === me.id) && targetReportMissing(s, p, today)) {
      out.push({ id: `tr-${p.id}`, text: `${p.name}: kechagi target hisoboti kiritilmagan`, href: "/target", tone: "red" });
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
