// Haqiqiy tizim uchun bo'sh boshlang'ich holat: faqat admin, standart hisoblar, moddalar, tariflar va sozlamalar.
// Mijozlar, loyihalar, xodimlar va pul — hammasi agentlikning o'zi tomonidan kiritiladi (demo ma'lumot yo'q).
import { DEFAULT_CONTENT_TYPES } from "./content";
import { monthKey } from "./dates";
import { DEFAULT_ARTICLES } from "./finance";
import { SEED_VERSION } from "./seed";
import { DEFAULT_TARIFFS, SERVICE_TARIFFS } from "./tariffs";
import type { ErpState } from "./types";

export function buildBlank(today: string, admin: { id: string; name: string } = { id: "u_admin", name: "Administrator" }): ErpState {
  return {
    version: SEED_VERSION,
    currentUserId: admin.id,
    users: [{ id: admin.id, name: admin.name, role: "admin", active: true, hiredAt: today }],
    leads: [],
    projects: [],
    posts: [],
    shoots: [],
    tasks: [],
    targetReports: [],
    reports: [],
    // ID'lar demo bilan bir xil: sahifalar «bank» va «naqd» hisobni shu ID orqali taklif qiladi
    accounts: [
      { id: "acc_bank", name: "Bank hisob", kind: "bank", currency: "UZS", opening: 0 },
      { id: "acc_cash", name: "Naqd kassa", kind: "cash", currency: "UZS", opening: 0 },
      { id: "acc_card", name: "Korporativ karta", kind: "card", currency: "UZS", opening: 0 },
      { id: "acc_usd", name: "Valyuta hisob (USD)", kind: "card", currency: "USD", opening: 0 },
    ],
    articles: DEFAULT_ARTICLES.map((a) => ({ ...a })),
    transactions: [],
    invoices: [],
    vendors: [],
    bills: [],
    payProfiles: [],
    accruals: [],
    budget: [],
    tariffs: [...DEFAULT_TARIFFS, ...SERVICE_TARIFFS].map((t) => ({ ...t, features: [...t.features], platforms: [...t.platforms] })),
    proposals: [],
    quotas: [],
    integrationLog: [],
    notifications: [],
    activity: [],
    settings: {
      companyName: "Friday Agency",
      requisites: { address: "", inn: "", bankName: "", bankAccount: "", mfo: "", director: "", phone: "" },
      usdRate: 12_650,
      usdMarkupPct: 2,
      payday: 10,
      latePenaltyPct: 0,
      payrollStart: monthKey(today),
      contentTypes: DEFAULT_CONTENT_TYPES.map((t) => ({ ...t })),
      telegram: { enabled: false, botToken: "" },
      integrations: {
        meta: { token: "", apiVersion: "v23.0", autoSync: true, leadMetric: "all", accounts: {} },
        cbu: { autoUpdate: true },
      },
    },
  };
}
