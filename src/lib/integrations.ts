// Tashqi integratsiyalar: Meta Marketing API (kunlik target hisobotlari) va Markaziy bank kursi.
// Demo'da so'rovlar brauzerdan yuboriladi; haqiqiy tizimda server har kuni ertalab o'zi bajaradi.
import { addDays, diffDays } from "./dates";
import type { ErpState, Integrations, Project, TargetReport } from "./types";

export type MetaRow = Omit<TargetReport, "id" | "authorId">;

export interface MetaResult {
  projectId: string;
  rows: MetaRow[];
  demo: boolean;
  error?: string;
}

const LEAD_ACTIONS: Record<Integrations["meta"]["leadMetric"], string[]> = {
  forms: ["lead"],
  messages: ["onsite_conversion.messaging_conversation_started_7d"],
  all: ["lead", "onsite_conversion.messaging_conversation_started_7d"],
};

export const LEAD_METRIC_LABELS: Record<Integrations["meta"]["leadMetric"], string> = {
  all: "Lid forma + Direct/Messenger xabarlar",
  forms: "Faqat lid forma",
  messages: "Faqat yozilgan xabarlar",
};

export const metaAccountOf = (s: ErpState, projectId: string) => s.settings.integrations.meta.accounts[projectId]?.trim() || "";
export const isMetaDemo = (s: ErpState) => !s.settings.integrations.meta.token.trim();

/** Reklama yoqilgan, lekin hisoboti yo'q kunlar (eng ko'pi bilan oxirgi `maxDays` kun, kechagacha). */
export function metaMissingDays(s: ErpState, p: Project, today: string, maxDays = 7): string[] {
  if (!p.periodStart || p.status !== "active") return [];
  const from = [addDays(today, -maxDays), p.periodStart].sort().pop()!;
  const have = new Set(s.targetReports.filter((r) => r.projectId === p.id).map((r) => r.date));
  const out: string[] = [];
  for (let d = from; d < today; d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
}

/** Demo rejim: loyiha byudjetiga mos, har safar bir xil chiqadigan namunaviy raqamlar. */
export function demoMetaRow(s: ErpState, p: Project, date: string): MetaRow {
  const seed = [...(p.id + date)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const r = (k: number) => ((seed >>> k) % 1000) / 1000;
  const budgetUsd = p.adBudgetUsd ?? 300;
  const spend = Math.round((((budgetUsd * s.settings.usdRate * 0.95) / 30) * (0.82 + r(1) * 0.36)) / 1000) * 1000;
  const views = Math.round(spend / (11 + r(3) * 3));
  const clicks = Math.round(views * (0.016 + r(5) * 0.006));
  const learn = 1 + 0.4 * Math.min(1, diffDays(date, p.periodStart ?? date) / 150);
  return { projectId: p.id, date, spend, views, clicks, leads: Math.round(clicks * (0.035 + r(7) * 0.02) * learn), note: "Meta Ads (demo)", source: "meta" };
}

interface InsightRow {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  account_currency?: string;
  actions?: { action_type: string; value: string }[];
}

async function getJson(url: string): Promise<{ data?: InsightRow[]; paging?: { next?: string }; name?: string; error?: { message: string } }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Meta serveriga ulanib bo'lmadi (internet yoki brauzer cheklovi)");
  }
  const j = (await res.json().catch(() => ({}))) as { error?: { message: string } };
  if (!res.ok || j.error) throw new Error(j.error?.message ?? `Meta xatosi: HTTP ${res.status}`);
  return j;
}

/** Token to'g'riligini tekshirish: foydalanuvchi yoki tizim foydalanuvchisi nomini qaytaradi. */
export async function testMetaToken(cfg: Integrations["meta"]): Promise<string> {
  const j = await getJson(`https://graph.facebook.com/${cfg.apiVersion}/me?fields=name&access_token=${encodeURIComponent(cfg.token.trim())}`);
  return j.name ?? "ulandi";
}

/** Reklama kabinetining kunlik ko'rsatkichlari (Insights API, time_increment=1). */
export async function fetchMetaDays(
  cfg: Integrations["meta"],
  account: string,
  since: string,
  until: string,
  usdRate: number,
  projectId: string,
): Promise<MetaRow[]> {
  const act = account.startsWith("act_") ? account : `act_${account}`;
  const params = new URLSearchParams({
    level: "account",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "spend,impressions,clicks,actions,account_currency",
    limit: "100",
    access_token: cfg.token.trim(),
  });
  let url: string | undefined = `https://graph.facebook.com/${cfg.apiVersion}/${act}/insights?${params}`;
  const rows: MetaRow[] = [];
  const leadTypes = LEAD_ACTIONS[cfg.leadMetric];
  while (url) {
    const j = await getJson(url);
    for (const d of j.data ?? []) {
      const spend = Number(d.spend ?? 0);
      rows.push({
        projectId,
        date: d.date_start,
        spend: Math.round(d.account_currency === "UZS" ? spend : spend * usdRate),
        views: Number(d.impressions ?? 0),
        clicks: Number(d.clicks ?? 0),
        leads: (d.actions ?? []).filter((a) => leadTypes.includes(a.action_type)).reduce((a, x) => a + Number(x.value), 0),
        note: d.account_currency && d.account_currency !== "UZS" ? `Meta Ads API · $${spend.toFixed(2)}` : "Meta Ads API",
        source: "meta",
      });
    }
    url = j.paging?.next;
  }
  return rows;
}

/** Ulangan loyihalar uchun yetishmayotgan kunlarni oladi (yoki faqat berilgan loyiha va kunlarni). */
export async function syncMeta(s: ErpState, today: string, only?: { projectId: string; days: string[] }): Promise<MetaResult[]> {
  const cfg = s.settings.integrations.meta;
  const demo = isMetaDemo(s);
  const out: MetaResult[] = [];
  const projects = only ? s.projects.filter((p) => p.id === only.projectId) : s.projects.filter((p) => metaAccountOf(s, p.id));
  for (const p of projects) {
    const days = only ? only.days : metaMissingDays(s, p, today);
    if (days.length === 0) continue;
    const account = metaAccountOf(s, p.id);
    if (demo || !account) {
      out.push({ projectId: p.id, demo: true, rows: days.map((d) => demoMetaRow(s, p, d)) });
      continue;
    }
    try {
      const sorted = [...days].sort();
      const rows = await fetchMetaDays(cfg, account, sorted[0]!, sorted[sorted.length - 1]!, s.settings.usdRate, p.id);
      out.push({ projectId: p.id, demo: false, rows: rows.filter((r) => days.includes(r.date)) });
    } catch (e) {
      out.push({ projectId: p.id, demo: false, rows: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

// ---------- Markaziy bank ----------

/** O'zbekiston Markaziy banki rasmiy kursi (cbu.uz ochiq API). */
export async function fetchCbuRate(date?: string): Promise<{ rate: number; date: string }> {
  let res: Response;
  try {
    res = await fetch(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/${date ? `${date}/` : ""}`);
  } catch {
    throw new Error("Markaziy bank saytiga ulanib bo'lmadi");
  }
  if (!res.ok) throw new Error(`Markaziy bank: HTTP ${res.status}`);
  const j = (await res.json()) as { Rate?: string; Date?: string }[];
  const row = Array.isArray(j) ? j[0] : undefined;
  const rate = Number(row?.Rate);
  if (!row || !(rate > 0)) throw new Error("Markaziy bank javobida kurs topilmadi");
  const [dd, mm, yyyy] = (row.Date ?? "").split(".");
  return { rate, date: yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : (date ?? "") };
}
