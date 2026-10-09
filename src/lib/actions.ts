// Biznes amallari. Har biri Ctx oladi: holatni o'zgartiradi, bildirishnoma yuboradi va tarixga yozadi.
import { addDays, diffDays, fmtDate, fmtDateShort, fmtDeadline, fmtMonth, fmtMoney, fmtNum, fmtUsd, nowISO } from "./dates";
import { contentTypes, findQuota, isAdType, quotaText, typeName } from "./content";
import type { MetaResult } from "./integrations";
import {
  ART,
  accountOf,
  articleOf,
  billPaid,
  employeeBalance,
  invoiceOutstandingUsd,
  invoicePaid,
  invoiceSettled,
  nextInvoiceNumber,
  pieceAccrual,
  taskWorkType,
  txUZS,
} from "./finance";
import { DOC_BLOCKS, FORMAT_LABELS, LEAD_STAGES, PLATFORM_LABELS, POST_STATUSES, ROLE_LABELS, TASK_KIND_LABELS, platformsText } from "./labels";
import {
  hasAds,
  isRecurring,
  recurringFee,
  recurringLines,
  refreshUsdPrices,
  isUsd,
  serviceLabel,
  serviceHasAds,
  serviceOf,
  servicePrepayPaid,
  servicesSummary,
  stageIndex,
  linesUsd,
  round2,
  stagesFor,
  type ServiceInput,
} from "./services";
import { isTaskOpen, lateness, postStage, workBlockedReason } from "./rules";
import { currentPeriod, periodAt } from "./period";
import { newId, type Ctx } from "./store";
import { acceptedIds, defaultPicks, nextProposalNumber, proposalPrice, tariffOf, tariffService } from "./tariffs";
import type {
  Bill,
  BudgetLine,
  ContentType,
  DocBlock,
  Invoice,
  InvoiceLine,
  Platform,
  ProjectService,
  ServiceKind,
  IntegrationKind,
  Integrations,
  Lead,
  LeadStage,
  PayProfile,
  Post,
  PostStatus,
  Project,
  Shoot,
  Tariff,
  Task,
  TargetReport,
  Transaction,
  WorkType,
} from "./types";

/** Voronka bosqichi raqami (rad etilgan bosqichlar avvalgi eng yuqori bosqichni saqlaydi). */
export const FUNNEL_STEP: Partial<Record<LeadStage, number>> = { new: 0, waiting: 1, meeting: 2, visited: 3, contract: 4 };

const stageLabel = (s: LeadStage) => LEAD_STAGES.find((x) => x.id === s)?.label ?? s;
const projectName = (c: Ctx, id: string) => c.s.projects.find((p) => p.id === id)?.name ?? "—";
const findProject = (c: Ctx, id: string) => c.s.projects.find((p) => p.id === id);
const marketologsOf = (c: Ctx, projectId: string) => {
  const p = findProject(c, projectId);
  return [p?.marketologId, ...c.s.users.filter((u) => u.role === "marketolog" && u.active).map((u) => u.id)];
};
const financeIds = (c: Ctx) => c.s.users.filter((u) => u.role === "moliya" && u.active).map((u) => u.id);

/** Ishbay hisoblash yozuvi (takrorlanmaydi) va xodimga xabar. */
function accruePiece(c: Ctx, userId: string, wt: WorkType, projectId: string | undefined, title: string, sourceId: string) {
  if (c.s.accruals.some((a) => a.sourceId === sourceId)) return null;
  const a = pieceAccrual(c.s, userId, wt, { projectId, date: c.today, sourceId, title, createdBy: "system", id: newId("acr") });
  if (!a) return null;
  c.s.accruals.push(a);
  c.notify([userId], `Hisoblandi: ${title} — ${fmtMoney(a.amount)}`, "/hisobim");
  return a;
}

function assertWorkAllowed(c: Ctx, projectId: string) {
  const p = findProject(c, projectId);
  const reason = p ? workBlockedReason(c.s, p) : "Loyiha topilmadi";
  if (reason) throw new Error(reason);
}

// ---------- CRM ----------

export function saveLead(c: Ctx, data: Omit<Lead, "id" | "history" | "createdAt" | "stage"> & { id?: string }) {
  if (data.id) {
    const l = c.s.leads.find((x) => x.id === data.id);
    if (!l) return;
    Object.assign(l, data);
    c.log(`${l.name}: lid ma'lumotlari yangilandi`, "/crm");
    return;
  }
  const lead: Lead = { ...data, id: newId("lead"), stage: "new", maxStep: 0, history: [], createdAt: nowISO() };
  c.s.leads.unshift(lead);
  c.notify([lead.operatorId], `Yangi lid: ${lead.name} (${lead.phone})`, "/crm");
  c.log(`Yangi lid qo'shildi: ${lead.name}`, "/crm");
}

export function addContact(c: Ctx, leadId: string, text: string, nextContactDate?: string) {
  const l = c.s.leads.find((x) => x.id === leadId);
  if (!l || !text.trim()) return;
  l.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text: text.trim() });
  l.maxStep = Math.max(l.maxStep ?? 0, 1);
  if (nextContactDate !== undefined) l.nextContactDate = nextContactDate || undefined;
  c.log(`${l.name}: aloqa tarixi to'ldirildi`, "/crm");
}

export function moveLead(c: Ctx, leadId: string, stage: LeadStage, extra: { meeting?: Lead["meeting"]; reason?: string } = {}) {
  const l = c.s.leads.find((x) => x.id === leadId);
  if (!l) return;
  if (stage === "meeting") {
    if (!extra.meeting?.date || !extra.meeting.time || !extra.meeting.marketologId) {
      throw new Error("Uchrashuv uchun sana, vaqt va marketolog majburiy");
    }
    l.meeting = extra.meeting;
    c.notify([extra.meeting.marketologId], `Yangi uchrashuv belgilandi: ${l.name}, ${fmtDate(extra.meeting.date)} ${extra.meeting.time}`, "/crm");
  }
  if (stage === "unfit" || stage === "lowquality") {
    if (!extra.reason?.trim()) throw new Error("Sabab majburiy");
    l.rejectReason = extra.reason.trim();
  }
  const from = l.stage;
  l.stage = stage;
  l.maxStep = Math.max(l.maxStep ?? 0, FUNNEL_STEP[stage] ?? 0);
  l.history.unshift({
    id: newId("c"),
    at: nowISO(),
    userId: c.me.id,
    text: `Bosqich: ${stageLabel(from)} → ${stageLabel(stage)}${extra.reason ? ` (${extra.reason})` : ""}`,
  });
  c.log(`${l.name}: bosqich → ${stageLabel(stage)}`, "/crm");
}

export type { ServiceInput };

export interface ProjectInput {
  name: string;
  contactName: string;
  phone: string;
  industry: string;
  links: string;
  contractNo: string;
  contractDate: string;
  /** Oylik xizmatlar uchun oldindan to'lov turi. */
  prepayType: 100 | 50;
  prepayDueDate: string;
  remainderDueDate: string;
  marketologId: string;
  smmId: string;
  targetologId?: string;
  adBudgetUsd?: number;
  /** Shartnoma valyutasi (bo'lmasa — so'm). Dollarda bo'lsa xizmat narxi priceUsd da. */
  currency?: "UZS" | "USD";
  services: ServiceInput[];
}

const MAX_USD = 10_000_000;

/** Dollardagi shartnomada narx dollarda kiritiladi, so'mdagi qiymati joriy kurs bo'yicha hisoblanadi. */
function priceInput<T extends { price?: number; priceUsd?: number; kind?: ServiceKind }>(x: T, usd: boolean, usdRate: number): T {
  if (!usd) {
    const rest = { ...x };
    delete rest.priceUsd;
    return rest;
  }
  if (x.priceUsd === undefined) return x;
  if (!(x.priceUsd > 0)) throw new Error(`${x.kind ? `${serviceLabel(x.kind)}: ` : ""}narxni dollarda kiriting`);
  if (x.priceUsd > MAX_USD) throw new Error("Narx juda katta — nollarni tekshiring");
  return { ...x, priceUsd: round2(x.priceUsd), price: Math.round(round2(x.priceUsd) * usdRate) };
}

/** Fakturani bekor qilish (faqat to'lanmagan). */
function voidInv(inv: Invoice, date: string, reason: string) {
  inv.voidedAt = date;
  inv.voidReason = reason;
}

/** Oylik faktura davri boshlanganmi (boshlanmagan davr fakturasi xizmat to'xtatilsa bekor qilinadi). */
function servicePeriodStarted(c: Ctx, p: Project, inv: Invoice): boolean {
  if (!p.periodStart) return false;
  const per = periodAt(p, inv.periodIndex);
  return Boolean(per && per.start <= c.today);
}

/** Moliya: to'lanmagan fakturani sabab bilan bekor qilish. */
export function voidInvoice(c: Ctx, invoiceId: string, reason: string) {
  const inv = c.s.invoices.find((x) => x.id === invoiceId);
  if (!inv || inv.voidedAt) return;
  if (!reason.trim()) throw new Error("Bekor qilish sababini yozing");
  if (invoicePaid(c.s, inv) > 0.5) throw new Error("Faktura bo'yicha to'lov bor — bekor qilib bo'lmaydi");
  const svc = inv.serviceId ? serviceOf(c.s, inv.serviceId)?.service : undefined;
  if (svc && svc.status !== "cancelled")
    throw new Error(
      `Bu ${serviceLabel(svc.kind)} xizmati fakturasi — bekor qilish uchun loyiha kartasida xizmatni to'xtating (narx kelishilgan bo'lsa — narxni o'zgartiring)`,
    );
  voidInv(inv, c.today, reason.trim());
  c.log(`Faktura ${inv.number} bekor qilindi: ${reason.trim()} (${projectName(c, inv.projectId)})`, "/moliya/fakturalar");
}

/** Xizmatlar o'zgarganda loyihaning hisoblangan maydonlari: oylik summa, qisqa tavsif, SMM paketi. */
function refreshProject(c: Ctx, p: Project) {
  refreshUsdPrices(p, c.s.settings.usdRate);
  p.monthlyFee = recurringFee(p, c.s.settings.usdRate);
  p.tariff = servicesSummary(p.services);
  p.tariffId = p.services.find((x) => x.kind === "smm" && x.status !== "cancelled")?.tariffId;
}

function buildService(input: ServiceInput, date: string): ProjectService {
  const once = !isRecurring(input.kind);
  return {
    ...input,
    id: newId("svc"),
    prepayPct: once ? (input.prepayPct ?? 50) : undefined,
    startDate: input.startDate || date,
    stages: once ? stagesFor(input.kind) : undefined,
    status: "active",
    createdAt: nowISO(),
  };
}

function validateService(x: ServiceInput) {
  if (!(x.price > 0)) throw new Error(`${serviceLabel(x.kind)}: narxni kiriting`);
  if (!isRecurring(x.kind) && !x.assigneeId) throw new Error(`${serviceLabel(x.kind)}: ijrochini tanlang`);
}

/** Qatorlarni ulushga ko'ra kichraytiradi (oldindan / qoldiq to'lov), yig'indi aniq summaga teng bo'ladi. */
function scaleLines(lines: InvoiceLine[], amount: number): InvoiceLine[] {
  const total = lines.reduce((a, l) => a + l.amount, 0) || 1;
  const out = lines.map((l) => ({
    ...l,
    amount: Math.round((l.amount * amount) / total),
    ...(l.usd !== undefined ? { usd: round2((l.usd * amount) / total) } : {}),
  }));
  const diff = amount - out.reduce((a, l) => a + l.amount, 0);
  if (out.length) out[out.length - 1]!.amount += diff;
  // Dollardagi qatorlar ham ulushga ko'ra; yig'indi sentgacha aniq
  const fullUsd = linesUsd(lines);
  if (fullUsd !== undefined && out.length) {
    const want = round2((fullUsd * amount) / total);
    out[out.length - 1]!.usd = round2(out[out.length - 1]!.usd! + want - linesUsd(out)!);
  }
  return out;
}

/** Oylik xizmatlar uchun 1-davr fakturalari (oldindan va kerak bo'lsa qoldiq). */
function recurringStartInvoices(c: Ctx, p: Project, issueDate: string, prepayDue: string, remainderDue: string, only?: InvoiceLine[]) {
  const lines = only ?? recurringLines(p, c.s.settings.usdRate);
  const fee = lines.reduce((a, l) => a + l.amount, 0);
  if (fee <= 0) return;
  const prepay = Math.round((fee * p.prepayType) / 100);
  const base = { projectId: p.id, periodIndex: 0, issueDate };
  c.s.invoices.push({
    ...base,
    id: newId("inv"),
    number: nextInvoiceNumber(c.s),
    kind: "prepay",
    amount: prepay,
    lines: scaleLines(lines, prepay),
    usd: linesUsd(scaleLines(lines, prepay)),
    dueDate: prepayDue || issueDate,
    note: only ? `1-davr: qo'shilgan xizmat — oldindan to'lov (${p.prepayType}%)` : `Oldindan to'lov (${p.prepayType}%)`,
  });
  if (p.prepayType === 50) {
    c.s.invoices.push({
      ...base,
      id: newId("inv"),
      number: nextInvoiceNumber(c.s),
      kind: "remainder",
      amount: fee - prepay,
      lines: scaleLines(lines, fee - prepay),
      usd: linesUsd(scaleLines(lines, fee - prepay)),
      dueDate: remainderDue,
      note: "Qoldiq to'lov (50%)",
    });
  }
}

/** Bir martalik xizmat: oldindan to'lov fakturasi. Qolgani topshirilganda chiqariladi. */
function serviceStartInvoice(c: Ctx, p: Project, svc: ProjectService, issueDate: string, dueDate: string): Invoice {
  const pct = svc.prepayPct ?? 50;
  const amount = Math.round((svc.price * pct) / 100);
  const usd = isUsd(p) && svc.priceUsd !== undefined ? round2((svc.priceUsd * pct) / 100) : undefined;
  const inv: Invoice = {
    id: newId("inv"),
    number: nextInvoiceNumber(c.s),
    projectId: p.id,
    serviceId: svc.id,
    kind: "prepay",
    periodIndex: 0,
    amount,
    lines: [{ kind: svc.kind, title: `${serviceLabel(svc.kind)}${svc.title ? ` — ${svc.title}` : ""}`, amount, ...(usd !== undefined ? { usd } : {}) }],
    ...(usd !== undefined ? { usd } : {}),
    issueDate,
    dueDate: dueDate || issueDate,
    note: `${serviceLabel(svc.kind)}: oldindan to'lov (${pct}%)`,
  };
  c.s.invoices.push(inv);
  return inv;
}

/** "Shartnoma bo'ldi": lid ma'lumotlari avtomatik Loyiha kartasiga ko'chadi. */
export function createProject(c: Ctx, input: ProjectInput, leadId?: string): string {
  if (!input.name.trim()) throw new Error("Mijoz nomini kiriting");
  if (!input.contractNo.trim()) throw new Error("Shartnoma raqamini kiriting");
  if (c.s.projects.some((p) => p.contractNo.trim().toLowerCase() === input.contractNo.trim().toLowerCase()))
    throw new Error(`Shartnoma № ${input.contractNo.trim()} allaqachon bor — boshqa raqam kiriting`);
  if (!isDate(input.contractDate)) throw new Error("Shartnoma sanasini tanlang");
  const usdContract = input.currency === "USD";
  if (usdContract && input.services.some((x) => x.priceUsd === undefined)) throw new Error("Dollardagi shartnoma: har bir xizmat narxini dollarda kiriting");
  input = { ...input, services: input.services.map((x) => priceInput(x, usdContract, c.s.settings.usdRate)) };
  if (input.services.some((x) => x.price > MAX_UZS)) throw new Error("Xizmat narxi juda katta — nollarni tekshiring");
  if (!input.services.length) throw new Error("Kamida bitta xizmatni qo'shing");
  input.services.forEach(validateService);
  const id = newId("prj");
  const docs = Object.fromEntries(DOC_BLOCKS.map((b) => [b.id, { content: "", status: "progress" }])) as Project["docs"];
  const { prepayDueDate, remainderDueDate, services, currency, ...rest } = input;
  const project: Project = {
    ...rest,
    ...(currency === "USD" ? { currency } : {}),
    id,
    leadId,
    tariff: "",
    monthlyFee: 0,
    services: services.map((x) => buildService(x, input.contractDate)),
    pauseWork: false,
    status: "active",
    docs,
    createdAt: nowISO(),
  };
  refreshProject(c, project);
  c.s.projects.push(project);
  recurringStartInvoices(c, project, input.contractDate, prepayDueDate, remainderDueDate);
  for (const svc of project.services) if (!isRecurring(svc.kind)) serviceStartInvoice(c, project, svc, input.contractDate, prepayDueDate);
  if (leadId) {
    const l = c.s.leads.find((x) => x.id === leadId);
    if (l) {
      const from = l.stage;
      l.stage = "contract";
      l.maxStep = 4;
      l.projectId = id;
      l.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text: `Bosqich: ${stageLabel(from)} → Shartnoma bo'ldi` });
      // Operatorga shartnoma bonusi (stavkasi bo'lsa)
      const a = pieceAccrual(c.s, l.operatorId, "shartnoma", {
        projectId: id,
        date: input.contractDate,
        sourceId: `lead:${l.id}`,
        title: `Shartnoma bonusi: ${input.name}`,
        createdBy: c.me.id,
        id: newId("acr"),
      });
      if (a && !c.s.accruals.some((x) => x.sourceId === a.sourceId)) {
        c.s.accruals.push(a);
        c.notify([l.operatorId], `Bonus hisoblandi: ${input.name} shartnomasi uchun ${fmtMoney(a.amount)}`, "/hisobim");
      }
    }
  }
  c.notify(
    [input.marketologId, project.monthlyFee > 0 ? input.smmId || undefined : undefined, project.targetologId],
    `Yangi loyiha: ${input.name} (shartnoma ${input.contractNo}) — ${project.tariff}`,
    `/loyiha/${id}`,
  );
  for (const svc of project.services)
    if (svc.assigneeId)
      c.notify(
        [svc.assigneeId],
        `${input.name}: sizga yangi ish — ${serviceLabel(svc.kind)}${svc.deadline ? `, muddat ${fmtDate(svc.deadline)}` : ""}`,
        "/mening",
      );
  c.notify(financeIds(c), `${input.name}: oldindan to'lovni qayd eting (${project.tariff})`, "/moliya/fakturalar");
  c.log(`${input.name}: loyiha kartasi yaratildi${leadId ? " (lid → loyiha)" : ""} — ${project.tariff}`, `/loyiha/${id}`);
  return id;
}

// ---------- Xizmatlar ----------

/** Mavjud mijozga yangi xizmat qo'shish (masalan, SMM mijozi sayt buyurtma qildi). */
export function addService(c: Ctx, projectId: string, input: ServiceInput, o: { dueDate?: string; prorate?: boolean } = {}) {
  const p = findProject(c, projectId);
  if (!p) return;
  if (isUsd(p) && input.priceUsd === undefined) throw new Error("Dollardagi shartnoma: narxni dollarda kiriting");
  input = priceInput(input, isUsd(p), c.s.settings.usdRate);
  if (input.price > MAX_UZS) throw new Error("Narx juda katta — nollarni tekshiring");
  validateService(input);
  // Reklama yoki SMM xizmatiga mas'ul xodim bo'lmasa — birinchi faol xodim tayinlanadi (keyin o'zgartirish mumkin)
  const needRole = (role: "targetolog" | "smm", field: "targetologId" | "smmId") => {
    if (p[field] && c.s.users.find((x) => x.id === p[field])?.active) return;
    const u = c.s.users.find((x) => x.role === role && x.active);
    if (!u) throw new Error(`${ROLE_LABELS[role]} yo'q — avval Admin bo'limida xodim qo'shing`);
    p[field] = u.id;
    c.notify([u.id], `${p.name}: sizga biriktirildi (${serviceLabel(input.kind)})`, `/loyiha/${p.id}`);
  };
  if (serviceHasAds(input)) needRole("targetolog", "targetologId");
  if (input.kind === "smm") needRole("smm", "smmId");
  const hadRecurring = recurringLines(p, c.s.settings.usdRate).length > 0;
  const svc = buildService(input, c.today);
  // Ishlayotgan loyihaga keyin qo'shilgan oylik xizmat — shu kundan boshlangan davrlar fakturasiga kiradi
  if (isRecurring(svc.kind) && (hadRecurring || p.periodStart)) svc.billFrom = c.today;
  p.services.push(svc);
  refreshProject(c, p);
  if (isRecurring(svc.kind)) {
    if (!p.periodStart) {
      // Davr hali boshlanmagan: 1-davr uchun oldindan to'lov (oldin oylik xizmat bo'lgan bo'lsa — faqat yangi xizmat qatorlari)
      const only = hadRecurring ? recurringLines({ ...p, services: [svc] }, c.s.settings.usdRate) : undefined;
      recurringStartInvoices(c, p, c.today, o.dueDate ?? c.today, "", only);
    }
  } else serviceStartInvoice(c, p, svc, c.today, o.dueDate ?? c.today);
  const curPer = isRecurring(svc.kind) && p.periodStart ? currentPeriod(p, c.today) : null;
  // Joriy davrning qolgan kunlari uchun (kunlarga bo'lib) qo'shimcha faktura — so'ralgan bo'lsa
  let prorated = 0;
  if (curPer && o.prorate) {
    const left = diffDays(curPer.end, c.today);
    const total = diffDays(curPer.end, curPer.start);
    const fee = recurringFee({ ...p, services: [svc] }, c.s.settings.usdRate);
    const feeUsd = linesUsd(recurringLines({ ...p, services: [svc] }, c.s.settings.usdRate));
    prorated = Math.round((fee * left) / total / 1000) * 1000;
    const proUsd = feeUsd !== undefined ? round2((feeUsd * left) / total) : undefined;
    if (prorated > 0) {
      c.s.invoices.push({
        id: newId("inv"),
        number: nextInvoiceNumber(c.s),
        projectId: p.id,
        kind: "extra",
        periodIndex: curPer.index,
        amount: prorated,
        lines: [
          {
            kind: svc.kind,
            title: `${serviceLabel(svc.kind)} — joriy davrning ${left} kuni`,
            amount: prorated,
            ...(proUsd !== undefined ? { usd: proUsd } : {}),
          },
        ],
        ...(proUsd !== undefined ? { usd: proUsd } : {}),
        issueDate: c.today,
        dueDate: o.dueDate || addDays(c.today, 3),
        note: `${serviceLabel(svc.kind)}: ${fmtDate(c.today)} – ${fmtDate(addDays(curPer.end, -1))} (${left}/${total} kun)`,
      });
    }
  }
  const midPeriod = Boolean(curPer) && !prorated;
  c.notify(
    [p.marketologId, ...financeIds(c)],
    `${p.name}: yangi xizmat — ${serviceLabel(svc.kind)} (${fmtMoney(svc.price)})${
      midPeriod ? ". Joriy davr uchun faktura chiqmaydi — keyingi davrdan boshlab; kerak bo'lsa «Qo'shimcha xizmat» fakturasi chiqaring" : ""
    }`,
    `/loyiha/${p.id}`,
  );
  c.notify([svc.assigneeId], `${p.name}: sizga yangi ish — ${serviceLabel(svc.kind)}${svc.deadline ? `, muddat ${fmtDate(svc.deadline)}` : ""}`, "/mening");
  c.log(`${p.name}: xizmat qo'shildi — ${serviceLabel(svc.kind)}`, `/loyiha/${p.id}`);
}

export function updateService(c: Ctx, projectId: string, serviceId: string, patch: Partial<ServiceInput>) {
  const p = findProject(c, projectId);
  const svc = p?.services.find((x) => x.id === serviceId);
  if (!p || !svc) return;
  if (isUsd(p) && patch.price !== undefined && patch.priceUsd === undefined) throw new Error("Dollardagi shartnoma: narxni dollarda kiriting");
  patch = priceInput(patch, isUsd(p), c.s.settings.usdRate);
  if (patch.price !== undefined && !(patch.price > 0)) throw new Error("Narxni kiriting");
  if (patch.price !== undefined && patch.price > MAX_UZS) throw new Error("Narx juda katta — nollarni tekshiring");
  if (svc.status !== "active") throw new Error("Faqat faol xizmatni o'zgartirish mumkin");
  if (patch.price !== undefined && !isRecurring(svc.kind)) {
    const invs = c.s.invoices.filter((x) => x.serviceId === svc.id && !x.voidedAt);
    if (patch.priceUsd !== undefined) {
      const billedUsd = round2(invs.reduce((a, x) => a + (x.usd ?? 0), 0));
      if (patch.priceUsd < billedUsd) throw new Error(`Narx chiqarilgan fakturalardan ($${fmtUsd(billedUsd)}) kam bo'lishi mumkin emas`);
    } else {
      const billed = invs.reduce((a, x) => a + x.amount, 0);
      if (patch.price < billed) throw new Error(`Narx chiqarilgan fakturalardan (${fmtMoney(billed)}) kam bo'lishi mumkin emas`);
    }
  }
  if (patch.assigneeId && !c.s.users.find((u) => u.id === patch.assigneeId)?.active) throw new Error("Ijrochini tanlang (faol xodim)");
  if (patch.deadline !== undefined && patch.deadline && !isDate(patch.deadline)) throw new Error("Muddatni tanlang");
  if (patch.assigneeId && patch.assigneeId !== svc.assigneeId) {
    c.notify([patch.assigneeId], `${p.name}: sizga ish biriktirildi — ${serviceLabel(svc.kind)}`, "/mening");
  }
  Object.assign(svc, patch);
  refreshProject(c, p);
  c.log(`${p.name}: ${serviceLabel(svc.kind)} — shartlar yangilandi`, `/loyiha/${p.id}`);
}

/** Xizmatni to'xtatish: oylik xizmat keyingi fakturalarga kirmaydi; bir martalik — bekor qilinadi. */
export function cancelService(c: Ctx, projectId: string, serviceId: string) {
  const p = findProject(c, projectId);
  const svc = p?.services.find((x) => x.id === serviceId);
  if (!p || !svc) return;
  if (svc.deliveredAt) throw new Error("Topshirilgan xizmatni bekor qilib bo'lmaydi");
  svc.status = "cancelled";
  svc.cancelledAt = c.today;
  refreshProject(c, p);
  // To'lanmagan fakturalar bekor qilinadi: bir martalik xizmatniki — hammasi; oylik xizmatniki — boshlanmagan davrlar
  // (faqat shu xizmat qatorlari bo'lgan fakturalar). Qisman to'langanlari qoladi — moliya qaytarishni hal qiladi.
  const voided: string[] = [];
  const kept: string[] = [];
  for (const inv of c.s.invoices) {
    if (inv.projectId !== p.id || inv.voidedAt) continue;
    const mine = isRecurring(svc.kind)
      ? !inv.serviceId &&
        inv.kind !== "extra" &&
        (inv.lines ?? []).length > 0 &&
        inv.lines!.every((l) => l.kind === svc.kind) &&
        !servicePeriodStarted(c, p, inv)
      : inv.serviceId === svc.id;
    if (!mine) continue;
    if (invoicePaid(c.s, inv) > 0.5) kept.push(inv.number);
    else {
      voidInv(inv, c.today, `${serviceLabel(svc.kind)} to'xtatildi`);
      voided.push(inv.number);
    }
  }
  const fin = [
    voided.length ? `bekor qilingan fakturalar: ${voided.join(", ")}` : "",
    kept.length ? `to'langan fakturalar (qaytarishni hal qiling): ${kept.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  c.notify([p.marketologId, ...financeIds(c)], `${p.name}: ${serviceLabel(svc.kind)} to'xtatildi${fin ? ` — ${fin}` : ""}`, `/loyiha/${p.id}`);
  c.notify([svc.assigneeId], `${p.name}: ${serviceLabel(svc.kind)} to'xtatildi — ishni davom ettirmang`, "/mening");
  c.log(`${p.name}: ${serviceLabel(svc.kind)} to'xtatildi`, `/loyiha/${p.id}`);
}

/**
 * Bir martalik xizmat: joriy bosqichni bajarilgan deb belgilaydi.
 * Birinchi bosqichdan keyin ishni davom ettirish uchun oldindan to'lov kelgan bo'lishi kerak.
 * Oxirgi bosqich — topshirish: qoldiq faktura chiqadi, daromad tan olinadi, ijrochiga haq hisoblanadi.
 */
export function advanceServiceStage(c: Ctx, projectId: string, serviceId: string) {
  const p = findProject(c, projectId);
  const svc = p?.services.find((x) => x.id === serviceId);
  if (!p || !svc?.stages) return;
  if (svc.status === "done") return;
  if (svc.status !== "active") throw new Error("Xizmat to'xtatilgan");
  const i = stageIndex(svc);
  if (i >= svc.stages.length) return;
  if (i >= 1 && !servicePrepayPaid(c.s, svc.id, (inv) => invoiceSettled(c.s, inv))) {
    throw new Error("Oldindan to'lov hali kelmagan — ish to'lovdan keyin davom etadi");
  }
  svc.stages[i]!.doneAt = c.today;
  const label = serviceLabel(svc.kind);
  const last = i === svc.stages.length - 1;
  if (!last) {
    const next = svc.stages[i + 1]!.name;
    const text = `${p.name} · ${label}: «${svc.stages[i]!.name}» bajarildi → keyingi: ${next}`;
    c.notify([p.marketologId], text, `/loyiha/${p.id}`);
    c.notify([svc.assigneeId], text, "/mening");
    c.log(`${p.name} · ${label}: «${svc.stages[i]!.name}» bajarildi`, `/loyiha/${p.id}`);
    return;
  }
  svc.deliveredAt = c.today;
  svc.status = "done";
  const preInv = c.s.invoices.filter((x) => x.serviceId === svc.id && !x.voidedAt);
  const pre = preInv.reduce((a, x) => a + x.amount, 0);
  // Dollardagi shartnoma: qoldiq USD da, so'mdagi qiymati — bugungi kurs bo'yicha
  const restUsd = isUsd(p) && svc.priceUsd !== undefined ? round2(svc.priceUsd - preInv.reduce((a, x) => a + (x.usd ?? 0), 0)) : undefined;
  const rest = restUsd !== undefined ? Math.round(restUsd * c.s.settings.usdRate) : svc.price - pre;
  if (rest > 0) {
    c.s.invoices.push({
      id: newId("inv"),
      number: nextInvoiceNumber(c.s),
      projectId: p.id,
      serviceId: svc.id,
      kind: "remainder",
      periodIndex: 0,
      amount: rest,
      lines: [{ kind: svc.kind, title: `${label}${svc.title ? ` — ${svc.title}` : ""}`, amount: rest, ...(restUsd !== undefined ? { usd: restUsd } : {}) }],
      ...(restUsd !== undefined ? { usd: restUsd } : {}),
      issueDate: c.today,
      dueDate: addDays(c.today, 3),
      note: `${label}: topshirildi — qoldiq to'lov`,
    });
  }
  if (svc.assigneeId && svc.assigneeFee && svc.assigneeFee > 0 && !c.s.accruals.some((a) => a.sourceId === `svc:${svc.id}`)) {
    c.s.accruals.push({
      id: newId("acr"),
      userId: svc.assigneeId,
      projectId: p.id,
      date: c.today,
      kind: "piece",
      workType: "xizmat",
      sourceId: `svc:${svc.id}`,
      title: `${p.name}: ${label}${svc.title ? ` (${svc.title})` : ""} topshirildi`,
      qty: 1,
      rate: svc.assigneeFee,
      amount: svc.assigneeFee,
      approved: false,
      createdBy: "system",
    });
    c.notify([svc.assigneeId], `Hisoblandi: ${p.name} — ${label} (${fmtMoney(svc.assigneeFee)})`, "/hisobim");
  }
  const bosses = c.s.users.filter((u) => u.role === "rahbar" && u.active).map((u) => u.id);
  c.notify(
    [p.marketologId, ...bosses, ...financeIds(c)],
    `${p.name}: ${label} topshirildi${rest > 0 ? ` — qoldiq faktura ${fmtMoney(rest)}` : ""}`,
    `/loyiha/${p.id}`,
  );
  c.log(`${p.name}: ${label} mijozga topshirildi`, `/loyiha/${p.id}`);
}

/** Xato bilan belgilangan bosqichni qaytarish (topshirilgan xizmatda emas). */
export function revertServiceStage(c: Ctx, projectId: string, serviceId: string) {
  const p = findProject(c, projectId);
  const svc = p?.services.find((x) => x.id === serviceId);
  if (!p || !svc?.stages || svc.deliveredAt) return;
  const i = stageIndex(svc) - 1;
  if (i < 0) return;
  svc.stages[i]!.doneAt = undefined;
  c.log(`${p.name} · ${serviceLabel(svc.kind)}: «${svc.stages[i]!.name}» qayta ochildi`, `/loyiha/${p.id}`);
}

// ---------- Oylik topshiriq ----------

/** Marketolog loyiha bo'yicha oylik topshiriq beradi; o'zgarish tarixga yoziladi va SMM'ga xabar boradi. */
export function saveQuota(c: Ctx, projectId: string, month: string, counts: Record<string, number>, note = "") {
  const p = findProject(c, projectId);
  if (!p) return;
  const clean = Object.fromEntries(
    Object.entries(counts)
      .filter(([, n]) => Number.isFinite(n) && n >= 0)
      .map(([k, n]) => [k, Math.round(n)]),
  );
  if (!Object.values(clean).some((n) => n > 0)) throw new Error("Kamida bitta turga son kiriting");
  c.s.quotas ??= [];
  const ex = findQuota(c.s, projectId, month);
  const period = `${p.name} · ${fmtMonth(month)}`;
  if (!ex) {
    c.s.quotas.push({
      id: newId("q"),
      projectId,
      month,
      counts: clean,
      note: note.trim(),
      updatedAt: nowISO(),
      updatedBy: c.me.id,
      history: [{ at: nowISO(), userId: c.me.id, text: `Topshiriq berildi: ${quotaText(c.s, clean)}` }],
    });
    c.notify([p.smmId], `📋 ${period} topshirig'i: ${quotaText(c.s, clean)}${note.trim() ? ` (${note.trim()})` : ""}`, "/kontent");
    c.log(`${period}: oylik topshiriq berildi`, `/loyiha/${p.id}`);
    return;
  }
  const keys = [...new Set([...Object.keys(ex.counts), ...Object.keys(clean)])];
  const diff = keys
    .filter((k) => (ex.counts[k] ?? 0) !== (clean[k] ?? 0))
    .map((k) => `${typeName(c.s, k).split(" (")[0]} ${ex.counts[k] ?? 0} → ${clean[k] ?? 0}`);
  if (!diff.length && ex.note === note.trim()) return;
  ex.counts = clean;
  ex.note = note.trim();
  ex.updatedAt = nowISO();
  ex.updatedBy = c.me.id;
  const text = diff.length ? diff.join(", ") : "izoh yangilandi";
  ex.history.unshift({ at: nowISO(), userId: c.me.id, text: `O'zgardi: ${text}${note.trim() ? ` (${note.trim()})` : ""}` });
  c.notify([p.smmId], `📋 ${period} topshirig'i o'zgardi: ${text}`, "/kontent");
  c.log(`${period}: topshiriq o'zgardi — ${text}`, `/loyiha/${p.id}`);
}

/** Kontent turlari ro'yxatini agentlik o'zi to'ldiradi (masalan: «Karusel», «Jonli efir»). */
export function saveContentType(c: Ctx, t: Omit<ContentType, "id"> & { id?: string }) {
  if (!t.name.trim()) throw new Error("Tur nomini kiriting");
  const list = (c.s.settings.contentTypes = [...contentTypes(c.s)]);
  if (t.id) {
    const ex = list.find((x) => x.id === t.id);
    if (ex) Object.assign(ex, { ...t, name: t.name.trim() });
  } else {
    if (list.some((x) => x.name.toLowerCase() === t.name.trim().toLowerCase())) throw new Error("Bunday tur bor");
    list.push({ id: newId("ct"), name: t.name.trim(), format: t.format, active: true });
  }
  c.log(`Kontent turi saqlandi: ${t.name.trim()} (${FORMAT_LABELS[t.format]})`, "/kontent");
}

// ---------- Tariflar va tijorat takliflari ----------// ---------- Tariflar va tijorat takliflari ----------

export function saveTariff(c: Ctx, t: Tariff) {
  if (!t.name.trim()) throw new Error("Tarif nomini kiriting");
  if (!(t.price > 0)) throw new Error("Narxni kiriting");
  const i = c.s.tariffs.findIndex((x) => x.id === t.id);
  if (i >= 0) c.s.tariffs[i] = t;
  else c.s.tariffs.push({ ...t, id: newId("t") });
  c.log(`Tarif saqlandi: ${t.name} — ${fmtMoney(t.price)}`, "/takliflar");
}

export interface ProposalInput {
  leadId: string;
  tariffIds: string[];
  recommendedId: string;
  discountPct: number;
  validDays: number;
  note: string;
}

export function createProposal(c: Ctx, o: ProposalInput): string {
  const lead = c.s.leads.find((l) => l.id === o.leadId);
  if (!lead) throw new Error("Lidni tanlang");
  if (o.tariffIds.length === 0) throw new Error("Kamida bitta tarifni tanlang");
  if (!o.tariffIds.includes(o.recommendedId)) throw new Error("Tavsiya etiladigan paket ro'yxatda bo'lishi kerak");
  if (o.discountPct < 0 || o.discountPct > 50) throw new Error("Chegirma 0–50% oralig'ida bo'lishi kerak");
  const id = newId("tk");
  const number = nextProposalNumber(c.s, c.today);
  c.s.proposals.push({
    id,
    number,
    leadId: o.leadId,
    date: c.today,
    validUntil: addDays(c.today, o.validDays),
    tariffIds: o.tariffIds,
    recommendedId: o.recommendedId,
    discountPct: o.discountPct,
    note: o.note.trim(),
    status: "draft",
    createdBy: c.me.id,
  });
  lead.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text: `Tijorat taklifi tayyorlandi: ${number}` });
  c.log(`${lead.name}: tijorat taklifi ${number}`, `/taklif/${id}`);
  return id;
}

export function setProposalStatus(
  c: Ctx,
  id: string,
  status: "sent" | "accepted" | "rejected",
  extra: { tariffId?: string; tariffIds?: string[]; reason?: string } = {},
) {
  const p = c.s.proposals.find((x) => x.id === id);
  if (!p) return;
  const lead = c.s.leads.find((l) => l.id === p.leadId);
  if (status === "accepted") {
    const ids = extra.tariffIds ?? (extra.tariffId ? [extra.tariffId] : defaultPicks(c.s, p));
    if (!ids.length || ids.some((tid) => !p.tariffIds.includes(tid))) throw new Error("Paketni tanlang");
    const kinds = ids.map((tid) => tariffOf(c.s, tid)).map((t) => (t ? tariffService(t) : "smm"));
    if (new Set(kinds).size !== kinds.length) throw new Error("Har xizmatdan bitta paket tanlanadi");
    p.acceptedTariffIds = ids;
    p.acceptedTariffId = ids[0];
  }
  if (status === "rejected" && !extra.reason?.trim()) throw new Error("Sabab majburiy");
  p.status = status;
  p.rejectReason = status === "rejected" ? extra.reason!.trim() : undefined;
  p.decidedAt = status === "sent" ? undefined : c.today;
  const picked = acceptedIds(p)
    .map((tid) => tariffOf(c.s, tid))
    .filter((t): t is Tariff => Boolean(t))
    .map((t) => `${serviceLabel(tariffService(t))}: ${t.name} — ${fmtMoney(proposalPrice(p, t))}${isRecurring(tariffService(t)) ? "/oy" : ""}`)
    .join("; ");
  const text =
    status === "sent"
      ? `Tijorat taklifi yuborildi: ${p.number}`
      : status === "accepted"
        ? `Taklif qabul qilindi: ${picked}`
        : `Taklif rad etildi: ${p.rejectReason}`;
  lead?.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text });
  if (status === "accepted" && lead) {
    const bosses = c.s.users.filter((u) => u.role === "rahbar" && u.active).map((u) => u.id);
    c.notify([lead.operatorId, lead.meeting?.marketologId, ...bosses], `${lead.name}: taklif qabul qilindi — ${picked}. Shartnomani rasmiylashtiring`, "/crm");
  }
  c.log(`${lead?.name}: ${text}`, `/taklif/${p.id}`);
}

export function updateProject(c: Ctx, id: string, patch: Partial<Project>) {
  const p = findProject(c, id);
  if (!p) return;
  if (p.status === "closed" && patch.pauseWork === false) throw new Error("Loyiha yopilgan — ishni qayta ochib bo'lmaydi");
  if ("periodStart" in patch && patch.periodStart !== p.periodStart) {
    if (c.s.invoices.some((i) => i.projectId === p.id && i.kind === "monthly"))
      throw new Error("Oylik fakturalar chiqqan — hisob davri boshini o'zgartirib bo'lmaydi (fakturalar siljib ketadi)");
    if (patch.periodStart && patch.periodStart > c.today) throw new Error("Hisob davri boshi kelajakda bo'lishi mumkin emas");
  }
  if ("currency" in patch && (patch.currency ?? "UZS") !== (p.currency ?? "UZS"))
    throw new Error("Shartnoma valyutasini o'zgartirib bo'lmaydi — kerak bo'lsa yangi shartnoma tuzing");
  if (patch.pauseWork !== undefined && patch.pauseWork !== p.pauseWork) {
    c.notify([p.marketologId, p.smmId], `${p.name}: ish ${patch.pauseWork ? "to'xtatildi (qarz)" : "qayta tiklandi"}`, `/loyiha/${id}`);
  }
  Object.assign(p, patch);
  if (patch.adBudgetUsd !== undefined) refreshProject(c, p);
  c.log(`${p.name}: loyiha kartasi yangilandi`, `/loyiha/${id}`);
}

export function saveDoc(c: Ctx, projectId: string, block: DocBlock, content: string, status: "progress" | "done") {
  const p = findProject(c, projectId);
  if (!p) return;
  p.docs[block] = { content, status, updatedAt: nowISO() };
  const label = DOC_BLOCKS.find((b) => b.id === block)?.label;
  c.log(`${p.name}: ${label} — ${status === "done" ? "Tayyor" : "Jarayonda"}`, `/loyiha/${projectId}`);
}

export function handOff(c: Ctx, projectId: string) {
  const p = findProject(c, projectId);
  if (!p) return;
  if (Object.values(p.docs).some((d) => d.status !== "done")) throw new Error("Barcha bloklar «Tayyor» bo'lishi kerak");
  p.handedOffAt = nowISO();
  c.notify([p.smmId, p.targetologId], `${p.name}: strategiya tayyor — kontent reja va target ishini boshlang`, `/loyiha/${projectId}`);
  c.log(`${p.name}: SMM menejer va targetologga uzatildi`, `/loyiha/${projectId}`);
}

// ---------- Kontent ----------

export function savePost(c: Ctx, data: Omit<Post, "id" | "createdAt" | "status"> & { id?: string; status?: PostStatus }) {
  // Target video organik joylanmaydi: platformasiz, tayyor bo'lgach targetologga beriladi
  const ad = isAdType(c.s, data.typeId);
  if (ad) data = { ...data, platforms: [], platformNotes: {}, forTarget: true };
  else if (!data.platforms?.length) throw new Error("Kamida bitta platformani tanlang");
  if (data.id) {
    const p = c.s.posts.find((x) => x.id === data.id);
    if (!p) return;
    Object.assign(p, data);
    // Olib tashlangan platformaning joylash belgisi ham o'chadi
    if (p.publishedOn) {
      const kept = Object.fromEntries(Object.entries(p.publishedOn).filter(([k]) => p.platforms.includes(k as Platform)));
      p.publishedOn = kept;
    }
    // Joylangan postga yangi platforma qo'shilsa — u yerda hali joylanmagan, post «Tasdiqlandi»ga qaytadi
    if (p.status === "published" && p.platforms.some((x) => !p.publishedOn?.[x])) {
      p.status = "approved";
      p.publishedAt = undefined;
    }
    if (p.status === "published" && !p.publishedAt) p.publishedAt = c.today;
    c.log(`Post yangilandi: ${p.topic} (${projectName(c, p.projectId)})`, "/kontent");
    return;
  }
  assertWorkAllowed(c, data.projectId);
  const post: Post = { ...data, id: newId("post"), status: data.status ?? "plan", createdAt: nowISO() };
  c.s.posts.push(post);
  c.log(`Kontent rejaga qo'shildi: ${post.topic} — ${fmtDateShort(post.date)} (${projectName(c, post.projectId)})`, "/kontent");
}

export function deletePost(c: Ctx, id: string) {
  const p = c.s.posts.find((x) => x.id === id);
  c.s.posts = c.s.posts.filter((x) => x.id !== id);
  // Bog'langan syomka va TZ'lardan havolani olib tashlaymiz (o'chgan postga ishora qolmasin)
  for (const sh of c.s.shoots) sh.postIds = sh.postIds.filter((x) => x !== id);
  for (const t of c.s.tasks) if (t.postId === id) t.postId = undefined;
  if (p) c.log(`Post o'chirildi: ${p.topic}`, "/kontent");
}

export function sendToInternal(c: Ctx, postId: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.status = "internal";
  p.reviewNote = undefined;
  c.notify(marketologsOf(c, p.projectId), `Tasdiqlash so'rovi: ${p.topic} (${projectName(c, p.projectId)})`, "/tasdiqlash");
  c.log(`${p.topic}: ichki tasdiqqa yuborildi`, "/kontent");
}

export function approveInternal(c: Ctx, postId: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.status = "client";
  p.reviewNote = undefined;
  c.notify([p.assigneeId], `Marketolog tasdiqladi: ${p.topic} — mijozga yuboring`, "/kontent");
  c.log(`${p.topic}: marketolog tasdiqladi → Mijoz tasdig'ida`, "/kontent");
}

export function returnPost(c: Ctx, postId: string, note: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  if (!note.trim()) throw new Error("Qaytarish uchun izoh yozing");
  p.status = p.format === "video" ? "editing" : p.format === "text" ? "plan" : "design";
  p.reviewNote = note.trim();
  c.notify([p.assigneeId], `Qaytarildi: ${p.topic} — ${note.trim()}`, "/kontent");
  c.log(`${p.topic}: izoh bilan qaytarildi`, "/kontent");
}

export function clientApproved(c: Ctx, postId: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.status = "approved";
  const pr = findProject(c, p.projectId);
  c.notify([pr?.marketologId, p.assigneeId], `Mijoz tasdiqladi: ${p.topic} (${pr?.name ?? "—"}) — joylash ${fmtDate(p.date)}`, "/kontent");
  c.log(`${p.topic}: mijoz tasdiqladi`, "/kontent");
}

const platformList = platformsText;

/**
 * Joylandi: platforma berilsa — faqat shu platformada; berilmasa — hamma platformada.
 * Hamma platformaga joylangach post «Joylandi» bo'ladi.
 */
export function publishPost(c: Ctx, postId: string, platform?: Platform) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  if (!p.platforms.length) return handToTarget(c, postId);
  p.publishedOn ??= {};
  for (const pl of platform ? [platform] : p.platforms) p.publishedOn[pl] ??= c.today;
  const pending = p.platforms.filter((x) => !p.publishedOn?.[x]);
  const pr = findProject(c, p.projectId);
  if (pending.length) {
    if (p.status !== "approved" && postStage(p.status) < postStage("approved")) p.status = "approved";
    c.log(`${p.topic}: ${platform ? PLATFORM_LABELS[platform] : ""} joylandi — qolgan: ${platformList(pending)}`, "/kontent");
    return;
  }
  p.status = "published";
  p.publishedAt = c.today;
  // Faqat SMM (reklamasiz) mijozda hisob davri birinchi joylangan postdan boshlanadi
  if (pr && !pr.periodStart && !hasAds(pr)) {
    pr.periodStart = c.today;
    c.notify([pr.marketologId, ...financeIds(c)], `${pr.name}: birinchi post joylandi — hisob davri ${fmtDate(c.today)} dan boshlandi`, `/loyiha/${pr.id}`);
  }
  c.notify([pr?.marketologId, pr?.targetologId, p.assigneeId], `Joylandi: ${p.topic} (${pr?.name ?? "—"}, ${platformList(p.platforms)})`, "/kontent");
  c.log(`${p.topic}: joylandi (${platformList(p.platforms)})`, "/kontent");
}

/** Target video tayyor: targetologga TZ (material) ketadi, rejada «Targetologga berildi» deb sanaladi. */
export function handToTarget(c: Ctx, postId: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p || p.status === "published") return;
  if (p.platforms.length) throw new Error("Bu post platformaga joylanadi — «Joylandi» tugmasidan foydalaning");
  if (postStage(p.status) < postStage("approved")) throw new Error("Avval tasdiqdan o'tkazing (ichki va mijoz tasdig'i)");
  const pr = findProject(c, p.projectId);
  if (!pr?.targetologId || !hasAds(pr)) throw new Error("Loyihada target xizmati yoki targetolog yo'q");
  createTask(c, {
    kind: "target",
    projectId: p.projectId,
    postId: p.id,
    assigneeId: pr.targetologId,
    title: `Reklama videosi: ${p.topic}`,
    brief: "Tayyor reklama videosi — kampaniyaga qo'ying va natijani hisobotda belgilang",
    deadline: addDays(c.today, 1),
    deadlineTime: "18:00",
  });
  p.forTarget = true;
  p.status = "published";
  p.publishedAt = c.today;
  c.notify([pr.marketologId], `${pr.name}: reklama videosi targetologga berildi — ${p.topic}`, "/target");
  c.log(`${p.topic}: reklama videosi targetologga berildi (${pr.name})`, "/target");
}

/** Xato bilan qo'yilgan «joylandi» belgisini olib tashlash. */
export function unpublishPlatform(c: Ctx, postId: string, platform: Platform) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p?.publishedOn?.[platform]) return;
  delete p.publishedOn[platform];
  if (p.status === "published") {
    p.status = "approved";
    p.publishedAt = undefined;
  }
  c.log(`${p.topic}: ${PLATFORM_LABELS[platform]} — joylash belgisi olib tashlandi`, "/kontent");
}

/**
 * Status ro'yxatidan o'zgartirish. Ishlab chiqarish bosqichlari (reja → dizayn) erkin;
 * tasdiq zinasini sakrab o'tib bo'lmaydi: ichki tasdiq → (marketolog) mijozga → mijoz tasdig'i → joylash.
 */
export function setPostStatus(c: Ctx, postId: string, status: PostStatus) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p || p.status === status) return;
  const from = p.status;
  if (status === "internal") return sendToInternal(c, postId);
  if (status === "client") {
    if (from !== "internal") throw new Error("Avval ichki tasdiqqa yuboring — mijozga marketolog tasdig'idan keyin yuboriladi");
    if (!["marketolog", "rahbar", "admin"].includes(c.me.role)) throw new Error("Ichki tasdiqni marketolog beradi");
    return approveInternal(c, postId);
  }
  if (status === "approved") {
    if (from !== "client") throw new Error("Mijoz tasdig'i faqat «Mijoz tasdig'ida» bosqichidan keyin belgilanadi");
    return clientApproved(c, postId);
  }
  if (status === "published") {
    if (from !== "approved") throw new Error("Joylashdan oldin mijoz tasdig'i kerak");
    return publishPost(c, postId);
  }
  // Ortga qaytarildi: joylash belgilari ham bekor bo'ladi
  p.status = status;
  p.publishedAt = undefined;
  p.publishedOn = undefined;
  c.log(`${p.topic}: status → ${POST_STATUSES.find((x) => x.id === status)?.label}`, "/kontent");
}

const advance = (p: Post | undefined, to: PostStatus) => {
  if (p && postStage(p.status) < postStage(to)) p.status = to;
};

// ---------- Syomka ----------

export function createShoot(c: Ctx, data: Omit<Shoot, "id" | "createdAt" | "status">) {
  assertWorkAllowed(c, data.projectId);
  if (!isDate(data.date)) throw new Error("Syomka sanasini tanlang");
  if (data.date < c.today) throw new Error("Syomka sanasi o'tib ketgan — bugun yoki keyingi kunni tanlang");
  if (!/^\d{2}:\d{2}$/.test(data.time ?? "")) throw new Error("Syomka vaqtini kiriting");
  if (!data.location.trim()) throw new Error("Joyni kiriting");
  if (!(Number.isInteger(data.videoCount) && data.videoCount >= 1 && data.videoCount <= 100)) throw new Error("Video soni 1 dan 100 gacha bo'lsin");
  if (!c.s.users.find((u) => u.id === data.operatorId)?.active) throw new Error("Syomka operatorini tanlang");
  const sh: Shoot = { ...data, id: newId("shoot"), status: "planned", createdAt: nowISO() };
  c.s.shoots.push(sh);
  for (const pid of sh.postIds) {
    const p = c.s.posts.find((x) => x.id === pid);
    if (p && postStage(p.status) <= postStage("shoot")) p.status = "shoot";
  }
  c.notify(
    [sh.operatorId],
    `Syomka belgilandi: ${projectName(c, sh.projectId)}, ${fmtDate(sh.date)} ${sh.time}, ${sh.location} — ${sh.videoCount} ta video`,
    "/syomka",
  );
  c.log(`Syomka belgilandi: ${projectName(c, sh.projectId)}, ${fmtDate(sh.date)}`, "/syomka");
}

export function handFootage(c: Ctx, shootId: string, link: string) {
  const sh = c.s.shoots.find((x) => x.id === shootId);
  if (!sh) return;
  if (!link.trim()) throw new Error("Kadrlar havolasini kiriting (Google Drive)");
  sh.footageLink = link.trim();
  sh.status = "handed";
  sh.handedAt = nowISO();
  const project = findProject(c, sh.projectId);
  const editors = new Set<string>();
  for (const t of c.s.tasks) {
    if (t.kind === "montaj" && (t.shootId === sh.id || (t.postId && sh.postIds.includes(t.postId)))) {
      t.footageLink = sh.footageLink;
      editors.add(t.assigneeId);
    }
  }
  for (const pid of sh.postIds)
    advance(
      c.s.posts.find((x) => x.id === pid),
      "editing",
    );
  accruePiece(c, sh.operatorId, "syomka", sh.projectId, `${project?.name}: syomka (${sh.location})`, `shoot:${sh.id}`);
  c.notify([...editors], `Kadrlar topshirildi: ${project?.name} — ${sh.footageLink}`, "/montaj");
  c.notify([project?.smmId], `Syomka tugadi, kadrlar montajyorga topshirildi: ${project?.name}`, "/syomka");
  c.log(`${project?.name}: kadrlar montajyorga topshirildi`, "/syomka");
}

// ---------- Vazifalar (TZ) ----------

export function createTask(c: Ctx, data: Omit<Task, "id" | "createdAt" | "createdBy" | "status">) {
  assertWorkAllowed(c, data.projectId);
  if (!data.title.trim()) throw new Error("Vazifa nomini yozing");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) throw new Error("Deadline sanasini tanlang");
  const who = c.s.users.find((u) => u.id === data.assigneeId);
  if (!who?.active) throw new Error("Ijrochini tanlang (faol xodim)");
  const t: Task = { ...data, id: newId("task"), status: "new", createdBy: c.me.id, createdAt: nowISO() };
  // Syomka allaqachon topshirilgan bo'lsa, montajyor kadrlar havolasini darhol oladi
  if (t.kind === "montaj" && !t.footageLink && t.postId) {
    const sh = c.s.shoots.find((x) => x.status === "handed" && x.footageLink && x.postIds.includes(t.postId!));
    if (sh) {
      t.footageLink = sh.footageLink;
      t.shootId ??= sh.id;
    }
  }
  c.s.tasks.push(t);
  const post = c.s.posts.find((x) => x.id === t.postId);
  if (t.kind === "montaj") advance(post, "editing");
  if (t.kind === "dizayn") advance(post, "design");
  if (t.kind === "target" && post) post.forTarget = true;
  const href = t.kind === "montaj" ? "/montaj" : t.kind === "dizayn" ? "/dizayn" : "/target";
  c.notify([t.assigneeId], `Yangi TZ (${TASK_KIND_LABELS[t.kind]}): ${t.title} — deadline ${fmtDeadline(t)}`, href);
  c.log(`${TASK_KIND_LABELS[t.kind]} TZ berildi: ${t.title} (${projectName(c, t.projectId)})`, href);
}

const taskHref = (t: Task) => (t.kind === "montaj" ? "/montaj" : t.kind === "dizayn" ? "/dizayn" : "/target");

export function startTask(c: Ctx, id: string) {
  const t = c.s.tasks.find((x) => x.id === id);
  if (!t) return;
  t.status = "progress";
  c.log(`${t.title}: jarayonda`, taskHref(t));
}

export function submitTask(c: Ctx, id: string, resultLink: string) {
  const t = c.s.tasks.find((x) => x.id === id);
  if (!t) return;
  if (!resultLink.trim()) throw new Error("Tayyor ish havolasini kiriting (Google Drive)");
  t.status = "review";
  t.resultLink = resultLink.trim();
  t.submittedAt = c.now ? `${c.today}T${c.now}` : c.today;
  c.notify([t.createdBy, findProject(c, t.projectId)?.smmId], `Tekshiruvga topshirildi: ${t.title}`, taskHref(t));
  c.log(`${t.title}: tayyor, tekshiruvga topshirildi`, taskHref(t));
}

export function acceptTask(c: Ctx, id: string) {
  const t = c.s.tasks.find((x) => x.id === id);
  if (!t) return;
  t.status = "accepted";
  t.acceptedAt = nowISO();
  t.returnNote = undefined;
  c.notify([t.assigneeId], `Qabul qilindi: ${t.title}`, taskHref(t));
  c.log(`${t.title}: qabul qilindi`, taskHref(t));
  const wt = taskWorkType(t);
  const a = wt ? accruePiece(c, t.assigneeId, wt, t.projectId, `${projectName(c, t.projectId)}: ${t.title}`, `task:${t.id}`) : null;
  // Kechikkan ish uchun jarima (sozlamada yoqilgan bo'lsa)
  const pct = c.s.settings.latePenaltyPct;
  // Kechikish ijrochi topshirgan kun va soat bo'yicha (tekshiruvchining kechikishi ijrochiga jarima bo'lmaydi)
  const doneOn = (t.submittedAt ?? c.today).slice(0, 10);
  const doneAt = t.submittedAt?.slice(11, 16) || undefined;
  const late = t.deadline ? lateness(t.deadline, t.deadlineTime, doneOn, doneAt) : null;
  if (a && pct > 0 && late && !c.s.accruals.some((x) => x.sourceId === `late:${t.id}`)) {
    const amount = -Math.round((a.amount * pct) / 100);
    c.s.accruals.push({
      id: newId("acr"),
      userId: t.assigneeId,
      projectId: t.projectId,
      date: c.today,
      kind: "penalty",
      sourceId: `late:${t.id}`,
      title: `Jarima ${pct}%: «${t.title}» ${late}`,
      qty: 1,
      rate: amount,
      amount,
      approved: false,
      createdBy: "system",
    });
  }
}

export function returnTask(c: Ctx, id: string, note: string) {
  const t = c.s.tasks.find((x) => x.id === id);
  if (!t) return;
  if (!note.trim()) throw new Error("Qaytarish sababini yozing");
  t.status = "returned";
  t.returnNote = note.trim();
  c.notify([t.assigneeId], `Qaytarildi: ${t.title} — ${note.trim()}`, taskHref(t));
  c.log(`${t.title}: qaytarildi`, taskHref(t));
}

/** Targetolog reklamani yoqdi. Loyihadagi birinchi reklama sanasi hisob davrining boshi bo'ladi. */
export function launchTarget(c: Ctx, id: string, date: string) {
  const t = c.s.tasks.find((x) => x.id === id);
  if (!t) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Reklama yoqilgan sanani tanlang");
  if (date > c.today) throw new Error("Kelajakdagi sana bo'lishi mumkin emas");
  t.launchedAt = date;
  t.status = "progress";
  const p = findProject(c, t.projectId);
  // Hisob davri bir marta boshlanadi; faktura chiqqanidan keyin orqaga surilmaydi (aks holda fakturalar siljiydi)
  const billed = Boolean(p && c.s.invoices.some((i) => i.projectId === p.id && i.kind === "monthly"));
  if (p && (!p.periodStart || (date < p.periodStart && !billed))) {
    p.periodStart = date;
    c.notify([p.marketologId, ...financeIds(c)], `${p.name}: birinchi reklama ${fmtDate(date)} da yoqildi — hisob davri boshlandi`, `/loyiha/${p.id}`);
  }
  c.notify([p?.smmId], `Reklama yoqildi: ${t.title}`, "/target");
  c.log(`${t.title}: reklama yoqildi (${fmtDate(date)})`, "/target");
}

const sameChannel = (a?: string, b?: string) => (a ?? "meta") === (b ?? "meta");

export function saveTargetReport(c: Ctx, data: Omit<TargetReport, "id" | "authorId">) {
  if (!isDate(data.date)) throw new Error("Sanani tanlang");
  if (data.date > c.today) throw new Error("Kelajakdagi kun uchun hisobot kiritib bo'lmaydi");
  for (const [k, v] of [
    ["Sarf", data.spend],
    ["Ko'rishlar", data.views],
    ["Kliklar", data.clicks],
    ["Lidlar", data.leads],
  ] as const) {
    if (!(Number.isFinite(v) && v >= 0)) throw new Error(`${k}: manfiy yoki noto'g'ri qiymat`);
  }
  if (data.views > 0 && data.clicks > data.views) throw new Error("Kliklar ko'rishlardan ko'p bo'lishi mumkin emas");
  if (data.spend > MAX_UZS) throw new Error("Sarf juda katta — nollarni tekshiring");
  const existing = c.s.targetReports.find((r) => r.projectId === data.projectId && r.date === data.date && sameChannel(r.channel, data.channel));
  if (existing) Object.assign(existing, data);
  else c.s.targetReports.push({ ...data, id: newId("tr"), authorId: c.me.id });
  c.log(`Target kunlik hisobot: ${projectName(c, data.projectId)}, ${fmtDate(data.date)}`, "/target");
}

// ---------- Integratsiyalar ----------

export function logIntegration(c: Ctx, kind: IntegrationKind, ok: boolean, text: string) {
  c.s.integrationLog.unshift({ id: newId("il"), at: nowISO(), kind, ok, text });
  c.s.integrationLog = c.s.integrationLog.slice(0, 60);
}

/** Meta Ads'dan olingan kunlik ko'rsatkichlarni target hisobotlariga yozadi. Qaytaradi: nechta kun. */
export function applyMetaSync(c: Ctx, results: MetaResult[]): number {
  let n = 0;
  const parts: string[] = [];
  for (const r of results) {
    const p = findProject(c, r.projectId);
    if (!p) continue;
    if (r.error) {
      logIntegration(c, "meta", false, `Meta Ads: ${p.name} — ${r.error}`);
      continue;
    }
    for (const row of r.rows) {
      const ex = c.s.targetReports.find((x) => x.projectId === row.projectId && x.date === row.date && sameChannel(x.channel));
      if (ex) Object.assign(ex, row);
      else c.s.targetReports.push({ ...row, id: newId("tr"), authorId: p.targetologId ?? c.me.id });
      n++;
    }
    if (r.rows.length) parts.push(`${p.name} — ${r.rows.length} kun`);
  }
  if (parts.length) logIntegration(c, "meta", true, `Meta Ads: ${parts.join(", ")}${results.every((r) => r.demo) ? " (demo)" : ""}`);
  c.s.settings.integrations.meta.lastSync = nowISO();
  return n;
}

export function saveMetaSettings(c: Ctx, patch: Partial<Omit<Integrations["meta"], "accounts">>) {
  Object.assign(c.s.settings.integrations.meta, patch);
}

export function setMetaAccount(c: Ctx, projectId: string, account: string) {
  const v = account.trim();
  if (v && !/^(act_)?\d{5,20}$/.test(v)) throw new Error("Reklama kabineti ID raqamlardan iborat bo'ladi, masalan act_1234567890");
  const acc = c.s.settings.integrations.meta.accounts;
  if (v) acc[projectId] = v.startsWith("act_") ? v : `act_${v}`;
  else delete acc[projectId];
  c.log(`${projectName(c, projectId)}: Meta reklama kabineti ${v ? "ulandi" : "uzildi"}`, "/integratsiyalar");
}

export function setUsdRate(c: Ctx, rate: number, rateDate: string, source: "cbu" | "manual") {
  const r = Math.round(rate * 100) / 100;
  if (!(r >= 1000 && r <= 1_000_000)) throw new Error("Kurs noto'g'ri ko'rinadi (1 USD = 1 000 … 1 000 000 so'm)");
  c.s.settings.usdRate = r;
  c.s.settings.integrations.cbu.lastUpdate = nowISO();
  c.s.settings.integrations.cbu.rateDate = rateDate;
  logIntegration(
    c,
    "cbu",
    true,
    source === "cbu" ? `Markaziy bank kursi: 1 USD = ${fmtNum(rate)} so'm (${fmtDate(rateDate)})` : `Kurs qo'lda kiritildi: 1 USD = ${fmtNum(rate)} so'm`,
  );
}

/** Dollardagi shartnoma: so'mda pul o'tkazish (bank/karta) orqali to'lovga ustama foizi. */
export function setUsdMarkup(c: Ctx, pct: number) {
  if (!(pct >= 0 && pct <= 20)) throw new Error("Ustama 0 … 20% oralig'ida bo'lishi kerak");
  c.s.settings.usdMarkupPct = Math.round(pct * 100) / 100;
  c.log(`Dollardagi shartnomalar: pul o'tkazishda ustama ${c.s.settings.usdMarkupPct}%`, "/integratsiyalar");
}

// ---------- Moliya ----------

export function setInvoiceDue(c: Ctx, invoiceId: string, dueDate: string) {
  const inv = c.s.invoices.find((x) => x.id === invoiceId);
  if (!inv) return;
  inv.dueDate = dueDate;
  c.log(`${inv.number}: to'lov sanasi ${fmtDate(dueDate)}`, "/moliya/fakturalar");
}

/** Pul harakati sanasi kelajakda bo'lmasligi va USD hisobda kurs bo'lishi shart. */
/** yyyy-mm-dd ko'rinishidagi sana. */
const isDate = (d?: string) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "");

/** Bitta amal uchun maksimal summa (so'm) — xato bilan qo'shimcha nollar yozilishidan himoya. */
const MAX_UZS = 100_000_000_000;

function assertMoney(c: Ctx, o: { date: string; accountId: string; rate?: number; amount?: number }): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date ?? "")) throw new Error("Sanani kiriting");
  if (o.date > c.today) throw new Error("Sana kelajakda bo'lishi mumkin emas — to'lov kelgan kunni kiriting");
  if (o.date < "2015-01-01") throw new Error("Sana juda eski — tekshiring");
  const acc = accountOf(c.s, o.accountId);
  if (!acc) throw new Error("Hisobni tanlang");
  let fx = 1;
  if (acc.currency === "USD") {
    if (!(o.rate && o.rate > 0)) throw new Error("USD hisob uchun kursni kiriting");
    if (o.rate < 1000 || o.rate > 1_000_000) throw new Error("Kurs noto'g'ri ko'rinadi (1 USD = 1 000 … 1 000 000 so'm)");
    fx = o.rate;
  }
  if (o.amount !== undefined && o.amount * fx > MAX_UZS) throw new Error(`Summa juda katta (${fmtMoney(o.amount * fx)}) — nollarni tekshiring`);
  return fx;
}

/** Summa qolgan qarzdan keskin oshsa (odatda xato: nol ortiqcha yoki valyuta chalkashligi) — rad etiladi. */
function assertNotOverpaid(uzs: number, outstanding: number) {
  if (uzs > outstanding * 1.05 + 1000) {
    throw new Error(`To'lov summasi (${fmtMoney(uzs)}) qolgan qarzdan (${fmtMoney(outstanding)}) ancha oshib ketdi — summani va valyutani tekshiring`);
  }
}

/** Mijoz to'lovi fakturaga bog'lanadi. USD hisobga tushsa — kurs bilan. */
export function recordClientPayment(
  c: Ctx,
  invoiceId: string,
  o: { amount: number; date: string; accountId: string; rate?: number; note: string; fxRate?: number; markupPct?: number },
) {
  const inv = c.s.invoices.find((x) => x.id === invoiceId);
  if (!inv) throw new Error("Faktura topilmadi");
  if (inv.voidedAt) throw new Error("Faktura bekor qilingan — to'lov qabul qilinmaydi");
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
  const fx = assertMoney(c, o);
  // Dollardagi shartnoma: to'lov qancha dollarni qoplaydi. Dollar hisobga — o'zi; so'mga — to'lov kunidagi kurs
  // (+ bank/karta o'tkazmasida ustama, naqdda — ustamasiz).
  let usdPart: { invoiceUsd: number; fxRate?: number; markupPct?: number } | null = null;
  if (inv.usd) {
    const acc = accountOf(c.s, o.accountId)!;
    const left = invoiceOutstandingUsd(c.s, inv);
    if (acc.currency === "USD") usdPart = { invoiceUsd: round2(o.amount) };
    else {
      const fxRate = o.fxRate ?? c.s.settings.usdRate;
      if (!(fxRate >= 1000 && fxRate <= 1_000_000)) throw new Error("To'lov kunidagi kursni kiriting (1 USD = … so'm)");
      const markupPct = o.markupPct ?? (acc.kind === "cash" ? 0 : (c.s.settings.usdMarkupPct ?? 2));
      if (!(markupPct >= 0 && markupPct <= 20)) throw new Error("Ustama 0–20% oralig'ida bo'lsin");
      usdPart = { invoiceUsd: round2(o.amount / (fxRate * (1 + markupPct / 100))), fxRate, markupPct };
    }
    if (usdPart.invoiceUsd > left * 1.05 + 1)
      throw new Error(`To'lov ($${usdPart.invoiceUsd.toFixed(2)}) qolgan qarzdan ($${left.toFixed(2)}) ancha oshib ketdi — summani va valyutani tekshiring`);
    // Sentlik yaxlitlash farqi qarz bo'lib qolmasin
    if (Math.abs(usdPart.invoiceUsd - left) <= 0.02) usdPart.invoiceUsd = left;
  } else assertNotOverpaid(o.amount * fx, Math.max(0, inv.amount - invoicePaid(c.s, inv)));
  c.s.transactions.push({
    ...(usdPart ?? {}),
    id: newId("tx"),
    date: o.date,
    accountId: o.accountId,
    dir: "in",
    amount: o.amount,
    rate: o.rate,
    articleId: ART.client,
    projectId: inv.projectId,
    invoiceId,
    note: o.note,
    createdBy: c.me.id,
  });
  const p = findProject(c, inv.projectId);
  if (inv.kind === "prepay" && p && invoiceSettled(c.s, inv)) {
    c.notify([p.marketologId, p.smmId], `${p.name}: oldindan to'lov keldi — ish boshlanadi`, `/loyiha/${p.id}`);
  }
  c.log(`${p?.name}: to'lov qabul qilindi — ${inv.number}, ${fmtMoney(txUZS(c.s, c.s.transactions[c.s.transactions.length - 1]!))}`, "/moliya/fakturalar");
}

/** Qo'shimcha xizmat uchun faktura (masalan, alohida syomka). */
export function createExtraInvoice(c: Ctx, o: { projectId: string; amount: number; issueDate: string; dueDate: string; note: string }) {
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
  c.s.invoices.push({ id: newId("inv"), number: nextInvoiceNumber(c.s), kind: "extra", periodIndex: 0, ...o });
  c.log(`${projectName(c, o.projectId)}: qo'shimcha xizmat fakturasi ${fmtMoney(o.amount)}`, "/moliya/fakturalar");
}

/** Erkin kirim yoki chiqim (xarajat, soliq, dividend, tranzit va h.k.). */
export function addTransaction(c: Ctx, t: Omit<Transaction, "id" | "createdBy">) {
  if (!(t.amount > 0)) throw new Error("Summani kiriting");
  assertMoney(c, t);
  const art = c.s.articles.find((a) => a.id === t.articleId);
  if (!art) throw new Error("Moddani tanlang");
  c.s.transactions.push({ ...t, dir: art.dir, id: newId("tx"), createdBy: c.me.id });
  c.log(
    `${art.dir === "in" ? "Kirim" : "Chiqim"}: ${art.name} — ${fmtMoney(txUZS(c.s, c.s.transactions[c.s.transactions.length - 1]!))}`,
    "/moliya/kirim-chiqim",
  );
}

/** Hisoblar o'rtasida o'tkazma (valyuta ayirboshlash ham). */
export function addTransfer(c: Ctx, o: { from: string; to: string; amountFrom: number; amountTo: number; rate?: number; date: string; note: string }) {
  if (o.from === o.to) throw new Error("Turli hisoblarni tanlang");
  if (!(o.amountFrom > 0) || !(o.amountTo > 0)) throw new Error("Summani kiriting");
  assertMoney(c, { date: o.date, accountId: o.from, rate: o.rate, amount: o.amountFrom });
  assertMoney(c, { date: o.date, accountId: o.to, rate: o.rate, amount: o.amountTo });
  const tid = newId("trf");
  const base = { date: o.date, transferId: tid, note: o.note, createdBy: c.me.id };
  c.s.transactions.push({ ...base, id: newId("tx"), accountId: o.from, dir: "out", amount: o.amountFrom, rate: o.rate, articleId: ART.transferOut });
  c.s.transactions.push({ ...base, id: newId("tx"), accountId: o.to, dir: "in", amount: o.amountTo, rate: o.rate, articleId: ART.transferIn });
  c.log(`O'tkazma: ${accountOf(c.s, o.from)?.name} → ${accountOf(c.s, o.to)?.name}`, "/moliya/kirim-chiqim");
}

export function deleteTransaction(c: Ctx, id: string) {
  const t = c.s.transactions.find((x) => x.id === id);
  if (!t) return;
  c.s.transactions = c.s.transactions.filter((x) => x.id !== id && (!t.transferId || x.transferId !== t.transferId));
  c.log(`Tranzaksiya o'chirildi: ${t.note || articleOf(c.s, t.articleId)?.name}`, "/moliya/kirim-chiqim");
}

export function addBill(c: Ctx, b: Omit<Bill, "id">) {
  if (!(b.amount > 0)) throw new Error("Summani kiriting");
  if (b.amount > MAX_UZS) throw new Error("Summa juda katta — nollarni tekshiring");
  if (!isDate(b.date)) throw new Error("Hujjat sanasini tanlang");
  if (b.dueDate && b.dueDate < b.date) throw new Error("To'lov muddati hujjat sanasidan oldin bo'lishi mumkin emas");
  c.s.bills.push({ ...b, id: newId("bill") });
  c.log(`Xarajat hujjati: ${c.s.vendors.find((v) => v.id === b.vendorId)?.name} — ${fmtMoney(b.amount)}`, "/moliya/debitor");
}

export function payBill(c: Ctx, billId: string, o: { amount: number; date: string; accountId: string; rate?: number }) {
  const b = c.s.bills.find((x) => x.id === billId);
  if (!b) return;
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
  const fx = assertMoney(c, o);
  assertNotOverpaid(o.amount * fx, Math.max(0, b.amount - billPaid(c.s, b)));
  c.s.transactions.push({
    id: newId("tx"),
    date: o.date,
    accountId: o.accountId,
    dir: "out",
    amount: o.amount,
    rate: o.rate,
    articleId: b.articleId,
    vendorId: b.vendorId,
    billId,
    projectId: b.projectId,
    note: b.note,
    createdBy: c.me.id,
  });
  c.log(`To'landi: ${c.s.vendors.find((v) => v.id === b.vendorId)?.name} — ${b.note}`, "/moliya/debitor");
}

/** Xodimga to'lov yoki avans. FIFO bo'yicha eng eski hisoblashlarni yopadi. */
export function payEmployee(c: Ctx, o: { userId: string; amount: number; date: string; accountId: string; rate?: number; note: string; advance?: boolean }) {
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
  const fx = assertMoney(c, o);
  // Hisoblangan ish haqi to'lovi qarzdan keskin oshmasin (avans — alohida tanlanadi)
  if (o.advance === false) assertNotOverpaid(o.amount * fx, Math.max(0, employeeBalance(c.s, o.userId)));
  c.s.transactions.push({
    id: newId("tx"),
    date: o.date,
    accountId: o.accountId,
    dir: "out",
    amount: o.amount,
    rate: o.rate,
    articleId: ART.payroll,
    userId: o.userId,
    note: o.note,
    createdBy: c.me.id,
  });
  const user = c.s.users.find((u) => u.id === o.userId);
  c.notify([o.userId], `Sizga to'lov: ${fmtMoney(txUZS(c.s, c.s.transactions[c.s.transactions.length - 1]!))}${o.note ? ` — ${o.note}` : ""}`, "/hisobim");
  c.log(`Ish haqi to'landi: ${user?.name} — ${fmtMoney(o.amount)}`, "/moliya/ish-haqi");
}

/** Qo'lda hisoblash: bonus (+), jarima yoki ushlab qolish (−), boshqa. */
export function addManualAccrual(
  c: Ctx,
  o: { userId: string; projectId?: string; date: string; kind: "bonus" | "penalty" | "manual"; amount: number; title: string },
) {
  if (!o.amount) throw new Error("Summani kiriting");
  if (!o.title.trim()) throw new Error("Izoh yozing");
  const amount = o.kind === "penalty" ? -Math.abs(o.amount) : Math.abs(o.amount);
  c.s.accruals.push({
    id: newId("acr"),
    userId: o.userId,
    projectId: o.projectId || undefined,
    date: o.date,
    kind: o.kind,
    title: o.title.trim(),
    qty: 1,
    rate: amount,
    amount,
    approved: false,
    createdBy: c.me.id,
  });
  c.notify([o.userId], `${amount > 0 ? "Hisoblandi" : "Ushlab qolindi"}: ${o.title.trim()} (${fmtMoney(amount)})`, "/hisobim");
  c.log(`Ish haqi ${amount > 0 ? "qo'shimcha" : "jarima"}: ${c.s.users.find((u) => u.id === o.userId)?.name} ${fmtMoney(amount)}`, "/moliya/ish-haqi");
}

export function approveAccruals(c: Ctx, ids: string[]) {
  let n = 0;
  for (const a of c.s.accruals) {
    if (ids.includes(a.id) && !a.approved) {
      a.approved = true;
      n++;
    }
  }
  if (n) c.log(`${n} ta hisoblash tasdiqlandi`, "/moliya/ish-haqi");
}

export function deleteAccrual(c: Ctx, id: string) {
  const a = c.s.accruals.find((x) => x.id === id);
  if (!a) return;
  if (a.createdBy === "system" && a.kind !== "piece" && a.kind !== "bonus") throw new Error("Avtomatik davriy hisoblashni o'chirib bo'lmaydi");
  // Ishbay haq o'chirilsa, shu ish uchun kechikish jarimasi ham olib tashlanadi
  const late = a.sourceId?.startsWith("task:") ? `late:${a.sourceId.slice(5)}` : null;
  c.s.accruals = c.s.accruals.filter((x) => x.id !== id && (!late || x.sourceId !== late));
  c.log(`Hisoblash o'chirildi: ${a.title}`, "/moliya/ish-haqi");
}

export function savePayProfile(c: Ctx, prof: PayProfile) {
  const i = c.s.payProfiles.findIndex((p) => p.userId === prof.userId);
  const old = i >= 0 ? c.s.payProfiles[i] : undefined;
  if (prof.fixed < 0 || prof.perProject < 0) throw new Error("Stavka manfiy bo'lishi mumkin emas");
  // Fiks oylik endi belgilansa — o'tgan oylar uchun orqaga hisoblanmaydi
  prof = { ...prof, fixedFrom: prof.fixed > 0 && !(old && old.fixed > 0) ? c.today : old?.fixedFrom };
  if (i >= 0) c.s.payProfiles[i] = prof;
  else c.s.payProfiles.push(prof);
  c.log(`Stavkalar yangilandi: ${c.s.users.find((u) => u.id === prof.userId)?.name}`, "/moliya/ish-haqi");
}

export function setBudget(c: Ctx, month: string, line: BudgetLine["line"], amount: number) {
  const b = c.s.budget.find((x) => x.month === month && x.line === line);
  if (b) b.amount = amount;
  else c.s.budget.push({ month, line, amount });
}

/** Xodimni arxivlash: tizimga kira olmaydi, yangi ish tayinlanmaydi; eski ma'lumot va hisob-kitoblari saqlanadi. */
export function archiveUser(c: Ctx, userId: string, replacementId?: string) {
  const u = c.s.users.find((x) => x.id === userId);
  if (!u) return;
  if (u.id === c.me.id) throw new Error("O'zingizni arxivlay olmaysiz");
  if (!u.active) return;
  if (u.role === "rahbar" && c.s.users.filter((x) => x.role === "rahbar" && x.active).length <= 1) {
    throw new Error("Oxirgi faol rahbarni arxivlab bo'lmaydi");
  }
  const rep = replacementId ? c.s.users.find((x) => x.id === replacementId) : undefined;
  if (replacementId && (!rep?.active || rep.id === u.id)) throw new Error("O'rniga faol xodimni tanlang");
  u.active = false;
  u.archivedAt = c.today;
  const moved: string[] = [];
  if (rep) {
    // Ochiq ishlar yangi mas'ulga o'tadi (yopilgan loyihalar va bajarilgan ishlar tarixi o'zgarmaydi)
    const take = <T>(obj: T, key: keyof T, label: string) => {
      if (obj[key] === u.id) {
        obj[key] = rep.id as T[keyof T];
        moved.push(label);
      }
    };
    for (const p of c.s.projects) {
      if (p.status === "closed") continue;
      take(p, "marketologId", p.name);
      take(p, "smmId", p.name);
      take(p, "targetologId", p.name);
      for (const svc of p.services ?? []) if (svc.status === "active") take(svc, "assigneeId", p.name);
    }
    for (const t of c.s.tasks) if (isTaskOpen(t)) take(t, "assigneeId", t.title);
    for (const sh of c.s.shoots) if (sh.status === "planned") take(sh, "operatorId", sh.location);
    for (const p of c.s.posts) if (p.assigneeId === u.id && p.status !== "published") p.assigneeId = rep.id;
    if (moved.length)
      c.notify([rep.id], `${u.name} ishlari sizga o'tkazildi: ${[...new Set(moved)].slice(0, 6).join(", ")}${moved.length > 6 ? "…" : ""}`, "/");
  }
  c.log(`Xodim arxivlandi: ${u.name} (${ROLE_LABELS[u.role]})${rep ? ` — ishlari ${rep.name}ga o'tkazildi` : ""}`, "/admin");
}

export function restoreUser(c: Ctx, userId: string) {
  const u = c.s.users.find((x) => x.id === userId);
  if (!u || u.active) return;
  u.active = true;
  u.activeFrom = c.today;
  c.log(`Xodim arxivdan qaytarildi: ${u.name} (${ROLE_LABELS[u.role]})`, "/admin");
}

export function closeProject(c: Ctx, projectId: string, date: string) {
  const p = findProject(c, projectId);
  if (!p) return;
  const open = p.services.filter((x) => !isRecurring(x.kind) && x.status === "active");
  if (open.length) {
    throw new Error(`Avval bir martalik ishlarni topshiring yoki to'xtating: ${open.map((x) => serviceLabel(x.kind)).join(", ")}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > c.today) throw new Error("Yopilish sanasini tanlang (bugundan keyin emas)");
  p.status = "closed";
  p.closedAt = date;
  p.pauseWork = true;
  // Yopilgandan keyin boshlanadigan davrlar fakturalari: to'lanmagani bekor, to'langani — qaytariladigan avans
  const voided: string[] = [];
  const paidAhead: string[] = [];
  for (const inv of c.s.invoices) {
    if (inv.projectId !== p.id || inv.kind !== "monthly" || inv.voidedAt) continue;
    const per = periodAt(p, inv.periodIndex);
    if (!per || per.start < date) continue;
    if (invoicePaid(c.s, inv) > 0.5) paidAhead.push(inv.number);
    else {
      voidInv(inv, c.today, "Loyiha yopildi");
      voided.push(inv.number);
    }
  }
  c.notify(
    [p.marketologId, p.smmId, p.targetologId, ...financeIds(c)],
    `${p.name}: loyiha yopildi (${fmtDate(date)}) — yangi fakturalar chiqarilmaydi${voided.length ? `; bekor qilindi: ${voided.join(", ")}` : ""}${
      paidAhead.length ? `; oldindan to'langan (qaytarishni hal qiling): ${paidAhead.join(", ")}` : ""
    }`,
    `/loyiha/${p.id}`,
  );
  c.log(`${p.name}: loyiha yopildi`, `/loyiha/${p.id}`);
}

export function submitReport(
  c: Ctx,
  data: { projectId: string; periodIndex: number; fileLink: string; reach: number; followers: number; leads: number; summary: string },
) {
  const ex = c.s.reports.find((r) => r.projectId === data.projectId && r.periodIndex === data.periodIndex);
  if (ex) Object.assign(ex, data, { submittedAt: nowISO() });
  else c.s.reports.push({ ...data, id: newId("rep"), authorId: c.me.id, submittedAt: nowISO() });
  const p = findProject(c, data.projectId);
  c.notify([p?.marketologId, ...financeIds(c)], `${p?.name}: ${data.periodIndex + 1}-davr oylik hisoboti topshirildi`, `/loyiha/${data.projectId}`);
  c.log(`${p?.name}: oylik hisobot topshirildi`, `/loyiha/${data.projectId}`);
}
