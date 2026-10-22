// Telegram Mini App: ochilganda Telegram beradigan ma'lumot (initData) haqiqiyligini tekshirish.
// Telegram uni bot tokeni bilan imzolaydi — tokenni bilmagan odam soxta yoki boshqa xodimning ma'lumotini yasay olmaydi.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TgLaunch {
  /** Telegram foydalanuvchi ID'si — bot bilan shaxsiy chat ID'si ham shu. */
  tgId: string;
  /** Imzolangan vaqt (soniya, Unix). */
  authDate: number;
}

const MAX_LEN = 4096;

/** Imzo to'g'ri, eskirmagan va foydalanuvchi ko'rsatilgan bo'lsa — uning ID'si; aks holda null. */
export function verifyInitData(initData: unknown, botToken: string, maxAgeSec: number, nowMs = Date.now()): TgLaunch | null {
  if (typeof initData !== "string" || !initData || initData.length > MAX_LEN || !botToken) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const fields = new Map<string, string>();
  for (const [k, v] of params) {
    if (fields.has(k)) return null; // takrorlangan maydon — soxtalashtirish urinishi
    fields.set(k, v);
  }
  const hash = fields.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  fields.delete("hash");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const sign = (keys: string[]) =>
    createHmac("sha256", secret)
      .update(keys.map((k) => `${k}=${fields.get(k)}`).join("\n"))
      .digest();
  const keys = [...fields.keys()].sort();
  const given = Buffer.from(hash, "hex");
  // «signature» maydoni (uchinchi tomon tekshiruvi uchun) — Telegram'ning turli versiyalarida xeshga kiritilgan yoki kiritilmagan.
  // Ikkala holat ham bot tokeni bilan hisoblanadi, shuning uchun xavfsizlik pasaymaydi.
  const ok = timingSafeEqual(sign(keys), given) || (fields.has("signature") && timingSafeEqual(sign(keys.filter((k) => k !== "signature")), given));
  if (!ok) return null;

  const authDate = Number(fields.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return null;
  const age = nowMs / 1000 - authDate;
  // Kelajakdagi vaqt (soatlar farqi) — 5 daqiqagacha kechiriladi
  if (age > maxAgeSec || age < -300) return null;

  let id: unknown;
  try {
    id = (JSON.parse(fields.get("user") ?? "null") as { id?: unknown } | null)?.id;
  } catch {
    return null;
  }
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  return { tgId: String(id), authDate };
}

/** Testlar uchun: Telegram kabi imzolangan initData yasaydi. */
export function signInitData(botToken: string, fields: Record<string, string>): string {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
