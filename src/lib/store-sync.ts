// Vaqtga bog'liq avtomatik yozuvlar: oylik fakturalar va davriy ish haqi hisoblashlari.
import { syncAccruals, syncInvoices } from "./finance";
import type { ErpState } from "./types";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export function syncAll(s: ErpState, today: string): void {
  syncInvoices(s, today, () => uid("inv"));
  syncAccruals(s, today, () => uid("acr"));
}
