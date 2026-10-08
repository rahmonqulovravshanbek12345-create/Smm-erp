// Vaqtga bog'liq avtomatik yozuvlar: oylik fakturalar va davriy ish haqi hisoblashlari.
import { syncAccruals, syncInvoices } from "./finance";
import { recurringFee } from "./services";
import type { ErpState } from "./types";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export function syncAll(s: ErpState, today: string): void {
  // Oylik summa USD kursiga bog'liq (performance foizi) — har safar yangilanadi
  for (const p of s.projects) {
    const fee = recurringFee(p, s.settings.usdRate);
    if (p.monthlyFee !== fee) p.monthlyFee = fee;
  }
  syncInvoices(s, today, () => uid("inv"));
  syncAccruals(s, today, () => uid("acr"));
}
