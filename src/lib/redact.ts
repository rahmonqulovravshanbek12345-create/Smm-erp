// Har bir xodimga faqat unga ruxsat etilgan ma'lumot yuboriladi (server tomonda). Masalan, montajyorning
// brauzeriga boshqalarning oyligi, kompaniya kassasi yoki boshqa loyihalar umuman kelmaydi.
// Maxfiy kalitlar (Telegram, Meta tokenlari) hech kimga yuborilmaydi — o'rniga «saqlangan» belgisi.
import { todayISO } from "./dates";
import { projectDebt } from "./finance";
import { canView, seesEverything, visibleProjects } from "./permissions";
import type { ErpState, Project, ProjectService, User } from "./types";

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

/**
 * Xodim uchun holat nusxasi. Asl holat o'zgarmaydi (yangi massiv va obyektlar).
 * `noFinance` — Telegram Mini App: rahbar va moliyachiga ham kompaniya pullari, narxlar va takliflar yuborilmaydi.
 */
export function redactFor(full: ErpState, me: User, today: string = todayISO(), o: { noFinance?: boolean } = {}): ErpState {
  const base = withoutSecrets(full);
  const admin = me.role === "admin";
  const out: ErpState = {
    ...base,
    currentUserId: me.id,
    // Chat ID va botga ulanish holati faqat admin (va xodimning o'zi) uchun; boshqalarga faqat «ulangan» belgisi
    users: base.users.map((u) => {
      if (admin || u.id === me.id) return u;
      const v = { ...u };
      delete v.telegramStatus;
      delete v.telegramStatusAt;
      return v.telegramChatId ? { ...v, telegramChatId: "•" } : v;
    }),
    notifications: base.notifications.filter((n) => n.userId === me.id),
  };
  if (seesEverything(me) && !o.noFinance) return out;

  const projects = seesEverything(me) ? full.projects : visibleProjects(full, me);
  const pids = new Set(projects.map((p) => p.id));
  const crm = canView(me.role, "crm");
  // Operator — o'z lidlaridan tuzilgan loyihalar (loyiha ham aynan shu liddan yaratilgan bo'lishi shart)
  if (crm)
    for (const l of full.leads)
      if (l.projectId && l.operatorId === me.id && full.projects.some((p) => p.id === l.projectId && p.leadId === l.id)) pids.add(l.projectId);
  const inProject = <T extends { projectId: string }>(x: T) => pids.has(x.projectId);
  // Narxlar, fakturalar va mijoz to'lovlari — faqat moliyaviy rollarga; xodimga ish uchun kerakli «to'lov kechikkan» belgisi (summasiz) qoladi
  const noMoney = (p: Project): Project => {
    const debt = projectDebt(full, p.id, today);
    const out: Project = {
      ...p,
      monthlyFee: 0,
      ...(debt.amount > 0 ? { overdueDays: debt.days } : {}),
      services: p.services.map((x) => {
        const svc: ProjectService = { ...x, price: 0 };
        delete svc.priceUsd;
        delete svc.prepayAmount;
        delete svc.prepayPct;
        delete svc.adPct;
        if (x.assigneeId !== me.id) delete svc.assigneeFee;
        return svc;
      }),
    };
    delete out.prepayAmount;
    return out;
  };

  return {
    ...out,
    projects: full.projects.filter((p) => pids.has(p.id)).map(noMoney),
    leads: crm ? full.leads : [],
    proposals: crm && !o.noFinance ? full.proposals : [],
    posts: full.posts.filter(inProject),
    shoots: full.shoots.filter(inProject),
    tasks: full.tasks.filter(inProject),
    quotas: full.quotas.filter(inProject),
    reports: full.reports.filter(inProject),
    targetReports: full.targetReports.filter(inProject),
    invoices: [],
    // Faqat o'z ish haqi to'lovlari
    transactions: full.transactions.filter((t) => t.userId === me.id),
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
