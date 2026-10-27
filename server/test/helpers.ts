// Server testlari uchun: toza test bazasi, demo holat, foydalanuvchilar va so'rov yordamchilari.
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { fileURLToPath } from "node:url";
import { demoState } from "../../src/lib/test-utils";
import { buildApp } from "../src/app";
import type { Config } from "../src/config";
import { hashPassword, makeSealer } from "../src/crypto";
import { createPool, migrate, type Db } from "../src/db";
import { createIntegrations } from "../src/integrations";
import { createLeadsService, type LeadsGraph, type LeadsService } from "../src/leads";
import { createNotifier, type TelegramControl } from "../src/notifier";
import type { Probe } from "../../src/lib/telegram";
import type { GraphLead } from "../../src/lib/leads-intake";
import { StateStore } from "../src/store";

export const ORIGIN = "https://erp.test";
export const PASS = "Sinov-parol-2026";
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export interface Ctx {
  app: FastifyInstance;
  db: Db;
  store: StateStore;
  sent: { chatId: string; text: string }[];
  /** Soxta Meta Graph: `byId` — webhook uchun lid, `forms` — zaxira tekshiruvi uchun. */
  graph: { byId: Record<string, GraphLead>; forms: Record<string, GraphLead[]>; fail?: string; calls: string[] };
  leads: LeadsService;
  docs: { chatId: string; filename: string; bytes: Uint8Array; caption: string }[];
  /** Soxta Telegram boshqaruvi: `probes` — chat bo'yicha tekshiruv natijasi, `webhookError` — webhook ulashdagi xato, `calls` — chaqiruvlar. */
  tg: { probes: Record<string, Probe>; webhookError?: string; calls: string[] };
  /** Fonda ketayotgan Telegram xabarlari va tekshiruvlar tugashini kutadi. */
  idle: () => Promise<void>;
  close: () => Promise<void>;
}

let ipSeq = 1;
/** Har bir test o'z «IP manzili» bilan (so'rov cheklovlari bir-biriga xalaqit bermasin). */
export const freshIp = () => `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

export async function setup(o: { require2fa?: string; secure?: boolean; staticDir?: string; quotaMb?: number } = {}): Promise<Ctx> {
  const db = createPool(process.env.TEST_DATABASE_URL ?? "postgres://erp:erptest@127.0.0.1:55432/erp_test");
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  const secret = Buffer.alloc(32, 7).toString("base64");
  const sealer = makeSealer(secret);
  const store = new StateStore(db, { sealer });
  await store.create(demoState());
  const sent: Ctx["sent"] = [];
  const docs: Ctx["docs"] = [];
  const tg: Ctx["tg"] = { probes: {}, calls: [] };
  const control: TelegramControl = {
    probe: async (_t, chatId) => tg.probes[chatId] ?? "unknown",
    setWebhook: async (_t, url, secret) => {
      tg.calls.push(`set:${url}:${secret}`);
      return tg.webhookError ? { ok: false, error: tg.webhookError } : { ok: true };
    },
    deleteWebhook: async () => {
      tg.calls.push("delete");
      return tg.webhookError ? { ok: false, error: tg.webhookError } : { ok: true };
    },
    setMenuButton: async (_t, url) => {
      tg.calls.push(url ? `menu:${url}` : "menu:default");
      return tg.webhookError ? { ok: false, error: tg.webhookError } : { ok: true };
    },
  };
  const notifier = createNotifier(
    store,
    async (_t, chatId, text) => {
      sent.push({ chatId, text });
      // «fail» chat — Telegram yetkaza olmagan holatni sinash uchun
      return chatId !== "fail";
    },
    async (_t, chatId, filename, bytes, caption) => {
      docs.push({ chatId, filename, bytes, caption });
      return true;
    },
    control,
  );
  const graph: Ctx["graph"] = { byId: {}, forms: {}, calls: [] };
  const fakeGraph: LeadsGraph = {
    getLead: async (_t, _v, id) => {
      graph.calls.push(`lead:${id}`);
      if (graph.fail) throw new Error(graph.fail);
      const g = graph.byId[id];
      if (!g) throw new Error("Meta: lid topilmadi");
      return g;
    },
    listForms: async () => {
      if (graph.fail) throw new Error(graph.fail);
      return Object.keys(graph.forms).map((id) => ({ id }));
    },
    listFormLeads: async (_t, _v, formId, since) => {
      graph.calls.push(`since:${since}`);
      return graph.forms[formId] ?? [];
    },
    pageName: async () => "Friday Agency (test)",
  };
  const leads = createLeadsService(store, fakeGraph, undefined, (o) => notifier.deliver(o));
  const integrations = createIntegrations(store, {
    fetchCbuRate: async () => ({ rate: 12_900, date: "2026-10-07" }),
    testMetaToken: async () => "Test Business",
    syncMeta: async () => [],
  });
  const cfg: Config = {
    DATABASE_URL: "",
    HOST: "127.0.0.1",
    PORT: 0,
    APP_ORIGIN: ORIGIN,
    SECRET_KEY: secret,
    STATIC_DIR: o.staticDir ?? FIXTURES,
    COOKIE_SECURE: o.secure ?? true,
    REQUIRE_2FA_ROLES: (o.require2fa ?? "").split(",").filter(Boolean),
    TRUST_PROXY: "127.0.0.1",
    USER_DAILY_WRITE_MB: o.quotaMb ?? 5,
    RATE_LIMITS: true,
    JOBS: false,
    LOG_LEVEL: "silent",
    TZ: "Asia/Tashkent",
  };
  const app = await buildApp({ cfg, db, store, sealer, notifier, integrations, leads });
  await app.ready();
  return {
    app,
    db,
    store,
    sent,
    docs,
    tg,
    idle: () => notifier.idle(),
    graph,
    leads,
    close: async () => {
      await app.close();
      await notifier.idle();
      await leads.idle();
      await db.end();
    },
  };
}

/** Xodimga login va parol beradi (parolni almashtirish talab qilinmaydi). */
export async function giveLogin(db: Db, userId: string, login: string, password = PASS, mustChange = false) {
  await db.query(
    "INSERT INTO credentials (user_id, login, pass_hash, must_change) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET pass_hash = EXCLUDED.pass_hash, must_change = EXCLUDED.must_change",
    [userId, login, await hashPassword(password), mustChange],
  );
}

export interface Client {
  ip: string;
  cookies: Record<string, string>;
  req: (method: "GET" | "POST", url: string, body?: unknown, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
}

export function client(app: FastifyInstance, ip = freshIp()): Client {
  const c: Client = {
    ip,
    cookies: {},
    async req(method, url, body, headers = {}) {
      const res = await app.inject({
        method,
        url,
        remoteAddress: "127.0.0.1",
        headers: {
          "x-forwarded-for": ip,
          ...(method === "POST" ? { "x-erp": "1", origin: ORIGIN, "content-type": "application/json" } : {}),
          ...(Object.keys(c.cookies).length
            ? {
                cookie: Object.entries(c.cookies)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("; "),
              }
            : {}),
          ...headers,
        },
        ...(body !== undefined ? { payload: JSON.stringify(body) } : method === "POST" ? { payload: "{}" } : {}),
      });
      for (const ck of res.cookies) {
        if (ck.value === "" || (ck.maxAge !== undefined && ck.maxAge <= 0) || (ck.expires && ck.expires.getTime() < Date.now())) delete c.cookies[ck.name];
        else c.cookies[ck.name] = ck.value;
      }
      return res;
    },
  };
  return c;
}

export async function loginAs(app: FastifyInstance, login: string, password = PASS): Promise<Client> {
  const c = client(app);
  const r = await c.req("POST", "/api/auth/login", { login, password });
  if (r.statusCode !== 200) throw new Error(`login ${login}: ${r.statusCode} ${r.body}`);
  return c;
}

export const action = (c: Client, name: string, args: unknown[], ids?: string[]) => c.req("POST", "/api/action", { name, args, ...(ids ? { ids } : {}) });
