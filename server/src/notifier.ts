// Telegram xabarlari serverdan yuboriladi (bot tokeni faqat serverda). Yetib bormagan xabar «failed» deb belgilanadi.
import type { Outgoing } from "../../src/lib/ctx";
import { nowHM, todayISO } from "../../src/lib/dates";
import { alertsFor } from "../../src/lib/rules";
import { sendTelegram, telegramText } from "../../src/lib/telegram";
import type { StateStore } from "./store";

export type SendFn = (token: string, chatId: string, text: string) => Promise<boolean>;

export interface Notifier {
  /** Amal natijasidagi bildirishnomalarni Telegram'ga yuboradi (javobni kutmaydi). */
  deliver(outbox: Outgoing[]): void;
  /** Bitta xodimga to'g'ridan-to'g'ri xabar (masalan, yangi qurilmadan kirish ogohlantirishi). */
  direct(userId: string, text: string): void;
  test(userId: string): Promise<boolean>;
  /** Bugungi eslatmalar — har bir xodimga o'zinikini. Qaytaradi: nechta xodimga. */
  digest(): number;
  /** Navbatdagi barcha yuborishlar tugashini kutish (testlar va to'xtash uchun). */
  idle(): Promise<void>;
}

export function createNotifier(store: StateStore, send: SendFn = sendTelegram): Notifier {
  let pending: Promise<unknown> = Promise.resolve();
  const track = (p: Promise<unknown>) => {
    pending = Promise.all([pending, p.catch(() => undefined)]);
  };
  const cfg = () => {
    const tg = store.current().state.settings.telegram;
    const token = tg.botToken.trim();
    return tg.enabled && token ? token : null;
  };
  const chatOf = (userId: string) => {
    const u = store.current().state.users.find((x) => x.id === userId);
    return u?.active && u.telegramChatId?.trim() ? { u, chat: u.telegramChatId.trim() } : null;
  };

  return {
    deliver(outbox) {
      const token = cfg();
      if (!token || !outbox.length) return;
      track(
        (async () => {
          const failed: string[] = [];
          for (const o of outbox) if (!(await send(token, o.chatId, o.text))) failed.push(o.notificationId);
          if (failed.length)
            await store.system((s) => {
              for (const n of s.notifications) if (failed.includes(n.id)) n.telegram = "failed";
            });
        })(),
      );
    },
    direct(userId, text) {
      const token = cfg();
      const to = chatOf(userId);
      if (token && to) track(send(token, to.chat, telegramText(to.u, text)));
    },
    async test(userId) {
      const token = cfg();
      const to = chatOf(userId);
      if (!token || !to) return false;
      return send(token, to.chat, telegramText(to.u, "✅ Telegram bildirishnomalari ishlayapti"));
    },
    digest() {
      const token = cfg();
      if (!token) return 0;
      const { state } = store.current();
      const today = todayISO();
      const now = nowHM();
      let sent = 0;
      for (const u of state.users) {
        const chat = u.telegramChatId?.trim();
        if (!u.active || !chat) continue;
        const alerts = alertsFor(state, u, today, now);
        if (!alerts.length) continue;
        const lines = alerts.slice(0, 12).map((a) => `${a.tone === "red" ? "🔴" : "🟡"} ${a.text}`);
        if (alerts.length > 12) lines.push(`… yana ${alerts.length - 12} ta`);
        track(send(token, chat, telegramText(u, `📋 Bugungi eslatmalar (${alerts.length}):\n${lines.join("\n")}`)));
        sent++;
      }
      return sent;
    },
    idle: () => pending.then(() => undefined),
  };
}
