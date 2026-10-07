import { useEffect, useRef } from "react";
import * as act from "../lib/actions";
import { fetchCbuRate, syncMeta } from "../lib/integrations";
import { useErp } from "../lib/store";

/**
 * Sayt ochilganda kuniga bir marta: Markaziy bank kursi va Meta Ads'dan yetishmayotgan kunlik hisobotlar.
 * Haqiqiy tizimda buni server jadval bo'yicha bajaradi.
 */
export function useAutoSync() {
  const { state, today, run } = useErp();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { cbu, meta } = state.settings.integrations;
    void (async () => {
      if (cbu.autoUpdate && cbu.rateDate !== today && cbu.lastAttempt !== today) {
        run((c) => {
          c.s.settings.integrations.cbu.lastAttempt = today;
        });
        try {
          const r = await fetchCbuRate();
          run((c) => act.setUsdRate(c, r.rate, r.date, "cbu"));
        } catch (e) {
          run((c) => act.logIntegration(c, "cbu", false, `${e instanceof Error ? e.message : "Xatolik"} — kurs o'zgarmadi`));
        }
      }
      if (meta.autoSync && meta.lastAttempt !== today) {
        const res = await syncMeta(state, today);
        run((c) => {
          c.s.settings.integrations.meta.lastAttempt = today;
          act.applyMetaSync(c, res);
        });
      }
    })();
    // Faqat birinchi ochilishda ishlaydi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
