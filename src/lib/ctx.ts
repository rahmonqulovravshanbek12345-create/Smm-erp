// Amal konteksti: holat, kim bajaryapti, bugungi sana, bildirishnoma va faoliyat tarixi.
// React'ga bog'liq emas — brauzer ham, server ham bir xil amallarni shu kontekst bilan bajaradi.
import { nowHM, nowISO, todayISO } from "./dates";
import { linkFor } from "./routes";
import { telegramText } from "./telegram";
import type { ErpState, User } from "./types";

export interface Ctx {
  s: ErpState;
  me: User;
  today: string;
  /** Hozirgi vaqt «HH:MM» (deadline soati uchun); testlarda berilmasligi mumkin. */
  now?: string;
  /** Tizim ichida bildirishnoma + (sozlangan bo'lsa) Telegram xabar. */
  notify: (userIds: (string | undefined)[], text: string, href?: string) => void;
  /** Faoliyat tarixi: kim, qachon, nimani o'zgartirdi. */
  log: (text: string, href?: string) => void;
}

/** Telegram'ga yuborilishi kerak bo'lgan xabar (amal muvaffaqiyatli tugagandan keyin yuboriladi). */
export interface Outgoing {
  notificationId: string;
  chatId: string;
  text: string;
}

const ID_RE = /^[a-z]{1,8}_[a-z0-9]{8}$/;
const randomId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

// Brauzer amalni o'zida bajarganda yaratilgan ID'lar serverga yuboriladi va server aynan shularni ishlatadi:
// shunda brauzer «yangi loyiha sahifasiga o'tish» kabi ishlarni server javobini kutmasdan qila oladi.
let replay: string[] | null = null;
let issued: string[] | null = null;

export const newId = (prefix = "id"): string => {
  let id: string | undefined;
  if (replay) {
    const i = replay.findIndex((x) => x.startsWith(`${prefix}_`));
    if (i >= 0) id = replay.splice(i, 1)[0];
  }
  id ??= randomId(prefix);
  issued?.push(id);
  return id;
};

/** Amalni bajarib, unda yaratilgan ID'larni yig'adi (brauzer → server). */
export function collectIds<T>(fn: () => T): { value: T; ids: string[] } {
  const prev = issued;
  issued = [];
  try {
    const value = fn();
    return { value, ids: issued };
  } finally {
    issued = prev;
  }
}

/**
 * Brauzerdan kelgan ID'larni qayta ishlatib amalni bajaradi. Faqat to'g'ri ko'rinishdagi va holatda hali
 * yo'q ID'lar olinadi — boshqa yozuvning ID'sini berib, uni «ustidan yozib» bo'lmaydi.
 */
export function withReplayIds<T>(s: ErpState, ids: unknown, fn: () => T): T {
  const raw = JSON.stringify(s);
  const ok = Array.isArray(ids)
    ? [...new Set(ids.filter((x): x is string => typeof x === "string" && ID_RE.test(x) && !raw.includes(`"${x}"`)))].slice(0, 500)
    : [];
  const prev = replay;
  replay = ok;
  try {
    return fn();
  } finally {
    replay = prev;
  }
}

export interface MakeCtxOptions {
  today?: string;
  now?: string;
}

/**
 * Amal konteksti. Bildirishnomalar holatga yoziladi; Telegram'ga ketadiganlari `outbox`ga yig'iladi —
 * ularni chaqiruvchi (server yoki demo brauzer) amal muvaffaqiyatli tugagandan keyin yuboradi.
 */
export function makeCtx(s: ErpState, me: User, o: MakeCtxOptions = {}): { ctx: Ctx; outbox: Outgoing[] } {
  const tg = s.settings.telegram;
  const token = tg.botToken.trim();
  const outbox: Outgoing[] = [];
  const ctx: Ctx = {
    s,
    me,
    today: o.today ?? todayISO(),
    now: o.now ?? nowHM(),
    notify(userIds, text, href) {
      const uniq = new Set(userIds.filter((x): x is string => Boolean(x) && x !== me.id));
      for (const uid of uniq) {
        const to = s.users.find((u) => u.id === uid);
        // Arxivdagi xodimga bildirishnoma va Telegram yuborilmaydi
        if (!to?.active) continue;
        const chatId = to.telegramChatId?.trim();
        const live = Boolean(tg.enabled && token && chatId);
        const id = newId("ntf");
        s.notifications.unshift({
          id,
          userId: uid,
          text,
          // Oluvchi ocha olmaydigan sahifaga havola berilmaydi (masalan, direktorda «Mening hisobim» yo'q)
          href: linkFor(to.role, href),
          at: nowISO(),
          read: false,
          telegram: !tg.enabled ? "off" : live ? "sent" : "demo",
        });
        if (live) outbox.push({ notificationId: id, chatId: chatId!, text: telegramText(to, text) });
      }
    },
    log(text, href) {
      s.activity.unshift({ id: newId("act"), at: nowISO(), userId: me.id, text, href });
    },
  };
  return { ctx, outbox };
}
