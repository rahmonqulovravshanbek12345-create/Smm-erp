// SMM agentlik ERP — asosiy ma'lumotlar obyektlari (TZ, 8-bo'lim).
// Barcha sanalar "YYYY-MM-DD" ko'rinishida, vaqt belgilari esa ISO formatda saqlanadi.

export type Role =
  | "admin"
  | "rahbar"
  | "operator"
  | "marketolog"
  | "smm"
  | "targetolog"
  | "syomka"
  | "montajyor"
  | "dizayner"
  | "moliya";

export interface User {
  id: string;
  name: string;
  role: Role;
  phone?: string;
  /** Telegram bot xabar yuboradigan chat ID. */
  telegramChatId?: string;
  active: boolean;
}

// ---------- CRM ----------

export type LeadStage = "new" | "meeting" | "visited" | "waiting" | "contract" | "unfit" | "lowquality";

export interface ContactLog {
  id: string;
  at: string;
  userId: string;
  text: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  service: string;
  note: string;
  operatorId: string;
  stage: LeadStage;
  nextContactDate?: string;
  meeting?: { date: string; time: string; marketologId: string };
  rejectReason?: string;
  /** Voronkada erishilgan eng yuqori bosqich: 0 yangi, 1 bog'lanildi, 2 uchrashuv, 3 ofisga keldi, 4 shartnoma. */
  maxStep?: number;
  history: ContactLog[];
  projectId?: string;
  createdAt: string;
}

// ---------- Loyiha ----------

export type DocBlock = "brief" | "strategy" | "competitors" | "swot" | "audience";

export interface DocState {
  content: string;
  status: "progress" | "done";
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  leadId?: string;
  contactName: string;
  phone: string;
  industry: string;
  links: string;
  contractNo: string;
  contractDate: string;
  tariff: string;
  /** Katalogdagi tarif (bo'sh — individual shartlar). */
  tariffId?: string;
  monthlyFee: number;
  prepayType: 100 | 50;
  marketologId: string;
  smmId: string;
  targetologId?: string;
  /** Birinchi reklama joylangan sana — hisob davrining boshi. */
  periodStart?: string;
  /** "Ishni to'xtatish" opsiyasi (qo'lda): belgilansa, yangi vazifalar ochilmaydi. */
  pauseWork: boolean;
  /** Yopilgan loyiha uchun yangi fakturalar chiqarilmaydi. */
  status: "active" | "closed";
  closedAt?: string;
  /** Mijozning oylik reklama byudjeti (USD, tranzit). */
  adBudgetUsd?: number;
  /** Hujjatlar uchun mijoz rekvizitlari. */
  legalName?: string;
  inn?: string;
  address?: string;
  docs: Record<DocBlock, DocState>;
  handedOffAt?: string;
  createdAt: string;
}

// ---------- Tariflar va tijorat takliflari ----------

export interface Tariff {
  id: string;
  name: string;
  /** Qisqa tavsif: kimlar uchun. */
  tagline: string;
  /** Oylik narx, so'm. */
  price: number;
  posts: number;
  videos: number;
  designs: number;
  stories: number;
  shoots: number;
  platforms: Platform[];
  target: boolean;
  /** Tavsiya etiladigan oylik reklama byudjeti (USD, alohida to'lanadi). */
  adBudgetUsd: number;
  prepayType: 100 | 50;
  features: string[];
  active: boolean;
}

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected";

export interface Proposal {
  id: string;
  number: string;
  leadId: string;
  date: string;
  validUntil: string;
  tariffIds: string[];
  recommendedId: string;
  discountPct: number;
  /** Mijozga shaxsiy murojaat. */
  note: string;
  status: ProposalStatus;
  acceptedTariffId?: string;
  rejectReason?: string;
  decidedAt?: string;
  createdBy: string;
}

// ---------- Kontent ----------

export type Platform = "instagram" | "telegram";
export type PostFormat = "video" | "image" | "ai";
export type PostStatus =
  | "plan"
  | "shoot"
  | "editing"
  | "design"
  | "internal"
  | "client"
  | "approved"
  | "published";

export interface Post {
  id: string;
  projectId: string;
  date: string;
  platform: Platform;
  format: PostFormat;
  topic: string;
  script: string;
  assigneeId: string;
  status: PostStatus;
  forTarget: boolean;
  reviewNote?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface Shoot {
  id: string;
  projectId: string;
  date: string;
  time: string;
  location: string;
  videoCount: number;
  postIds: string[];
  operatorId: string;
  note: string;
  footageLink?: string;
  status: "planned" | "handed";
  handedAt?: string;
  createdAt: string;
}

export type TaskKind = "montaj" | "dizayn" | "target";
export type TaskStatus = "new" | "progress" | "review" | "returned" | "accepted";

export interface Task {
  id: string;
  projectId: string;
  postId?: string;
  shootId?: string;
  kind: TaskKind;
  assigneeId: string;
  title: string;
  brief: string;
  script?: string;
  footageLink?: string;
  files?: string;
  designType?: "post" | "cover";
  deadline: string;
  status: TaskStatus;
  returnNote?: string;
  resultLink?: string;
  /** Target vazifasi: reklama yoqilgan sana. */
  launchedAt?: string;
  acceptedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface TargetReport {
  id: string;
  projectId: string;
  date: string;
  spend: number;
  views: number;
  clicks: number;
  leads: number;
  note: string;
  authorId: string;
  /** Qo'lda kiritilgan yoki Meta Ads'dan import qilingan. */
  source: "manual" | "meta";
}

// ---------- Moliya ----------
// Hisob yuritish tamoyillari:
//  • Foyda va zarar — hisoblash usulida: daromad xizmat ko'rsatilgan davrga, ish haqi hisoblangan sanaga.
//  • Pul oqimi (Cash Flow) — faqat haqiqiy kirim-chiqim tranzaksiyalaridan.
//  • Mijozning reklama byudjeti — tranzit: daromad ham, xarajat ham emas.
//  • Aylanma soliq avtomatik hisoblanmaydi — to'langanda chiqim sifatida kiritiladi.

export type Currency = "UZS" | "USD";

export interface Account {
  id: string;
  name: string;
  kind: "cash" | "bank" | "card";
  currency: Currency;
  /** Tizim yuritila boshlagan kundagi qoldiq. */
  opening: number;
}

/**
 * revenue — daromad; direct — to'g'ridan-to'g'ri (loyiha) xarajat; overhead — doimiy xarajat;
 * tax — soliq; transit — mijoz reklama byudjeti; investing — jihoz; financing — egasi/kredit;
 * payroll — xodimga to'lov (hisoblangan ish haqini yopadi); client — mijoz to'lovi (fakturani yopadi);
 * vendor — ta'minotchiga to'lov (xarajat hujjatini yopadi).
 */
export type ArticleGroup =
  | "revenue"
  | "direct"
  | "overhead"
  | "tax"
  | "transit"
  | "investing"
  | "financing"
  | "payroll"
  | "client"
  | "vendor"
  | "transfer";

export interface Article {
  id: string;
  name: string;
  group: ArticleGroup;
  dir: "in" | "out";
}

export interface Transaction {
  id: string;
  date: string;
  accountId: string;
  dir: "in" | "out";
  /** Hisob valyutasida. */
  amount: number;
  /** USD hisoblar uchun: 1 USD necha so'm (tranzaksiya kunidagi kurs). */
  rate?: number;
  articleId: string;
  projectId?: string;
  userId?: string;
  vendorId?: string;
  invoiceId?: string;
  billId?: string;
  transferId?: string;
  note: string;
  createdBy: string;
}

export interface Invoice {
  id: string;
  number: string;
  projectId: string;
  kind: "prepay" | "remainder" | "monthly" | "extra";
  /** Qaysi xizmat davri uchun (0 — birinchi davr). */
  periodIndex: number;
  amount: number;
  issueDate: string;
  /** Bo'sh — sana hali kelishilmagan (qoldiq to'lov uchun). */
  dueDate: string;
  note: string;
}

export interface Vendor {
  id: string;
  name: string;
  kind: string;
}

/** Ta'minotchidan kelgan xarajat hujjati (ijara, servis obunasi va h.k.). */
export interface Bill {
  id: string;
  vendorId: string;
  articleId: string;
  projectId?: string;
  amount: number;
  date: string;
  dueDate: string;
  note: string;
}

export type WorkType = "montaj" | "dizayn_post" | "dizayn_cover" | "syomka" | "shartnoma";

/** Xodimning ish haqi sxemasi. Bir nechtasi birga bo'lishi mumkin. */
export interface PayProfile {
  userId: string;
  /** Fiks oylik (har oy oxirida hisoblanadi). */
  fixed: number;
  /** Har bir loyiha uchun oylik (loyiha davri yopilganda hisoblanadi). */
  perProject: number;
  /** Ishbay stavkalar (ish qabul qilinganda hisoblanadi). */
  rates: Partial<Record<WorkType, number>>;
}

export type AccrualKind = "piece" | "project" | "fixed" | "bonus" | "penalty" | "manual";

/** Hisoblangan ish haqi yozuvi. Manfiy summa — jarima yoki ushlab qolish. */
export interface Accrual {
  id: string;
  userId: string;
  projectId?: string;
  date: string;
  kind: AccrualKind;
  workType?: WorkType;
  /** Takrorlanmaslik uchun manba: vazifa, syomka, davr va h.k. */
  sourceId?: string;
  title: string;
  qty: number;
  rate: number;
  amount: number;
  approved: boolean;
  createdBy: string;
}

/** Oylik reja (byudjet) — moddalar guruhi bo'yicha. */
export interface BudgetLine {
  month: string;
  line: "revenue" | "direct" | "overhead";
  amount: number;
}

export interface MonthlyReport {
  id: string;
  projectId: string;
  periodIndex: number;
  fileLink: string;
  reach: number;
  followers: number;
  leads: number;
  summary: string;
  authorId: string;
  submittedAt: string;
}

// ---------- Tizim ----------

export interface Notification {
  id: string;
  userId: string;
  text: string;
  href?: string;
  at: string;
  read: boolean;
  /** Telegram orqali yetkazilish holati. */
  telegram: "sent" | "demo" | "failed" | "off";
}

export interface Activity {
  id: string;
  at: string;
  userId: string;
  text: string;
  href?: string;
}

export interface Requisites {
  address: string;
  inn: string;
  bankName: string;
  bankAccount: string;
  mfo: string;
  director: string;
  phone: string;
}

export interface Settings {
  companyName: string;
  requisites: Requisites;
  /** Joriy USD kursi (yangi tranzaksiyalar uchun taklif). */
  usdRate: number;
  /** Ish haqi to'lanadigan kun (oyning nechanchi kuni). */
  payday: number;
  /** Kechikkan ish uchun jarima foizi (0 — o'chirilgan). */
  latePenaltyPct: number;
  /** Fiks oyliklar va loyiha oyliklari qaysi oydan boshlab hisoblanadi. */
  payrollStart: string;
  telegram: {
    enabled: boolean;
    /** Bot tokeni faqat shu brauzerda saqlanadi; bo'sh bo'lsa xabarlar demo rejimda ko'rsatiladi. */
    botToken: string;
  };
  integrations: Integrations;
}

export type IntegrationKind = "meta" | "cbu";

export interface IntegrationLog {
  id: string;
  at: string;
  kind: IntegrationKind;
  ok: boolean;
  text: string;
}

export interface Integrations {
  meta: {
    /** Marketing API kirish tokeni — faqat shu brauzerda saqlanadi; bo'sh bo'lsa demo rejim. */
    token: string;
    apiVersion: string;
    /** Sayt ochilganda o'tgan kunlar hisobotini o'zi oladi. */
    autoSync: boolean;
    /** Lid deb nimani hisoblash: lid forma, Direct/Telegram xabar yoki ikkalasi. */
    leadMetric: "all" | "forms" | "messages";
    /** Loyiha → reklama kabineti ID (act_…). */
    accounts: Record<string, string>;
    lastSync?: string;
    /** Avtomatik sinxron urinilgan kun (mahalliy sana). */
    lastAttempt?: string;
  };
  cbu: {
    autoUpdate: boolean;
    lastUpdate?: string;
    rateDate?: string;
    /** Avtomatik urinish kuni — sayt ochilganda kuniga bir martadan ko'p urinilmaydi. */
    lastAttempt?: string;
  };
}

export interface ErpState {
  version: number;
  currentUserId: string;
  users: User[];
  leads: Lead[];
  projects: Project[];
  posts: Post[];
  shoots: Shoot[];
  tasks: Task[];
  targetReports: TargetReport[];
  reports: MonthlyReport[];
  accounts: Account[];
  articles: Article[];
  transactions: Transaction[];
  invoices: Invoice[];
  vendors: Vendor[];
  bills: Bill[];
  payProfiles: PayProfile[];
  accruals: Accrual[];
  budget: BudgetLine[];
  tariffs: Tariff[];
  proposals: Proposal[];
  integrationLog: IntegrationLog[];
  notifications: Notification[];
  activity: Activity[];
  settings: Settings;
}
