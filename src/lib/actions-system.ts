// Tizim amallari: xodimlar, sozlamalar, bildirishnomalar va integratsiya belgilari.
// Oldin sahifalarda to'g'ridan-to'g'ri holatni o'zgartirardi — endi nomli amal: server ham xuddi shuni bajaradi.
import { applyMetaSync, logIntegration } from "./actions";
import { newId, type Ctx } from "./ctx";
import { nowISO } from "./dates";
import type { MetaResult } from "./integrations";
import { ROLE_LABELS } from "./labels";
import { isMasked } from "./redact";
import { phoneKey, normalizePhone, type IntakeLead } from "./leads-intake";
import type { Account, Integrations, Lead, Requisites, Role, User, Vendor } from "./types";

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

/** Xodim ism-familiyasi (bitta maydon). Eski yozuvlar xodim ID'siga bog'langan, shuning uchun hisobotlar buzilmaydi. */
export function setUserName(c: Ctx, userId: string, name: string) {
  const u = findUser(c, userId);
  const v = name.replace(/\s+/g, " ").trim();
  if (!v) throw new Error("Ism-familiyani kiriting");
  if (v.length > 80) throw new Error("Ism juda uzun");
  if (v === u.name) return;
  c.log(`${u.name}: ism o'zgartirildi → ${v}`, "/admin");
  u.name = v;
}

/** Profil rasmi yuklangan/o'chirilganini belgilaydi (rasm baytlari bazada alohida; faqat server chaqiradi). */
export function setAvatarStamp(c: Ctx, userId: string, at?: string) {
  findUser(c, userId).avatarAt = at;
}

/** Chat ID o'zgarsa, eski botga ulanish holati endi to'g'ri emas — noma'lum bo'ladi. */
function putChatId(u: User, v: string | undefined) {
  if ((u.telegramChatId?.trim() || undefined) === v) return;
  u.telegramChatId = v;
  delete u.telegramStatus;
  delete u.telegramStatusAt;
}

export function setUserChatId(c: Ctx, userId: string, chatId: string) {
  const u = findUser(c, userId);
  const v = chatId.trim();
  if (v && !/^-?\d{3,20}$/.test(v)) throw new Error("Chat ID raqamlardan iborat bo'ladi (guruhda -100… bilan boshlanadi)");
  putChatId(u, v || undefined);
}

/** Demo: barcha xodimlarga bitta chat ID (hamma xabar bitta Telegram'ga). */
export function setChatIdForAll(c: Ctx, chatId: string) {
  const v = chatId.trim();
  if (!v) throw new Error("Chat ID kiriting");
  for (const u of c.s.users) putChatId(u, v);
  c.log("Barcha xodimlarga bitta Telegram chat ID qo'yildi (demo)", "/admin");
}

/** Bot ulanishi/chiqib ketishi haqida xabar oladiganlar. */
const TG_WATCHERS: Role[] = ["admin", "rahbar", "marketolog"];

/**
 * Telegram'dan bilingan holat: xodim botga ulandi yoki botni bloklab qo'ydi (faqat server chaqiradi).
 * `event` — Telegram'ning o'zi xabar berdi; `send` — xabar yuborish natijasi; `probe` — admin «tekshirish» tugmasi.
 * Tekshiruv natijasi va xabar yuborilgani sababli birinchi marta «ulangan» deb bilinishi — jim (yangilik emas).
 * Qaytaradi: nechta xodimning holati o'zgardi.
 */
export function setTelegramStatus(c: Ctx, chatId: string, status: "member" | "blocked", source: "event" | "send" | "probe"): number {
  const at = nowISO();
  const changed: User[] = [];
  const loud: User[] = [];
  for (const u of c.s.users) {
    if (u.telegramChatId?.trim() !== chatId || u.telegramStatus === status) continue;
    const before = u.telegramStatus;
    u.telegramStatus = status;
    u.telegramStatusAt = at;
    changed.push(u);
    const quiet = source === "probe" || (source === "send" && before === undefined && status === "member");
    if (u.active && !quiet) loud.push(u);
  }
  if (loud.length) {
    const names = loud.map((u) => `${u.name} (${ROLE_LABELS[u.role]})`).join(", ");
    const text =
      status === "member"
        ? `✅ ${names}: Telegram botga ulandi — endi xabarlar boradi`
        : `📵 ${names}: Telegram botni to'xtatdi (blokladi) — unga xabar bormaydi`;
    const to = c.s.users.filter((u) => u.active && TG_WATCHERS.includes(u.role) && !loud.includes(u)).map((u) => u.id);
    c.notify(to, text, "/admin", { self: true });
  }
  return changed.length;
}

/** Ulanishni kuzatish (Telegram webhook) yoqildi/o'chirildi yoki xato bilan tugadi (faqat server chaqiradi). */
export function markTelegramTracking(c: Ctx, on: boolean, error?: string) {
  c.s.settings.telegram.tracking = { on, at: nowISO(), ...(error ? { error: error.slice(0, 300) } : {}) };
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
  // Brauzer saqlangan tokenni faqat «••••» belgisi sifatida ko'radi — u qaytib kelsa, token o'zgarmaydi
  if (isMasked(token)) return;
  const v = token.trim();
  if (v && !/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(v)) throw new Error("Bot tokeni noto'g'ri ko'rinadi (masalan 123456:ABC-DEF…)");
  // Boshqa bot: eski botdagi ulanish holatlari va kuzatuv endi tegishli emas
  if (v !== c.s.settings.telegram.botToken) {
    delete c.s.settings.telegram.tracking;
    for (const u of c.s.users) {
      delete u.telegramStatus;
      delete u.telegramStatusAt;
    }
  }
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

// ---------- Facebook Lead Ads: targetdan tushgan lidlar CRM'ga ----------

type LeadsCfg = Integrations["leads"];

/** Sozlamalar (faqat admin). Saqlangan maxfiy qiymat brauzerga «••••» bo'lib boradi — u qaytib kelsa, o'zgarmaydi. */
export function saveLeadAdsSettings(c: Ctx, patch: Partial<Pick<LeadsCfg, "enabled" | "pageId" | "pageToken" | "appSecret" | "verifyToken" | "assignTo">>) {
  const cfg = c.s.settings.integrations.leads;
  const next = { ...patch };
  for (const k of ["pageToken", "appSecret"] as const) {
    if (next[k] !== undefined && isMasked(next[k])) delete next[k];
    else if (next[k] !== undefined) next[k] = next[k]!.trim();
  }
  if (next.pageId !== undefined) {
    next.pageId = next.pageId.trim();
    if (next.pageId && !/^\d{5,25}$/.test(next.pageId)) throw new Error("Facebook sahifa ID'si raqamlardan iborat bo'ladi");
  }
  if (next.verifyToken !== undefined) {
    next.verifyToken = next.verifyToken.trim();
    if (next.verifyToken && !/^[A-Za-z0-9_-]{16,100}$/.test(next.verifyToken))
      throw new Error("Tasdiqlash so'zi kamida 16 ta harf/raqamdan iborat bo'lsin (probel va maxsus belgilarsiz)");
  }
  if (next.assignTo !== undefined && next.assignTo !== "rotate") {
    const u = c.s.users.find((x) => x.id === next.assignTo);
    if (!u?.active) throw new Error("Lidlar beriladigan xodim topilmadi");
  }
  const result = { ...cfg, ...next };
  if (result.enabled && !(result.appSecret && result.pageToken && result.pageId && result.verifyToken))
    throw new Error("Yoqish uchun sahifa ID, sahifa tokeni, App Secret va tasdiqlash so'zi kerak");
  Object.assign(cfg, next);
  c.log(`Facebook Lead Ads sozlamalari saqlandi${cfg.enabled ? " (yoqilgan)" : ""}`, "/integratsiyalar");
}

/** Navbatdagi operator (yoki sozlamadagi xodim); operator bo'lmasa — admin/rahbar. */
function leadOwner(c: Ctx): string {
  const cfg = c.s.settings.integrations.leads;
  const fixed = cfg.assignTo !== "rotate" ? c.s.users.find((u) => u.id === cfg.assignTo && u.active) : undefined;
  if (fixed) return fixed.id;
  const ops = c.s.users.filter((u) => u.active && u.role === "operator");
  if (ops.length) {
    const pick = ops[cfg.rotateIdx % ops.length]!;
    cfg.rotateIdx = (cfg.rotateIdx + 1) % 1_000_000;
    return pick.id;
  }
  return (c.s.users.find((u) => u.active && u.role === "rahbar") ?? c.s.users.find((u) => u.active && u.role === "admin") ?? c.me).id;
}

/** Tashqi (Facebook) lid: yangi lid yaratadi, takroriy bo'lsa — yaratmaydi. Qaytaradi: nima bo'ldi. */
export function intakeLead(c: Ctx, input: IntakeLead): "created" | "duplicate" | "repeat" {
  const cfg = c.s.settings.integrations.leads;
  if (c.s.leads.some((l) => l.externalId === input.externalId)) return "duplicate";
  const phone = normalizePhone(input.phone) || "";
  const now = nowISO();
  cfg.lastLeadAt = now;
  cfg.received += 1;
  // Shu telefondan oxirgi 30 kunda lid bor — yangisi ochilmaydi, mavjudiga yozuv qo'shiladi
  const key = phoneKey(phone);
  const cutoff = new Date(Date.parse(now) - 30 * 86_400_000).toISOString();
  const same = key.length === 9 ? c.s.leads.find((l) => phoneKey(l.phone) === key && l.createdAt >= cutoff) : undefined;
  if (same) {
    same.history.unshift({
      id: newId("c"),
      at: now,
      userId: "system",
      text: `Facebook Lead Ads: shu raqamdan yana ariza keldi${input.service ? ` (${input.service})` : ""}`,
    });
    c.notify([same.operatorId], `${same.name}: Facebook'dan yana ariza qoldirdi — qayta bog'laning`, "/crm");
    return "repeat";
  }
  const lead: Lead = {
    id: newId("lead"),
    name: input.name || "Facebook lid",
    phone,
    source: "Meta Ads",
    service: input.service,
    note: input.note,
    operatorId: leadOwner(c),
    stage: "new",
    maxStep: 0,
    history: [],
    externalId: input.externalId,
    createdAt: input.createdAt && !Number.isNaN(Date.parse(input.createdAt)) ? new Date(input.createdAt).toISOString() : now,
  };
  c.s.leads.unshift(lead);
  c.notify([lead.operatorId], `Yangi lid (Facebook): ${lead.name}${phone ? ` (${phone})` : ""}`, "/crm");
  c.log(`Facebook Lead Ads: yangi lid — ${lead.name}`, "/crm");
  return "created";
}

/** Zaxira tekshiruvi tugadi (xato bo'lsa — matni). */
export function markLeadsPoll(c: Ctx, error?: string) {
  const cfg = c.s.settings.integrations.leads;
  cfg.lastPollAt = nowISO();
  cfg.lastError = error ? error.slice(0, 300) : undefined;
}
