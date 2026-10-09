// Moliyaviy hisob-kitoblar yadrosi. Barcha hisobotlar shu yerdagi funksiyalardan quriladi.
//
// Asosiy tamoyillar (types.ts dagi izohga qarang):
//  • P&L — hisoblash usulida: daromad xizmat davri kunlariga bo'linib oylarga taqsimlanadi,
//    ish haqi hisoblangan sanada, ta'minotchi xarajati hujjat sanasida tan olinadi.
//  • Cash Flow — faqat tranzaksiyalar (haqiqiy pul harakati).
//  • Tranzit (mijoz reklama byudjeti) P&L'ga kirmaydi, Cash Flow'da alohida ko'rsatiladi.
import { addDays, addMonths, diffDays, fmtMonth, fmtUsd, monthKey, shiftMonthKey } from "./dates";
import { currentPeriod, periodAt, type Period } from "./period";
import { isSettled, outstandingOf } from "./money";
import { hasAds, hasContent, invoiceLines, linesUsd, recurringFee, recurringLines, round2, serviceLabel, serviceOf } from "./services";
import type { Accrual, Article, ArticleGroup, Bill, ErpState, Invoice, PayProfile, Project, Task, Transaction, User, WorkType } from "./types";

// ---------- Moddalar ----------

export const ART = {
  client: "a_client",
  otherIn: "a_other_in",
  transitIn: "a_transit_in",
  ownerIn: "a_owner_in",
  transferIn: "a_transfer_in",
  payroll: "a_payroll",
  transitOut: "a_transit_out",
  rent: "a_rent",
  software: "a_software",
  internet: "a_internet",
  transport: "a_transport",
  production: "a_production",
  marketing: "a_marketing",
  bank: "a_bank",
  otherOut: "a_other_out",
  tax: "a_tax",
  equipment: "a_equipment",
  dividend: "a_dividend",
  transferOut: "a_transfer_out",
} as const;

export const DEFAULT_ARTICLES: Article[] = [
  { id: ART.client, name: "Mijoz to'lovi (faktura bo'yicha)", group: "client", dir: "in" },
  { id: ART.otherIn, name: "Boshqa daromad", group: "revenue", dir: "in" },
  { id: ART.transitIn, name: "Reklama byudjeti — mijozdan (tranzit)", group: "transit", dir: "in" },
  { id: ART.ownerIn, name: "Egasining qo'yilmasi", group: "financing", dir: "in" },
  { id: ART.transferIn, name: "O'tkazma (kirim)", group: "transfer", dir: "in" },
  { id: ART.payroll, name: "Ish haqi to'lovi", group: "payroll", dir: "out" },
  { id: ART.transitOut, name: "Meta Ads — reklama byudjeti (tranzit)", group: "transit", dir: "out" },
  { id: ART.transport, name: "Transport (syomka)", group: "direct", dir: "out" },
  { id: ART.production, name: "Syomka va rekvizit xarajatlari", group: "direct", dir: "out" },
  { id: ART.rent, name: "Ofis ijarasi", group: "overhead", dir: "out" },
  { id: ART.software, name: "Dasturlar va servislar", group: "overhead", dir: "out" },
  { id: ART.internet, name: "Internet va aloqa", group: "overhead", dir: "out" },
  { id: ART.marketing, name: "Agentlikning o'z marketingi", group: "overhead", dir: "out" },
  { id: ART.bank, name: "Bank xizmatlari", group: "overhead", dir: "out" },
  { id: ART.otherOut, name: "Boshqa xarajat", group: "overhead", dir: "out" },
  { id: ART.tax, name: "Aylanma soliq", group: "tax", dir: "out" },
  { id: ART.equipment, name: "Jihoz xaridi", group: "investing", dir: "out" },
  { id: ART.dividend, name: "Egasiga dividend", group: "financing", dir: "out" },
  { id: ART.transferOut, name: "O'tkazma (chiqim)", group: "transfer", dir: "out" },
];

export const GROUP_LABELS: Record<ArticleGroup, string> = {
  revenue: "Daromad",
  client: "Mijoz to'lovi",
  direct: "To'g'ridan-to'g'ri xarajat",
  overhead: "Doimiy xarajat",
  tax: "Soliq",
  transit: "Tranzit",
  investing: "Investitsiya",
  financing: "Moliyaviy",
  payroll: "Ish haqi",
  vendor: "Ta'minotchi",
  transfer: "O'tkazma",
};

export const articleOf = (s: ErpState, id: string) => s.articles.find((a) => a.id === id);
export const accountOf = (s: ErpState, id: string) => s.accounts.find((a) => a.id === id);

// ---------- Valyuta ----------

/** Tranzaksiya summasi so'mda (USD hisoblar — tranzaksiya kursida). */
export function txUZS(s: ErpState, t: Transaction): number {
  const acc = accountOf(s, t.accountId);
  return acc?.currency === "USD" ? t.amount * (t.rate ?? s.settings.usdRate) : t.amount;
}

export const signedUZS = (s: ErpState, t: Transaction) => (t.dir === "in" ? 1 : -1) * txUZS(s, t);

/** Hisob qoldig'i o'z valyutasida. */
export function accountBalance(s: ErpState, accountId: string, upTo?: string): number {
  const acc = accountOf(s, accountId);
  if (!acc) return 0;
  let b = acc.opening;
  for (const t of s.transactions) {
    if (t.accountId !== accountId || (upTo && t.date > upTo)) continue;
    b += t.dir === "in" ? t.amount : -t.amount;
  }
  return b;
}

/** Barcha hisoblardagi pul so'mda (USD — joriy kursda). */
export function totalCashUZS(s: ErpState, upTo?: string): number {
  return s.accounts.reduce((a, acc) => a + accountBalance(s, acc.id, upTo) * (acc.currency === "USD" ? s.settings.usdRate : 1), 0);
}

// ---------- Fakturalar va mijoz to'lovlari ----------

export type PayStatus = "pending" | "paid" | "partial" | "overdue" | "void";

/** Dollardagi faktura: hisob kursi (chiqarilgan kundagi) — 1 USD necha so'm. */
export const bookRate = (inv: Invoice) => (inv.usd ? inv.amount / inv.usd : 1);

/** To'lov dollardagi fakturaning necha dollarini qoplagan (eski yozuvlarda — hisob kursi bo'yicha). */
export const FX_LINE = "Kurs farqi va to'lov ustamasi";
/** To'lovning fakturani yopgan qismi so'mda (faktura chiqarilgan kundagi kurs bo'yicha). */
export const txBookUZS = (s: ErpState, t: Transaction, inv: Invoice) =>
  inv.usd ? (t.dir === "in" ? 1 : -1) * Math.abs(txInvoiceUsd(s, t, inv)) * bookRate(inv) : signedUZS(s, t);
/** Kurs va ustama farqi: kelgan pul − fakturani yopgan qismi (so'm). */
export const txFxDiff = (s: ErpState, t: Transaction, inv: Invoice) => Math.round(signedUZS(s, t) - txBookUZS(s, t, inv));
export const txInvoiceUsd = (s: ErpState, t: Transaction, inv: Invoice) => t.invoiceUsd ?? signedUZS(s, t) / bookRate(inv);

/** Dollardagi faktura bo'yicha to'langan USD. */
export function invoicePaidUsd(s: ErpState, inv: Invoice, upTo?: string): number {
  let sum = 0;
  for (const t of s.transactions) if (t.invoiceId === inv.id && (!upTo || t.date <= upTo)) sum += (t.dir === "in" ? 1 : -1) * Math.abs(txInvoiceUsd(s, t, inv));
  return sum;
}

/**
 * Faktura bo'yicha to'langan (so'mda, hisob qiymatida). Dollardagi fakturada — qoplangan USD × hisob kursi:
 * kurs farqi va ustama fakturani emas, alohida «kurs farqi» qatorini o'zgartiradi.
 */
export function invoicePaid(s: ErpState, inv: Invoice, upTo?: string): number {
  if (inv.usd) return invoicePaidUsd(s, inv, upTo) * bookRate(inv);
  let sum = 0;
  for (const t of s.transactions) if (t.invoiceId === inv.id && (!upTo || t.date <= upTo)) sum += signedUZS(s, t);
  return sum;
}

/** Faktura to'liq to'langanmi (dollardagisi — sentgacha). */
export function invoiceSettled(s: ErpState, inv: Invoice): boolean {
  if (inv.usd) return inv.usd - invoicePaidUsd(s, inv) <= 0.005;
  return isSettled(inv.amount, invoicePaid(s, inv));
}

export const invoiceOutstanding = (s: ErpState, inv: Invoice) =>
  inv.voidedAt || invoiceSettled(s, inv) ? 0 : inv.usd ? (inv.usd - invoicePaidUsd(s, inv)) * bookRate(inv) : outstandingOf(inv.amount, invoicePaid(s, inv));

/** Dollardagi faktura qoldig'i USD da. */
export const invoiceOutstandingUsd = (s: ErpState, inv: Invoice) => (inv.usd && !inv.voidedAt ? Math.max(0, round2(inv.usd - invoicePaidUsd(s, inv))) : 0);

/** Bekor qilinmagan fakturalar. */
export const liveInvoices = (s: ErpState) => s.invoices.filter((i) => !i.voidedAt);

export function invoiceStatus(s: ErpState, inv: Invoice, today: string): PayStatus {
  if (inv.voidedAt) return "void";
  const paid = invoicePaid(s, inv);
  if (invoiceSettled(s, inv)) return "paid";
  if (inv.dueDate && inv.dueDate < today) return "overdue";
  if (paid > 0) return "partial";
  return "pending";
}

export interface Debt {
  amount: number;
  days: number;
}

/** Muddati o'tgan fakturalar bo'yicha qarz va eng uzoq kechikish. */
export function projectDebt(s: ErpState, projectId: string, today: string): Debt {
  let amount = 0;
  let days = 0;
  for (const inv of s.invoices) {
    if (inv.projectId !== projectId || invoiceStatus(s, inv, today) !== "overdue") continue;
    amount += invoiceOutstanding(s, inv);
    days = Math.max(days, diffDays(today, inv.dueDate));
  }
  return { amount, days };
}

/** Oylik xizmatlar bo'yicha oldindan to'lov (bir martalik xizmatlarniki — alohida). */
export function prepayPaid(s: ErpState, projectId: string): boolean {
  // Bekor qilinganlar hisobga olinmaydi (masalan, SMM o'rniga target tanlansa — eski oldindan to'lov fakturasi bekor)
  const pre = s.invoices.find((i) => i.projectId === projectId && i.kind === "prepay" && !i.serviceId && !i.voidedAt);
  return !pre || invoiceSettled(s, pre);
}

export function nextInvoiceNumber(s: ErpState): string {
  const max = s.invoices.reduce((m, i) => Math.max(m, Number(i.number.replace(/\D/g, "")) || 0), 0);
  return `SF-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Faktura qaysi xizmat davri uchun (qo'shimcha xizmat — chiqarilgan kuni).
 * Bir martalik xizmat (sayt, branding, video) — topshirilgan kuni tan olinadi; topshirilguncha olingan pul — avans.
 */
export function invoicePeriod(s: ErpState, inv: Invoice): Period | null {
  if (inv.voidedAt) return null;
  if (inv.kind === "extra") return { index: inv.periodIndex, start: inv.issueDate, end: addDays(inv.issueDate, 1) };
  if (inv.serviceId) {
    const d = serviceOf(s, inv.serviceId)?.service.deliveredAt;
    return d ? { index: 0, start: d, end: addDays(d, 1) } : null;
  }
  const p = s.projects.find((x) => x.id === inv.projectId);
  const per = p ? periodAt(p, inv.periodIndex) : null;
  // Loyiha yopilgandan keyin boshlanadigan davr xizmati ko'rsatilmaydi — to'langan bo'lsa, bu avans (qaytariladi)
  if (per && p?.status === "closed" && p.closedAt && per.start >= p.closedAt) return null;
  return per;
}

/**
 * Yangi davr boshlanishidan 3 kun oldin oylik faktura avtomatik chiqariladi.
 * Yopilgan loyihalar uchun chiqarilmaydi.
 */
export function syncInvoices(s: ErpState, today: string, newId: () => string): void {
  for (const p of s.projects) {
    if (!p.periodStart || p.status === "closed") continue;
    for (let i = 1; addMonths(p.periodStart, i) <= addDays(today, 3); i++) {
      if (s.invoices.some((x) => x.projectId === p.id && x.kind === "monthly" && x.periodIndex === i)) continue;
      const due = addMonths(p.periodStart, i);
      // Faqat shu davr boshida amalda bo'lgan xizmatlar (to'xtatilgan oylar keyin qayta qo'shilsa ham hisoblanmaydi)
      const lines = recurringLines(p, s.settings.usdRate, due);
      const amount = lines.reduce((a, l) => a + l.amount, 0);
      if (amount <= 0) continue;
      s.invoices.push({
        id: newId(),
        number: nextInvoiceNumber(s),
        projectId: p.id,
        kind: "monthly",
        periodIndex: i,
        amount,
        lines,
        ...(linesUsd(lines) !== undefined ? { usd: linesUsd(lines) } : {}),
        issueDate: addDays(due, -3) > today ? today : addDays(due, -3),
        dueDate: due,
        note: `${i + 1}-davr uchun abonent to'lovi`,
      });
    }
  }
}

// ---------- Daromadni tan olish (hisoblash usuli) ----------

/**
 * Summani [start, end) oralig'idagi kunlar bo'yicha oylarga taqsimlaydi.
 * cutoff berilsa — faqat shu sanagacha (shu kun ham kiradi) o'tgan kunlar hisobga olinadi.
 */
function allocateByDays(amount: number, start: string, end: string, out: Map<string, number>, cutoff?: string): void {
  const total = diffDays(end, start);
  if (total <= 0) {
    if (!cutoff || start <= cutoff) out.set(monthKey(start), (out.get(monthKey(start)) ?? 0) + amount);
    return;
  }
  const stop = cutoff && addDays(cutoff, 1) < end ? addDays(cutoff, 1) : end;
  let cur = start;
  while (cur < stop) {
    const m = monthKey(cur);
    const nextMonth = `${shiftMonthKey(m, 1)}-01`;
    const segEnd = nextMonth < stop ? nextMonth : stop;
    out.set(m, (out.get(m) ?? 0) + (amount * diffDays(segEnd, cur)) / total);
    cur = segEnd;
  }
}

/** Faktura daromadi oylar bo'yicha — faqat bugungacha ko'rsatilgan xizmat kunlari. */
export function invoiceRevenueByMonth(s: ErpState, inv: Invoice, today: string): Map<string, number> {
  const out = new Map<string, number>();
  if (inv.voidedAt) return out;
  const per = invoicePeriod(s, inv);
  if (per) allocateByDays(inv.amount, per.start, per.end, out, today);
  return out;
}

/**
 * Bugungi kungacha tan olinmagan (kelgusi davrga tegishli) faktura qismi.
 * invoiceRevenueByMonth bilan bir xil qoida: bugungi kun ham ko'rsatilgan xizmat kuni hisoblanadi.
 */
export function unrecognizedRevenue(s: ErpState, inv: Invoice, today: string): number {
  if (inv.voidedAt) return 0;
  const per = invoicePeriod(s, inv);
  if (!per) return inv.amount;
  const total = diffDays(per.end, per.start);
  if (total <= 0) return per.start <= today ? 0 : inv.amount;
  const servedUntil = addDays(today, 1);
  if (servedUntil <= per.start) return inv.amount;
  if (servedUntil >= per.end) return 0;
  return (inv.amount * diffDays(per.end, servedUntil)) / total;
}

// ---------- Ish haqi ----------

export const WORK_LABELS: Record<WorkType, string> = {
  montaj: "Montaj (video)",
  dizayn_post: "Post dizayni",
  dizayn_cover: "Oblojka",
  syomka: "Syomka (chiqish)",
  shartnoma: "Shartnoma bonusi",
  xizmat: "Bir martalik xizmat (sayt, branding, video)",
};

export const ACCRUAL_KIND_LABELS: Record<Accrual["kind"], string> = {
  piece: "Ishbay",
  project: "Loyiha oyligi",
  fixed: "Fiks oylik",
  bonus: "Bonus",
  penalty: "Jarima",
  manual: "Qo'lda",
};

export function profileOf(s: ErpState, userId: string): PayProfile {
  return s.payProfiles.find((p) => p.userId === userId) ?? { userId, fixed: 0, perProject: 0, rates: {} };
}

export function taskWorkType(t: Task): WorkType | null {
  if (t.kind === "montaj") return "montaj";
  if (t.kind === "dizayn") return t.designType === "cover" ? "dizayn_cover" : "dizayn_post";
  return null;
}

/** Ishbay hisoblash yozuvi (stavka 0 bo'lsa — null). */
export function pieceAccrual(
  s: ErpState,
  userId: string,
  workType: WorkType,
  o: { projectId?: string; date: string; sourceId: string; title: string; createdBy: string; id: string },
): Accrual | null {
  const rate = profileOf(s, userId).rates[workType] ?? 0;
  if (rate <= 0) return null;
  return {
    id: o.id,
    userId,
    projectId: o.projectId,
    date: o.date,
    kind: workType === "shartnoma" ? "bonus" : "piece",
    workType,
    sourceId: o.sourceId,
    title: o.title,
    qty: 1,
    rate,
    amount: rate,
    approved: false,
    createdBy: o.createdBy,
  };
}

/** Xodim loyiha oyligini qaysi loyihalardan oladi (SMM, targetolog yoki marketolog sifatida). */
export const projectStaff = (p: Project) =>
  [hasContent(p) ? p.smmId : undefined, hasAds(p) ? p.targetologId : undefined, p.marketologId].filter((x): x is string => Boolean(x));

/**
 * Xodim [from, to) oralig'ida necha kun ishlagan: ishga kirgan sanadan, arxivlangan kungacha;
 * arxivdan qaytarilgan bo'lsa — qaytgan kundan yana. Sanalari yo'q eski yozuvlar: faol — hamma kun, arxivda — 0.
 */
export function workedDays(u: User | undefined, from: string, to: string): number {
  if (!u) return 0;
  const hire = u.hiredAt ?? "0000-01-01";
  const spans: [string, string][] = [];
  if (u.archivedAt) {
    if (u.activeFrom && u.activeFrom > u.archivedAt) {
      spans.push([hire, u.archivedAt]);
      if (u.active) spans.push([u.activeFrom, "9999-12-31"]);
    } else spans.push([hire, u.active ? "9999-12-31" : u.archivedAt]);
  } else if (u.active) spans.push([hire, "9999-12-31"]);
  let days = 0;
  for (const [a, b] of spans) {
    const st = a > from ? a : from;
    const en = b < to ? b : to;
    if (en > st) days += diffDays(en, st);
  }
  return days;
}

/** Fiks oylik qaysi sanadan hisoblanadi (profil 0 dan oshirilgan sana). */
const fixedStart = (prof: PayProfile) => prof.fixedFrom ?? "0000-01-01";

/**
 * Davriy hisoblashlar:
 *  • loyiha oyligi — har bir yopilgan loyiha davri uchun;
 *  • fiks oylik — har bir tugagan oy uchun (oyning oxirgi kuni).
 */
export function syncAccruals(s: ErpState, today: string, newId: () => string): void {
  const start = `${s.settings.payrollStart}-01`;
  const has = (sourceId: string) => s.accruals.some((a) => a.sourceId === sourceId);

  for (const p of s.projects) {
    if (!p.periodStart) continue;
    for (let i = 0; ; i++) {
      const per = periodAt(p, i)!;
      if (per.end > today) break;
      if (p.status === "closed" && p.closedAt && per.start >= p.closedAt) break;
      if (per.end < start) continue;
      // Davr hisoblanmagan bo'lsa (oylik xizmat yo'q edi) — loyiha oyligi ham yo'q
      if (recurringFee(p, s.settings.usdRate, per.start) <= 0) continue;
      const total = diffDays(per.end, per.start);
      for (const uid of new Set(projectStaff(p))) {
        const full = profileOf(s, uid).perProject;
        const src = `per:${p.id}:${i}:${uid}`;
        if (full <= 0 || has(src)) continue;
        // Davr ichida ishlagan kunlariga ko'ra (yangi kelgan yoki arxivlangan xodim)
        const days = workedDays(
          s.users.find((u) => u.id === uid),
          per.start,
          per.end,
        );
        if (days <= 0) continue;
        const rate = days >= total ? full : Math.round((full * days) / total);
        s.accruals.push({
          id: newId(),
          userId: uid,
          projectId: p.id,
          date: per.end,
          kind: "project",
          sourceId: src,
          title: `${p.name}: ${i + 1}-davr uchun loyiha oyligi${days < total ? ` (${days}/${total} kun)` : ""}`,
          qty: 1,
          rate,
          amount: rate,
          approved: false,
          createdBy: "system",
        });
      }
    }
  }

  const curMonth = monthKey(today);
  for (const prof of s.payProfiles) {
    if (prof.fixed <= 0) continue;
    const user = s.users.find((u) => u.id === prof.userId);
    for (let m = s.settings.payrollStart; m < curMonth; m = shiftMonthKey(m, 1)) {
      const src = `fix:${prof.userId}:${m}`;
      if (has(src)) continue;
      // Oyda ishlagan kunlariga ko'ra: ishga kirgan, arxivlangan oy va fiks oylik belgilangan sanadan
      const from = `${m}-01`;
      const to = `${shiftMonthKey(m, 1)}-01`;
      const dim = diffDays(to, from);
      const fs = fixedStart(prof);
      const days = fs >= to ? 0 : workedDays(user, fs > from ? fs : from, to);
      if (days <= 0) continue;
      const amount = days >= dim ? prof.fixed : Math.round((prof.fixed * days) / dim);
      s.accruals.push({
        id: newId(),
        userId: prof.userId,
        date: addDays(`${shiftMonthKey(m, 1)}-01`, -1),
        kind: "fixed",
        sourceId: src,
        title: `Fiks oylik — ${fmtMonth(m)}${days < dim ? ` (${days}/${dim} kun)` : ""}`,
        qty: 1,
        rate: amount,
        amount,
        approved: false,
        createdBy: "system",
      });
    }
  }
}

export const payoutsOf = (s: ErpState, userId: string, upTo?: string) =>
  s.transactions.filter((t) => t.userId === userId && articleOf(s, t.articleId)?.group === "payroll" && (!upTo || t.date <= upTo));

export interface LedgerAccrual extends Accrual {
  paid: number;
  payStatus: "paid" | "partial" | "unpaid";
}

/** Xodim hisobi: to'lovlar eng eski hisoblashlarga navbat bilan (FIFO) taqsimlanadi. */
export function employeeLedger(s: ErpState, userId: string) {
  const accruals = s.accruals.filter((a) => a.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
  const payouts = payoutsOf(s, userId).sort((a, b) => a.date.localeCompare(b.date));
  const paidTotal = payouts.reduce((x, t) => x + signedUZS(s, t) * -1, 0);
  const penalties = accruals.filter((a) => a.amount < 0).reduce((x, a) => x - a.amount, 0);
  let pool = paidTotal + penalties;
  const rows: LedgerAccrual[] = accruals.map((a) => {
    if (a.amount < 0) return { ...a, paid: 0, payStatus: "paid" };
    const paid = Math.min(a.amount, Math.max(0, pool));
    pool -= paid;
    return { ...a, paid, payStatus: isSettled(a.amount, paid) ? "paid" : paid > 0 ? "partial" : "unpaid" };
  });
  const accrued = accruals.reduce((x, a) => x + a.amount, 0);
  return { rows, payouts, accrued, paid: paidTotal, balance: accrued - paidTotal };
}

/** Xodim balansi: musbat — kompaniya xodimga qarzdor, manfiy — xodimga avans berilgan. */
export function employeeBalance(s: ErpState, userId: string, upTo?: string): number {
  let b = 0;
  for (const a of s.accruals) if (a.userId === userId && (!upTo || a.date <= upTo)) b += a.amount;
  for (const t of payoutsOf(s, userId, upTo)) b -= txUZS(s, t);
  return b;
}

/** Ish haqi ro'yxatlari uchun xodimlar: faol xodimlar va balansi nolga teng bo'lmagan arxivdagilar (qarz ko'rinib turishi uchun). */
export function payrollStaff(s: ErpState): User[] {
  return s.users.filter((u) => u.role !== "admin" && (u.active || Math.abs(employeeBalance(s, u.id)) > 0.5));
}

export interface PayrollRow {
  user: User;
  opening: number;
  accrued: number;
  byKind: Partial<Record<Accrual["kind"], number>>;
  paid: number;
  closing: number;
}

/** Ish haqi vedomosti: oy bo'yicha har bir xodim. */
export function payrollSheet(s: ErpState, month: string): PayrollRow[] {
  const startPrev = addDays(`${month}-01`, -1);
  const end = addDays(`${shiftMonthKey(month, 1)}-01`, -1);
  return s.users
    .filter((u) => u.role !== "admin")
    .map((u) => {
      const opening = employeeBalance(s, u.id, startPrev);
      const ms = s.accruals.filter((a) => a.userId === u.id && monthKey(a.date) === month);
      const byKind: PayrollRow["byKind"] = {};
      for (const a of ms) byKind[a.kind] = (byKind[a.kind] ?? 0) + a.amount;
      const accrued = ms.reduce((x, a) => x + a.amount, 0);
      const paid = payoutsOf(s, u.id)
        .filter((t) => monthKey(t.date) === month)
        .reduce((x, t) => x + txUZS(s, t), 0);
      return { user: u, opening, accrued, byKind, paid, closing: employeeBalance(s, u.id, end) };
    })
    .filter((r) => r.opening || r.accrued || r.paid || r.closing);
}

/** Loyiha oyligi qaysi davr uchun hisoblangan (sourceId: per:loyiha:davr:xodim). */
function accrualPeriod(s: ErpState, a: Accrual): Period | null {
  const m = a.sourceId?.match(/^per:([^:]+):(\d+):/);
  if (!m) return null;
  const p = s.projects.find((x) => x.id === m[1]);
  return p ? periodAt(p, Number(m[2])) : null;
}

// ---------- Ta'minotchilar ----------

export function billPaid(s: ErpState, b: Bill): number {
  return s.transactions.filter((t) => t.billId === b.id).reduce((x, t) => x - signedUZS(s, t), 0);
}

// ---------- Foyda va zarar (P&L) ----------

export type PnlSection = "revenue" | "direct" | "overhead" | "tax";

export interface PnlLine {
  key: string;
  label: string;
  section: PnlSection;
  values: Record<string, number>;
  total: number;
}

export interface PnlResult {
  months: string[];
  lines: PnlLine[];
  totals: Record<"revenue" | "direct" | "gross" | "overhead" | "operating" | "tax" | "net", Record<string, number>>;
  sum: Record<"revenue" | "direct" | "gross" | "overhead" | "operating" | "tax" | "net", number>;
}

const ACCRUAL_LINE: Record<Accrual["kind"], { key: string; label: string; section: PnlSection }> = {
  piece: { key: "pay_piece", label: "Ishbay ish haqi (montaj, dizayn, syomka, bir martalik ishlar)", section: "direct" },
  penalty: { key: "pay_piece", label: "Ishbay ish haqi (montaj, dizayn, syomka, bir martalik ishlar)", section: "direct" },
  project: { key: "pay_project", label: "Loyiha oyligi (SMM, target, marketolog)", section: "direct" },
  fixed: { key: "pay_fixed", label: "Fiks oyliklar (ma'muriy xodimlar)", section: "overhead" },
  bonus: { key: "pay_bonus", label: "Bonuslar va qo'shimcha to'lovlar", section: "overhead" },
  manual: { key: "pay_bonus", label: "Bonuslar va qo'shimcha to'lovlar", section: "overhead" },
};

/**
 * P&L hisoblash usulida. projectId berilsa — faqat shu loyihaga tegishli summalar.
 * Moslik tamoyili: daromad ham, loyiha oyligi ham davr kunlariga taqsimlanadi; joriy (tugamagan)
 * davr va oy uchun loyiha oyligi va fiks oyliklar bugungi kungacha proporsional hisoblanadi.
 */
export function pnl(s: ErpState, months: string[], today: string, projectId?: string): PnlResult {
  const set = new Set(months);
  const lines = new Map<string, PnlLine>();
  const add = (key: string, label: string, section: PnlSection, month: string, v: number) => {
    if (!set.has(month) || !v) return;
    let l = lines.get(key);
    if (!l) {
      l = { key, label, section, values: {}, total: 0 };
      lines.set(key, l);
    }
    l.values[month] = (l.values[month] ?? 0) + v;
    l.total += v;
  };

  // Daromad xizmatlar kesimida: faktura qatorlari ulushiga ko'ra
  for (const inv of s.invoices) {
    if (projectId && inv.projectId !== projectId) continue;
    const byMonth = invoiceRevenueByMonth(s, inv, today);
    if (inv.kind === "extra") {
      for (const [m, v] of byMonth) add("rev_extra", "Qo'shimcha xizmatlar", "revenue", m, v);
      continue;
    }
    const lines = invoiceLines(s, inv);
    const total = lines.reduce((a, l) => a + l.amount, 0) || 1;
    for (const l of lines) {
      for (const [m, v] of byMonth) add(`rev_${l.kind}`, serviceLabel(l.kind), "revenue", m, (v * l.amount) / total);
    }
  }

  // Dollardagi shartnomalar: to'lov kunidagi kurs va ustama farqi (faktura so'mdagi qiymatidan farqi)
  for (const t of s.transactions) {
    if (!t.invoiceId || (projectId && t.projectId !== projectId)) continue;
    const inv = s.invoices.find((i) => i.id === t.invoiceId);
    if (!inv?.usd) continue;
    add("rev_fx", FX_LINE, "revenue", monthKey(t.date), txFxDiff(s, t, inv));
  }

  for (const a of s.accruals) {
    if (projectId && a.projectId !== projectId) continue;
    const l = a.kind === "manual" && a.projectId ? ACCRUAL_LINE.piece : ACCRUAL_LINE[a.kind];
    const per = a.kind === "project" ? accrualPeriod(s, a) : null;
    if (per) {
      const out = new Map<string, number>();
      allocateByDays(a.amount, per.start, per.end, out);
      for (const [m, v] of out) add(l.key, l.label, l.section, m, v);
    } else add(l.key, l.label, l.section, monthKey(a.date), a.amount);
  }

  // Joriy davr/oy: hali yozilmagan, lekin bugungacha "ishlab topilgan" ish haqi
  for (const p of s.projects) {
    if (projectId && p.id !== projectId) continue;
    const per = currentPeriod(p, today);
    if (!per || p.status === "closed") continue;
    if (recurringFee(p, s.settings.usdRate, per.start) <= 0) continue;
    const total = diffDays(per.end, per.start);
    for (const uid of new Set(projectStaff(p))) {
      const rate = profileOf(s, uid).perProject;
      if (rate <= 0) continue;
      const days = workedDays(
        s.users.find((u) => u.id === uid),
        per.start,
        addDays(today, 1),
      );
      if (days <= 0) continue;
      const out = new Map<string, number>();
      allocateByDays((rate * days) / total, per.start, addDays(today, 1), out);
      for (const [m, v] of out) add(ACCRUAL_LINE.project.key, ACCRUAL_LINE.project.label, "direct", m, v);
    }
  }
  const cur = monthKey(today);
  if (!projectId && set.has(cur)) {
    const dim = diffDays(`${shiftMonthKey(cur, 1)}-01`, `${cur}-01`);
    for (const prof of s.payProfiles) {
      if (prof.fixed <= 0) continue;
      if (s.accruals.some((a) => a.sourceId === `fix:${prof.userId}:${cur}`)) continue;
      const fs = fixedStart(prof);
      const from = fs > `${cur}-01` ? fs : `${cur}-01`;
      const days =
        from > today
          ? 0
          : workedDays(
              s.users.find((u) => u.id === prof.userId),
              from,
              addDays(today, 1),
            );
      if (days > 0) add(ACCRUAL_LINE.fixed.key, ACCRUAL_LINE.fixed.label, "overhead", cur, (prof.fixed * days) / dim);
    }
  }

  for (const b of s.bills) {
    if (projectId && b.projectId !== projectId) continue;
    const art = articleOf(s, b.articleId);
    if (!art || !["direct", "overhead"].includes(art.group)) continue;
    add(art.id, art.name, art.group as PnlSection, monthKey(b.date), b.amount);
  }

  for (const t of s.transactions) {
    if (t.billId || t.invoiceId) continue;
    if (projectId && t.projectId !== projectId) continue;
    const art = articleOf(s, t.articleId);
    if (!art) continue;
    if (art.group === "revenue") add(art.id, art.name, "revenue", monthKey(t.date), signedUZS(s, t));
    else if (art.group === "direct" || art.group === "overhead" || art.group === "tax") add(art.id, art.name, art.group, monthKey(t.date), -signedUZS(s, t));
  }

  const totals = {
    revenue: {} as Record<string, number>,
    direct: {} as Record<string, number>,
    gross: {} as Record<string, number>,
    overhead: {} as Record<string, number>,
    operating: {} as Record<string, number>,
    tax: {} as Record<string, number>,
    net: {} as Record<string, number>,
  };
  for (const m of months) {
    const sec = (x: PnlSection) => [...lines.values()].filter((l) => l.section === x).reduce((a, l) => a + (l.values[m] ?? 0), 0);
    totals.revenue[m] = sec("revenue");
    totals.direct[m] = sec("direct");
    totals.gross[m] = totals.revenue[m]! - totals.direct[m]!;
    totals.overhead[m] = sec("overhead");
    totals.operating[m] = totals.gross[m]! - totals.overhead[m]!;
    totals.tax[m] = sec("tax");
    totals.net[m] = totals.operating[m]! - totals.tax[m]!;
  }
  const sumOf = (r: Record<string, number>) => months.reduce((a, m) => a + (r[m] ?? 0), 0);
  const order: PnlSection[] = ["revenue", "direct", "overhead", "tax"];
  return {
    months,
    lines: [...lines.values()].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || b.total - a.total),
    totals,
    sum: {
      revenue: sumOf(totals.revenue),
      direct: sumOf(totals.direct),
      gross: sumOf(totals.gross),
      overhead: sumOf(totals.overhead),
      operating: sumOf(totals.operating),
      tax: sumOf(totals.tax),
      net: sumOf(totals.net),
    },
  };
}

export interface ProjectProfit {
  project: Project;
  revenue: number;
  direct: number;
  margin: number;
  marginPct: number;
  overheadShare: number;
  net: number;
  costByUser: { userId: string; amount: number }[];
}

/** Loyihalar kesimida: daromad − loyiha tannarxi = marja; doimiy xarajat daromad ulushiga ko'ra taqsimlanadi. */
export function projectProfitability(s: ErpState, months: string[], today: string): ProjectProfit[] {
  const all = pnl(s, months, today);
  const overheadTotal = all.sum.overhead;
  const rows = s.projects.map((project) => {
    const r = pnl(s, months, today, project.id);
    const set = new Set(months);
    // Xodimlar bo'yicha to'g'ridan-to'g'ri xarajat — P&L bilan bir xil qoida (davr kunlariga taqsimlash va joriy davr ulushi)
    const byUser = new Map<string, number>();
    const put = (uid: string, m: string, v: number) => set.has(m) && byUser.set(uid, (byUser.get(uid) ?? 0) + v);
    for (const a of s.accruals) {
      if (a.projectId !== project.id) continue;
      const l = a.kind === "manual" ? ACCRUAL_LINE.piece : ACCRUAL_LINE[a.kind];
      if (l.section !== "direct") continue;
      const per = a.kind === "project" ? accrualPeriod(s, a) : null;
      if (per) {
        const out = new Map<string, number>();
        allocateByDays(a.amount, per.start, per.end, out);
        for (const [m, v] of out) put(a.userId, m, v);
      } else put(a.userId, monthKey(a.date), a.amount);
    }
    const per = project.status === "closed" ? null : currentPeriod(project, today);
    if (per && recurringFee(project, s.settings.usdRate, per.start) > 0) {
      const total = diffDays(per.end, per.start);
      for (const uid of new Set(projectStaff(project))) {
        const rate = profileOf(s, uid).perProject;
        const days =
          rate > 0
            ? workedDays(
                s.users.find((u) => u.id === uid),
                per.start,
                addDays(today, 1),
              )
            : 0;
        if (days <= 0) continue;
        const out = new Map<string, number>();
        allocateByDays((rate * days) / total, per.start, addDays(today, 1), out);
        for (const [m, v] of out) put(uid, m, v);
      }
    }
    return {
      project,
      revenue: r.sum.revenue,
      direct: r.sum.direct,
      margin: r.sum.revenue - r.sum.direct,
      marginPct: r.sum.revenue ? ((r.sum.revenue - r.sum.direct) / r.sum.revenue) * 100 : 0,
      overheadShare: 0,
      net: 0,
      costByUser: [...byUser.entries()].map(([userId, amount]) => ({ userId, amount })).sort((a, b) => b.amount - a.amount),
    };
  });
  const revTotal = rows.reduce((a, r) => a + r.revenue, 0);
  for (const r of rows) {
    r.overheadShare = revTotal ? (overheadTotal * r.revenue) / revTotal : 0;
    r.net = r.margin - r.overheadShare;
  }
  return rows.filter((r) => r.revenue || r.direct).sort((a, b) => b.net - a.net);
}

// ---------- Pul oqimi (Cash Flow) ----------

export interface CashFlowRow {
  label: string;
  values: Record<string, number>;
  total: number;
}

export interface CashFlowSection {
  key: "operating" | "transit" | "investing" | "financing";
  title: string;
  rows: CashFlowRow[];
  net: Record<string, number>;
}

const CF_SECTION: Partial<Record<ArticleGroup, CashFlowSection["key"]>> = {
  client: "operating",
  revenue: "operating",
  payroll: "operating",
  direct: "operating",
  overhead: "operating",
  tax: "operating",
  vendor: "operating",
  transit: "transit",
  investing: "investing",
  financing: "financing",
};

export function cashFlow(s: ErpState, months: string[]) {
  const first = months[0]!;
  const openingUZS = s.accounts.reduce((a, acc) => a + acc.opening * (acc.currency === "USD" ? s.settings.usdRate : 1), 0);
  let running = openingUZS;
  for (const t of s.transactions) if (t.date < `${first}-01`) running += signedUZS(s, t);

  const set = new Set(months);
  const sections: CashFlowSection[] = [
    { key: "operating", title: "Operatsion faoliyat", rows: [], net: {} },
    { key: "transit", title: "Tranzit: mijozlar reklama byudjeti", rows: [], net: {} },
    { key: "investing", title: "Investitsion faoliyat", rows: [], net: {} },
    { key: "financing", title: "Moliyaviy faoliyat", rows: [], net: {} },
  ];
  const rowMap = new Map<string, CashFlowRow>();
  const fx: Record<string, number> = {};
  for (const t of s.transactions) {
    const m = monthKey(t.date);
    if (!set.has(m)) continue;
    const art = articleOf(s, t.articleId);
    if (!art) continue;
    const v = signedUZS(s, t);
    if (art.group === "transfer") {
      fx[m] = (fx[m] ?? 0) + v;
      continue;
    }
    const key = CF_SECTION[art.group] ?? "operating";
    const sec = sections.find((x) => x.key === key)!;
    const label = art.name;
    const rk = `${key}:${art.id}:${t.dir}`;
    let row = rowMap.get(rk);
    if (!row) {
      row = { label: `${t.dir === "in" ? "+" : "−"} ${label}`, values: {}, total: 0 };
      rowMap.set(rk, row);
      sec.rows.push(row);
    }
    row.values[m] = (row.values[m] ?? 0) + v;
    row.total += v;
    sec.net[m] = (sec.net[m] ?? 0) + v;
  }
  for (const sec of sections) sec.rows.sort((a, b) => b.total - a.total);

  const opening: Record<string, number> = {};
  const net: Record<string, number> = {};
  const closing: Record<string, number> = {};
  for (const m of months) {
    opening[m] = running;
    net[m] = sections.reduce((a, sec) => a + (sec.net[m] ?? 0), 0) + (fx[m] ?? 0);
    running += net[m]!;
    closing[m] = running;
  }
  return { months, sections, fx, opening, net, closing };
}

// ---------- Debitorlik va kreditorlik ----------

/** Mijoz pulidan bizda turgan reklama byudjeti (so'mda). */
export function transitBalance(s: ErpState, projectId?: string): number {
  let b = 0;
  for (const t of s.transactions) {
    if (projectId && t.projectId !== projectId) continue;
    if (articleOf(s, t.articleId)?.group === "transit") b += signedUZS(s, t);
  }
  return b;
}

export interface ReceivableRow {
  project: Project;
  invoiced: number;
  paid: number;
  balance: number;
  notDue: number;
  d30: number;
  d60: number;
  d60plus: number;
  advance: number;
}

export function receivables(s: ErpState, today: string): ReceivableRow[] {
  return s.projects
    .map((project) => {
      const invs = liveInvoices(s).filter((i) => i.projectId === project.id && i.issueDate <= today);
      const row: ReceivableRow = { project, invoiced: 0, paid: 0, balance: 0, notDue: 0, d30: 0, d60: 0, d60plus: 0, advance: 0 };
      for (const inv of invs) {
        const paid = invoicePaid(s, inv);
        row.invoiced += inv.amount;
        row.paid += paid;
        const out = invoiceOutstanding(s, inv);
        if (out > 0) {
          const late = inv.dueDate ? diffDays(today, inv.dueDate) : 0;
          if (late <= 0) row.notDue += out;
          else if (late <= 30) row.d30 += out;
          else if (late <= 60) row.d60 += out;
          else row.d60plus += out;
        }
        // Olingan avans: to'lov hozirgacha ko'rsatilgan xizmatdan oshgan qismi (kelgusi davr daromadi).
        row.advance += Math.max(0, paid - (inv.amount - unrecognizedRevenue(s, inv, today)));
      }
      row.balance = row.invoiced - row.paid;
      return row;
    })
    .filter((r) => r.invoiced || r.paid);
}

export function payables(s: ErpState, today: string) {
  const employees = s.users
    .map((user) => ({ user, balance: employeeBalance(s, user.id, today) }))
    .filter((r) => Math.abs(r.balance) > 0.5)
    .sort((a, b) => b.balance - a.balance);
  const vendors = s.vendors
    .map((vendor) => {
      const bills = s.bills.filter((b) => b.vendorId === vendor.id && b.date <= today);
      let outstanding = 0;
      let overdue = 0;
      for (const b of bills) {
        const o = outstandingOf(b.amount, billPaid(s, b));
        outstanding += o;
        if (b.dueDate < today) overdue += o;
      }
      return { vendor, outstanding, overdue };
    })
    .filter((r) => r.outstanding > 0.5);
  const advances = receivables(s, today)
    .filter((r) => r.advance > 0.5)
    .map((r) => ({ project: r.project, amount: r.advance }));
  const transit = s.projects.map((project) => ({ project, amount: transitBalance(s, project.id) })).filter((r) => r.amount > 0.5);
  return { employees, vendors, advances, transit };
}

// ---------- Akt-sverka ----------

export interface ReconRow {
  date: string;
  doc: string;
  debit: number;
  credit: number;
}

/**
 * Mijoz bilan: debet — biz ko'rsatgan xizmat (faktura), kredit — mijoz to'lovi.
 * Yakuniy saldo musbat — mijoz bizga qarzdor.
 */
export function reconClient(s: ErpState, projectId: string, from: string, to: string) {
  const rows: (ReconRow & { before: boolean })[] = [];
  for (const inv of liveInvoices(s)) {
    if (inv.projectId !== projectId || inv.issueDate > to) continue;
    rows.push({ date: inv.issueDate, doc: `Hisob-faktura ${inv.number} — ${inv.note}`, debit: inv.amount, credit: 0, before: inv.issueDate < from });
  }
  for (const t of s.transactions) {
    if (t.projectId !== projectId || !t.invoiceId || t.date > to) continue;
    const inv = s.invoices.find((i) => i.id === t.invoiceId);
    const usd = inv?.usd ? ` — $${fmtUsd(Math.abs(txInvoiceUsd(s, t, inv)))}` : "";
    rows.push({
      date: t.date,
      doc: `To'lov (${inv?.number ?? "—"})${usd}${t.note ? ` — ${t.note}` : ""}`,
      debit: 0,
      credit: inv ? txBookUZS(s, t, inv) : signedUZS(s, t),
      before: t.date < from,
    });
  }
  return finishRecon(rows);
}

/**
 * Xodim bilan: kredit — hisoblangan ish haqi (kompaniya qarzi), debet — to'langan.
 * Yakuniy saldo musbat — kompaniya xodimga qarzdor.
 */
export function reconEmployee(s: ErpState, userId: string, from: string, to: string) {
  const rows: (ReconRow & { before: boolean })[] = [];
  for (const a of s.accruals) {
    if (a.userId !== userId || a.date > to) continue;
    rows.push({ date: a.date, doc: a.title, debit: a.amount < 0 ? -a.amount : 0, credit: a.amount > 0 ? a.amount : 0, before: a.date < from });
  }
  for (const t of payoutsOf(s, userId, to)) {
    rows.push({ date: t.date, doc: `To'lov${t.note ? ` — ${t.note}` : ""}`, debit: txUZS(s, t), credit: 0, before: t.date < from });
  }
  const r = finishRecon(rows);
  return { ...r, opening: -r.opening, closing: -r.closing };
}

function finishRecon(all: (ReconRow & { before: boolean })[]) {
  all.sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);
  const opening = all.filter((r) => r.before).reduce((a, r) => a + r.debit - r.credit, 0);
  const rows = all.filter((r) => !r.before).map(({ before: _b, ...r }) => r);
  const debit = rows.reduce((a, r) => a + r.debit, 0);
  const credit = rows.reduce((a, r) => a + r.credit, 0);
  return { opening, rows, debit, credit, closing: opening + debit - credit };
}

// ---------- To'lov kalendari ----------

export interface CalendarItem {
  label: string;
  amount: number;
  kind: "client" | "payroll" | "vendor" | "forecast";
  forecast: boolean;
  overdue?: boolean;
}

export interface CalendarDay {
  date: string;
  items: CalendarItem[];
  net: number;
  balance: number;
}

export function paymentCalendar(s: ErpState, today: string, horizon = 45) {
  const end = addDays(today, horizon);
  const cash = totalCashUZS(s, today);
  const transit = Math.max(0, transitBalance(s));
  const free = cash - transit;
  const items = new Map<string, CalendarItem[]>();
  const push = (date: string, item: CalendarItem) => {
    const d = date < today ? today : date;
    if (d > end) return;
    items.set(d, [...(items.get(d) ?? []), item]);
  };
  const pname = (id: string) => s.projects.find((p) => p.id === id)?.name ?? "—";

  // Kirim: to'lanmagan fakturalar
  for (const inv of s.invoices) {
    const out = invoiceOutstanding(s, inv);
    if (out <= 0.5 || !inv.dueDate) continue;
    push(inv.dueDate, { label: `${pname(inv.projectId)} — ${inv.number}`, amount: out, kind: "client", forecast: false, overdue: inv.dueDate < today });
  }
  // Kirim (prognoz): hali chiqarilmagan oylik fakturalar
  for (const p of s.projects) {
    if (!p.periodStart || p.status === "closed") continue;
    for (let i = 1; addMonths(p.periodStart, i) <= end; i++) {
      const due = addMonths(p.periodStart, i);
      if (due <= today) continue;
      if (s.invoices.some((x) => x.projectId === p.id && x.kind === "monthly" && x.periodIndex === i)) continue;
      const fee = recurringFee(p, s.settings.usdRate);
      if (fee > 0) push(due, { label: `${p.name} — ${i + 1}-davr (prognoz)`, amount: fee, kind: "forecast", forecast: true });
    }
  }
  // Chiqim: ta'minotchi hujjatlari
  const vname = (id: string) => s.vendors.find((v) => v.id === id)?.name ?? "—";
  for (const b of s.bills) {
    const out = outstandingOf(b.amount, billPaid(s, b));
    if (out <= 0) continue;
    push(b.dueDate, { label: `${vname(b.vendorId)} — ${b.note}`, amount: -out, kind: "vendor", forecast: false, overdue: b.dueDate < today });
  }
  // Chiqim (prognoz): takrorlanuvchi xarajatlar — har ta'minotchining oxirgi hujjati keyingi oyga ko'chiriladi
  for (const v of s.vendors) {
    const last = s.bills.filter((b) => b.vendorId === v.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last || diffDays(today, last.date) > 45) continue;
    for (let k = 1; k <= 2; k++) {
      const due = addMonths(last.dueDate, k);
      if (due <= today || due > end) continue;
      push(due, { label: `${v.name} — ${last.note} (prognoz)`, amount: -last.amount, kind: "forecast", forecast: true });
    }
  }
  // Chiqim: ish haqi to'lov kunlarida
  const paydays: string[] = [];
  for (let k = 0; k <= 2; k++) {
    const d = `${shiftMonthKey(monthKey(today), k)}-${String(s.settings.payday).padStart(2, "0")}`;
    if (d >= today && d <= end) paydays.push(d);
  }
  const owed = s.users.reduce((a, u) => a + Math.max(0, employeeBalance(s, u.id)), 0);
  const last3 = [1, 2, 3].map((k) => shiftMonthKey(monthKey(today), -k));
  const avgPayroll = s.accruals.filter((a) => last3.includes(monthKey(a.date))).reduce((x, a) => x + a.amount, 0) / 3;
  paydays.forEach((d, i) => {
    if (i === 0) push(d, { label: "Ish haqi: hisoblangan va to'lanmagan qoldiq", amount: -owed, kind: "payroll", forecast: false });
    else push(d, { label: "Ish haqi (o'rtacha oylik fond, prognoz)", amount: -avgPayroll, kind: "forecast", forecast: true });
  });

  const days: CalendarDay[] = [];
  let balance = free;
  let firstNegative: string | null = null;
  let min = free;
  for (const date of [...items.keys()].sort()) {
    const its = items.get(date)!;
    const net = its.reduce((a, x) => a + x.amount, 0);
    balance += net;
    if (balance < min) min = balance;
    if (balance < 0 && !firstNegative) firstNegative = date;
    days.push({ date, items: its, net, balance });
  }
  return { cash, transit, free, days, min, firstNegative, end };
}

// ---------- Ko'rsatkichlar ----------

export const lastMonths = (today: string, n: number) => Array.from({ length: n }, (_, i) => shiftMonthKey(monthKey(today), i - n + 1));

/** MRR — faol loyihalarning oylik abonent to'lovlari yig'indisi (bir martalik xizmatlar kirmaydi). */
export function mrr(s: ErpState, today: string): number {
  return s.projects.filter((p) => p.status !== "closed" && currentPeriod(p, today)).reduce((a, p) => a + recurringFee(p, s.settings.usdRate), 0);
}

/** Xizmatlar kesimida daromad (P&L qatorlaridan): xizmat → summa. */
export function revenueByService(s: ErpState, months: string[], today: string): { kind: string; label: string; amount: number }[] {
  return pnl(s, months, today)
    .lines.filter((l) => l.section === "revenue")
    .map((l) => ({ kind: l.key.replace(/^rev_/, ""), label: l.label, amount: l.total }))
    .sort((a, b) => b.amount - a.amount);
}

export function clientCashIn(s: ErpState, month: string): number {
  return s.transactions.filter((t) => monthKey(t.date) === month && articleOf(s, t.articleId)?.group === "client").reduce((a, t) => a + signedUZS(s, t), 0);
}
