// Kim qaysi amalni bajara oladi — serverda har bir so'rovda tekshiriladi (sahifadagi tugmalar bilan bir xil qoidalar).
// Brauzerdagi cheklov qulaylik uchun; haqiqiy himoya — shu yer: tugmasi yo'q amalni so'rov yuborib ham bajarib bo'lmaydi.
import { access, canEdit, canEditFinance, canPayUser, canReassignLead } from "./permissions";
import { DEMO_ONLY, type ActionArgs, type ActionName } from "./registry";
import type { ErpState, Project, Role, User } from "./types";

type Rule<N extends ActionName> = (me: User, s: ErpState, args: ActionArgs<N>) => boolean;

const is =
  (...roles: Role[]) =>
  (me: User) =>
    roles.includes(me.role);
const boss = is("admin", "rahbar");
const fin = (me: User) => canEditFinance(me.role);
const crm = (me: User) => canEdit(me.role, "crm");
const manage = is("admin", "rahbar", "marketolog");
const integrations = (me: User) => canEdit(me.role, "integrations");
const adminOnly = is("admin");

const project = (s: ErpState, id: unknown): Project | undefined => s.projects.find((p) => p.id === id);
const postProject = (s: ErpState, postId: unknown) => project(s, s.posts.find((p) => p.id === postId)?.projectId);
const taskOf = (s: ErpState, id: unknown) => s.tasks.find((t) => t.id === id);

/** Kontent: SMM faqat o'z loyihalarida; rahbar va admin — hammasida. */
const contentOn = (me: User, p: Project | undefined) => Boolean(p) && canEdit(me.role, "content") && (me.role !== "smm" || p!.smmId === me.id);
/** Ichki tasdiq: marketolog, SMM (o'z loyihasi), rahbar, admin. */
const approveOn = (me: User, p: Project | undefined) => {
  const a = access(me.role, "content");
  return Boolean(p) && (a === "approve" || a === "full") && (me.role !== "smm" || p!.smmId === me.id);
};
/** Syomka, montaj, dizayn, target topshiriqlari: SMM o'z loyihasida, rahbar, admin. */
const productionOn = (me: User, p: Project | undefined) => Boolean(p) && (boss(me) || (me.role === "smm" && p!.smmId === me.id));
const reviewer = (me: User, s: ErpState, taskId: unknown) => {
  const t = taskOf(s, taskId);
  if (!t) return false;
  return is("admin", "rahbar", "marketolog")(me) || (me.role === "smm" && project(s, t.projectId)?.smmId === me.id);
};
const assignee = (me: User, s: ErpState, taskId: unknown) => {
  const t = taskOf(s, taskId);
  return Boolean(t) && (t!.assigneeId === me.id || me.role === "admin");
};
const serviceWorker = (me: User, s: ErpState, projectId: unknown, serviceId: unknown) =>
  manage(me) || Boolean(project(s, projectId)?.services.find((x) => x.id === serviceId && x.assigneeId === me.id));
const targetologOn = (me: User, p: Project | undefined) => Boolean(p) && (me.role === "admin" || (me.role === "targetolog" && p!.targetologId === me.id));

const RULES: { [N in ActionName]: Rule<N> } = {
  // CRM
  // Mavjud lidning mas'ul operatorini faqat rahbariyat almashtiradi
  saveLead: (me, s, [d]) => crm(me) && (!d.id || canReassignLead(me.role) || s.leads.find((l) => l.id === d.id)?.operatorId === d.operatorId),
  addContact: crm,
  moveLead: crm,
  createProposal: crm,
  setProposalStatus: crm,
  saveTariff: manage,
  // Loyihalar
  createProject: (me) => crm(me) || canEdit(me.role, "projects"),
  updateProject: (me) => canEdit(me.role, "projects") || fin(me),
  closeProject: (me) => canEdit(me.role, "projects") || fin(me),
  handOff: (me) => canEdit(me.role, "marketing"),
  saveDoc: (me) => canEdit(me.role, "marketing"),
  submitReport: (me, s, [d]) => me.role === "admin" || (me.role === "smm" && project(s, d.projectId)?.smmId === me.id),
  addService: manage,
  updateService: manage,
  cancelService: manage,
  advanceServiceStage: (me, s, [pid, sid]) => serviceWorker(me, s, pid, sid),
  revertServiceStage: (me, s, [pid, sid]) => serviceWorker(me, s, pid, sid),
  saveQuota: manage,
  saveContentType: manage,
  // Kontent
  savePost: (me, s, [d]) => contentOn(me, project(s, d.projectId)) && (!d.id || contentOn(me, postProject(s, d.id))),
  deletePost: (me, s, [id]) => contentOn(me, postProject(s, id)),
  sendToInternal: (me, s, [id]) => contentOn(me, postProject(s, id)),
  clientApproved: (me, s, [id]) => contentOn(me, postProject(s, id)),
  handToTarget: (me, s, [id]) => contentOn(me, postProject(s, id)),
  publishPost: (me, s, [id]) => contentOn(me, postProject(s, id)),
  unpublishPlatform: (me, s, [id]) => contentOn(me, postProject(s, id)),
  setPostStatus: (me, s, [id]) => contentOn(me, postProject(s, id)) || approveOn(me, postProject(s, id)),
  approveInternal: (me, s, [id]) => approveOn(me, postProject(s, id)),
  returnPost: (me, s, [id]) => approveOn(me, postProject(s, id)),
  createShoot: (me, s, [d]) => productionOn(me, project(s, d.projectId)),
  handFootage: (me, s, [id]) => {
    const sh = s.shoots.find((x) => x.id === id);
    return Boolean(sh) && (sh!.operatorId === me.id || boss(me));
  },
  // Vazifalar
  createTask: (me, s, [d]) => productionOn(me, project(s, d.projectId)),
  startTask: (me, s, [id]) => assignee(me, s, id),
  submitTask: (me, s, [id]) => assignee(me, s, id),
  acceptTask: (me, s, [id]) => reviewer(me, s, id),
  returnTask: (me, s, [id]) => reviewer(me, s, id),
  launchTarget: (me, s, [id]) => {
    const t = taskOf(s, id);
    return Boolean(t) && (me.role === "admin" || (me.role === "targetolog" && t!.assigneeId === me.id));
  },
  saveTargetReport: (me, s, [d]) => targetologOn(me, project(s, d.projectId)),
  // Moliya
  voidInvoice: fin,
  setInvoiceDue: fin,
  recordClientPayment: fin,
  createExtraInvoice: fin,
  addTransaction: (me, _s, [d]) => fin(me) && canPayUser(me, d.userId),
  addTransfer: fin,
  deleteTransaction: (me, s, [id]) => fin(me) && canPayUser(me, s.transactions.find((t) => t.id === id)?.userId),
  addBill: fin,
  payBill: fin,
  payEmployee: (me, _s, [d]) => fin(me) && canPayUser(me, d.userId),
  addManualAccrual: (me, _s, [d]) => fin(me) && canPayUser(me, d.userId),
  approveAccruals: (me, s, [ids]) => fin(me) && s.accruals.every((a) => !ids.includes(a.id) || canPayUser(me, a.userId)),
  deleteAccrual: (me, s, [id]) => fin(me) && canPayUser(me, s.accruals.find((a) => a.id === id)?.userId),
  savePayProfile: (me, _s, [d]) => fin(me) && canPayUser(me, d.userId),
  setBudget: fin,
  saveAccount: fin,
  saveVendor: fin,
  // Integratsiyalar
  setUsdRate: integrations,
  setUsdMarkup: integrations,
  saveMetaSettings: integrations,
  // Reklama kabinetini shu loyihaning targetologi o'zi bog'laydi (token va sozlamalar — faqat admin/rahbar)
  setMetaAccount: (me, s, [projectId]) => integrations(me) || (me.role === "targetolog" && s.projects.find((p) => p.id === projectId)?.targetologId === me.id),
  setCbuAuto: integrations,
  // Serverli tizimda bularni server o'zi bajaradi
  logIntegration: () => false,
  applyMetaSync: () => false,
  metaAutoSync: () => false,
  markIntegrationAttempt: () => false,
  // Facebook Lead Ads: sozlash — faqat admin; lidlarni qabul qilishni server o'zi bajaradi
  saveLeadAdsSettings: adminOnly,
  intakeLead: () => false,
  markLeadsPoll: () => false,
  setAvatarStamp: () => false,
  switchUser: () => false,
  setChatIdForAll: () => false,
  // Xodimlar va tizim sozlamalari — faqat admin
  addUser: adminOnly,
  setUserRole: adminOnly,
  setUserName: adminOnly,
  setUserChatId: adminOnly,
  archiveUser: adminOnly,
  restoreUser: adminOnly,
  setTelegramEnabled: adminOnly,
  setTelegramToken: adminOnly,
  setCompanyName: adminOnly,
  setRequisite: adminOnly,
  setPayday: adminOnly,
  setLatePenalty: adminOnly,
  // Har kim o'z bildirishnomalarini
  markAllRead: () => true,
  markRead: () => true,
};

/** Serverli tizimda amalga ruxsat: yo'q bo'lsa — sababi, bor bo'lsa — null. */
export function denyReason<N extends ActionName>(name: N, me: User, s: ErpState, args: ActionArgs<N>): string | null {
  if (!me.active) return "Akkaunt arxivlangan";
  if (DEMO_ONLY.has(name)) return "Bu amal serverli tizimda avtomatik bajariladi";
  const rule = RULES[name] as Rule<N> | undefined;
  if (!rule) return "Noma'lum amal";
  return rule(me, s, args) ? null : "Bu amal uchun ruxsatingiz yo'q";
}
