import type { DocBlock, LeadStage, Platform, PostFormat, PostStatus, Role, TaskKind, TaskStatus } from "./types";

export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  rahbar: "Rahbar (direktor)",
  operator: "Call operator",
  marketolog: "Marketolog",
  smm: "SMM menejer",
  targetolog: "Targetolog",
  syomka: "Syomka operatori",
  montajyor: "Montajyor",
  dizayner: "Dizayner",
  webdev: "Veb-dasturchi",
  moliya: "Moliya",
};

export const ROLE_DUTIES: Record<Role, string> = {
  operator: "Leadlarga qo'ng'iroq qiladi, uchrashuv belgilaydi",
  marketolog: "Brif, strategiya, tahlillar, tasdiqlash, nazorat",
  smm: "Kontent reja, TZ berish, joylash, hisobot",
  targetolog: "Meta Ads, kunlik hisobot",
  syomka: "Syomka, kadrlarni topshirish",
  montajyor: "Video montaj",
  dizayner: "Post va oblojka dizayni, branding",
  webdev: "Sayt qilish: dizayndan ishga tushirishgacha",
  moliya: "To'lovlar, qarzlar",
  admin: "Foydalanuvchi va huquqlar",
  rahbar: "Moliyaviy natija, strategik qarorlar",
};

export const LEAD_STAGES: { id: LeadStage; label: string; tone: Tone }[] = [
  { id: "new", label: "Yangi lid", tone: "blue" },
  { id: "meeting", label: "Uchrashuv belgilandi", tone: "violet" },
  { id: "visited", label: "Ofisga keldi", tone: "amber" },
  { id: "waiting", label: "Kutuvda", tone: "gray" },
  { id: "contract", label: "Shartnoma bo'ldi", tone: "green" },
  { id: "unfit", label: "To'g'ri kelmadi", tone: "red" },
  { id: "lowquality", label: "Sifatsiz lid", tone: "red" },
];

export const LEAD_SOURCES = ["Instagram", "Telegram", "Sayt", "Tavsiya", "Meta Ads", "Boshqa"];
/** Lid qiziqqan xizmat — xizmatlar ro'yxati bilan bir xil. */
export const SERVICES = ["SMM xizmati", "Target xizmati", "Performance marketing", "Video production", "Branding", "Sayt qilish"];

export const DOC_BLOCKS: { id: DocBlock; label: string; hint: string }[] = [
  { id: "brief", label: "Brif", hint: "Mijoz biznesi, maqsadlar, mahsulot/xizmatlar, cheklovlar" },
  { id: "strategy", label: "Strategiya", hint: "Pozitsiyalash, kontent ustunlari, KPI, kanallar" },
  { id: "competitors", label: "Konkurent analiz", hint: "3-5 ta raqobatchi: kuchli/zaif tomonlari, kontenti" },
  { id: "swot", label: "SWOT", hint: "Kuchli, zaif tomonlar, imkoniyatlar, xavflar" },
  { id: "audience", label: "Maqsadli auditoriya", hint: "Segmentlar, yosh, qiziqish, og'riqlar, geografiya" },
];

export const POST_STATUSES: { id: PostStatus; label: string; tone: Tone }[] = [
  { id: "plan", label: "Reja", tone: "gray" },
  { id: "shoot", label: "Syomka kutilmoqda", tone: "amber" },
  { id: "editing", label: "Montajda", tone: "blue" },
  { id: "design", label: "Dizaynda", tone: "blue" },
  { id: "internal", label: "Ichki tasdiqda", tone: "violet" },
  { id: "client", label: "Mijoz tasdig'ida", tone: "violet" },
  { id: "approved", label: "Tasdiqlandi", tone: "green" },
  { id: "published", label: "Joylandi", tone: "green" },
];

export const LATE = { label: "Kechikdi", tone: "red" as Tone };

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export const PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[];

/** Kalendar va kartalar uchun qisqa belgi. */
export const PLATFORM_SHORT: Record<Platform, string> = { instagram: "IG", telegram: "TG", facebook: "FB", tiktok: "TT", youtube: "YT" };

export const FORMAT_LABELS: Record<PostFormat, string> = {
  video: "Video",
  image: "Rasm / dizayn",
  text: "Faqat matn",
  ai: "AI post",
};

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  montaj: "Montaj",
  dizayn: "Dizayn",
  target: "Target",
};

export const TASK_STATUSES: { id: TaskStatus; label: string; tone: Tone }[] = [
  { id: "new", label: "Yangi", tone: "blue" },
  { id: "progress", label: "Jarayonda", tone: "amber" },
  { id: "review", label: "Tayyor (tekshiruvga)", tone: "violet" },
  { id: "returned", label: "Qaytarildi", tone: "red" },
  { id: "accepted", label: "Qabul qilindi", tone: "green" },
];

export const PAYMENT_STATUS: Record<"pending" | "paid" | "partial" | "overdue", { label: string; tone: Tone }> = {
  pending: { label: "Kutilmoqda", tone: "gray" },
  paid: { label: "To'langan", tone: "green" },
  partial: { label: "Qisman", tone: "amber" },
  overdue: { label: "Muddati o'tgan (qarz)", tone: "red" },
};

export const PAYMENT_KIND_LABELS = {
  prepay: "Oldindan to'lov",
  remainder: "Qoldiq to'lov",
  monthly: "Oylik abonent",
  extra: "Qo'shimcha xizmat",
};

export function postStatusMeta(id: PostStatus) {
  return POST_STATUSES.find((s) => s.id === id) ?? POST_STATUSES[0]!;
}

export function taskStatusMeta(id: TaskStatus) {
  return TASK_STATUSES.find((s) => s.id === id) ?? TASK_STATUSES[0]!;
}

export function leadStageMeta(id: LeadStage) {
  return LEAD_STAGES.find((s) => s.id === id) ?? LEAD_STAGES[0]!;
}
