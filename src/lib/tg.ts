// Telegram Mini App (brauzer tomoni): botdagi «ERP» tugmasi ochadigan sahifa — /tg.
// Rasmiy SDK skripti yuklanmaydi (begona skript yo'q): Telegram ma'lumotni manzil oxirida (#tgWebAppData=…) beradi,
// ilova esa Telegram'ga hujjatlashtirilgan oddiy xabarlar yuboradi. https://core.telegram.org/api/web-events

/** Serverli tizimdagi /tg sahifasi — Mini App rejimi. */
export const MINI_APP = import.meta.env.VITE_SERVER === "1" && typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/tg";

const INIT_KEY = "smm-erp-tg-init";
const THEME_KEY = "smm-erp-tg-theme";
const TOKEN_KEY = "smm-erp-tg-token";

const read = (s: () => Storage, k: string) => {
  try {
    return s().getItem(k);
  } catch {
    return null;
  }
};
const write = (s: () => Storage, k: string, v: string | null) => {
  try {
    if (v === null) s().removeItem(k);
    else s().setItem(k, v);
  } catch {
    // saqlab bo'lmasa — faqat shu ochilishda ishlaydi
  }
};
const session = () => window.sessionStorage;
const local = () => window.localStorage;

/**
 * Telegram ochganda manzilga qo'ygan ma'lumotlarni oladi va manzilni tozalaydi (ilova #/sahifa yo'llarini ishlatadi).
 * Sahifa qayta yuklansa — shu oynadagi nusxadan.
 */
function captureLaunch(): { initData: string | null; dark: boolean | null } {
  if (!MINI_APP) return { initData: null, dark: null };
  const p = new URLSearchParams(window.location.hash.slice(1));
  const data = p.get("tgWebAppData");
  if (data) {
    write(session, INIT_KEY, data);
    write(session, THEME_KEY, p.get("tgWebAppThemeParams"));
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  let dark: boolean | null = null;
  try {
    const bg = (JSON.parse(read(session, THEME_KEY) ?? "null") as { bg_color?: string } | null)?.bg_color;
    const m = bg && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg);
    if (m) dark = (0.299 * parseInt(m[1]!, 16) + 0.587 * parseInt(m[2]!, 16) + 0.114 * parseInt(m[3]!, 16)) / 255 < 0.5;
  } catch {
    // mavzu ma'lumoti buzilgan — qurilma sozlamasi ishlatiladi
  }
  return { initData: data ?? read(session, INIT_KEY), dark };
}

const launch = captureLaunch();

/** Telegram imzolagan ma'lumot (har so'rovda serverga yuboriladi). Mini App Telegram'dan tashqarida ochilsa — null. */
export const tgInitData = () => launch.initData;
/** Telegram mavzusi qorong'imi (ma'lum bo'lmasa — null). */
export const tgDark = () => launch.dark;

/** Parol bilan kirilganda server bergan token (12 soat). */
export const tgToken = () => read(local, TOKEN_KEY);
export const setTgToken = (t: string | null) => write(local, TOKEN_KEY, t);

/** Mini App so'rovlari uchun sarlavhalar: token va Telegram imzosi. */
export function tgHeaders(): Record<string, string> {
  if (!MINI_APP) return {};
  const token = tgToken();
  return { ...(launch.initData ? { "X-TG-Init": launch.initData } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ---------- Telegram bilan xabar almashish ----------

type Proxy = { postEvent?: (type: string, data: string) => void };

function postEvent(type: string, data: Record<string, unknown> = {}) {
  if (!MINI_APP) return;
  const w = window as unknown as { TelegramWebviewProxy?: Proxy };
  try {
    // Telefon va kompyuter ilovalari
    if (w.TelegramWebviewProxy?.postEvent) w.TelegramWebviewProxy.postEvent(type, JSON.stringify(data));
    // Veb-versiya (web.telegram.org) — sahifa uning oynasi ichida
    else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), "https://web.telegram.org");
  } catch {
    // Telegram tashqarisida — e'tiborsiz
  }
}

const listeners = new Map<string, Set<() => void>>();
function receive(type: string) {
  for (const fn of listeners.get(type) ?? []) fn();
}
if (MINI_APP) {
  const w = window as unknown as { Telegram?: { WebView?: { receiveEvent?: (t: string, d: unknown) => void } } };
  w.Telegram = { ...w.Telegram, WebView: { ...w.Telegram?.WebView, receiveEvent: (t) => receive(t) } };
  window.addEventListener("message", (e) => {
    if (e.origin !== "https://web.telegram.org" || typeof e.data !== "string") return;
    try {
      const m = JSON.parse(e.data) as { eventType?: unknown };
      if (typeof m.eventType === "string") receive(m.eventType);
    } catch {
      // begona xabar
    }
  });
}

/** Telegram'ga: ilova tayyor (yuklanish belgisi olinadi) va to'liq balandlikda ochilsin. */
export function tgReady() {
  postEvent("web_app_ready");
  postEvent("web_app_expand");
}

/** Telegram'ning «Orqaga» tugmasi (sarlavhada). Qaytaradi: tozalash funksiyasi. */
export function tgBackButton(visible: boolean, onPress: () => void): () => void {
  if (!MINI_APP) return () => undefined;
  postEvent("web_app_setup_back_button", { is_visible: visible });
  if (!visible) return () => undefined;
  const set = listeners.get("back_button_pressed") ?? new Set();
  listeners.set("back_button_pressed", set);
  set.add(onPress);
  return () => set.delete(onPress);
}

/** Havolani Telegram ichidagi brauzerda ochadi (masalan, saytning to'liq versiyasi). */
export function tgOpenLink(url: string) {
  postEvent("web_app_open_link", { url });
}
