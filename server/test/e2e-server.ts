// Brauzer (e2e) testlari uchun server: demo ma'lumot + har bir xodimga login (login = xodim ID'si).
// Faqat testlarda ishlatiladi — ishlab chiqarish paketiga kirmaydi. /__test/* yo'llari faqat shu yerda.
process.env.TZ ||= "Asia/Tashkent";

import { setClockOffset, todayISO } from "../../src/lib/dates";
import { buildSeed } from "../../src/lib/seed";
import { syncAll } from "../../src/lib/store-sync";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { hashPassword, makeSealer } from "../src/crypto";
import { createPool, migrate } from "../src/db";
import { createIntegrations } from "../src/integrations";
import { createNotifier } from "../src/notifier";
import { StateStore } from "../src/store";

const PASS = "Sinov-parol-2026";

async function main() {
  const cfg = loadConfig();
  const db = createPool(cfg.DATABASE_URL);
  const sealer = makeSealer(cfg.SECRET_KEY);
  const store = new StateStore(db, { sealer });
  const sent: { chatId: string; text: string }[] = [];
  const passHash = await hashPassword(PASS);

  async function reset(offsetMs = 0) {
    setClockOffset(offsetMs);
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate(db);
    const today = todayISO();
    const s = buildSeed(today);
    syncAll(s, today);
    await store.create(s);
    for (const u of s.users) {
      await db.query("INSERT INTO credentials (user_id, login, pass_hash, must_change) VALUES ($1, $2, $3, false)", [u.id, u.id.toLowerCase(), passHash]);
    }
    sent.length = 0;
  }
  await reset();

  const notifier = createNotifier(store, async (_t, chatId, text) => {
    sent.push({ chatId, text });
    return true;
  });
  const integrations = createIntegrations(store, {
    fetchCbuRate: async () => ({ rate: 12_777.77, date: todayISO() }),
    testMetaToken: async () => "Test Business",
    syncMeta: async (s, today, only) => {
      const { syncMeta } = await import("../../src/lib/integrations");
      // Haqiqiy Meta o'rniga — demo raqamlar, lekin «demo emas» deb belgilanadi (server yo'lini sinash uchun)
      const res = await syncMeta(
        { ...s, settings: { ...s.settings, integrations: { ...s.settings.integrations, meta: { ...s.settings.integrations.meta, token: "" } } } },
        today,
        only,
      );
      return res.map((r) => ({ ...r, demo: false }));
    },
  });
  const app = await buildApp({ cfg, db, store, sealer, notifier, integrations });
  app.post("/__test/reset", async () => {
    await reset();
    return { ok: true };
  });
  app.get("/__test/sent", async () => ({ sent }));
  // Brauzer soati siljitilganda (page.clock) server «bugun»i ham shunga tenglashadi
  app.post("/__test/clock", async (req) => {
    const body = req.body as { time?: string; reseed?: boolean };
    const t = Date.parse(String(body.time ?? ""));
    const offset = Number.isFinite(t) ? t - Date.now() : 0;
    // Test boshida soat o'rnatilsa — demo kabi, ma'lumotlar o'sha sanaga nisbatan qayta quriladi
    if (body.reseed) await reset(offset);
    else {
      setClockOffset(offset);
      // Haqiqiy serverda jadval (har 30 daqiqada) bajaradigan ish: yangi davr fakturalari va ish haqi
      await store.system((s) => {
        syncAll(s, todayISO());
      });
    }
    return { ok: true, today: todayISO() };
  });
  // To'liq (saralanmagan) holat — testlar server haqiqatini tekshirishi uchun
  app.get("/__test/state", async () => store.current());
  await app.listen({ host: cfg.HOST, port: cfg.PORT });
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
