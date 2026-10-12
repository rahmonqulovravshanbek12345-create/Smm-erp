import { useEffect, useRef } from "react";
import { SERVER_MODE } from "../lib/api";
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
    // Serverli tizimda bu ishni server jadval bo'yicha bajaradi
    if (started.current || SERVER_MODE) return;
    started.current = true;
    const { cbu, meta } = state.settings.integrations;
    void (async () => {
      if (cbu.autoUpdate && cbu.rateDate !== today && cbu.lastAttempt !== today) {
        run("markIntegrationAttempt", ["cbu"]);
        try {
          const r = await fetchCbuRate();
          run("setUsdRate", [r.rate, r.date, "cbu"]);
        } catch (e) {
          run("logIntegration", ["cbu", false, `${e instanceof Error ? e.message : "Xatolik"} — kurs o'zgarmadi`]);
        }
      }
      if (meta.autoSync && meta.lastAttempt !== today) {
        const res = await syncMeta(state, today);
        run("metaAutoSync", [res]);
      }
    })();
    // Faqat birinchi ochilishda ishlaydi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
