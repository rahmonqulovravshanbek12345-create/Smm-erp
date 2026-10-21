// Telegram xabarlari serverdan yuboriladi (bot tokeni faqat serverda). Yetib bormagan xabar «failed» deb belgilanadi.
import type { Outgoing } from "../../src/lib/ctx";
import { nowHM, todayISO } from "../../src/lib/dates";
import { alertsFor } from "../../src/lib/rules";
import { fullExportSheets, TELEGRAM_FILE_LIMIT } from "../../src/lib/full-export";
import {
  deleteTelegramWebhook,
  probeChat,
  sendTelegram,
  sendTelegramDocument,
  setTelegramWebhook,
  telegramText,
  type Probe,
  type TgResult,
} from "../../src/lib/telegram";
import { buildXlsx } from "../../src/lib/xlsx";
import type { StateStore } from "./store";

export type SendFn = (token: string, chatId: string, text: string) => Promise<boolean>;

export type SendDocFn = (token: string, chatId: string, filename: string, bytes: Uint8Array, caption: string) => Promise<boolean>;

/** Telegram'ning xabar yuborishdan boshqa chaqiruvlari (testlarda soxtasi beriladi). */
export interface TelegramControl {
  probe(token: string, chatId: string): Promise<Probe>;
  setWebhook(token: string, url: string, secret: string): Promise<TgResult>;
  deleteWebhook(token: string): Promise<TgResult>;
}

const realControl: TelegramControl = { probe: probeChat, setWebhook: setTelegramWebhook, deleteWebhook: deleteTelegramWebhook };

export interface Notifier {
  /** Amal natijasidagi bildirishnomalarni Telegram'ga yuboradi (javobni kutmaydi). */
  deliver(outbox: Outgoing[]): void;
  /** Bitta xodimga to'g'ridan-to'g'ri xabar (masalan, yangi qurilmadan kirish ogohlantirishi). */
  direct(userId: string, text: string): void;
  test(userId: string): Promise<boolean>;
  /** Bugungi eslatmalar — har bir xodimga o'zinikini. Qaytaradi: nechta xodimga. */
  digest(): number;
  /** Butun ma'lumot Excel faylda — faqat faol adminlarga (Telegram chat ID kiritilgan bo'lsa). Qaytaradi: nechta adminga yuborildi. */
  dailyExcel(): Promise<{ admins: number; sent: number; bytes: number }>;
  /** Xodim botga ulandi yoki botni blokladi: holat o'zgarsa — yoziladi va admin/rahbar/marketologga xabar boradi. */
  recordStatus(chatId: string, status: "member" | "blocked", source: "event" | "send" | "probe"): Promise<void>;
  /** Chat ID kiritilgan barcha faol xodimlarni fonda tekshiradi. Qaytaradi: nechta chat (0 — Telegram o'chiq). */
  probeAll(): number;
  /** Ulanishni kuzatishni yoqish (Telegram webhook shu manzilga) yoki o'chirish. */
  setTracking(on: boolean, url: string, secret: string): Promise<TgResult>;
  /** Navbatdagi barcha yuborishlar tugashini kutish (testlar va to'xtash uchun). */
  idle(): Promise<void>;
}

export function createNotifier(
  store: StateStore,
  send: SendFn = sendTelegram,
  sendDoc: SendDocFn = sendTelegramDocument,
  control: TelegramControl = realControl,
): Notifier {
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

  const deliver = (outbox: Outgoing[]) => {
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
  };

  const recordStatus: Notifier["recordStatus"] = async (chatId, status, source) => {
    // Holat o'zgarmasa — bazaga hech narsa yozilmaydi (har bir yuborilgan xabarda chaqiriladi)
    const affected = store.current().state.users.some((u) => u.telegramChatId?.trim() === chatId && u.telegramStatus !== status);
    if (!affected) return;
    const r = await store.runAsSystem("setTelegramStatus", [chatId, status, source]);
    deliver(r.outbox);
  };

  return {
    deliver,
    recordStatus,
    probeAll() {
      const token = cfg();
      if (!token) return 0;
      const chats = [...new Set(store.current().state.users.flatMap((u) => (u.active && u.telegramChatId?.trim() ? [u.telegramChatId.trim()] : [])))];
      for (const chat of chats) track(control.probe(token, chat).then((p) => (p === "unknown" ? undefined : recordStatus(chat, p, "probe"))));
      return chats.length;
    },
    async setTracking(on, url, secret) {
      const token = cfg();
      if (!token) return { ok: false, error: "Avval Telegram bildirishnomalarini yoqing va bot tokenini kiriting" };
      const r = on ? await control.setWebhook(token, url, secret) : await control.deleteWebhook(token);
      // O'chirish muvaffaqiyatsiz bo'lsa — kuzatuv hali ham yoqilgan
      await store.runAsSystem("markTelegramTracking", [on ? r.ok : !r.ok, r.ok ? undefined : r.error]);
      return r;
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
    async dailyExcel() {
      const token = cfg();
      if (!token) return { admins: 0, sent: 0, bytes: 0 };
      const { state } = store.current();
      const today = todayISO();
      let bytes = buildXlsx(fullExportSheets(state, today));
      // Fayl Telegram chegarasidan oshsa — katta jurnallarsiz yuboramiz
      if (bytes.length > TELEGRAM_FILE_LIMIT) bytes = buildXlsx(fullExportSheets(state, today, { dropLogs: true }));
      const admins = state.users.filter((u) => u.role === "admin" && u.active && u.telegramChatId?.trim());
      if (bytes.length > TELEGRAM_FILE_LIMIT) {
        for (const a of admins)
          track(
            send(
              token,
              a.telegramChatId!.trim(),
              telegramText(a, "⚠ Kunlik Excel juda katta bo'lib ketdi (50 MB dan oshdi), yuborilmadi. Ma'lumotlar zaxirasi serverda saqlanmoqda."),
            ),
          );
        return { admins: admins.length, sent: 0, bytes: bytes.length };
      }
      const name = `erp-${today}.xlsx`;
      const caption = `📊 ${state.settings.companyName}: butun ERP ma'lumoti, ${today} (soat 23:50)\n${(bytes.length / 1024).toFixed(0)} KB`;
      let sent = 0;
      await Promise.all(
        admins.map(async (a) => {
          const ok = await sendDoc(token, a.telegramChatId!.trim(), name, bytes, caption);
          if (ok) sent++;
        }),
      );
      return { admins: admins.length, sent, bytes: bytes.length };
    },
    idle: () => pending.then(() => undefined),
  };
}
