// Har bir amal argumentlarining aniq shakli. Brauzerdan kelgan har qanday so'rov shu yerda tekshiriladi:
// noma'lum maydon, noto'g'ri tur, haddan katta son yoki matn — amal bajarilmaydi (holat buzilmaydi).
import { z } from "zod";
import type { ActionArgs, ActionName } from "../../src/lib/registry";

// ---------- Asosiy turlar ----------

const id = z.string().min(1).max(64);
const optId = id.optional();
const short = z.string().max(300);
const text = z.string().max(5_000);
/** Uzun matn (ssenariy, TZ, strategiya bloki). Cheklov — bitta xodim ulkan matnlar bilan tizimni sekinlashtira olmasin. */
const long = z.string().max(20_000);
const link = z.string().max(2_000);
/** Haqiqiy kalendar sanasi (2026-02-30 yoki 2026-13-01 emas). */
const realDate = (v: string) => {
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri")
  .refine(realDate, "Sana noto'g'ri");
const dateOrEmpty = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Sana noto'g'ri")
  .refine((v) => v === "" || realDate(v), "Sana noto'g'ri");
const time = z.string().regex(/^(\d{2}:\d{2})?$/, "Vaqt noto'g'ri");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Oy noto'g'ri");
const money = z.number().finite().min(-1e13).max(1e13);
const amount = z.number().finite().min(0).max(1e13);
const count = z.number().finite().min(0).max(1e7);
const pct = z.number().finite().min(0).max(100);
const rate = z.number().finite().positive().max(1e7);

const role = z.enum(["admin", "rahbar", "operator", "marketolog", "smm", "targetolog", "syomka", "montajyor", "dizayner", "webdev", "moliya"]);
const leadStage = z.enum(["new", "meeting", "visited", "waiting", "contract", "unfit", "lowquality"]);
const platform = z.enum(["instagram", "telegram", "facebook", "tiktok", "youtube"]);
const postFormat = z.enum(["video", "image", "text", "ai"]);
const postStatus = z.enum(["plan", "shoot", "editing", "design", "internal", "client", "approved", "published"]);
const serviceKind = z.enum(["smm", "target", "performance", "video", "branding", "web"]);
const taskKind = z.enum(["montaj", "dizayn", "target"]);
const adChannel = z.enum(["meta", "google", "yandex", "tiktok"]);
const docBlock = z.enum(["brief", "strategy", "competitors", "swot", "audience"]);
const workType = z.enum(["montaj", "dizayn_post", "dizayn_cover", "syomka", "shartnoma", "xizmat"]);
const prepay = z.union([z.literal(100), z.literal(50)]);
const currency = z.enum(["UZS", "USD"]);
const platformText = z.partialRecord(platform, z.string().max(5_000));
const platformDate = z.partialRecord(platform, dateOrEmpty);

// ---------- Murakkab kirishlar ----------

const meeting = z.strictObject({ date: dateOrEmpty, time, marketologId: z.string().max(64) });

const serviceInput = z.strictObject({
  kind: serviceKind,
  priceUsd: z.number().finite().min(0).max(1e7).optional(),
  tariffId: optId,
  title: short,
  withTarget: z.boolean().optional(),
  price: amount,
  adPct: pct.optional(),
  kpiLeads: count.optional(),
  kpiCpl: z.number().finite().min(0).max(1e6).optional(),
  channels: z.array(adChannel).max(4).optional(),
  prepayPct: prepay.optional(),
  prepayAmount: amount.optional(),
  assigneeId: optId,
  assigneeFee: amount.optional(),
  startDate: dateOrEmpty.optional(),
  deadline: dateOrEmpty.optional(),
});

const projectInput = z.strictObject({
  name: short,
  contactName: short,
  phone: short,
  industry: short,
  links: link,
  contractNo: short,
  contractDate: dateOrEmpty,
  prepayType: prepay,
  prepayAmount: amount.optional(),
  prepayDueDate: dateOrEmpty,
  remainderDueDate: dateOrEmpty,
  marketologId: z.string().max(64),
  smmId: z.string().max(64),
  targetologId: optId,
  adBudgetUsd: z.number().finite().min(0).max(1e8).optional(),
  currency: currency.optional(),
  services: z.array(serviceInput).max(20),
});

const tariff = z.strictObject({
  id: z.string().max(64),
  service: serviceKind.optional(),
  name: short,
  tagline: short,
  price: amount,
  posts: count,
  videos: count,
  designs: count,
  texts: count.optional(),
  targetVideos: count.optional(),
  stories: count,
  shoots: count,
  platforms: z.array(platform).max(5),
  target: z.boolean(),
  adPct: pct.optional(),
  adBudgetUsd: z.number().finite().min(0).max(1e8),
  prepayType: prepay,
  features: z.array(short).max(50),
  active: z.boolean(),
});

const metaRow = z.strictObject({
  projectId: id,
  date,
  spend: amount,
  views: count.max(1e12),
  clicks: count.max(1e12),
  leads: count.max(1e12),
  note: text,
  channel: adChannel.optional(),
  source: z.enum(["manual", "meta"]),
});

// ---------- Amallar ----------

type Schemas = { [N in ActionName]: z.ZodType<ActionArgs<N>> };

export const ARGS: Schemas = {
  saveLead: z.tuple([
    z.strictObject({
      id: optId,
      name: short,
      phone: short,
      source: short,
      service: short,
      note: text,
      operatorId: z.string().max(64),
      nextContactDate: dateOrEmpty.optional(),
      meeting: meeting.optional(),
      rejectReason: text.optional(),
    }),
  ]),
  addContact: z.tuple([id, text, dateOrEmpty.optional()]),
  moveLead: z.tuple([id, leadStage, z.strictObject({ meeting: meeting.optional(), reason: text.optional() }).optional()]),
  createProposal: z.tuple([
    z.strictObject({
      leadId: id,
      tariffIds: z.array(id).max(30),
      recommendedId: z.string().max(64),
      discountPct: pct,
      validDays: z.number().int().min(1).max(365),
      note: text,
    }),
  ]),
  setProposalStatus: z.tuple([
    id,
    z.enum(["sent", "accepted", "rejected"]),
    z.strictObject({ tariffId: optId, tariffIds: z.array(id).max(10).optional(), reason: text.optional() }).optional(),
  ]),
  saveTariff: z.tuple([tariff]),

  createProject: z.tuple([projectInput, optId]),
  updateProject: z.tuple([id, z.strictObject({ periodStart: dateOrEmpty.optional(), pauseWork: z.boolean().optional() })]),
  closeProject: z.tuple([id, date]),
  handOff: z.tuple([id]),
  saveDoc: z.tuple([id, docBlock, long, z.enum(["progress", "done"])]),
  submitReport: z.tuple([
    z.strictObject({
      projectId: id,
      periodIndex: z.number().int().min(0).max(1000),
      fileLink: link,
      reach: count.max(1e12),
      followers: count.max(1e12),
      leads: count.max(1e12),
      summary: long,
    }),
  ]),
  addService: z.tuple([id, serviceInput, z.strictObject({ dueDate: dateOrEmpty.optional(), prorate: z.boolean().optional() }).optional()]),
  updateService: z.tuple([id, id, serviceInput.partial()]),
  cancelService: z.tuple([id, id]),
  advanceServiceStage: z.tuple([id, id]),
  revertServiceStage: z.tuple([id, id]),
  saveQuota: z.tuple([id, month, z.record(z.string().max(64), count).refine((r) => Object.keys(r).length <= 100), text.optional()]),
  saveContentType: z.tuple([z.strictObject({ id: optId, name: short, format: postFormat, active: z.boolean(), forAds: z.boolean().optional() })]),

  savePost: z.tuple([
    z.strictObject({
      id: optId,
      projectId: id,
      date: dateOrEmpty,
      platforms: z.array(platform).max(5),
      typeId: z.string().max(64),
      format: postFormat,
      topic: short,
      script: long,
      assigneeId: z.string().max(64),
      forTarget: z.boolean(),
      platformNotes: platformText.optional(),
      publishedOn: platformDate.optional(),
      publishedAt: dateOrEmpty.optional(),
    }),
  ]),
  deletePost: z.tuple([id]),
  sendToInternal: z.tuple([id]),
  approveInternal: z.tuple([id]),
  returnPost: z.tuple([id, text]),
  clientApproved: z.tuple([id]),
  publishPost: z.tuple([id, platform.optional()]),
  handToTarget: z.tuple([id]),
  unpublishPlatform: z.tuple([id, platform]),
  setPostStatus: z.tuple([id, postStatus]),
  createShoot: z.tuple([
    z.strictObject({
      projectId: id,
      date,
      time,
      location: short,
      videoCount: z.number().int().min(0).max(1000),
      postIds: z.array(id).max(200),
      operatorId: z.string().max(64),
      note: text,
      footageLink: link.optional(),
    }),
  ]),
  handFootage: z.tuple([id, link]),

  createTask: z.tuple([
    z.strictObject({
      kind: taskKind,
      projectId: id,
      postId: optId,
      shootId: optId,
      assigneeId: z.string().max(64),
      title: short,
      brief: long,
      script: long.optional(),
      footageLink: link.optional(),
      files: link.optional(),
      designType: z.string().max(64).optional(),
      deadline: dateOrEmpty,
      deadlineTime: time.optional(),
    }),
  ]),
  startTask: z.tuple([id]),
  submitTask: z.tuple([id, link]),
  acceptTask: z.tuple([id]),
  returnTask: z.tuple([id, text]),
  updateTask: z.tuple([
    id,
    z.strictObject({
      assigneeId: z.string().max(64).optional(),
      // Bo'sh qator — postdan uzish
      postId: z.string().max(64).optional(),
      title: short.optional(),
      brief: long.optional(),
      script: long.optional(),
      footageLink: link.optional(),
      files: link.optional(),
      designType: z.string().max(64).optional(),
      deadline: dateOrEmpty.optional(),
      deadlineTime: time.optional(),
    }),
  ]),
  cancelTask: z.tuple([id]),
  launchTarget: z.tuple([id, date]),
  saveTargetReport: z.tuple([metaRow]),

  voidInvoice: z.tuple([id, text]),
  setInvoiceDue: z.tuple([id, dateOrEmpty]),
  recordClientPayment: z.tuple([
    id,
    z.strictObject({
      amount,
      date,
      accountId: id,
      rate: rate.optional(),
      note: text,
      fxRate: rate.optional(),
      markupPct: pct.optional(),
    }),
  ]),
  createExtraInvoice: z.tuple([z.strictObject({ projectId: id, amount, issueDate: date, dueDate: dateOrEmpty, note: text })]),
  addTransaction: z.tuple([
    z.strictObject({
      date,
      accountId: id,
      dir: z.enum(["in", "out"]),
      amount,
      rate: rate.optional(),
      articleId: id,
      projectId: optId,
      userId: optId,
      vendorId: optId,
      note: text,
    }),
  ]),
  addTransfer: z.tuple([z.strictObject({ from: id, to: id, amountFrom: amount, amountTo: amount, rate: rate.optional(), date, note: text })]),
  deleteTransaction: z.tuple([id]),
  addBill: z.tuple([z.strictObject({ vendorId: id, articleId: id, projectId: optId, amount, date, dueDate: dateOrEmpty, note: text })]),
  payBill: z.tuple([id, z.strictObject({ amount, date, accountId: id, rate: rate.optional() })]),
  payEmployee: z.tuple([z.strictObject({ userId: id, amount, date, accountId: id, rate: rate.optional(), note: text, advance: z.boolean().optional() })]),
  addManualAccrual: z.tuple([
    z.strictObject({ userId: id, projectId: optId, date, kind: z.enum(["bonus", "penalty", "manual"]), amount: money, title: short }),
  ]),
  approveAccruals: z.tuple([z.array(id).max(5_000)]),
  deleteAccrual: z.tuple([id]),
  savePayProfile: z.tuple([
    z.strictObject({
      userId: id,
      fixed: amount,
      perProject: amount,
      rates: z.partialRecord(workType, amount),
      fixedFrom: dateOrEmpty.optional(),
    }),
  ]),
  setBudget: z.tuple([month, z.enum(["revenue", "direct", "overhead"]), amount]),
  saveAccount: z.tuple([z.strictObject({ id: optId, name: short, kind: z.enum(["cash", "bank", "card"]), currency, opening: money })]),
  saveVendor: z.tuple([z.strictObject({ id: optId, name: short, kind: short })]),

  setUsdRate: z.tuple([rate, date, z.literal("manual")]),
  setUsdMarkup: z.tuple([pct]),
  saveMetaSettings: z.tuple([
    z.strictObject({
      token: z.string().max(1_000).optional(),
      apiVersion: z
        .string()
        .regex(/^v\d{1,3}\.\d{1,2}$/)
        .optional(),
      autoSync: z.boolean().optional(),
      leadMetric: z.enum(["all", "forms", "messages"]).optional(),
    }),
  ]),
  setMetaAccount: z.tuple([id, z.string().max(40)]),
  setProjectTeam: z.tuple([id, z.enum(["marketolog", "smm", "targetolog"]), id, date]),
  setCbuAuto: z.tuple([z.boolean()]),
  // Serverda brauzerdan qabul qilinmaydi (qoidalar ham rad etadi) — shakl faqat to'liqlik uchun
  logIntegration: z.tuple([z.enum(["meta", "cbu"]), z.boolean(), text]),
  applyMetaSync: z.tuple([z.array(z.never()).max(0)]),
  metaAutoSync: z.tuple([z.array(z.never()).max(0)]),
  markIntegrationAttempt: z.tuple([z.enum(["cbu", "meta"])]),
  saveLeadAdsSettings: z.tuple([
    z.strictObject({
      enabled: z.boolean().optional(),
      pageId: z.string().max(40).optional(),
      pageToken: z.string().max(1_000).optional(),
      appSecret: z.string().max(200).optional(),
      verifyToken: z.string().max(120).optional(),
      assignTo: id.optional(),
    }),
  ]),
  // Serverda brauzerdan qabul qilinmaydi (qoidalar rad etadi) — shakl faqat to'liqlik uchun
  intakeLead: z.tuple([z.strictObject({ externalId: short, name: short, phone: short, service: short, note: text, createdAt: z.string().max(40).optional() })]),
  markLeadsPoll: z.tuple([z.string().max(300).optional()]),
  setAvatarStamp: z.tuple([id, z.string().max(40).optional()]),
  setTelegramStatus: z.tuple([z.string().regex(/^-?\d{3,20}$/), z.enum(["member", "blocked"]), z.enum(["event", "send", "probe"])]),
  markTelegramTracking: z.tuple([z.boolean(), z.string().max(300).optional()]),
  markTelegramMiniApp: z.tuple([z.boolean(), z.string().max(300).optional()]),
  setUserName: z.tuple([id, short]),
  switchUser: z.tuple([id]),
  setChatIdForAll: z.tuple([z.string().max(30)]),

  addUser: z.tuple([z.strictObject({ name: short, role })]),
  setUserRole: z.tuple([id, role]),
  setUserChatId: z.tuple([id, z.string().max(30)]),
  archiveUser: z.tuple([id, optId]),
  restoreUser: z.tuple([id]),
  setTelegramEnabled: z.tuple([z.boolean()]),
  setTelegramToken: z.tuple([z.string().max(200)]),
  setCompanyName: z.tuple([short]),
  setRequisite: z.tuple([z.enum(["address", "inn", "bankName", "bankAccount", "mfo", "director", "phone"]), short]),
  setPayday: z.tuple([z.number().int().min(1).max(28)]),
  setLatePenalty: z.tuple([pct]),

  markAllRead: z.tuple([]),
  markRead: z.tuple([id]),
};

/** Argumentlarni tekshiradi: to'g'ri bo'lsa — tozalangan qiymat, aks holda xato matni. */
export function parseArgs<N extends ActionName>(name: N, raw: unknown): { ok: true; args: ActionArgs<N> } | { ok: false; error: string } {
  const schema = ARGS[name];
  if (!schema) return { ok: false, error: "Noma'lum amal" };
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, args: r.data as ActionArgs<N> };
  const issue = r.error.issues[0];
  return { ok: false, error: `Ma'lumot noto'g'ri: ${issue ? `${issue.path.join(".") || "argumentlar"} — ${issue.message}` : "shakl mos emas"}` };
}
