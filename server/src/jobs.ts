// Jadval bo'yicha ishlar (Toshkent vaqti): fakturalar va ish haqi hisoblash, kurs, Meta Ads, ertalabki eslatmalar, kunlik Excel (23:50).
import { Cron } from "croner";
import { newId } from "../../src/lib/ctx";
import { addDays, nowISO, todayISO } from "../../src/lib/dates";
import { syncAll } from "../../src/lib/store-sync";
import type { ErpState } from "../../src/lib/types";
import { pruneSessions } from "./auth";
import { pruneAudit, type Db } from "./db";
import type { Integrations } from "./integrations";
import type { LeadsService } from "./leads";
import type { Notifier } from "./notifier";
import { MAX_STATE_BYTES, type StateStore } from "./store";

/** Eski o'qilgan bildirishnomalar va juda eski faoliyat yozuvlari (to'liq tarix audit jurnalida qoladi). */
export function trimHistory(s: ErpState, today: string): void {
  const cutoff = addDays(today, -120);
  s.notifications = s.notifications.filter((n) => !n.read || n.at.slice(0, 10) >= cutoff).slice(0, 30_000);
  if (s.activity.length > 20_000) s.activity = s.activity.slice(0, 20_000);
}

/** Ma'lumotlar hajmi chegaraga yaqinlashsa — adminlarga kuniga bir marta ogohlantirish (tizimda va Telegram'da). */
const warnedOn = new WeakMap<StateStore, string>();
export async function warnStateSize(store: StateStore, notifier: Notifier, today: string, limitBytes = MAX_STATE_BYTES / 3): Promise<boolean> {
  if (store.bytes < limitBytes || warnedOn.get(store) === today) return false;
  warnedOn.set(store, today);
  const mb = (n: number) => Math.round(n / 1024 / 1024);
  const text = `⚠ Ma'lumotlar hajmi ${mb(store.bytes)} MB ga yetdi (chegara ${mb(MAX_STATE_BYTES)} MB). Admin → Xavfsizlik jurnalida kim ko'p ma'lumot qo'shayotganini tekshiring.`;
  const admins = store.current().state.users.filter((u) => u.role === "admin" && u.active);
  await store.system((s) => {
    for (const a of admins) s.notifications.unshift({ id: newId("ntf"), userId: a.id, text, href: "/admin", at: nowISO(), read: false, telegram: "off" });
  });
  for (const a of admins) notifier.direct(a.id, text);
  return true;
}

export function startJobs(o: {
  store: StateStore;
  db: Db;
  integrations: Integrations;
  notifier: Notifier;
  leads: LeadsService;
  tz: string;
  log: (m: string, e?: unknown) => void;
}) {
  const { store, integrations, notifier, leads, tz, log } = o;
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
        await pruneAudit(o.db);
        await warnStateSize(store, notifier, today);
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
    // Facebook Lead Ads zaxira tekshiruvi: webhook yetmay qolgan lidlarni oladi (yoqilgan bo'lsa)
    new Cron(
      "*/10 * * * *",
      { timezone: tz, protect: true },
      safe("facebook-lidlar", () => leads.poll()),
    ),
    // Kun oxirida butun ERP ma'lumoti Excel faylda adminga (Telegram)
    new Cron(
      "50 23 * * *",
      { timezone: tz, protect: true },
      safe("kunlik-excel", async () => {
        const r = await notifier.dailyExcel();
        if (r.admins && r.sent < r.admins) log(`kunlik Excel: ${r.admins} adminning ${r.sent} tasiga yetib bordi`);
      }),
    ),
  ];
  return () => jobs.forEach((j) => j.stop());
}
