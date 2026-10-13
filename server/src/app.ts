// HTTP server: kirish, holat, amallar, integratsiyalar va admin. Har bir so'rov: sessiya → huquq → argumentlar → amal.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from "fastify";
import { renderSVG } from "uqr";
import { z } from "zod";
import { denyReason } from "../../src/lib/action-rules";
import { BRAND } from "../../src/lib/brand";
import { canEdit } from "../../src/lib/permissions";
import { redactFor, withoutSecrets } from "../../src/lib/redact";
import { ACTIONS, type ActionName } from "../../src/lib/registry";
import type { ErpState, User } from "../../src/lib/types";
import {
  LOGIN_RE,
  checkPassword,
  checkTotp,
  clearFailures,
  isTrustedDevice,
  trustDevice,
  createSession,
  credentialByLogin,
  credentialByUser,
  deleteSession,
  getSession,
  lockedFor,
  withLoginLock,
  normLogin,
  recordFailure,
  recordTotpFailure,
  rememberDevice,
  revokeUser,
  sessionLife,
  type Credential,
  type Session,
} from "./auth";
import type { Config } from "./config";
import { hashPassword, newToken, newTotpSecret, otpauthUri, passwordProblem, tempPassword, verifyPassword, type Sealer } from "./crypto";
import { audit, type Db } from "./db";
import type { Integrations } from "./integrations";
import type { Notifier } from "./notifier";
import { parseArgs } from "./schemas";
import { QuotaError, UserError, type StateStore } from "./store";

export interface Deps {
  cfg: Config;
  db: Db;
  store: StateStore;
  sealer: Sealer;
  notifier: Notifier;
  integrations: Integrations;
}

interface AuthInfo {
  sess: Session;
  user: User;
  cred: Credential;
  /** Parolni almashtirish yoki 2FA'ni yoqish talab qilinadi — boshqa ishlar yopiq. */
  blocked: "password" | "2fa" | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthInfo;
  }
}

const ISSUER = BRAND;

/** index.html ichidagi skriptlar xeshi — CSP faqat aynan shu skriptlarga ruxsat beradi (begona skript ishlamaydi). */
function scriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(m[0].slice(0, m[0].indexOf(">")))) continue;
    out.push(`'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`);
  }
  return out;
}

const httpError = (reply: FastifyReply, code: number, error: string, extra: Record<string, unknown> = {}) => reply.code(code).send({ error, ...extra });

export async function buildApp(d: Deps) {
  const { cfg, db, store, sealer } = d;
  const secure = cfg.COOKIE_SECURE;
  const SID = secure ? "__Host-erp" : "erp_sid";
  const DID = secure ? "__Host-erpd" : "erp_did";
  const html = readFileSync(join(cfg.STATIC_DIR, "index.html"), "utf8");
  const htmlEtag = `"${createHash("sha256").update(html).digest("base64url").slice(0, 27)}"`;

  const app = Fastify({
    logger: cfg.LOG_LEVEL === "silent" ? false : { level: cfg.LOG_LEVEL, redact: ["req.headers.cookie", "req.headers.authorization"] },
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    logController: new LogController({ disableRequestLogging: cfg.LOG_LEVEL !== "debug" && cfg.LOG_LEVEL !== "trace" }),
    return503OnClosing: true,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...scriptHashes(html)],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Shrift sahifaning ichida (data:) — tashqi shrift serverlariga so'rov ketmaydi
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(secure ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: secure ? { maxAge: 31_536_000, includeSubDomains: false } : false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
  });
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    if (!reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
  });
  await app.register(rateLimit, {
    global: cfg.RATE_LIMITS,
    max: 600,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: `Juda ko'p so'rov — ${Math.ceil(ctx.ttl / 1000)} soniyadan keyin urinib ko'ring` }),
  });

  /** Yo'l bo'yicha so'rov cheklovi (faqat avtomatik testlarda o'chiriladi). */
  const rl = (max: number, timeWindow: string) => ({ config: { rateLimit: cfg.RATE_LIMITS ? { max, timeWindow } : false } });

  // ---------- Umumiy himoya ----------

  // Boshqa saytdan buyruq yuborishning oldini olish (CSRF): o'zgartiruvchi so'rov faqat shu saytdan va maxsus sarlavha bilan
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "GET" || req.method === "HEAD") return;
    const origin = req.headers.origin;
    if (req.headers["x-erp"] !== "1" || (origin !== undefined && origin !== cfg.APP_ORIGIN)) {
      return httpError(reply, 403, "So'rov rad etildi");
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err.statusCode === 429) return reply.code(429).send(err);
    if (err.statusCode && err.statusCode < 500) return httpError(reply, err.statusCode, "So'rov noto'g'ri");
    req.log.error({ err }, "ichki xato");
    return httpError(reply, 500, "Ichki xatolik — keyinroq urinib ko'ring");
  });
  app.setNotFoundHandler((_req, reply) => httpError(reply, 404, "Topilmadi"));

  const ipOf = (req: FastifyRequest) => req.ip ?? "";
  const uaOf = (req: FastifyRequest) => String(req.headers["user-agent"] ?? "").slice(0, 300);
  const cookieOpts = (maxAgeDays: number) => ({ path: "/", httpOnly: true, secure, sameSite: "strict" as const, maxAge: maxAgeDays * 86_400 });
  const setSession = (reply: FastifyReply, token: string, days: number) => reply.setCookie(SID, token, cookieOpts(days));
  /** To'liq sessiya: muddati rolga qarab. */
  const fullSession = async (req: FastifyRequest, reply: FastifyReply, user: User) => {
    const life = sessionLife(user.role);
    setSession(reply, await createSession(db, user.id, "full", ipOf(req), uaOf(req), life), life.days);
  };
  const deviceOf = (req: FastifyRequest, reply: FastifyReply) => {
    let dev = req.cookies[DID];
    if (!dev || !/^[A-Za-z0-9_-]{20,64}$/.test(dev)) {
      dev = newToken();
      reply.setCookie(DID, dev, cookieOpts(400));
      req.cookies[DID] = dev; // shu so'rov ichida qayta chaqirilsa, bir xil qiymat qaytsin
    }
    return dev;
  };

  const needs2fa = (u: User) => cfg.REQUIRE_2FA_ROLES.includes(u.role);
  const userIn = (s: ErpState, id: string) => s.users.find((u) => u.id === id);

  /** Sessiyani tekshiradi. `allowBlocked` — parolni almashtirish/2FA sozlash sahifalari uchun. */
  /** `init` server ishlab turganda bajarilsa — holat bazadan o'qiladi (qayta ishga tushirish shart emas). */
  const ensureReady = async () => {
    if (!store.ready) await store.load().catch(() => false);
    return store.ready;
  };

  async function authenticate(req: FastifyRequest, reply: FastifyReply, o: { allowBlocked?: boolean } = {}): Promise<AuthInfo | null> {
    if (!(await ensureReady())) {
      httpError(reply, 503, "Tizim hali sozlanmagan");
      return null;
    }
    const sess = await getSession(db, req.cookies[SID]);
    const user = sess ? userIn(store.current().state, sess.user_id) : undefined;
    const cred = sess && user ? await credentialByUser(db, user.id) : null;
    if (!sess || sess.stage !== "full" || !user?.active || !cred) {
      if (sess && (!user?.active || !cred)) await revokeUser(db, sess.user_id);
      httpError(reply, 401, "Tizimga kiring");
      return null;
    }
    // Muddat joriy rol bo'yicha (rol o'zgarsa yoki sessiya eski qoidalar bilan ochilgan bo'lsa ham)
    const life = sessionLife(user.role);
    const now = Date.now();
    if (now - sess.created_at.getTime() > life.days * 86_400_000 || now - sess.last_seen.getTime() > life.idleMinutes * 60_000) {
      await deleteSession(db, sess.id);
      httpError(reply, 401, "Sessiya muddati tugadi — qaytadan kiring");
      return null;
    }
    const blocked: AuthInfo["blocked"] = cred.must_change ? "password" : needs2fa(user) && !cred.totp_enabled ? "2fa" : null;
    if (blocked && !o.allowBlocked) {
      httpError(reply, 403, blocked === "password" ? "Avval parolni almashtiring" : "Avval ikki bosqichli kirishni yoqing", { blocked });
      return null;
    }
    const info = { sess, user, cred, blocked };
    req.auth = info;
    return info;
  }

  const meInfo = (a: AuthInfo) => ({
    user: { id: a.user.id, name: a.user.name, role: a.user.role },
    login: a.cred.login,
    blocked: a.blocked,
    has2fa: a.cred.totp_enabled,
    require2fa: needs2fa(a.user),
  });

  /** Kirish muvaffaqiyatli bo'lganda: yangi qurilma bo'lsa — xodimning Telegram'iga ogohlantirish. */
  async function afterLogin(req: FastifyRequest, reply: FastifyReply, user: User, cred: Credential) {
    await clearFailures(db, cred.login, ipOf(req));
    await db.query("UPDATE credentials SET last_login_at = now() WHERE user_id = $1", [user.id]);
    const fresh = await rememberDevice(db, user.id, deviceOf(req, reply));
    await audit(db, { userId: user.id, ip: ipOf(req), kind: "login", ok: true, detail: { newDevice: fresh, ua: uaOf(req) } });
    if (fresh && cred.last_login_at) {
      const when = new Date().toLocaleString("uz-UZ", { timeZone: cfg.TZ });
      d.notifier.direct(
        user.id,
        `🔐 Akkauntingizga yangi qurilmadan kirildi\n${when}, IP ${ipOf(req)}\n${uaOf(req).slice(0, 120)}\n\nSiz bo'lmasangiz — darhol parolni almashtiring va adminga xabar bering.`,
      );
    }
  }

  // ---------- Kirish ----------

  const LoginBody = z.strictObject({ login: z.string().max(64), password: z.string().max(200) });

  app.post("/api/auth/login", rl(30, "5 minutes"), async (req, reply) => {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) return httpError(reply, 400, "Login va parolni kiriting");
    if (!(await ensureReady())) return httpError(reply, 503, "Tizim hali sozlanmagan");
    const login = normLogin(body.data.login);
    // Jurnalga faqat mavjud login yoziladi: xodim adashib login maydoniga parolini yozsa, u jurnalga tushmasin
    const shown = async () => ((await credentialByLogin(db, login)) ? login.slice(0, 64) : "(mavjud emas)");
    const fail = async (reason: string) => {
      await recordFailure(db, login, ipOf(req));
      await audit(db, { ip: ipOf(req), kind: "login", ok: false, detail: { login: await shown(), reason } });
      return httpError(reply, 401, "Login yoki parol noto'g'ri");
    };
    return withLoginLock(login, async () => {
      const wait = await lockedFor(db, login, ipOf(req));
      if (wait > 0) {
        await audit(db, { ip: ipOf(req), kind: "login", ok: false, detail: { login: await shown(), reason: "locked" } });
        return httpError(reply, 429, `Juda ko'p noto'g'ri urinish — ${wait} daqiqadan keyin qayta urinib ko'ring`);
      }
      const cred = await checkPassword(db, login, body.data.password);
      if (!cred) return fail("password");
      const user = userIn(store.current().state, cred.user_id);
      if (!user?.active) return fail("inactive");
      if (cred.totp_enabled && (await isTrustedDevice(db, user.id, req.cookies[DID]))) {
        // Ishonchli qurilma (xodim shu qurilmada 30 kun ichida kod kiritib «eslab qol» belgilagan) — faqat parol yetadi
        await fullSession(req, reply, user);
        await afterLogin(req, reply, user, cred);
        return { ok: true };
      }
      if (cred.totp_enabled) {
        // Parol to'g'ri, lekin hali 2FA kodi kerak — 5 daqiqalik oraliq sessiya.
        // Xato hisoblagichlari bu yerda TOZALANMAYDI: aks holda parolni bilgan odam qayta kirib, kodlarni cheksiz tanlardi.
        setSession(reply, await createSession(db, user.id, "totp", ipOf(req), uaOf(req)), 1);
        return { need2fa: true };
      }
      await fullSession(req, reply, user);
      await afterLogin(req, reply, user, cred);
      return { ok: true };
    });
  });

  app.post("/api/auth/totp", rl(30, "5 minutes"), async (req, reply) => {
    const body = z.strictObject({ code: z.string().max(12), remember: z.boolean().optional() }).safeParse(req.body);
    const sess = await getSession(db, req.cookies[SID]);
    if (!sess || sess.stage !== "totp") return httpError(reply, 401, "Qaytadan kiring");
    const cred = await credentialByUser(db, sess.user_id);
    const user = userIn(store.current().state, sess.user_id);
    if (!cred || !user?.active) return httpError(reply, 401, "Qaytadan kiring");
    return withLoginLock(cred.login, async () => {
      if (await lockedFor(db, cred.login, ipOf(req))) return httpError(reply, 429, "Juda ko'p noto'g'ri urinish — keyinroq urinib ko'ring");
      if (!body.success || !(await checkTotp(db, sealer, cred, body.data.code))) {
        await recordFailure(db, cred.login, ipOf(req));
        await recordTotpFailure(db, cred.login);
        await audit(db, { userId: user.id, ip: ipOf(req), kind: "login-2fa", ok: false });
        return httpError(reply, 401, "Kod noto'g'ri");
      }
      // Oraliq sessiya o'rniga yangi to'liq sessiya (sessiya ID'si almashtiriladi)
      await deleteSession(db, sess.id);
      if (body.success && body.data.remember) await trustDevice(db, user.id, deviceOf(req, reply));
      await fullSession(req, reply, user);
      await afterLogin(req, reply, user, cred);
      return { ok: true };
    });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const sess = await getSession(db, req.cookies[SID]);
    if (sess) {
      await deleteSession(db, sess.id);
      await audit(db, { userId: sess.user_id, ip: ipOf(req), kind: "logout", ok: true });
    }
    // __Host- cookie faqat Secure belgisi bilan o'chadi — o'rnatilgandagi bilan bir xil sozlamalar
    reply.clearCookie(SID, { path: "/", httpOnly: true, secure, sameSite: "strict" });
    return { ok: true };
  });

  app.get("/api/me", async (req, reply) => {
    // Kirilmagan bo'lsa — xato emas, oddiy javob (brauzer konsolida «401» shovqini bo'lmasin)
    if ((await ensureReady()) && !(await getSession(db, req.cookies[SID], false))) return { user: null };
    const a = await authenticate(req, reply, { allowBlocked: true });
    if (!a) return;
    return meInfo(a);
  });

  app.post("/api/auth/password", rl(30, "5 minutes"), async (req, reply) => {
    const a = await authenticate(req, reply, { allowBlocked: true });
    if (!a) return;
    const body = z.strictObject({ current: z.string().max(200), next: z.string().max(200) }).safeParse(req.body);
    if (!body.success) return httpError(reply, 400, "Parollarni kiriting");
    // O'g'irlangan sessiya bilan joriy parolni tanlab bo'lmasin — kirishdagi blok bu yerda ham amal qiladi
    const refused = await withLoginLock(a.cred.login, async () => {
      const wait = await lockedFor(db, a.cred.login, ipOf(req));
      if (wait > 0) return httpError(reply, 429, `Juda ko'p noto'g'ri urinish — ${wait} daqiqadan keyin qayta urinib ko'ring`);
      if (!(await verifyPassword(body.data.current, a.cred.pass_hash))) {
        await recordFailure(db, a.cred.login, ipOf(req));
        await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "password-change", ok: false });
        return httpError(reply, 400, "Joriy parol noto'g'ri");
      }
      return null;
    });
    if (refused) return refused;
    const problem = passwordProblem(body.data.next, a.cred.login);
    if (problem) return httpError(reply, 400, problem);
    if (body.data.next === body.data.current) return httpError(reply, 400, "Yangi parol eskisidan farq qilsin");
    await db.query("UPDATE credentials SET pass_hash = $2, must_change = false, updated_at = now() WHERE user_id = $1", [
      a.user.id,
      await hashPassword(body.data.next),
    ]);
    // Boshqa qurilmalardagi sessiyalar yopiladi
    await revokeUser(db, a.user.id, a.sess.id);
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "password-change", ok: true });
    return { ok: true };
  });

  // ---------- 2FA ----------

  app.post("/api/auth/2fa/setup", async (req, reply) => {
    const a = await authenticate(req, reply, { allowBlocked: true });
    if (!a) return;
    if (a.blocked === "password") return httpError(reply, 403, "Avval parolni almashtiring", { blocked: "password" });
    if (a.cred.totp_enabled) return httpError(reply, 400, "Ikki bosqichli kirish allaqachon yoqilgan");
    const secret = newTotpSecret();
    await db.query("UPDATE credentials SET totp_pending = $2 WHERE user_id = $1", [a.user.id, sealer.seal(secret)]);
    const uri = otpauthUri(secret, a.cred.login, ISSUER);
    return { secret, uri, svg: renderSVG(uri, { border: 2 }) };
  });

  app.post("/api/auth/2fa/enable", rl(30, "5 minutes"), async (req, reply) => {
    const a = await authenticate(req, reply, { allowBlocked: true });
    if (!a) return;
    const body = z.strictObject({ code: z.string().max(12) }).safeParse(req.body);
    if (!body.success || !a.cred.totp_pending || !(await checkTotp(db, sealer, a.cred, body.data.code, true))) {
      await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "2fa-enable", ok: false });
      return httpError(reply, 400, "Kod noto'g'ri — ilovadagi yangi kodni kiriting");
    }
    await db.query("UPDATE credentials SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = true, updated_at = now() WHERE user_id = $1", [
      a.user.id,
    ]);
    await revokeUser(db, a.user.id, a.sess.id);
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "2fa-enable", ok: true });
    return { ok: true };
  });

  app.post("/api/auth/2fa/disable", rl(10, "5 minutes"), async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    if (needs2fa(a.user)) return httpError(reply, 400, "Sizning rolingiz uchun ikki bosqichli kirish majburiy");
    const refused = await withLoginLock(a.cred.login, async () => {
      const wait = await lockedFor(db, a.cred.login, ipOf(req));
      if (wait > 0) return httpError(reply, 429, `Juda ko'p noto'g'ri urinish — ${wait} daqiqadan keyin qayta urinib ko'ring`);
      const body = z.strictObject({ password: z.string().max(200), code: z.string().max(12) }).safeParse(req.body);
      if (!body.success || !(await verifyPassword(body.data.password, a.cred.pass_hash)) || !(await checkTotp(db, sealer, a.cred, body.data.code))) {
        await recordFailure(db, a.cred.login, ipOf(req));
        return httpError(reply, 400, "Parol yoki kod noto'g'ri");
      }
      return null;
    });
    if (refused) return refused;
    await db.query("UPDATE credentials SET totp_secret = NULL, totp_enabled = false, updated_at = now() WHERE user_id = $1", [a.user.id]);
    await db.query("DELETE FROM trusted_devices WHERE user_id = $1", [a.user.id]);
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "2fa-disable", ok: true });
    return { ok: true };
  });

  // ---------- Holat va amallar ----------

  app.get("/api/state", async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    const { state, version } = store.current();
    const have = Number((req.query as { v?: string }).v);
    if (have === version) return reply.code(204).send();
    return { version, state: redactFor(state, a.user) };
  });

  const ActionBody = z.strictObject({
    name: z.string().max(64),
    args: z.array(z.unknown()).max(10),
    ids: z.array(z.string().max(40)).max(500).optional(),
  });

  // Cheklov har bir sessiyaga (ofisda hamma bitta IP'dan chiqadi): bir xodim boshqalarni sekinlashtira olmasin
  const actionLimit = cfg.RATE_LIMITS
    ? { config: { rateLimit: { max: 120, timeWindow: "1 minute", keyGenerator: (req: FastifyRequest) => req.cookies[SID] ?? req.ip } } }
    : rl(0, "");
  app.post("/api/action", actionLimit, async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    const body = ActionBody.safeParse(req.body);
    if (!body.success || !Object.hasOwn(ACTIONS, body.data.name)) return httpError(reply, 400, "Noma'lum amal");
    const name = body.data.name as ActionName;
    // JSON'da undefined → null bo'ladi: yuqori darajadagi null — «berilmagan» argument
    const parsed = parseArgs(
      name,
      body.data.args.map((x) => (x === null ? undefined : x)),
    );
    if (!parsed.ok) {
      await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "action", action: name, ok: false, detail: { error: parsed.error } });
      return httpError(reply, 400, parsed.error);
    }
    try {
      const r = await store.run(name, parsed.args, a.user.id, {
        ids: body.data.ids,
        check: (me, s) => denyReason(name, me, s, parsed.args),
        quotaBytes: a.user.role === "admin" ? undefined : cfg.USER_DAILY_WRITE_MB * 1024 * 1024,
      });
      await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "action", action: name, ok: true, version: r.version, detail: auditArgs(name, parsed.args) });
      d.notifier.deliver(r.outbox);
      // Arxivlangan xodim darhol tizimdan chiqariladi
      if (name === "archiveUser") await revokeUser(db, String(parsed.args[0]));
      const me = r.state.users.find((u) => u.id === a.user.id)!;
      return { ok: true, value: r.value ?? null, version: r.version, state: redactFor(r.state, me) };
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "action", action: name, ok: false, detail: { error: e.message } });
      const code = e instanceof QuotaError ? 429 : e.message === "Bu amal uchun ruxsatingiz yo'q" || e.message.startsWith("Bu amal serverli") ? 403 : 422;
      return httpError(reply, code, e.message);
    }
  });

  // ---------- Integratsiyalar (tarmoq so'rovlari faqat serverdan, tokenlar bilan) ----------

  const integrationsEdit = (u: User) => canEdit(u.role, "integrations");

  app.post("/api/integrations/cbu/pull", async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    if (!integrationsEdit(a.user)) return httpError(reply, 403, "Bu amal uchun ruxsatingiz yo'q");
    const r = await d.integrations.pullCbu(true);
    if (!r.ok) return httpError(reply, 502, r.error);
    return { ok: true, rate: r.rate, date: r.date };
  });

  app.post("/api/integrations/meta/test", async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    if (!integrationsEdit(a.user)) return httpError(reply, 403, "Bu amal uchun ruxsatingiz yo'q");
    const r = await d.integrations.testMeta();
    if (!r.ok) return httpError(reply, 502, r.error);
    return { ok: true, name: r.name };
  });

  const MetaSyncBody = z.strictObject({
    projectId: z.string().max(64).optional(),
    days: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .max(31)
      .optional(),
  });

  app.post("/api/integrations/meta/sync", rl(20, "1 minute"), async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    const body = MetaSyncBody.safeParse(req.body ?? {});
    if (!body.success) return httpError(reply, 400, "So'rov noto'g'ri");
    const { projectId, days } = body.data;
    const p = projectId ? store.current().state.projects.find((x) => x.id === projectId) : undefined;
    const allowed = integrationsEdit(a.user) || (p !== undefined && a.user.role === "targetolog" && p.targetologId === a.user.id);
    if (!allowed || (projectId && !p) || Boolean(projectId) !== Boolean(days)) return httpError(reply, 403, "Bu amal uchun ruxsatingiz yo'q");
    const r = await d.integrations.syncMeta(projectId && days ? { projectId, days } : undefined);
    const me = store.current().state.users.find((u) => u.id === a.user.id)!;
    return { ok: true, count: r.count, errors: r.errors, demo: r.demo, version: store.current().version, state: redactFor(store.current().state, me) };
  });

  app.post("/api/integrations/telegram/test", rl(5, "1 minute"), async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    if (a.user.role !== "admin") return httpError(reply, 403, "Bu amal uchun ruxsatingiz yo'q");
    const ok = await d.notifier.test(a.user.id);
    if (!ok) return httpError(reply, 502, "Xabar ketmadi — token, chat ID va botga /start bosilganini tekshiring");
    return { ok: true };
  });

  app.post("/api/integrations/telegram/digest", rl(5, "1 minute"), async (req, reply) => {
    const a = await authenticate(req, reply);
    if (!a) return;
    if (a.user.role !== "admin") return httpError(reply, 403, "Bu amal uchun ruxsatingiz yo'q");
    return { ok: true, sent: d.notifier.digest() };
  });

  // ---------- Admin: kirish ma'lumotlari ----------

  const adminOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    const a = await authenticate(req, reply);
    if (!a) return null;
    if (a.user.role !== "admin") {
      httpError(reply, 403, "Bu amal uchun ruxsatingiz yo'q");
      return null;
    }
    return a;
  };

  app.get("/api/admin/logins", async (req, reply) => {
    if (!(await adminOnly(req, reply))) return;
    const { rows } = await db.query<{
      user_id: string;
      login: string;
      must_change: boolean;
      totp_enabled: boolean;
      last_login_at: Date | null;
      sessions: string;
      locked_until: Date | null;
    }>(
      `SELECT c.user_id, c.login, c.must_change, c.totp_enabled, c.last_login_at,
              (SELECT count(*) FROM sessions s WHERE s.user_id = c.user_id AND s.stage = 'full') AS sessions,
              (SELECT max(locked_until) FROM login_attempts l WHERE split_part(l.login, '|', 1) = c.login) AS locked_until
         FROM credentials c`,
    );
    return {
      logins: rows.map((r) => ({
        userId: r.user_id,
        login: r.login,
        mustChange: r.must_change,
        has2fa: r.totp_enabled,
        lastLoginAt: r.last_login_at?.toISOString() ?? null,
        sessions: Number(r.sessions),
        locked: Boolean(r.locked_until && r.locked_until.getTime() > Date.now()),
      })),
    };
  });

  app.post("/api/admin/credentials", rl(30, "1 minute"), async (req, reply) => {
    const a = await adminOnly(req, reply);
    if (!a) return;
    const body = z.strictObject({ userId: z.string().max(64), login: z.string().max(64) }).safeParse(req.body);
    if (!body.success) return httpError(reply, 400, "Ma'lumot noto'g'ri");
    const login = normLogin(body.data.login);
    if (!LOGIN_RE.test(login)) return httpError(reply, 400, "Login 3–32 belgi: lotin harflari, raqam, nuqta, chiziqcha");
    const user = userIn(store.current().state, body.data.userId);
    if (!user?.active) return httpError(reply, 404, "Faol xodim topilmadi");
    const taken = await credentialByLogin(db, login);
    if (taken && taken.user_id !== user.id) return httpError(reply, 409, "Bu login band — boshqasini tanlang");
    const temp = tempPassword();
    await db.query(
      `INSERT INTO credentials (user_id, login, pass_hash, must_change) VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id) DO UPDATE SET login = EXCLUDED.login, pass_hash = EXCLUDED.pass_hash, must_change = true, updated_at = now()`,
      [user.id, login, await hashPassword(temp)],
    );
    await clearFailures(db, login);
    await revokeUser(db, user.id);
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "admin-credentials", ok: true, detail: { target: user.id, login } });
    return { ok: true, login, tempPassword: temp };
  });

  /** Loginni almashtirish: parol, 2FA va xodimning kiritgan ma'lumotlari o'zgarmaydi (ular xodim ID'siga bog'langan). */
  app.post("/api/admin/rename-login", rl(30, "1 minute"), async (req, reply) => {
    const a = await adminOnly(req, reply);
    if (!a) return;
    const body = z.strictObject({ userId: z.string().max(64), login: z.string().max(64) }).safeParse(req.body);
    if (!body.success) return httpError(reply, 400, "Ma'lumot noto'g'ri");
    const login = normLogin(body.data.login);
    if (!LOGIN_RE.test(login)) return httpError(reply, 400, "Login 3–32 belgi: lotin harflari, raqam, nuqta, chiziqcha");
    const cred = await credentialByUser(db, body.data.userId);
    if (!cred) return httpError(reply, 404, "Bu xodimda hali login yo'q — avval login bering");
    if (cred.login === login) return httpError(reply, 400, "Yangi login eskisi bilan bir xil");
    const taken = await credentialByLogin(db, login);
    if (taken) return httpError(reply, 409, "Bu login band — boshqasini tanlang");
    await withLoginLock(cred.login, async () => {
      await db.query("UPDATE credentials SET login = $2, updated_at = now() WHERE user_id = $1", [cred.user_id, login]);
      await clearFailures(db, cred.login);
      await clearFailures(db, login);
      // Eski login bilan ochilgan sessiyalar va ishonchli qurilmalar yopiladi (adminning o'z sessiyasi qoladi)
      await revokeUser(db, cred.user_id, cred.user_id === a.user.id ? a.sess.id : undefined);
    });
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "admin-rename-login", ok: true, detail: { target: cred.user_id, from: cred.login, to: login } });
    return { ok: true, login };
  });

  app.post("/api/admin/reset-2fa", async (req, reply) => {
    const a = await adminOnly(req, reply);
    if (!a) return;
    const body = z.strictObject({ userId: z.string().max(64) }).safeParse(req.body);
    if (!body.success || body.data.userId === a.user.id) return httpError(reply, 400, "Ma'lumot noto'g'ri");
    await db.query("UPDATE credentials SET totp_secret = NULL, totp_pending = NULL, totp_enabled = false, updated_at = now() WHERE user_id = $1", [
      body.data.userId,
    ]);
    await revokeUser(db, body.data.userId);
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "admin-reset-2fa", ok: true, detail: { target: body.data.userId } });
    return { ok: true };
  });

  app.post("/api/admin/logout-user", async (req, reply) => {
    const a = await adminOnly(req, reply);
    if (!a) return;
    const body = z.strictObject({ userId: z.string().max(64) }).safeParse(req.body);
    if (!body.success) return httpError(reply, 400, "Ma'lumot noto'g'ri");
    const n = await revokeUser(db, body.data.userId, body.data.userId === a.user.id ? a.sess.id : undefined);
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "admin-logout-user", ok: true, detail: { target: body.data.userId, sessions: n } });
    return { ok: true, sessions: n };
  });

  app.get("/api/admin/export", async (req, reply) => {
    const a = await adminOnly(req, reply);
    if (!a) return;
    const { state, version } = store.current();
    await audit(db, { userId: a.user.id, ip: ipOf(req), kind: "admin-export", ok: true, version });
    const date = new Date().toISOString().slice(0, 10);
    reply.header("Content-Disposition", `attachment; filename="erp-zaxira-${date}.json"`);
    reply.type("application/json; charset=utf-8");
    return JSON.stringify({ exportedAt: new Date().toISOString(), version, state: withoutSecrets(state) });
  });

  app.get("/api/admin/audit", async (req, reply) => {
    if (!(await adminOnly(req, reply))) return;
    const q = z.object({ before: z.coerce.number().int().positive().optional() }).safeParse(req.query);
    const before = q.success ? q.data.before : undefined;
    const { rows } = await db.query(
      `SELECT id, at, user_id, ip, kind, action, ok, detail FROM audit_log WHERE ($1::bigint IS NULL OR id < $1) ORDER BY id DESC LIMIT 200`,
      [before ?? null],
    );
    return { rows };
  });

  // ---------- Sahifa ----------

  app.get("/", async (req, reply) => {
    reply.header("Cache-Control", "no-cache").header("ETag", htmlEtag).type("text/html; charset=utf-8");
    if (req.headers["if-none-match"] === htmlEtag) return reply.code(304).send();
    return html;
  });
  for (const f of ["apple-touch-icon.png", "fd-touch-icon.png", "og.jpg"]) {
    let buf: Buffer | null = null;
    try {
      buf = readFileSync(join(cfg.STATIC_DIR, f));
    } catch {
      buf = null;
    }
    if (buf) {
      const body = buf;
      app.get(`/${f}`, async (_req, reply) =>
        reply
          .header("Cache-Control", "public, max-age=86400")
          .type(f.endsWith(".png") ? "image/png" : "image/jpeg")
          .send(body),
      );
    }
  }
  app.get("/healthz", async () => ({ ok: store.ready }));

  return app;
}

/** Audit jurnaliga yoziladigan argumentlar: maxfiy qiymatlar va katta matnlar yozilmaydi. */
function auditArgs(name: ActionName, args: unknown[]): unknown {
  if (name === "setTelegramToken" || name === "saveMetaSettings") return { args: "(yashirin)" };
  const s = JSON.stringify(args);
  return s.length > 4000 ? { args: `${s.slice(0, 4000)}…` } : { args };
}
