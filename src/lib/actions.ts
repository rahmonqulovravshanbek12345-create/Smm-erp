// Biznes amallari. Har biri Ctx oladi: holatni o'zgartiradi, bildirishnoma yuboradi va tarixga yozadi.
import { addDays, fmtDate, fmtDateShort, nowISO } from "./dates";
import { DOC_BLOCKS, LEAD_STAGES, POST_STATUSES, TASK_KIND_LABELS } from "./labels";
import { postStage, workBlockedReason } from "./rules";
import { newId, type Ctx } from "./store";
import type { DocBlock, Lead, LeadStage, Post, PostStatus, Project, Shoot, Task, TargetReport } from "./types";

const stageLabel = (s: LeadStage) => LEAD_STAGES.find((x) => x.id === s)?.label ?? s;
const projectName = (c: Ctx, id: string) => c.s.projects.find((p) => p.id === id)?.name ?? "—";
const findProject = (c: Ctx, id: string) => c.s.projects.find((p) => p.id === id);
const marketologsOf = (c: Ctx, projectId: string) => {
  const p = findProject(c, projectId);
  return [p?.marketologId, ...c.s.users.filter((u) => u.role === "marketolog" && u.active).map((u) => u.id)];
};
const financeIds = (c: Ctx) => c.s.users.filter((u) => u.role === "moliya" && u.active).map((u) => u.id);

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
  const lead: Lead = { ...data, id: newId("lead"), stage: "new", history: [], createdAt: nowISO() };
  c.s.leads.unshift(lead);
  c.notify([lead.operatorId], `Yangi lid: ${lead.name} (${lead.phone})`, "/crm");
  c.log(`Yangi lid qo'shildi: ${lead.name}`, "/crm");
}

export function addContact(c: Ctx, leadId: string, text: string, nextContactDate?: string) {
  const l = c.s.leads.find((x) => x.id === leadId);
  if (!l || !text.trim()) return;
  l.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text: text.trim() });
  if (nextContactDate !== undefined) l.nextContactDate = nextContactDate || undefined;
  c.log(`${l.name}: aloqa tarixi to'ldirildi`, "/crm");
}

export function moveLead(
  c: Ctx,
  leadId: string,
  stage: LeadStage,
  extra: { meeting?: Lead["meeting"]; reason?: string } = {},
) {
  const l = c.s.leads.find((x) => x.id === leadId);
  if (!l) return;
  if (stage === "meeting") {
    if (!extra.meeting?.date || !extra.meeting.time || !extra.meeting.marketologId) {
      throw new Error("Uchrashuv uchun sana, vaqt va marketolog majburiy");
    }
    l.meeting = extra.meeting;
    c.notify(
      [extra.meeting.marketologId],
      `Yangi uchrashuv belgilandi: ${l.name}, ${fmtDate(extra.meeting.date)} ${extra.meeting.time}`,
      "/crm",
    );
  }
  if (stage === "unfit" || stage === "lowquality") {
    if (!extra.reason?.trim()) throw new Error("Sabab majburiy");
    l.rejectReason = extra.reason.trim();
  }
  const from = l.stage;
  l.stage = stage;
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
  c.s.projects.push({ ...rest, id, leadId, pauseWork: false, docs, createdAt: nowISO() });
  const prepay = Math.round((input.monthlyFee * input.prepayType) / 100);
  c.s.payments.push({
    id: newId("pay"),
    projectId: id,
    kind: "prepay",
    periodIndex: 0,
    amount: prepay,
    dueDate: prepayDueDate || input.contractDate,
    transactions: [],
  });
  if (input.prepayType === 50) {
    c.s.payments.push({
      id: newId("pay"),
      projectId: id,
      kind: "remainder",
      periodIndex: 0,
      amount: input.monthlyFee - prepay,
      dueDate: remainderDueDate,
      transactions: [],
    });
  }
  if (leadId) {
    const l = c.s.leads.find((x) => x.id === leadId);
    if (l) {
      const from = l.stage;
      l.stage = "contract";
      l.projectId = id;
      l.history.unshift({ id: newId("c"), at: nowISO(), userId: c.me.id, text: `Bosqich: ${stageLabel(from)} → Shartnoma bo'ldi` });
    }
  }
  c.notify([input.marketologId, input.smmId], `Yangi loyiha: ${input.name} (shartnoma ${input.contractNo})`, `/loyiha/${id}`);
  c.notify(financeIds(c), `${input.name}: oldindan to'lovni (${input.prepayType}%) qayd eting`, "/moliya");
  c.log(`${input.name}: loyiha kartasi yaratildi${leadId ? " (lid → loyiha)" : ""}`, `/loyiha/${id}`);
  return id;
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
  c.log(`${p.topic}: mijoz tasdiqladi`, "/kontent");
}

export function publishPost(c: Ctx, postId: string) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p) return;
  p.status = "published";
  p.publishedAt = c.today;
  c.log(`${p.topic}: joylandi (${p.platform === "instagram" ? "Instagram" : "Telegram"})`, "/kontent");
}

export function setPostStatus(c: Ctx, postId: string, status: PostStatus) {
  const p = c.s.posts.find((x) => x.id === postId);
  if (!p || p.status === status) return;
  if (status === "internal") return sendToInternal(c, postId);
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
  for (const pid of sh.postIds) advance(c.s.posts.find((x) => x.id === pid), "editing");
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

/** Demo: Meta Ads'dan avtomatik import (haqiqiy versiyada Marketing API orqali olinadi). */
export function importFromMeta(c: Ctx, projectId: string, date: string) {
  const seed = [...(projectId + date)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const k = 0.8 + (seed % 40) / 100;
  saveTargetReport(c, {
    projectId,
    date,
    spend: Math.round((140_000 * k) / 1000) * 1000,
    views: Math.round(9_500 * k),
    clicks: Math.round(220 * k),
    leads: Math.round(6 * k),
    note: "Meta Ads'dan import qilindi",
    source: "meta",
  });
}

// ---------- Moliya ----------

export function addPaymentTx(c: Ctx, paymentId: string, amount: number, date: string, note: string) {
  const pay = c.s.payments.find((x) => x.id === paymentId);
  if (!pay || amount <= 0) throw new Error("Summani kiriting");
  pay.transactions.push({ id: newId("tx"), date, amount, note });
  const p = findProject(c, pay.projectId);
  const paid = pay.transactions.reduce((a, t) => a + t.amount, 0);
  if (pay.kind === "prepay" && paid >= pay.amount && p) {
    c.notify([p.marketologId, p.smmId], `${p.name}: oldindan to'lov keldi — ish boshlanadi`, `/loyiha/${p.id}`);
  }
  c.log(`${p?.name}: to'lov qayd etildi ${amount.toLocaleString("ru-RU")} so'm`, "/moliya");
}

export function setPaymentDue(c: Ctx, paymentId: string, dueDate: string) {
  const pay = c.s.payments.find((x) => x.id === paymentId);
  if (!pay) return;
  pay.dueDate = dueDate;
  c.log(`${projectName(c, pay.projectId)}: to'lov sanasi ${fmtDate(dueDate)}`, "/moliya");
}

export function saveSalary(c: Ctx, userId: string, month: string, amount: number, note: string) {
  const ex = c.s.salaries.find((x) => x.userId === userId && x.month === month);
  if (ex) Object.assign(ex, { amount, note });
  else c.s.salaries.push({ id: newId("sal"), userId, month, amount, note });
  c.log(`Oylik kiritildi: ${c.s.users.find((u) => u.id === userId)?.name}`, "/moliya");
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
