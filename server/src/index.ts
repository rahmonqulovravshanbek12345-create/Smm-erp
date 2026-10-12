// Kirish nuqtasi: `serve` (server) yoki boshqaruv buyruqlari (`init`, `reset-password`, …).
// Vaqt mintaqasi eng boshida o'rnatiladi — «bugun» Toshkent vaqti bo'yicha hisoblansin.
process.env.TZ ||= "Asia/Tashkent";

import { newId } from "../../src/lib/ctx";
import { todayISO } from "../../src/lib/dates";
import { buildBlank } from "../../src/lib/blank";
import { buildApp } from "./app";
import { clearFailures, credentialByLogin, LOGIN_RE, normLogin, revokeUser } from "./auth";
import { loadConfig } from "./config";
import { hashPassword, makeSealer, tempPassword } from "./crypto";
import { audit, createPool, migrate } from "./db";
import { createIntegrations } from "./integrations";
import { startJobs } from "./jobs";
import { createNotifier } from "./notifier";
import { StateStore } from "./store";

const [cmd = "serve", ...rest] = process.argv.slice(2);

async function main() {
  const cfg = loadConfig();
  const db = createPool(cfg.DATABASE_URL);
  await migrate(db);
  const store = new StateStore(db);
  await store.load();

  const say = (m: string) => process.stdout.write(`${m}\n`);
  const needCred = async (login: string) => {
    const c = await credentialByLogin(db, login);
    if (!c) throw new Error(`«${login}» logini topilmadi`);
    return c;
  };

  switch (cmd) {
    case "serve": {
      const notifier = createNotifier(store);
      const integrations = createIntegrations(store);
      const app = await buildApp({ cfg, db, store, sealer: makeSealer(cfg.SECRET_KEY), notifier, integrations });
      if (!store.ready) app.log.warn("Tizim hali sozlanmagan: `smm-erp init <login> <ism>` buyrug'ini bajaring");
      await app.listen({ host: cfg.HOST, port: cfg.PORT });
      const stopJobs = cfg.JOBS ? startJobs({ store, db, integrations, notifier, tz: cfg.TZ, log: (m, e) => app.log.error({ err: e }, m) }) : () => undefined;
      const stop = async () => {
        stopJobs();
        await app.close();
        await notifier.idle();
        await db.end();
        process.exit(0);
      };
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      return;
    }
    case "init": {
      const [login = "", ...nameParts] = rest;
      const name = nameParts.join(" ").trim() || "Administrator";
      if (store.ready) throw new Error("Tizim allaqachon sozlangan");
      if (!LOGIN_RE.test(normLogin(login))) throw new Error("Foydalanish: init <login> <Ism Familiya> (login: 3–32 lotin harf/raqam)");
      const id = newId("u");
      await store.create(buildBlank(todayISO(), { id, name }));
      const temp = tempPassword();
      await db.query("INSERT INTO credentials (user_id, login, pass_hash, must_change) VALUES ($1, $2, $3, true)", [
        id,
        normLogin(login),
        await hashPassword(temp),
      ]);
      await audit(db, { kind: "cli-init", ok: true, detail: { login: normLogin(login) } });
      say(
        `Tizim yaratildi.\n  Login: ${normLogin(login)}\n  Vaqtinchalik parol: ${temp}\nBirinchi kirishda yangi parol va ikki bosqichli kirish (Google Authenticator) so'raladi.`,
      );
      break;
    }
    case "reset-password": {
      const c = await needCred(rest[0] ?? "");
      const temp = tempPassword();
      await db.query("UPDATE credentials SET pass_hash = $2, must_change = true, updated_at = now() WHERE user_id = $1", [c.user_id, await hashPassword(temp)]);
      await clearFailures(db, c.login);
      await revokeUser(db, c.user_id);
      await audit(db, { kind: "cli-reset-password", ok: true, detail: { login: c.login } });
      say(`Yangi vaqtinchalik parol (${c.login}): ${temp}`);
      break;
    }
    case "reset-2fa": {
      const c = await needCred(rest[0] ?? "");
      await db.query("UPDATE credentials SET totp_secret = NULL, totp_pending = NULL, totp_enabled = false, updated_at = now() WHERE user_id = $1", [
        c.user_id,
      ]);
      await revokeUser(db, c.user_id);
      await audit(db, { kind: "cli-reset-2fa", ok: true, detail: { login: c.login } });
      say(`${c.login}: ikki bosqichli kirish o'chirildi — keyingi kirishda qaytadan sozlanadi`);
      break;
    }
    case "unlock": {
      const c = await needCred(rest[0] ?? "");
      await clearFailures(db, c.login);
      say(`${c.login}: blok olib tashlandi`);
      break;
    }
    case "check": {
      say(`Baza: ulandi. Holat: ${store.ready ? `bor (versiya ${store.current().version})` : "hali yaratilmagan"}`);
      break;
    }
    default:
      throw new Error(`Noma'lum buyruq: ${cmd}. Buyruqlar: serve, init, reset-password, reset-2fa, unlock, check`);
  }
  await db.end();
}

main().catch((e) => {
  process.stderr.write(`XATO: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
