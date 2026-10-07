// Telegram Bot API orqali xabar yuborish. Telegram bitta chatga sekundiga ~1 xabardan ko'pini
// cheklaydi (guruhga — daqiqasiga 20), shuning uchun xabarlar navbat bilan, oraliq bilan ketadi.
import { ROLE_LABELS } from "./labels";
import type { User } from "./types";

const GAP_MS = 1100;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
let queue: Promise<unknown> = Promise.resolve();

async function post(token: string, chatId: string, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (res.status !== 429) return res.ok;
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
  return `🔔 SMM ERP\n👤 ${to.name} · ${ROLE_LABELS[to.role]}\n\n${text}`;
}
