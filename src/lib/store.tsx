// Ilova holati: brauzerda (localStorage) saqlanadi. Har bir o'zgarish `run()` orqali o'tadi —
// u bildirishnoma, faoliyat tarixi va Telegram xabarlarini bir joyda boshqaradi.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { nowISO, todayISO } from "./dates";
import { linkFor } from "./routes";
import { syncAll } from "./store-sync";
import { buildSeed, SEED_VERSION } from "./seed";
import { normalizeState } from "./normalize";
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
  /** Brauzerga saqlab bo'lmadi (joy tugagan) — o'zgarishlar sahifa yopilsa yo'qoladi. */
  saveError: boolean;
}

const StoreContext = createContext<Store | null>(null);

/** Ishga tushganda foydalanuvchiga aytiladigan xabar (masalan, demo yangilandi). */
let bootNotice: string | null = null;

/** Eski ma'lumotdan zaxira nusxa: o'chirishdan oldin har doim saqlanadi (qo'lda tiklash mumkin bo'lsin). */
function backup(raw: string) {
  try {
    window.localStorage.setItem(`${STORAGE_KEY}-backup`, raw);
  } catch {
    // joy yetmasa — zaxirasiz davom etamiz
  }
}

function load(): ErpState {
  const seed = buildSeed(todayISO());
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ErpState;
      if (parsed?.version === SEED_VERSION) {
        const ok = normalizeState(parsed, seed);
        if (ok) return ok;
        backup(raw);
        bootNotice = "⚠ Saqlangan ma'lumot buzilgan edi — zaxiraga olindi, demo qayta ochildi";
        return seed;
      }
      // Demo ma'lumotlarning yangi versiyasi: eski holat zaxiraga olinadi (haqiqiy tizimda bu server migratsiyasi bo'ladi)
      backup(raw);
      keepTelegram(parsed, seed);
      bootNotice = "Demo yangi versiyaga yangilandi — oldingi ma'lumot zaxiraga olindi";
      return seed;
    }
  } catch {
    bootNotice = "⚠ Saqlangan ma'lumot o'qilmadi — demo qayta ochildi";
  }
  return seed;
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
  const [saveError, setSaveError] = useState(false);
  const toastTimer = useRef<number>();
  const today = todayISO();
  // Boshqa oynadan kelgan holat qayta yozilmasligi uchun
  const lastRaw = useRef<string | null>(null);

  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), t.startsWith("⚠") ? 5000 : 2600);
  }, []);

  useEffect(() => {
    const raw = JSON.stringify(state);
    if (raw === lastRaw.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
      lastRaw.current = raw;
      setSaveError(false);
    } catch {
      // Joy tugagan yoki yashirin rejim: o'zgarishlar faqat shu oynada qoladi — foydalanuvchi bilishi kerak
      setSaveError(true);
    }
  }, [state]);

  useEffect(() => {
    if (bootNotice) {
      showToast(bootNotice);
      bootNotice = null;
    }
    // Ikkinchi oynada o'zgartirilsa — shu oyna ham yangi holatni oladi (eski holat ustidan yozib yubormaydi)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = normalizeState(JSON.parse(e.newValue), buildSeed(todayISO()));
        if (!next || next.version !== SEED_VERSION) return;
        lastRaw.current = e.newValue;
        // Joriy foydalanuvchi har oynada o'ziniki bo'lib qoladi
        next.currentUserId = stateRef.current.currentUserId;
        stateRef.current = next;
        setState(next);
        showToast("Ma'lumot boshqa oynada yangilandi");
      } catch {
        // o'qib bo'lmadi — e'tiborsiz qoldiramiz
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [showToast]);

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
            // Arxivdagi xodimga bildirishnoma va Telegram yuborilmaydi
            if (!to?.active) continue;
            const chatId = to?.telegramChatId?.trim();
            const live = Boolean(tg.enabled && token && chatId);
            const id = newId("ntf");
            s.notifications.unshift({
              id,
              userId: uid,
              text,
              // Oluvchi ocha olmaydigan sahifaga havola berilmaydi (masalan, direktorda «Mening hisobim» yo'q)
              href: linkFor(to?.role, href),
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

  const value = useMemo(() => ({ state, me, today, run, reset, toast, showToast, saveError }), [state, me, today, run, reset, toast, showToast, saveError]);
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
