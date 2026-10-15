// Profil rasmini brauzerda tayyorlash (kvadrat 256×256 JPEG) va serverga yuborish.
import { ApiError, api } from "./api";

const SIDE = 256;
const MAX_BLOB = 120 * 1024;

export async function toAvatarJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Rasm faylini tanlang (JPG, PNG yoki WEBP)");
  if (file.size > 15 * 1024 * 1024) throw new Error("Fayl juda katta (15 MB gacha)");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Rasmni o'qib bo'lmadi — boshqa fayl tanlang");
  }
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brauzer rasmni qayta ishlay olmadi");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIDE, SIDE);
  // Markazdan kvadrat qirqiladi
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, SIDE, SIDE);
  bmp.close();
  for (const q of [0.88, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_BLOB) return blob;
  }
  throw new Error("Rasm hajmi katta — oddiyroq rasm tanlang");
}

export async function uploadAvatar(userId: string, blob: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/avatar/${encodeURIComponent(userId)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "image/jpeg", "X-ERP": "1" },
      body: blob,
    });
  } catch {
    throw new ApiError("Server bilan aloqa yo'q — internetni tekshiring", 0);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? `Xatolik (${res.status})`, res.status);
  }
}

export const removeAvatar = (userId: string) => api(`/api/avatar/${encodeURIComponent(userId)}/remove`, {});
