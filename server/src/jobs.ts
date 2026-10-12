// Jadval bo'yicha ishlar (Toshkent vaqti): fakturalar va ish haqi hisoblash, kurs, Meta Ads, ertalabki eslatmalar.
import { Cron } from "croner";
import { addDays, todayISO } from "../../src/lib/dates";
import { syncAll } from "../../src/lib/store-sync";
import type { ErpState } from "../../src/lib/types";
import { pruneSessions } from "./auth";
import type { Db } from "./db";
import type { Integrations } from "./integrations";
import type { Notifier } from "./notifier";
import type { StateStore } from "./store";

/** Eski o'qilgan bildirishnomalar va juda eski faoliyat yozuvlari (to'liq tarix audit jurnalida qoladi). */
export function trimHistory(s: ErpState, today: string): void {
  const cutoff = addDays(today, -120);
  s.notifications = s.notifications.filter((n) => !n.read || n.at.slice(0, 10) >= cutoff).slice(0, 30_000);
  if (s.activity.length > 20_000) s.activity = s.activity.slice(0, 20_000);
}

export function startJobs(o: { store: StateStore; db: Db; integrations: Integrations; notifier: Notifier; tz: string; log: (m: string, e?: unknown) => void }) {
  const { store, integrations, notifier, tz, log } = o;
  const safe = (name: string, fn: () => Promise<unknown> | unknown) => async () => {
    try {
      await fn();
    } catch (e) {
      log(`jadval ishi xato: ${name}`, e);
    }
  };
  const jobs = [
    // Har 30 daqiqada: muddati kelgan oylik fakturalar va ish haqi hisoblashlari (hech kim kirmasa ham)
    new Cron(
      "*/30 * * * *",
      { timezone: tz, protect: true },
      safe("hisob-kitob", async () => {
        const today = todayISO();
        await store.system((s) => {
          syncAll(s, today);
          trimHistory(s, today);
        });
        await pruneSessions(o.db);
      }),
    ),
    // Markaziy bank kursi: kuniga uch marta urinadi (bugungi kurs olingan bo'lsa — o'tkazib yuboradi)
    new Cron(
      "5 0,9,15 * * *",
      { timezone: tz, protect: true },
      safe("cbu", () => integrations.pullCbu(false)),
    ),
    // Meta Ads: kechagi kunlar hisobotlari
    new Cron(
      "30 7 * * *",
      { timezone: tz, protect: true },
      safe("meta", async () => {
        const meta = store.current().state.settings.integrations.meta;
        if (!meta.autoSync || !meta.token.trim()) return;
        await store.runAsSystem("markIntegrationAttempt", ["meta"]);
        await integrations.syncMeta();
      }),
    ),
    // Ertalabki eslatmalar Telegram'ga (dushanba–shanba)
    new Cron(
      "45 8 * * 1-6",
      { timezone: tz, protect: true },
      safe("eslatmalar", () => notifier.digest()),
    ),
  ];
  return () => jobs.forEach((j) => j.stop());
}
