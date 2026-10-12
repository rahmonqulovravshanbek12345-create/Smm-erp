// Tizim amallari: xodimlar, sozlamalar, bildirishnomalar va integratsiya belgilari.
// Oldin sahifalarda to'g'ridan-to'g'ri holatni o'zgartirardi — endi nomli amal: server ham xuddi shuni bajaradi.
import { applyMetaSync, logIntegration } from "./actions";
import { newId, type Ctx } from "./ctx";
import type { MetaResult } from "./integrations";
import { ROLE_LABELS } from "./labels";
import type { Account, Requisites, Role, Vendor } from "./types";

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const findUser = (c: Ctx, id: string) => {
  const u = c.s.users.find((x) => x.id === id);
  if (!u) throw new Error("Xodim topilmadi");
  return u;
};

// ---------- Xodimlar ----------

export function addUser(c: Ctx, o: { name: string; role: Role }): string {
  const name = o.name.trim();
  if (!name) throw new Error("Xodim ismini kiriting");
  if (name.length > 80) throw new Error("Ism juda uzun");
  if (!ROLES.includes(o.role)) throw new Error("Rolni tanlang");
  const id = newId("u");
  c.s.users.push({ id, name, role: o.role, active: true, hiredAt: c.today });
  c.log(`Yangi xodim: ${name} (${ROLE_LABELS[o.role]})`, "/admin");
  return id;
}

export function setUserRole(c: Ctx, userId: string, role: Role) {
  const u = findUser(c, userId);
  if (!ROLES.includes(role)) throw new Error("Rolni tanlang");
  if (u.id === c.me.id) throw new Error("O'zingizning rolingizni o'zgartira olmaysiz");
  if (u.role === role) return;
  if (u.role === "rahbar" && c.s.users.filter((y) => y.role === "rahbar" && y.active).length <= 1)
    throw new Error("Oxirgi faol rahbarning rolini o'zgartirib bo'lmaydi");
  if (u.role === "admin" && c.s.users.filter((y) => y.role === "admin" && y.active).length <= 1)
    throw new Error("Oxirgi faol adminning rolini o'zgartirib bo'lmaydi");
  u.role = role;
  c.log(`${u.name}: rol → ${ROLE_LABELS[role]}`, "/admin");
}

export function setUserChatId(c: Ctx, userId: string, chatId: string) {
  const u = findUser(c, userId);
  const v = chatId.trim();
  if (v && !/^-?\d{3,20}$/.test(v)) throw new Error("Chat ID raqamlardan iborat bo'ladi (guruhda -100… bilan boshlanadi)");
  u.telegramChatId = v || undefined;
}

/** Demo: barcha xodimlarga bitta chat ID (hamma xabar bitta Telegram'ga). */
export function setChatIdForAll(c: Ctx, chatId: string) {
  const v = chatId.trim();
  if (!v) throw new Error("Chat ID kiriting");
  for (const u of c.s.users) u.telegramChatId = v;
  c.log("Barcha xodimlarga bitta Telegram chat ID qo'yildi (demo)", "/admin");
}

/** Demo: boshqa xodim sifatida ko'rish. */
export function switchUser(c: Ctx, userId: string) {
  findUser(c, userId);
  c.s.currentUserId = userId;
}

// ---------- Sozlamalar ----------

export function setTelegramEnabled(c: Ctx, on: boolean) {
  c.s.settings.telegram.enabled = on;
  c.log(`Telegram bildirishnomalari ${on ? "yoqildi" : "o'chirildi"}`, "/admin");
}

export function setTelegramToken(c: Ctx, token: string) {
  const v = token.trim();
  if (v && !/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(v)) throw new Error("Bot tokeni noto'g'ri ko'rinadi (masalan 123456:ABC-DEF…)");
  c.s.settings.telegram.botToken = v;
  c.log(v ? "Telegram bot tokeni saqlandi" : "Telegram bot tokeni o'chirildi", "/admin");
}

export function setCompanyName(c: Ctx, name: string) {
  const v = name.trim();
  if (!v) return;
  if (v.length > 120) throw new Error("Nom juda uzun");
  c.s.settings.companyName = v;
}

export function setRequisite(c: Ctx, key: keyof Requisites, value: string) {
  if (!(key in c.s.settings.requisites)) throw new Error("Noma'lum rekvizit");
  if (value.length > 300) throw new Error("Matn juda uzun");
  c.s.settings.requisites[key] = value.trim();
}

export function setPayday(c: Ctx, day: number) {
  c.s.settings.payday = Math.min(28, Math.max(1, Math.round(day) || 10));
}

export function setLatePenalty(c: Ctx, pct: number) {
  c.s.settings.latePenaltyPct = Math.min(100, Math.max(0, Number(pct) || 0));
}

export function setCbuAuto(c: Ctx, on: boolean) {
  c.s.settings.integrations.cbu.autoUpdate = on;
}

/** Hisob (kassa, bank, karta): yangi qo'shish yoki nomi va boshlang'ich qoldig'ini o'zgartirish. */
export function saveAccount(c: Ctx, a: Omit<Account, "id"> & { id?: string }): string {
  const name = a.name.trim();
  if (!name) throw new Error("Hisob nomini kiriting");
  if (!["cash", "bank", "card"].includes(a.kind)) throw new Error("Hisob turini tanlang");
  if (a.currency !== "UZS" && a.currency !== "USD") throw new Error("Valyutani tanlang");
  if (!Number.isFinite(a.opening) || Math.abs(a.opening) > 1e13) throw new Error("Boshlang'ich qoldiq noto'g'ri");
  if (a.id) {
    const ex = c.s.accounts.find((x) => x.id === a.id);
    if (!ex) throw new Error("Hisob topilmadi");
    if (ex.currency !== a.currency && c.s.transactions.some((t) => t.accountId === ex.id))
      throw new Error("Tranzaksiyasi bor hisobning valyutasini o'zgartirib bo'lmaydi");
    Object.assign(ex, { name, kind: a.kind, currency: a.currency, opening: a.opening });
    c.log(`Hisob yangilandi: ${name}`, "/moliya/kirim-chiqim");
    return ex.id;
  }
  const id = newId("acc");
  c.s.accounts.push({ id, name, kind: a.kind, currency: a.currency, opening: a.opening });
  c.log(`Yangi hisob: ${name}`, "/moliya/kirim-chiqim");
  return id;
}

/** Ta'minotchi (ijara beruvchi, servis va h.k.). */
export function saveVendor(c: Ctx, v: Omit<Vendor, "id"> & { id?: string }): string {
  const name = v.name.trim();
  if (!name) throw new Error("Ta'minotchi nomini kiriting");
  if (v.id) {
    const ex = c.s.vendors.find((x) => x.id === v.id);
    if (!ex) throw new Error("Ta'minotchi topilmadi");
    ex.name = name;
    ex.kind = v.kind.trim();
    return ex.id;
  }
  if (c.s.vendors.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Error(`«${name}» allaqachon bor`);
  const id = newId("ven");
  c.s.vendors.push({ id, name, kind: v.kind.trim() });
  c.log(`Yangi ta'minotchi: ${name}`, "/moliya/debitor");
  return id;
}

// ---------- Bildirishnomalar ----------

export function markAllRead(c: Ctx) {
  for (const n of c.s.notifications) if (n.userId === c.me.id) n.read = true;
}

export function markRead(c: Ctx, id: string) {
  const n = c.s.notifications.find((y) => y.id === id && y.userId === c.me.id);
  if (n) n.read = true;
}

// ---------- Integratsiyalar (demo brauzer o'zi so'raydi; serverda bu ishni jadval bajaradi) ----------

export function markIntegrationAttempt(c: Ctx, kind: "cbu" | "meta") {
  c.s.settings.integrations[kind].lastAttempt = c.today;
}

export function metaAutoSync(c: Ctx, results: MetaResult[]): number {
  c.s.settings.integrations.meta.lastAttempt = c.today;
  return applyMetaSync(c, results);
}

export { logIntegration };
