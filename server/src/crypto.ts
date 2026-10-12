// Parol xeshi (scrypt), sessiya tokenlari, 2FA (TOTP, RFC 6238) va maxfiy qiymatlarni shifrlash (AES-256-GCM).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// ---------- Parollar ----------

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Login topilmaganda ham bir xil vaqt sarflanadi — javob tezligidan login borligini bilib bo'lmaydi. */
let dummy: Promise<string> | null = null;
export async function burnPasswordTime(password: string): Promise<void> {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummy);
}

const COMMON = new Set([
  "123456789",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "1q2w3e4r5t",
  "password123",
  "parol12345",
  "1111111111",
  "0000000000",
  "abcdefghij",
  "qwerty12345",
  "admin12345",
  "iloveyou12",
  "uzbekistan",
  "toshkent123",
  "tashkent123",
]);

/** Parol talablari: kamida 10 belgi, harf va raqam, oddiy/takroriy emas, loginni o'z ichiga olmaydi. */
export function passwordProblem(password: string, login = ""): string | null {
  if (password.length < 10) return "Parol kamida 10 belgidan iborat bo'lsin";
  if (password.length > 128) return "Parol juda uzun (128 belgigacha)";
  if (!/[A-Za-zЀ-ӿ]/.test(password) || !/\d/.test(password)) return "Parolda harf ham, raqam ham bo'lsin";
  if (new Set(password).size < 5) return "Parol juda oddiy — har xil belgilardan foydalaning";
  if (COMMON.has(password.toLowerCase())) return "Bu parol juda keng tarqalgan — boshqasini tanlang";
  if (login && password.toLowerCase().includes(login.toLowerCase())) return "Parolda login bo'lmasin";
  return null;
}

/** Vaqtinchalik parol (admin xodimga beradi): oson o'qiladigan, chalkash belgilarsiz. */
export function tempPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const dig = "23456789";
  const pick = (s: string, n: number) => Array.from(randomBytes(n), (b) => s[b % s.length]).join("");
  return `${pick(abc, 4)}-${pick(dig, 4)}-${pick(abc, 4)}`;
}

// ---------- Tokenlar ----------

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

// ---------- 2FA (TOTP) ----------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string): Buffer {
  const clean = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32 noto'g'ri");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32(randomBytes(20));

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", fromBase32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

/** Kodni tekshiradi (±30 soniya). Topilsa — qadam raqami (bir kodni ikki marta ishlatib bo'lmasligi uchun). */
export function verifyTotp(secret: string, code: string, lastStep: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = Math.floor(now / 30_000);
  for (const step of [cur - 1, cur, cur + 1]) {
    if (step <= lastStep) continue;
    const want = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(want, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- Shifrlash ----------

export function makeSealer(secretKeyB64: string) {
  const key = createHash("sha256").update(Buffer.from(secretKeyB64, "base64")).digest();
  return {
    seal(plain: string): string {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
    },
    open(sealed: string): string {
      const [v, iv, tag, ct] = sealed.split(":");
      if (v !== "v1" || !iv || !tag || !ct) throw new Error("Shifrlangan qiymat noto'g'ri");
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
    },
  };
}
export type Sealer = ReturnType<typeof makeSealer>;
