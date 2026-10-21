// Telegram Bot API orqali xabar yuborish. Telegram bitta chatga sekundiga ~1 xabardan ko'pini
// cheklaydi (guruhga — daqiqasiga 20), shuning uchun xabarlar navbat bilan, oraliq bilan ketadi.
import { BRAND } from "./brand";
import { ROLE_LABELS } from "./labels";
import { timeoutSignal } from "./net";
import type { User } from "./types";

const GAP_MS = 1100;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let queue: Promise<unknown> = Promise.resolve();

// ---------- Xodim botga ulanganmi: yuborish natijasidan bilib olish ----------

export type Delivery = "ok" | "blocked";
let observer: ((chatId: string, d: Delivery) => void) | null = null;

/** Har bir yuborish natijasini kuzatish (server: xodim botni bloklaganini bilib olish uchun). */
export function observeDelivery(fn: ((chatId: string, d: Delivery) => void) | null) {
  observer = fn;
}

/** Telegram «bot bloklangan / akkaunt o'chirilgan / guruhdan chiqarilgan» deb javob berdimi. */
const BLOCKED_RE = /blocked|deactivated|kicked/i;
const isBlocked = async (res: Response) =>
  res.status === 403 && BLOCKED_RE.test(((await res.json().catch(() => null)) as { description?: string } | null)?.description ?? "");

async function observe(chatId: string, res: Response) {
  if (!observer) return;
  try {
    if (res.ok) observer(chatId, "ok");
    else if (await isBlocked(res)) observer(chatId, "blocked");
  } catch {
    // kuzatuv xabar yuborishga xalaqit bermaydi
  }
}

async function post(token: string, chatId: string, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: timeoutSignal(20_000),
      });
      if (res.status !== 429) {
        await observe(chatId, res);
        return res.ok;
      }
      // Juda tez yuborildi — Telegram aytgan vaqtcha kutib, qayta urinamiz.
      const body = (await res.json().catch(() => null)) as { parameters?: { retry_after?: number } } | null;
      await wait(((body?.parameters?.retry_after ?? 3) + 0.5) * 1000);
    } catch {
      return false;
    }
  }
  return false;
}

export function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  const job = queue.then(() => post(token, chatId, text));
  queue = job.then(() => wait(GAP_MS));
  return job;
}

/** Xabar matni: kimga ekanligi yoziladi — bir nechta xodim bitta chatni ulaganda ham tushunarli. */
export function telegramText(to: User, text: string): string {
  return `🔔 ${BRAND}\n👤 ${to.name} · ${ROLE_LABELS[to.role]}\n\n${text}`;
}

async function postDocument(token: string, chatId: string, filename: string, bytes: Uint8Array, caption: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      form.set("chat_id", chatId);
      form.set("caption", caption.slice(0, 1000));
      form.set("document", new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" }), filename);
      const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form, signal: timeoutSignal(120_000) });
      if (res.status !== 429) {
        await observe(chatId, res);
        return res.ok;
      }
      const body = (await res.json().catch(() => null)) as { parameters?: { retry_after?: number } } | null;
      await wait(((body?.parameters?.retry_after ?? 3) + 0.5) * 1000);
    } catch {
      return false;
    }
  }
  return false;
}

/** Faylni (masalan, Excel) hujjat sifatida yuboradi. Telegram botlari uchun chegara — 50 MB. */
export function sendTelegramDocument(token: string, chatId: string, filename: string, bytes: Uint8Array, caption: string): Promise<boolean> {
  const job = queue.then(() => postDocument(token, chatId, filename, bytes, caption));
  queue = job.then(() => wait(GAP_MS));
  return job;
}

// ---------- Ulanishni tekshirish va kuzatish ----------

export type Probe = "member" | "blocked" | "unknown";

/** Bot shu chatga yoza oladimi: xabar yubormasdan, bir lahza «yozmoqda…» belgisi bilan tekshiradi. */
export function probeChat(token: string, chatId: string): Promise<Probe> {
  const job = queue.then(async (): Promise<Probe> => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
        signal: timeoutSignal(20_000),
      });
      if (res.ok) return "member";
      return (await isBlocked(res)) ? "blocked" : "unknown";
    } catch {
      return "unknown";
    }
  });
  queue = job.then(() => wait(GAP_MS));
  return job;
}

export type TgResult = { ok: true } | { ok: false; error: string };

async function botCall(token: string, method: string, body: Record<string, unknown>): Promise<TgResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timeoutSignal(20_000),
    });
    const r = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    return res.ok && r?.ok ? { ok: true } : { ok: false, error: String(r?.description ?? res.status).slice(0, 200) };
  } catch {
    // Xato matnida manzil (va u bilan token) bo'lmasligi uchun umumiy xabar
    return { ok: false, error: "Telegram bilan aloqa o'rnatilmadi" };
  }
}

/** Telegram xodim botga ulanishi/chiqib ketishini shu manzilga yuboradigan qiladi (maxfiy so'z bilan). */
export const setTelegramWebhook = (token: string, url: string, secret: string) =>
  botCall(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "my_chat_member"], max_connections: 5 });

export const deleteTelegramWebhook = (token: string) => botCall(token, "deleteWebhook", {});

/**
 * Telegram'dan kelgan yangilanish: shaxsiy chatda xodim botni ishga tushirdi (/start yoki blokdan chiqardi)
 * yoki botni bloklab qo'ydi. Boshqa hamma narsa — null.
 */
export function parseTelegramUpdate(body: unknown): { chatId: string; status: "member" | "blocked" } | null {
  type Chat = { id?: unknown; type?: unknown };
  const u = body as { my_chat_member?: { chat?: Chat; new_chat_member?: { status?: unknown } }; message?: { chat?: Chat; text?: unknown } } | null;
  const idOf = (c?: Chat) => (c?.type === "private" && typeof c.id === "number" && Number.isSafeInteger(c.id) ? String(c.id) : null);
  const m = u?.my_chat_member;
  const mId = idOf(m?.chat);
  if (mId) {
    const st = m?.new_chat_member?.status;
    if (st === "member") return { chatId: mId, status: "member" };
    if (st === "kicked" || st === "left") return { chatId: mId, status: "blocked" };
  }
  const msgId = idOf(u?.message?.chat);
  if (msgId && typeof u?.message?.text === "string" && /^\/start(?:\s|@|$)/.test(u.message.text)) return { chatId: msgId, status: "member" };
  return null;
}
