// Profil rasmi: brauzer 256x256 JPEG yasab yuboradi; server uni qat'iy tekshiradi (rasm ekanligi, o'lchami, hajmi).

export const AVATAR_MAX_BYTES = 150 * 1024;
const MAX_SIDE = 512;
const MIN_SIDE = 32;

/** JPEG ekanini (boshi, oxiri) va o'lchamini (SOF belgisidan) tekshiradi. Yaroqsiz bo'lsa — xato sababi. */
export function checkJpeg(b: Buffer): { ok: true; w: number; h: number } | { ok: false; error: string } {
  if (b.length < 125) return { ok: false, error: "Fayl juda kichik" };
  if (b.length > AVATAR_MAX_BYTES) return { ok: false, error: "Rasm hajmi juda katta" };
  if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) return { ok: false, error: "Rasm JPEG formatida bo'lishi kerak" };
  if (!(b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9)) return { ok: false, error: "Rasm fayli buzilgan" };
  // Belgilar ketma-ketligini o'qib, SOFn (o'lcham) ni topamiz
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return { ok: false, error: "Rasm fayli buzilgan" };
    const m = b[i + 1]!;
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return { ok: false, error: "Rasm fayli buzilgan" };
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return { ok: false, error: "Rasm fayli buzilgan" };
      const h = b.readUInt16BE(i + 5);
      const w = b.readUInt16BE(i + 7);
      if (w < MIN_SIDE || h < MIN_SIDE) return { ok: false, error: "Rasm juda kichik" };
      if (w > MAX_SIDE || h > MAX_SIDE) return { ok: false, error: `Rasm o'lchami ${MAX_SIDE}×${MAX_SIDE} dan oshmasin` };
      return { ok: true, w, h };
    }
    if (m === 0xda) break; // skan boshlandi, SOF topilmadi
    i += 2 + len;
  }
  return { ok: false, error: "Rasm o'lchamini aniqlab bo'lmadi" };
}
