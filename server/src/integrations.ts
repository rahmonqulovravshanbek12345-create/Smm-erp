// Tashqi tizimlar serverdan: Markaziy bank kursi va Meta Ads. Haqiqiy tizimda «demo» raqamlar hech qachon yozilmaydi.
import { todayISO } from "../../src/lib/dates";
import { fetchCbuRate, isMetaDemo, syncMeta, testMetaToken, type MetaResult } from "../../src/lib/integrations";
import type { StateStore } from "./store";

export interface Integrations {
  pullCbu(manual: boolean): Promise<{ ok: true; rate: number; date: string } | { ok: false; error: string }>;
  testMeta(): Promise<{ ok: true; name: string } | { ok: false; error: string }>;
  syncMeta(only?: { projectId: string; days: string[] }): Promise<{ count: number; errors: string[]; demo: boolean }>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export function createIntegrations(store: StateStore, f = { fetchCbuRate, syncMeta, testMetaToken }): Integrations {
  return {
    async pullCbu(manual) {
      const today = todayISO();
      if (!manual) {
        const cbu = store.current().state.settings.integrations.cbu;
        if (!cbu.autoUpdate || cbu.rateDate === today) return { ok: true, rate: store.current().state.settings.usdRate, date: cbu.rateDate ?? today };
      }
      try {
        const r = await f.fetchCbuRate();
        await store.runAsSystem("setUsdRate", [r.rate, r.date, "cbu"]);
        return { ok: true, rate: r.rate, date: r.date };
      } catch (e) {
        const error = msg(e);
        await store.runAsSystem("logIntegration", ["cbu", false, `${error} — kurs o'zgarmadi`]).catch(() => undefined);
        return { ok: false, error };
      }
    },

    async testMeta() {
      const { state } = store.current();
      if (isMetaDemo(state)) return { ok: false, error: "Meta tokeni kiritilmagan" };
      try {
        const name = await f.testMetaToken(state.settings.integrations.meta);
        await store.runAsSystem("logIntegration", ["meta", true, `Meta Ads: token tekshirildi (${name})`]);
        return { ok: true, name };
      } catch (e) {
        return { ok: false, error: msg(e) };
      }
    },

    async syncMeta(only) {
      const { state } = store.current();
      if (isMetaDemo(state)) return { count: 0, errors: ["Meta tokeni kiritilmagan — Integratsiyalar sahifasida kiriting"], demo: true };
      const all: MetaResult[] = await f.syncMeta(state, todayISO(), only);
      // Kabineti ulanmagan loyiha uchun soxta raqam yozilmaydi
      const results = all.map((r) => (r.demo ? { ...r, rows: [], error: "reklama kabineti ulanmagan" } : r));
      const errors = results.filter((r) => r.error).map((r) => `${state.projects.find((p) => p.id === r.projectId)?.name ?? r.projectId}: ${r.error}`);
      const res = await store.runAsSystem("applyMetaSync", [results]);
      return { count: res.value, errors, demo: false };
    },
  };
}
