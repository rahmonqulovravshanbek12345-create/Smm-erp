// Saqlangan ma'lumotni o'qishda himoya: eski yoki qisman buzilgan holat ilovani yiqitmasin.
// Yetishmagan ro'yxatlar bo'sh ro'yxat bilan, sozlamalar standart qiymatlar bilan to'ldiriladi.
import type { ErpState, Platform } from "./types";

/** Bo'lmasa — standart qiymatdan olinadigan ro'yxatlar (ularsiz tizim ishlamaydi). */
const FROM_SEED: (keyof ErpState)[] = ["accounts", "articles", "tariffs"];

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** b ning qiymatlari a ustiga (ichma-ich obyektlar ham); turi mos kelmagan qiymat standartdan olinadi. */
function merge<T>(a: T, b: unknown): T {
  if (!isObj(a) || !isObj(b)) return (b === undefined || b === null || (Array.isArray(a) && !Array.isArray(b)) ? a : b) as T;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? merge((a as Record<string, unknown>)[k], v) : v;
  return out as T;
}

/**
 * Saqlangan JSON'ni tekshiradi va to'ldiradi. Foydalanish mumkin bo'lmasa (loyiha yoki xodimlar ro'yxati yo'q) — null.
 */
export function normalizeState(raw: unknown, seed: ErpState): ErpState | null {
  if (!isObj(raw) || !Array.isArray(raw.users) || raw.users.length === 0 || !Array.isArray(raw.projects)) return null;
  const s = { ...seed, ...raw } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(seed)) {
    if (Array.isArray(v) && !Array.isArray(s[k])) s[k] = FROM_SEED.includes(k as keyof ErpState) ? v : [];
  }
  s.settings = merge(seed.settings, raw.settings);
  const st = s as unknown as ErpState;
  for (const p of st.posts) {
    const legacy = (p as unknown as { platform?: Platform }).platform;
    if (!Array.isArray(p.platforms)) p.platforms = legacy ? [legacy] : ["instagram"];
  }
  for (const p of st.projects) if (!Array.isArray(p.services)) p.services = [];
  for (const sh of st.shoots) if (!Array.isArray(sh.postIds)) sh.postIds = [];
  for (const q of st.quotas) {
    if (!isObj(q.counts)) q.counts = {};
    if (!Array.isArray(q.history)) q.history = [];
  }
  if (!st.users.some((u) => u.id === st.currentUserId)) st.currentUserId = st.users[0]!.id;
  return st;
}
