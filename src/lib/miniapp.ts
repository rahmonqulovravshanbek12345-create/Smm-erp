// Telegram Mini App: telefondagi kundalik ishlar. Pul, xodimlar va tizim sozlamalari faqat saytda (parol + 2FA bilan).
// Bu ro'yxatlar serverda ham tekshiriladi: Mini App sessiyasi bilan ro'yxatda yo'q amalni so'rov yuborib ham bajarib bo'lmaydi.
import type { Module } from "./permissions";
import type { ActionName } from "./registry";

/** Mini App'da ochiladigan bo'limlar. */
export const MINI_MODULES: ReadonlySet<Module> = new Set<Module>([
  "myday",
  "dashboard",
  "notifications",
  "crm",
  "content",
  "approvals",
  "shoots",
  "montaj",
  "dizayn",
  "target",
]);

/** Mini App'da ochilmaydigan sahifalar (bo'limi ochiq bo'lsa ham): pul va hujjatlar. */
export const MINI_BLOCKED_PATHS: readonly string[] = ["/crm/analitika", "/takliflar", "/taklif/"];

export const miniPathAllowed = (path: string) => !MINI_BLOCKED_PATHS.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));

/** Mini App sessiyasi bilan bajariladigan amallar: vazifalar, kontent, tasdiq, lidlar, bildirishnomalar. */
export const MINI_ACTIONS: ReadonlySet<ActionName> = new Set<ActionName>([
  // Vazifalar va syomka
  "createTask",
  "updateTask",
  "cancelTask",
  "startTask",
  "submitTask",
  "acceptTask",
  "returnTask",
  "launchTarget",
  "createShoot",
  "handFootage",
  // Kontent va tasdiq
  "savePost",
  "sendToInternal",
  "approveInternal",
  "returnPost",
  "clientApproved",
  "publishPost",
  "handToTarget",
  "unpublishPlatform",
  "setPostStatus",
  // Lidlar
  "saveLead",
  "addContact",
  "moveLead",
  // Bildirishnomalar va e'lonlar
  "markAllRead",
  "markRead",
  "sendAnnouncement",
]);

/** Mini App sessiyasi umri: bir ish kuni. Keyin parol qayta so'raladi. */
export const MINI_SESSION_HOURS = 12;
