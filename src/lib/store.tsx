// Ilova holati: brauzerda (localStorage) saqlanadi. Har bir o'zgarish `run()` orqali o'tadi —
// u bildirishnoma, faoliyat tarixi va Telegram xabarlarini bir joyda boshqaradi.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { nowISO, todayISO } from "./dates";
import { syncAll } from "./store-sync";
import { buildSeed, SEED_VERSION } from "./seed";
import { sendTelegram, telegramText } from "./telegram";
import type { ErpState, User } from "./types";

const STORAGE_KEY = "smm-erp-demo";

export const newId = (prefix = "id") => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export { syncAll };

interface Outgoing {
  notificationId: string;
  chatId: string;
  text: string;
}

export interface Ctx {
  s: ErpState;
  me: User;
  today: string;
  /** Tizim ichida bildirishnoma + (sozlangan bo'lsa) Telegram xabar. */
  notify: (userIds: (string | undefined)[], text: string, href?: string) => void;
  /** Faoliyat tarixi: kim, qachon, nimani o'zgartirdi. */
  log: (text: string, href?: string) => void;
}

interface Store {
  state: ErpState;
  me: User;
  today: string;
  /** O'zgarishni qo'llaydi; qoida buzilsa false qaytaradi va xabar ko'rsatadi. */
  run: (fn: (c: Ctx) => void, toast?: string) => boolean;
  reset: () => void;
  toast: string | null;
  showToast: (t: string) => void;
}

const StoreContext = createContext<Store | null>(null);

function load(): ErpState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ErpState;
      if (parsed.version === SEED_VERSION) return parsed;
      const fresh = buildSeed(todayISO());
      keepTelegram(parsed, fresh);
      return fresh;
    }
  } catch {
    // saqlangan ma'lumot o'qilmadi — yangi demo ma'lumot bilan boshlaymiz
  }
  return buildSeed(todayISO());
}

/** Demo qayta tiklanganda yoki yangilanganda tokenlar, chat ID'lar va ulangan reklama kabinetlari saqlanib qoladi. */
function keepTelegram(from: ErpState, to: ErpState) {
  const tg = from.settings?.telegram;
  if (tg) to.settings.telegram = { ...tg };
  for (const u of to.users) {
    const chatId = from.users?.find((x) => x.id === u.id)?.telegramChatId;
    if (chatId) u.telegramChatId = chatId;
  }
  const integ = from.settings?.integrations;
  if (integ?.meta?.token) {
    to.settings.integrations.meta = { ...integ.meta, accounts: { ...integ.meta.accounts }, lastSync: undefined };
  }
  if (integ?.cbu) to.settings.integrations.cbu.autoUpdate = integ.cbu.autoUpdate;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ErpState>(() => {
    const s = load();
    syncAll(s, todayISO());
    return s;
  });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const today = todayISO();

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // saqlash imkoni bo'lmasa (yashirin rejim), demo xotirada ishlashda davom etadi
    }
  }, [state]);

  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const deliver = useCallback((token: string, outbox: Outgoing[]) => {
    for (const o of outbox) {
      void sendTelegram(token, o.chatId, o.text).then((ok) =>
        setState((prev) => ({
          ...prev,
          notifications: prev.notifications.map((n) => (n.id === o.notificationId ? { ...n, telegram: ok ? "sent" : "failed" } : n)),
        })),
      );
    }
  }, []);

  // So'nggi holat ref'da saqlanadi: run() yangi holatni sinxron hisoblaydi, ketma-ket chaqiruvlar bir-birini yo'qotmaydi.
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback(
    (fn: (c: Ctx) => void, toastText?: string) => {
      const s = structuredClone(stateRef.current);
      const me = s.users.find((u) => u.id === s.currentUserId) ?? s.users[0]!;
      const tg = s.settings.telegram;
      const token = tg.botToken.trim();
      const outbox: Outgoing[] = [];
      const ctx: Ctx = {
        s,
        me,
        today: todayISO(),
        notify(userIds, text, href) {
          const uniq = new Set(userIds.filter((x): x is string => Boolean(x) && x !== me.id));
          for (const uid of uniq) {
            const to = s.users.find((u) => u.id === uid);
            const chatId = to?.telegramChatId?.trim();
            const live = Boolean(tg.enabled && token && chatId);
            const id = newId("ntf");
            s.notifications.unshift({
              id,
              userId: uid,
              text,
              href,
              at: nowISO(),
              read: false,
              telegram: !tg.enabled ? "off" : live ? "sent" : "demo",
            });
            if (live) outbox.push({ notificationId: id, chatId: chatId!, text: telegramText(to!, text) });
          }
        },
        log(text, href) {
          s.activity.unshift({ id: newId("act"), at: nowISO(), userId: me.id, text, href });
        },
      };
      try {
        fn(ctx);
      } catch (e) {
        // Qoida buzilsa (masalan, sabab kiritilmagan) — o'zgarish qo'llanmaydi.
        showToast(e instanceof Error ? `⚠ ${e.message}` : "Xatolik");
        return false;
      }
      syncAll(s, ctx.today);
      stateRef.current = s;
      setState(s);
      if (outbox.length) deliver(token, outbox);
      if (toastText) showToast(toastText);
      return true;
    },
    [deliver, showToast],
  );

  const reset = useCallback(() => {
    const s = buildSeed(todayISO());
    keepTelegram(stateRef.current, s);
    syncAll(s, todayISO());
    stateRef.current = s;
    setState(s);
    showToast("Demo ma'lumotlar qayta tiklandi");
  }, [showToast]);

  const me = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0]!;

  const value = useMemo(() => ({ state, me, today, run, reset, toast, showToast }), [state, me, today, run, reset, toast, showToast]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useErp(): Store {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useErp StoreProvider ichida ishlatilishi kerak");
  return v;
}

/** Foydalanuvchi, loyiha nomlarini tez topish uchun. */
export function useLookup() {
  const { state } = useErp();
  return useMemo(() => {
    const users = new Map(state.users.map((u) => [u.id, u]));
    const projects = new Map(state.projects.map((p) => [p.id, p]));
    return {
      userName: (id?: string) => (id ? (users.get(id)?.name ?? "—") : "—"),
      projectName: (id?: string) => (id ? (projects.get(id)?.name ?? "—") : "—"),
      project: (id?: string) => (id ? projects.get(id) : undefined),
      usersByRole: (role: User["role"]) => state.users.filter((u) => u.role === role && u.active),
    };
  }, [state.users, state.projects]);
}
