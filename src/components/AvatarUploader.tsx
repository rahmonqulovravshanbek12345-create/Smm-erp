import { useRef, useState, type ReactNode } from "react";
import { removeAvatar, toAvatarJpeg, uploadAvatar } from "../lib/avatar-upload";
import { useErp } from "../lib/store";

/** Profil rasmini tanlash/o'chirish: hidden input va amallar. Faqat serverli tizimda ishlatiladi. */
export function useAvatarPicker(userId: string): { input: ReactNode; pick: () => void; remove: () => Promise<void>; busy: boolean } {
  const { session, showToast } = useErp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const done = async (msg: string) => {
    await session?.refresh();
    showToast(msg);
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAvatar(userId, await toAvatarJpeg(file));
      await done("Profil rasmi saqlandi");
    } catch (e) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Rasm yuklanmadi"}`);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      aria-label="Profil rasmi"
      onChange={(e) => void onFile(e.target.files?.[0])}
    />
  );
  const remove = async () => {
    setBusy(true);
    try {
      await removeAvatar(userId);
      await done("Profil rasmi o'chirildi");
    } catch (e) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Xatolik"}`);
    } finally {
      setBusy(false);
    }
  };
  return { input, pick: () => ref.current?.click(), remove, busy };
}
