// Barcha nomli amallar. Sahifalar amalni nomi va argumentlari bilan chaqiradi: demo'da brauzer o'zi bajaradi,
// serverli tizimda esa server (huquq va argumentlarni tekshirib) bajaradi va hamma uchun saqlaydi.
import * as act from "./actions";
import * as sys from "./actions-system";
import type { Ctx } from "./ctx";

export const ACTIONS = {
  // CRM
  saveLead: act.saveLead,
  addContact: act.addContact,
  moveLead: act.moveLead,
  createProposal: act.createProposal,
  setProposalStatus: act.setProposalStatus,
  saveTariff: act.saveTariff,
  // Loyihalar va xizmatlar
  createProject: act.createProject,
  updateProject: act.updateProject,
  closeProject: act.closeProject,
  handOff: act.handOff,
  saveDoc: act.saveDoc,
  submitReport: act.submitReport,
  addService: act.addService,
  updateService: act.updateService,
  cancelService: act.cancelService,
  advanceServiceStage: act.advanceServiceStage,
  revertServiceStage: act.revertServiceStage,
  saveQuota: act.saveQuota,
  saveContentType: act.saveContentType,
  // Kontent
  savePost: act.savePost,
  deletePost: act.deletePost,
  sendToInternal: act.sendToInternal,
  approveInternal: act.approveInternal,
  returnPost: act.returnPost,
  clientApproved: act.clientApproved,
  publishPost: act.publishPost,
  handToTarget: act.handToTarget,
  unpublishPlatform: act.unpublishPlatform,
  setPostStatus: act.setPostStatus,
  createShoot: act.createShoot,
  handFootage: act.handFootage,
  // Vazifalar va target
  createTask: act.createTask,
  startTask: act.startTask,
  submitTask: act.submitTask,
  acceptTask: act.acceptTask,
  returnTask: act.returnTask,
  updateTask: act.updateTask,
  cancelTask: act.cancelTask,
  launchTarget: act.launchTarget,
  saveTargetReport: act.saveTargetReport,
  // Moliya
  voidInvoice: act.voidInvoice,
  setInvoiceDue: act.setInvoiceDue,
  recordClientPayment: act.recordClientPayment,
  createExtraInvoice: act.createExtraInvoice,
  addTransaction: act.addTransaction,
  addTransfer: act.addTransfer,
  deleteTransaction: act.deleteTransaction,
  addBill: act.addBill,
  payBill: act.payBill,
  payEmployee: act.payEmployee,
  addManualAccrual: act.addManualAccrual,
  approveAccruals: act.approveAccruals,
  deleteAccrual: act.deleteAccrual,
  savePayProfile: act.savePayProfile,
  setBudget: act.setBudget,
  saveAccount: sys.saveAccount,
  saveVendor: sys.saveVendor,
  // Integratsiyalar
  setUsdRate: act.setUsdRate,
  setUsdMarkup: act.setUsdMarkup,
  saveMetaSettings: act.saveMetaSettings,
  setMetaAccount: act.setMetaAccount,
  setProjectTeam: act.setProjectTeam,
  setCbuAuto: sys.setCbuAuto,
  logIntegration: sys.logIntegration,
  applyMetaSync: act.applyMetaSync,
  metaAutoSync: sys.metaAutoSync,
  markIntegrationAttempt: sys.markIntegrationAttempt,
  saveLeadAdsSettings: sys.saveLeadAdsSettings,
  intakeLead: sys.intakeLead,
  markLeadsPoll: sys.markLeadsPoll,
  setUserName: sys.setUserName,
  setAvatarStamp: sys.setAvatarStamp,
  setTelegramStatus: sys.setTelegramStatus,
  markTelegramTracking: sys.markTelegramTracking,
  markTelegramMiniApp: sys.markTelegramMiniApp,
  // Xodimlar va sozlamalar
  addUser: sys.addUser,
  setUserRole: sys.setUserRole,
  setUserChatId: sys.setUserChatId,
  setChatIdForAll: sys.setChatIdForAll,
  archiveUser: act.archiveUser,
  restoreUser: act.restoreUser,
  switchUser: sys.switchUser,
  setTelegramEnabled: sys.setTelegramEnabled,
  setTelegramToken: sys.setTelegramToken,
  setCompanyName: sys.setCompanyName,
  setRequisite: sys.setRequisite,
  setPayday: sys.setPayday,
  setLatePenalty: sys.setLatePenalty,
  // Bildirishnomalar
  markAllRead: sys.markAllRead,
  markRead: sys.markRead,
} satisfies Record<string, (c: Ctx, ...args: never[]) => unknown>;

export type ActionName = keyof typeof ACTIONS;
type Fn<N extends ActionName> = (typeof ACTIONS)[N];
export type ActionArgs<N extends ActionName> = Fn<N> extends (c: Ctx, ...args: infer A) => unknown ? A : never;
export type ActionResult<N extends ActionName> = ReturnType<Fn<N>>;

/** Amalni bajaradi (argumentlar oldindan tekshirilgan bo'lishi kerak). */
export function apply<N extends ActionName>(c: Ctx, name: N, args: ActionArgs<N>): ActionResult<N> {
  const fn = ACTIONS[name] as unknown as (c: Ctx, ...a: unknown[]) => ActionResult<N>;
  return fn(c, ...(args as unknown[]));
}

/** Faqat demo (brauzerdagi) rejimda ishlaydigan amallar — serverli tizimda ularni server o'zi bajaradi yoki ular kerak emas. */
export const DEMO_ONLY: ReadonlySet<ActionName> = new Set<ActionName>([
  "switchUser",
  "setChatIdForAll",
  "logIntegration",
  "applyMetaSync",
  "metaAutoSync",
  "markIntegrationAttempt",
  "intakeLead",
  "markLeadsPoll",
  "setAvatarStamp",
]);
