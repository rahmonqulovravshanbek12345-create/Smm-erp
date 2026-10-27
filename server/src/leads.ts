// Facebook Lead Ads → CRM. Meta lid kelganda webhook yuboradi (imzosi tekshiriladi), server lid ma'lumotini Meta'dan oladi
// va CRM'ga yozadi. Webhook yo'qolsa ham lid yo'qolmasligi uchun har 10 daqiqada zaxira tekshiruvi ishlaydi.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Outgoing } from "../../src/lib/ctx";
import { mapGraphLead, type GraphLead } from "../../src/lib/leads-intake";
import { timeoutSignal } from "../../src/lib/net";
import type { StateStore } from "./store";

const FIELDS = "id,created_time,field_data,campaign_name,adset_name,ad_name,form_id,platform,is_organic";

export interface LeadsGraph {
  getLead(token: string, version: string, leadgenId: string): Promise<GraphLead>;
  listForms(token: string, version: string, pageId: string): Promise<{ id: string }[]>;
  listFormLeads(token: string, version: string, formId: string, sinceUnix: number): Promise<GraphLead[]>;
  pageName(token: string, version: string, pageId: string): Promise<string>;
}

async function call<T>(version: string, path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  let res: Response;
  try {
    res = await fetch(url, { signal: timeoutSignal(15_000) });
  } catch {
    // Xato matnida manzil (va u bilan token) bo'lmasligi uchun umumiy xabar
    throw new Error("Meta bilan aloqa o'rnatilmadi");
  }
  const body = (await res.json().catch(() => null)) as ({ error?: { message?: string } } & T) | null;
  if (!res.ok || !body) throw new Error(`Meta: ${String(body?.error?.message ?? res.status).slice(0, 200)}`);
  return body;
}

export const realGraph: LeadsGraph = {
  getLead: (token, v, id) => call<GraphLead>(v, id, token, { fields: FIELDS }),
  listForms: async (token, v, pageId) =>
    (await call<{ data?: { id: string }[] }>(v, `${pageId}/leadgen_forms`, token, { fields: "id", limit: "50" })).data ?? [],
  listFormLeads: async (token, v, formId, since) =>
    (
      await call<{ data?: GraphLead[] }>(v, `${formId}/leads`, token, {
        fields: FIELDS,
        limit: "100",
        filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]),
      })
    ).data ?? [],
  pageName: async (token, v, pageId) => String((await call<{ name?: string }>(v, pageId, token, { fields: "name" })).name ?? pageId),
};

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface LeadsService {
  /** Meta'ni ulashda: «tasdiqlash so'zi» to'g'rimi. */
  verifyTokenOk(token: string): boolean;
  /** Webhook so'rovi Meta'dan ekanini tekshiradi (HMAC-SHA256, App Secret bilan). */
  signatureOk(raw: Buffer, header: unknown): boolean;
  enabled(): boolean;
  /** Webhook yuklamasi: lidlarni fonda qayta ishlaydi (Meta tez javob kutadi). Qaytaradi: nechta lid navbatga qo'yildi. */
  handleWebhook(body: unknown): number;
  /** Zaxira tekshiruvi: oxirgi vaqtdan beri kelgan lidlar. */
  poll(): Promise<{ found: number; created: number; error?: string }>;
  test(): Promise<{ ok: true; name: string } | { ok: false; error: string }>;
  idle(): Promise<void>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export function createLeadsService(
  store: StateStore,
  graph: LeadsGraph = realGraph,
  log: (m: string, e?: unknown) => void = () => undefined,
  // Operatorga «Yangi lid» xabari Telegram'ga shu orqali ketadi
  deliver: (outbox: Outgoing[]) => void = () => undefined,
): LeadsService {
  let pending: Promise<unknown> = Promise.resolve();
  let polling = false;
  const track = (p: Promise<unknown>) => {
    pending = Promise.all([pending, p.catch(() => undefined)]);
  };
  const cfg = () => store.current().state.settings.integrations.leads;
  const version = () => store.current().state.settings.integrations.meta.apiVersion;
  const ready = () => {
    const c = cfg();
    return c.enabled && Boolean(c.pageToken && c.pageId && c.appSecret);
  };
  const ingest = async (g: GraphLead) => {
    const r = await store.runAsSystem("intakeLead", [mapGraphLead(g)]);
    deliver(r.outbox);
    return r.value;
  };

  return {
    verifyTokenOk(token) {
      const v = cfg().verifyToken;
      return Boolean(v) && safeEq(v, token);
    },
    signatureOk(raw, header) {
      const secret = cfg().appSecret;
      if (!secret || typeof header !== "string" || !header.startsWith("sha256=")) return false;
      return safeEq(createHmac("sha256", secret).update(raw).digest("hex"), header.slice(7));
    },
    enabled: ready,

    handleWebhook(body) {
      const c = cfg();
      const ids: string[] = [];
      const entries = (body as { entry?: unknown } | null)?.entry;
      for (const e of Array.isArray(entries) ? entries.slice(0, 50) : []) {
        const entry = e as { id?: unknown; changes?: unknown };
        for (const ch of Array.isArray(entry.changes) ? entry.changes.slice(0, 50) : []) {
          const change = ch as { field?: unknown; value?: { leadgen_id?: unknown; page_id?: unknown } };
          if (change.field !== "leadgen") continue;
          const id = String(change.value?.leadgen_id ?? "");
          const page = String(change.value?.page_id ?? entry.id ?? "");
          if (/^\d{5,25}$/.test(id) && page === c.pageId) ids.push(id);
        }
      }
      for (const id of ids)
        track(
          graph
            .getLead(c.pageToken, version(), id)
            .then(ingest)
            .catch((e) => log(`Facebook lid olinmadi (zaxira tekshiruvi qayta urinadi): ${msg(e)}`)),
        );
      return ids.length;
    },

    async poll() {
      if (!ready() || polling) return { found: 0, created: 0 };
      polling = true;
      const c = cfg();
      try {
        // Oxirgi MUVAFFAQIYATLI tekshiruvdan 2 soat oldindan (webhook yetmay qolgan bo'lsa), ko'pi bilan 7 kun; birinchi marta — 3 kun
        const now = Date.now();
        const from = c.lastPollAt ? Math.max(Date.parse(c.lastPollAt) - 2 * 3_600_000, now - 7 * 86_400_000) : now - 3 * 86_400_000;
        const since = Math.floor(from / 1000);
        let found = 0;
        let created = 0;
        for (const f of await graph.listForms(c.pageToken, version(), c.pageId)) {
          for (const g of await graph.listFormLeads(c.pageToken, version(), f.id, since)) {
            found++;
            if ((await ingest(g)) === "created") created++;
          }
        }
        await store.runAsSystem("markLeadsPoll", []);
        return { found, created };
      } catch (e) {
        const error = msg(e);
        await store.runAsSystem("markLeadsPoll", [error]).catch(() => undefined);
        return { found: 0, created: 0, error };
      } finally {
        polling = false;
      }
    },

    async test() {
      const c = cfg();
      if (!c.pageToken || !c.pageId) return { ok: false, error: "Sahifa ID va sahifa tokenini kiriting" };
      try {
        return { ok: true, name: await graph.pageName(c.pageToken, version(), c.pageId) };
      } catch (e) {
        return { ok: false, error: msg(e) };
      }
    },
    idle: () => pending.then(() => undefined),
  };
}
