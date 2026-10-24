// Kirish: login + parol (+ 2FA), noto'g'ri urinishlarda bloklash, sessiyalar va qurilmalar.
import { burnPasswordTime, hashPassword, needsRehash, newToken, sha256, verifyPassword, verifyTotp, type Sealer } from "./crypto";
import type { Db } from "./db";

export const SESSION_DAYS = 30;
/** Shuncha kun ishlatilmagan sessiya o'chadi. */
export const IDLE_DAYS = 14;

/** Sessiya muddati: pul va tizim sozlamalariga kiradigan rollar uchun qisqaroq (7 kun, 1 kun harakatsizlik). */
export function sessionLife(role: string): { days: number; idleMinutes: number } {
  return role === "admin" || role === "rahbar" || role === "moliya" || role === "marketolog"
    ? { days: 7, idleMinutes: 24 * 60 }
    : { days: SESSION_DAYS, idleMinutes: IDLE_DAYS * 24 * 60 };
}
const TOTP_STAGE_MIN = 5;
const MAX_FAILS = 5;
const LOCK_MIN = 15;

export interface Credential {
  user_id: string;
  login: string;
  pass_hash: string;
  must_change: boolean;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_enabled: boolean;
  totp_last_step: string;
  last_login_at: Date | null;
}

export interface Session {
  id: string;
  user_id: string;
  stage: "full" | "totp";
  created_at: Date;
  last_seen: Date;
  expires_at: Date;
  idle_minutes: number;
  /** web — saytdagi cookie; tg — Telegram Mini App (token + Telegram imzosi). */
  kind: "web" | "tg";
  tg_id: string | null;
}

export const normLogin = (v: string) => v.trim().toLowerCase();
export const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;

export async function credentialByLogin(db: Db, login: string): Promise<Credential | null> {
  const { rows } = await db.query<Credential>("SELECT * FROM credentials WHERE login = $1", [normLogin(login)]);
  return rows[0] ?? null;
}

export async function credentialByUser(db: Db, userId: string): Promise<Credential | null> {
  const { rows } = await db.query<Credential>("SELECT * FROM credentials WHERE user_id = $1", [userId]);
  return rows[0] ?? null;
}

// ---------- Noto'g'ri urinishlar ----------
// Blok «login + IP» juftligiga qo'yiladi: begona odam boshqa joydan xato parol terib, haqiqiy xodimni
// bloklab qo'ya olmaydi. Ko'p IP'dan tarqoq hujumga qarshi — login bo'yicha umumiy yumshoq cheklov
// (soatiga 30 xato → 15 daqiqa). Login topilmasa ham xuddi shunday hisoblanadi (kim borligini bilib bo'lmasin).

const keyOf = (login: string, ip: string) => `${normLogin(login).slice(0, 64)}|${ip.slice(0, 64)}`;
const globalKey = (login: string) => `${normLogin(login).slice(0, 64)}|*`;
/** 2FA kodlari — IP'dan qat'i nazar (parolni bilgan odam IP almashtirib kod tanlay olmasin). */
const totpKey = (login: string) => `${normLogin(login).slice(0, 64)}|2fa`;
const GLOBAL_MAX = 30;
const TOTP_MAX = 10;

const chains = new Map<string, Promise<unknown>>();
/**
 * Bir login uchun «blokni tekshirish → taxmin → xatoni yozish» ketma-ketligi navbat bilan bajariladi.
 * Aks holda ko'p IP'dan bir vaqtda kelgan so'rovlar hisoblagich hali 0 bo'lganda hammasi tekshiruvdan o'tib ketardi.
 * (Server bitta jarayon — navbat xotirada; bloklash hisoblagichlari bazada qoladi.)
 */
export function withLoginLock<T>(login: string, fn: () => Promise<T>): Promise<T> {
  const key = normLogin(login).slice(0, 64);
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}

/** Bloklangan bo'lsa — necha daqiqa qolgani. */
export async function lockedFor(db: Db, login: string, ip: string): Promise<number> {
  const { rows } = await db.query<{ until: Date | null }>("SELECT max(locked_until) AS until FROM login_attempts WHERE login = ANY($1)", [
    [keyOf(login, ip), globalKey(login), totpKey(login)],
  ]);
  const until = rows[0]?.until;
  if (!until || until.getTime() <= Date.now()) return 0;
  return Math.ceil((until.getTime() - Date.now()) / 60_000);
}

/** Shu IP'dan har 5 ta xatodan keyin blok: 15 daqiqa, keyin 30, 60… (24 soatgacha). */
export async function recordFailure(db: Db, login: string, ip: string): Promise<void> {
  await db.query(
    `INSERT INTO login_attempts (login, failed, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (login) DO UPDATE SET failed = login_attempts.failed + 1, updated_at = now(),
       locked_until = CASE WHEN (login_attempts.failed + 1) % $2 = 0
         THEN now() + make_interval(mins => LEAST($3 * power(2, (login_attempts.failed + 1) / $2 - 1), 1440)::int)
         ELSE login_attempts.locked_until END`,
    [keyOf(login, ip), MAX_FAILS, LOCK_MIN],
  );
  await db.query(
    `INSERT INTO login_attempts (login, failed, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (login) DO UPDATE SET
       failed = CASE WHEN login_attempts.updated_at < now() - interval '1 hour' THEN 1 ELSE login_attempts.failed + 1 END,
       updated_at = now(),
       locked_until = CASE WHEN login_attempts.updated_at >= now() - interval '1 hour' AND (login_attempts.failed + 1) % $2 = 0
         THEN now() + make_interval(mins => $3) ELSE login_attempts.locked_until END`,
    [globalKey(login), GLOBAL_MAX, LOCK_MIN],
  );
}

/** Noto'g'ri 2FA kodi: har 10 tasidan keyin blok 15 daqiqa, keyin 30, 60… (IP'ga bog'liq emas). */
export async function recordTotpFailure(db: Db, login: string): Promise<void> {
  await db.query(
    `INSERT INTO login_attempts (login, failed, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (login) DO UPDATE SET failed = login_attempts.failed + 1, updated_at = now(),
       locked_until = CASE WHEN (login_attempts.failed + 1) % $2 = 0
         THEN now() + make_interval(mins => LEAST($3 * power(2, (login_attempts.failed + 1) / $2 - 1), 1440)::int)
         ELSE login_attempts.locked_until END`,
    [totpKey(login), TOTP_MAX, LOCK_MIN],
  );
}

/** To'liq kirishda — shu IP'dagi hisoblagich va 2FA hisoblagichi; IP berilmasa (admin/CLI) — loginning hamma bloklari. */
export async function clearFailures(db: Db, login: string, ip?: string): Promise<void> {
  if (ip !== undefined) await db.query("DELETE FROM login_attempts WHERE login = ANY($1)", [[keyOf(login, ip), globalKey(login), totpKey(login)]]);
  else await db.query("DELETE FROM login_attempts WHERE split_part(login, '|', 1) = $1", [normLogin(login).slice(0, 64)]);
}

/** Login va parolni tekshiradi. Login topilmasa ham bir xil vaqt va bir xil javob. */
export async function checkPassword(db: Db, login: string, password: string): Promise<Credential | null> {
  const cred = LOGIN_RE.test(normLogin(login)) ? await credentialByLogin(db, login) : null;
  if (!cred) {
    await burnPasswordTime(password);
    return null;
  }
  if (!(await verifyPassword(password, cred.pass_hash))) return null;
  if (needsRehash(cred.pass_hash)) {
    const pass_hash = await hashPassword(password);
    await db.query("UPDATE credentials SET pass_hash = $2 WHERE user_id = $1", [cred.user_id, pass_hash]);
    return { ...cred, pass_hash };
  }
  return cred;
}

// ---------- Sessiyalar ----------

export async function createSession(
  db: Db,
  userId: string,
  stage: Session["stage"],
  ip: string,
  ua: string,
  life = { days: SESSION_DAYS, idleMinutes: IDLE_DAYS * 24 * 60 },
  tgId?: string,
): Promise<string> {
  const token = newToken();
  const minutes = stage === "totp" ? TOTP_STAGE_MIN : Math.round(life.days * 24 * 60);
  await db.query(
    `INSERT INTO sessions (id, user_id, stage, expires_at, ip, user_agent, idle_minutes, kind, tg_id)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5, $6, $7, $8, $9)`,
    [sha256(token), userId, stage, minutes, ip.slice(0, 64), ua.slice(0, 300), life.idleMinutes, tgId ? "tg" : "web", tgId ?? null],
  );
  return token;
}

export async function getSession(db: Db, token: string | undefined, touch = true): Promise<Session | null> {
  if (!token || token.length > 100) return null;
  const { rows } = await db.query<Session>("SELECT * FROM sessions WHERE id = $1", [sha256(token)]);
  const s = rows[0];
  if (!s) return null;
  const now = Date.now();
  if (s.expires_at.getTime() <= now || now - s.last_seen.getTime() > s.idle_minutes * 60_000) {
    await db.query("DELETE FROM sessions WHERE id = $1", [s.id]);
    return null;
  }
  // Faollik vaqti 5 daqiqada bir marta yangilanadi (har so'rovda bazaga yozmaslik uchun)
  if (touch && now - s.last_seen.getTime() > 5 * 60_000) await db.query("UPDATE sessions SET last_seen = now() WHERE id = $1", [s.id]);
  return s;
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE id = $1", [id]);
}

/** Foydalanuvchining barcha sessiyalari (masalan, parol o'zgarganda yoki arxivlanganda). */
export async function revokeUser(db: Db, userId: string, exceptId?: string): Promise<number> {
  // Parol, 2FA yoki «chiqarish» o'zgarganda ishonchli qurilmalar ham bekor bo'ladi — hamma yangi qurilma sifatida kod kiritadi
  await db.query("DELETE FROM trusted_devices WHERE user_id = $1", [userId]);
  const r = await db.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [userId, exceptId ?? ""]);
  return r.rowCount ?? 0;
}

export async function pruneSessions(db: Db): Promise<void> {
  await db.query("DELETE FROM sessions WHERE expires_at < now() OR last_seen < now() - make_interval(mins => idle_minutes)");
  await db.query("DELETE FROM trusted_devices WHERE expires_at < now()");
  await db.query("DELETE FROM login_attempts WHERE updated_at < now() - interval '2 days' AND (locked_until IS NULL OR locked_until < now())");
}

// ---------- 2FA ----------

/** Kodni tekshiradi va qayta ishlatib bo'lmaydigan qiladi. */
export async function checkTotp(db: Db, sealer: Sealer, cred: Credential, code: string, pending = false): Promise<boolean> {
  const sealed = pending ? cred.totp_pending : cred.totp_secret;
  if (!sealed) return false;
  const step = verifyTotp(sealer.open(sealed), code.replace(/\s/g, ""), Number(cred.totp_last_step));
  if (step === null) return false;
  const r = await db.query("UPDATE credentials SET totp_last_step = $2 WHERE user_id = $1 AND totp_last_step < $2", [cred.user_id, step]);
  return r.rowCount === 1;
}

// ---------- Qurilmalar ----------

/** Yangi qurilma bo'lsa — true (va eslab qoladi). */
export async function rememberDevice(db: Db, userId: string, device: string): Promise<boolean> {
  const r = await db.query("INSERT INTO known_devices (user_id, device) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, sha256(device)]);
  return r.rowCount === 1;
}

export const TRUSTED_DEVICE_DAYS = 30;

/** Shu qurilmada (cookie) bu xodim 2FA kodini yaqinda kiritgan va «eslab qol» belgilaganmi. */
export async function isTrustedDevice(db: Db, userId: string, device: string | undefined): Promise<boolean> {
  if (!device || !/^[A-Za-z0-9_-]{20,64}$/.test(device)) return false;
  const r = await db.query("SELECT 1 FROM trusted_devices WHERE user_id = $1 AND device = $2 AND expires_at > now()", [userId, sha256(device)]);
  return (r.rowCount ?? 0) > 0;
}

export async function trustDevice(db: Db, userId: string, device: string): Promise<void> {
  await db.query(
    `INSERT INTO trusted_devices (user_id, device, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))
     ON CONFLICT (user_id, device) DO UPDATE SET expires_at = EXCLUDED.expires_at, created_at = now()`,
    [userId, sha256(device), TRUSTED_DEVICE_DAYS],
  );
}
