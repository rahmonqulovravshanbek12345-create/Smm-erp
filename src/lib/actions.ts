// Biznes amallari. Har biri Ctx oladi: holatni o'zgartiradi, bildirishnoma yuboradi va tarixga yozadi.
import { addDays, diffDays, fmtDate, fmtDateShort, fmtMoney, fmtNum, nowISO } from "./dates";
import type { MetaResult } from "./integrations";
import { ART, accountOf, articleOf, invoicePaid, nextInvoiceNumber, pieceAccrual, taskWorkType, txUZS } from "./finance";
import { DOC_BLOCKS, LEAD_STAGES, PLATFORM_LABELS, POST_STATUSES, TASK_KIND_LABELS } from "./labels";
import { postStage, workBlockedReason } from "./rules";
import { newId, type Ctx } from "./store";
import { nextProposalNumber, proposalPrice, tariffOf } from "./tariffs";
import type {
  Bill,
  BudgetLine,
  DocBlock,
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

export interface ProjectInput {
  name: string;
  contactName: string;
  phone: string;
  industry: string;
  links: string;
  contractNo: string;
  contractDate: string;
  tariff: string;
  tariffId?: string;
  monthlyFee: number;
  prepayType: 100 | 50;
  prepayDueDate: string;
  remainderDueDate: string;
  marketologId: string;
  smmId: string;
  targetologId?: string;
}

/** "Shartnoma bo'ldi": lid ma'lumotlari avtomatik Loyiha kartasiga ko'chadi. */
export function createProject(c: Ctx, input: ProjectInput, leadId?: string): string {
  const id = newId("prj");
  const docs = Object.fromEntries(DOC_BLOCKS.map((b) => [b.id, { content: "", status: "progress" }])) as Project["docs"];
  const { prepayDueDate, remainderDueDate, ...rest } = input;
  c.s.projects.push({ ...rest, id, leadId, pauseWork: false, status: "active", docs, createdAt: nowISO() });
  const prepay = Math.round((input.monthlyFee * input.prepayType) / 100);
  c.s.invoices.push({
    id: newId("inv"),
    number: nextInvoiceNumber(c.s),
    projectId: id,
    kind: "prepay",
    periodIndex: 0,
    amount: prepay,
    issueDate: input.contractDate,
    dueDate: prepayDueDate || input.contractDate,
    note: `Oldindan to'lov (${input.prepayType}%)`,
  });
  if (input.prepayType === 50) {
    c.s.invoices.push({
      id: newId("inv"),
      number: nextInvoiceNumber(c.s),
      projectId: id,
      kind: "remainder",
      periodIndex: 0,
      amount: input.monthlyFee - prepay,
      issueDate: input.contractDate,
      dueDate: remainderDueDate,
      note: "Qoldiq to'lov (50%)",
    });
  }
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
  c.notify([input.marketologId, input.smmId], `Yangi loyiha: ${input.name} (shartnoma ${input.contractNo})`, `/loyiha/${id}`);
  c.notify(financeIds(c), `${input.name}: oldindan to'lovni (${input.prepayType}%) qayd eting`, "/moliya/fakturalar");
  c.log(`${input.name}: loyiha kartasi yaratildi${leadId ? " (lid → loyiha)" : ""}`, `/loyiha/${id}`);
  return id;
}

// ---------- Tariflar va tijorat takliflari ----------

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
  if (!o.tariffIds.includes(o.recommendedId)) throw new Error("Tavsiya etiladigan tarif ro'yxatda bo'lishi kerak");
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

export function setProposalStatus(c: Ctx, id: string, status: "sent" | "accepted" | "rejected", extra: { tariffId?: string; reason?: string } = {}) {
  const p = c.s.proposals.find((x) => x.id === id);
  if (!p) return;
  const lead = c.s.leads.find((l) => l.id === p.leadId);
  if (status === "accepted") {
    const tid = extra.tariffId ?? p.recommendedId;
    if (!p.tariffIds.includes(tid)) throw new Error("Tarifni tanlang");
    p.acceptedTariffId = tid;
  }
  if (status === "rejected" && !extra.reason?.trim()) throw new Error("Sabab majburiy");
  p.status = status;
  p.rejectReason = status === "rejected" ? extra.reason!.trim() : undefined;
  p.decidedAt = status === "sent" ? undefined : c.today;
  const t = tariffOf(c.s, p.acceptedTariffId ?? p.recommendedId);
  const text =
    status === "sent"
      ? `Tijorat taklifi yuborildi: ${p.number}`
      : status === "accepted"
        ? `Taklif qabul qilindi: ${t?.name} — ${t ? fmtMoney(proposalPrice(p, t)) : ""}/oy`
        : `Taklif rad etildi: ${p.rejectReason}`;
  lead?.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text });
  if (status === "accepted" && lead) {
    const bosses = c.s.users.filter((u) => u.role === "rahbar" && u.active).map((u) => u.id);
    c.notify(
      [lead.operatorId, lead.meeting?.marketologId, ...bosses],
      `${lead.name}: taklif qabul qilindi — ${t?.name} (${t ? fmtMoney(proposalPrice(p, t)) : ""}/oy). Shartnomani rasmiylashtiring`,
      "/crm",
    );
  }
  c.log(`${lead?.name}: ${text}`, `/taklif/${p.id}`);
}

export function updateProject(c: Ctx, id: string, patch: Partial<Project>) {
  const p = findProject(c, id);
  if (!p) return;
  if (patch.pauseWork !== undefined && patch.pauseWork !== p.pauseWork) {
    c.notify([p.marketologId, p.smmId], `${p.name}: ish ${patch.pauseWork ? "to'xtatildi (qarz)" : "qayta tiklandi"}`, `/loyiha/${id}`);
  }
  Object.assign(p, patch);
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
  if (data.id) {
    const p = c.s.posts.find((x) => x.id === data.id);
    if (!p) return;
    Object.assign(p, data);
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
  p.status = p.format === "video" ? "editing" : "design";
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

export function publishPost(c: Ctx, postId: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.status = "published";
  p.publishedAt = c.today;
  const pr = findProject(c, p.projectId);
  c.notify([pr?.marketologId, pr?.targetologId, p.assigneeId], `Joylandi: ${p.topic} (${pr?.name ?? "—"}, ${PLATFORM_LABELS[p.platform]})`, "/kontent");
  c.log(`${p.topic}: joylandi (${PLATFORM_LABELS[p.platform]})`, "/kontent");
}

export function setPostStatus(c: Ctx, postId: string, status: PostStatus) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p || p.status === status) return;
  if (status === "internal") return sendToInternal(c, postId);
  if (status === "approved") return clientApproved(c, postId);
  if (status === "published") return publishPost(c, postId);
  p.status = status;
  c.log(`${p.topic}: status → ${POST_STATUSES.find((x) => x.id === status)?.label}`, "/kontent");
}

const advance = (p: Post | undefined, to: PostStatus) => {
  if (p && postStage(p.status) < postStage(to)) p.status = to;
};

// ---------- Syomka ----------

export function createShoot(c: Ctx, data: Omit<Shoot, "id" | "createdAt" | "status">) {
  assertWorkAllowed(c, data.projectId);
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
  const t: Task = { ...data, id: newId("task"), status: "new", createdBy: c.me.id, createdAt: nowISO() };
  c.s.tasks.push(t);
  const post = c.s.posts.find((x) => x.id === t.postId);
  if (t.kind === "montaj") advance(post, "editing");
  if (t.kind === "dizayn") advance(post, "design");
  if (t.kind === "target" && post) post.forTarget = true;
  const href = t.kind === "montaj" ? "/montaj" : t.kind === "dizayn" ? "/dizayn" : "/target";
  c.notify([t.assigneeId], `Yangi TZ (${TASK_KIND_LABELS[t.kind]}): ${t.title} — deadline ${fmtDate(t.deadline)}`, href);
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
  if (a && pct > 0 && t.deadline < c.today) {
    const amount = -Math.round((a.amount * pct) / 100);
    c.s.accruals.push({
      id: newId("acr"),
      userId: t.assigneeId,
      projectId: t.projectId,
      date: c.today,
      kind: "penalty",
      sourceId: `late:${t.id}`,
      title: `Jarima ${pct}%: «${t.title}» ${diffDays(c.today, t.deadline)} kun kechikdi`,
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
  t.launchedAt = date;
  t.status = "progress";
  const p = findProject(c, t.projectId);
  if (p && (!p.periodStart || date < p.periodStart)) {
    p.periodStart = date;
    c.notify([p.marketologId, ...financeIds(c)], `${p.name}: birinchi reklama ${fmtDate(date)} da yoqildi — hisob davri boshlandi`, `/loyiha/${p.id}`);
  }
  c.notify([p?.smmId], `Reklama yoqildi: ${t.title}`, "/target");
  c.log(`${t.title}: reklama yoqildi (${fmtDate(date)})`, "/target");
}

export function saveTargetReport(c: Ctx, data: Omit<TargetReport, "id" | "authorId">) {
  const existing = c.s.targetReports.find((r) => r.projectId === data.projectId && r.date === data.date);
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
      const ex = c.s.targetReports.find((x) => x.projectId === row.projectId && x.date === row.date);
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
  if (!(rate > 0)) throw new Error("Kursni kiriting");
  c.s.settings.usdRate = Math.round(rate * 100) / 100;
  c.s.settings.integrations.cbu.lastUpdate = nowISO();
  c.s.settings.integrations.cbu.rateDate = rateDate;
  logIntegration(
    c,
    "cbu",
    true,
    source === "cbu" ? `Markaziy bank kursi: 1 USD = ${fmtNum(rate)} so'm (${fmtDate(rateDate)})` : `Kurs qo'lda kiritildi: 1 USD = ${fmtNum(rate)} so'm`,
  );
}

// ---------- Moliya ----------

export function setInvoiceDue(c: Ctx, invoiceId: string, dueDate: string) {
  const inv = c.s.invoices.find((x) => x.id === invoiceId);
  if (!inv) return;
  inv.dueDate = dueDate;
  c.log(`${inv.number}: to'lov sanasi ${fmtDate(dueDate)}`, "/moliya/fakturalar");
}

/** Mijoz to'lovi fakturaga bog'lanadi. USD hisobga tushsa — kurs bilan. */
export function recordClientPayment(c: Ctx, invoiceId: string, o: { amount: number; date: string; accountId: string; rate?: number; note: string }) {
  const inv = c.s.invoices.find((x) => x.id === invoiceId);
  if (!inv) throw new Error("Faktura topilmadi");
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
  c.s.transactions.push({
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
  if (inv.kind === "prepay" && p && invoicePaid(c.s, inv) >= inv.amount - 1) {
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
  c.s.bills.push({ ...b, id: newId("bill") });
  c.log(`Xarajat hujjati: ${c.s.vendors.find((v) => v.id === b.vendorId)?.name} — ${fmtMoney(b.amount)}`, "/moliya/debitor");
}

export function payBill(c: Ctx, billId: string, o: { amount: number; date: string; accountId: string; rate?: number }) {
  const b = c.s.bills.find((x) => x.id === billId);
  if (!b) return;
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
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
export function payEmployee(c: Ctx, o: { userId: string; amount: number; date: string; accountId: string; rate?: number; note: string }) {
  if (!(o.amount > 0)) throw new Error("Summani kiriting");
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
  c.s.accruals = c.s.accruals.filter((x) => x.id !== id);
  c.log(`Hisoblash o'chirildi: ${a.title}`, "/moliya/ish-haqi");
}

export function savePayProfile(c: Ctx, prof: PayProfile) {
  const i = c.s.payProfiles.findIndex((p) => p.userId === prof.userId);
  if (i >= 0) c.s.payProfiles[i] = prof;
  else c.s.payProfiles.push(prof);
  c.log(`Stavkalar yangilandi: ${c.s.users.find((u) => u.id === prof.userId)?.name}`, "/moliya/ish-haqi");
}

export function setBudget(c: Ctx, month: string, line: BudgetLine["line"], amount: number) {
  const b = c.s.budget.find((x) => x.month === month && x.line === line);
  if (b) b.amount = amount;
  else c.s.budget.push({ month, line, amount });
}

export function closeProject(c: Ctx, projectId: string, date: string) {
  const p = findProject(c, projectId);
  if (!p) return;
  p.status = "closed";
  p.closedAt = date;
  p.pauseWork = true;
  c.notify(
    [p.marketologId, p.smmId, p.targetologId, ...financeIds(c)],
    `${p.name}: loyiha yopildi (${fmtDate(date)}) — yangi fakturalar chiqarilmaydi`,
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

export const defaultDeadline = (today: string) => addDays(today, 2);
