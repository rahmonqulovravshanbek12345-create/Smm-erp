// SMM agentlik ERP — asosiy ma'lumotlar obyektlari (TZ, 8-bo'lim).
// Barcha sanalar "YYYY-MM-DD" ko'rinishida, vaqt belgilari esa ISO formatda saqlanadi.

export type Role =
  | "admin"
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
  monthlyFee: number;
  prepayType: 100 | 50;
  marketologId: string;
  smmId: string;
  targetologId?: string;
  /** Birinchi reklama joylangan sana — hisob davrining boshi. */
  periodStart?: string;
  /** "Ishni to'xtatish" opsiyasi (qo'lda): belgilansa, yangi vazifalar ochilmaydi. */
  pauseWork: boolean;
  docs: Record<DocBlock, DocState>;
  handedOffAt?: string;
  createdAt: string;
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

export interface PaymentTx {
  id: string;
  date: string;
  amount: number;
  note: string;
}

export interface Payment {
  id: string;
  projectId: string;
  kind: "prepay" | "remainder" | "monthly";
  periodIndex: number;
  amount: number;
  dueDate: string;
  transactions: PaymentTx[];
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

export interface Salary {
  id: string;
  userId: string;
  month: string;
  amount: number;
  note: string;
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

export interface Settings {
  /** Bitta qabul qilingan montaj narxi (so'm). */
  montajPrice: number;
  telegram: {
    enabled: boolean;
    /** Bot tokeni faqat shu brauzerda saqlanadi; bo'sh bo'lsa xabarlar demo rejimda ko'rsatiladi. */
    botToken: string;
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
  payments: Payment[];
  reports: MonthlyReport[];
  salaries: Salary[];
  notifications: Notification[];
  activity: Activity[];
  settings: Settings;
}
