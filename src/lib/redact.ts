// Har bir xodimga faqat unga ruxsat etilgan ma'lumot yuboriladi (server tomonda). Masalan, montajyorning
// brauzeriga boshqalarning oyligi, kompaniya kassasi yoki boshqa loyihalar umuman kelmaydi.
// Maxfiy kalitlar (Telegram, Meta tokenlari) hech kimga yuborilmaydi — o'rniga «saqlangan» belgisi.
import { canView, seesEverything, visibleProjects } from "./permissions";
import type { ErpState, User } from "./types";

export const SECRET_MASK = "••••••••";

/** Saqlangan maxfiy qiymat o'rniga ko'rsatiladigan belgi (oxirgi 4 belgi — qaysi kalit ekanini tanish uchun). */
export const maskSecret = (v: string) => (v.trim() ? `${SECRET_MASK}${v.trim().slice(-4)}` : "");
export const isMasked = (v: string | undefined) => Boolean(v?.startsWith(SECRET_MASK));

/** Holatdan maxfiy kalitlarni olib tashlaydi (har qanday tashqi nusxa uchun). */
export function withoutSecrets(s: ErpState): ErpState {
  const st = s.settings;
  return {
    ...s,
    settings: {
      ...st,
      telegram: { ...st.telegram, botToken: maskSecret(st.telegram.botToken) },
      integrations: {
        ...st.integrations,
        meta: { ...st.integrations.meta, token: maskSecret(st.integrations.meta.token) },
        leads: { ...st.integrations.leads, pageToken: maskSecret(st.integrations.leads.pageToken), appSecret: maskSecret(st.integrations.leads.appSecret) },
      },
    },
  };
}

/** Xodim uchun holat nusxasi. Asl holat o'zgarmaydi (yangi massiv va obyektlar). */
export function redactFor(full: ErpState, me: User): ErpState {
  const base = withoutSecrets(full);
  const admin = me.role === "admin";
  const out: ErpState = {
    ...base,
    currentUserId: me.id,
    // Chat ID faqat admin uchun; boshqalarga faqat «ulangan» belgisi
    users: base.users.map((u) => (admin || u.id === me.id || !u.telegramChatId ? u : { ...u, telegramChatId: "•" })),
    notifications: base.notifications.filter((n) => n.userId === me.id),
  };
  if (seesEverything(me)) return out;

  const projects = visibleProjects(full, me);
  const pids = new Set(projects.map((p) => p.id));
  const crm = canView(me.role, "crm");
  // Operator — o'z lidlaridan tuzilgan loyihalar (loyiha ham aynan shu liddan yaratilgan bo'lishi shart)
  if (crm)
    for (const l of full.leads)
      if (l.projectId && l.operatorId === me.id && full.projects.some((p) => p.id === l.projectId && p.leadId === l.id)) pids.add(l.projectId);
  const inProject = <T extends { projectId: string }>(x: T) => pids.has(x.projectId);
  const invoices = full.invoices.filter(inProject);
  const invIds = new Set(invoices.map((i) => i.id));

  return {
    ...out,
    // Boshqa xodimlarning ish haqi (ijrochi haqi) ko'rinmaydi
    projects: full.projects
      .filter((p) => pids.has(p.id))
      .map((p) => ({ ...p, services: p.services.map((x) => (x.assigneeFee === undefined || x.assigneeId === me.id ? x : { ...x, assigneeFee: undefined })) })),
    leads: crm ? full.leads : [],
    proposals: crm ? full.proposals : [],
    posts: full.posts.filter(inProject),
    shoots: full.shoots.filter(inProject),
    tasks: full.tasks.filter(inProject),
    quotas: full.quotas.filter(inProject),
    reports: full.reports.filter(inProject),
    targetReports: full.targetReports.filter(inProject),
    // Loyiha qarzi va «to'lov kelmagan» belgisi uchun — faqat o'z loyihalarining fakturalari va ularga to'lovlar
    invoices,
    transactions: full.transactions.filter((t) => t.userId === me.id || (t.invoiceId !== undefined && invIds.has(t.invoiceId))),
    accruals: full.accruals.filter((a) => a.userId === me.id),
    payProfiles: full.payProfiles.filter((p) => p.userId === me.id),
    accounts: full.accounts.map((a) => ({ ...a, opening: 0 })),
    bills: [],
    vendors: [],
    budget: [],
    activity: full.activity.filter((a) => a.userId === me.id),
    integrationLog: canView(me.role, "integrations") ? full.integrationLog : [],
  };
}
