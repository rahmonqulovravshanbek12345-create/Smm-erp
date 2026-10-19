// Vaqtga bog'liq avtomatik yozuvlar: oylik fakturalar va davriy ish haqi hisoblashlari.
import { syncAccruals, syncInvoices } from "./finance";
import { recurringFee, refreshUsdPrices } from "./services";
import { applyTeamAll } from "./team";
import type { ErpState } from "./types";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export function syncAll(s: ErpState, today: string): void {
  // Jamoa almashuvi kuni kelgan bo'lsa — joriy xodim o'zgaradi
  applyTeamAll(s, today);
  // Oylik summa USD kursiga bog'liq (performance foizi) — har safar yangilanadi
  for (const p of s.projects) {
    // Dollardagi shartnoma: xizmatlarning so'mdagi qiymati joriy kurs bo'yicha
    refreshUsdPrices(p, s.settings.usdRate);
    const fee = recurringFee(p, s.settings.usdRate);
    if (p.monthlyFee !== fee) p.monthlyFee = fee;
  }
  syncInvoices(s, today, () => uid("inv"));
  syncAccruals(s, today, () => uid("acr"));
}
