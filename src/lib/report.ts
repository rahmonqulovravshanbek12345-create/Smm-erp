// Mijozga yuboriladigan oylik hisobot ma'lumotlari — ERP'dagi haqiqiy yozuvlardan avtomatik yig'iladi.
import { postTypeId, typeName } from "./content";
import { addDays, diffDays } from "./dates";
import { periodAt, type Period } from "./period";
import type { ErpState, MonthlyReport, Post, Project, TargetReport } from "./types";

export interface AdTotals {
  spend: number;
  views: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpl: number;
  cpm: number;
}

export interface ClientReportData {
  project: Project;
  period: Period;
  /** Davr hali tugamagan bo'lsa — bugungacha bo'lgan holat. */
  partial: boolean;
  posts: Post[];
  published: Post[];
  onTime: number;
  byFormat: Record<string, number>;
  byPlatform: Record<string, number>;
  ads: AdTotals;
  prevAds: AdTotals | null;
  daily: TargetReport[];
  organic: MonthlyReport | undefined;
  prevOrganic: MonthlyReport | undefined;
  nextPosts: Post[];
}

function totals(rows: TargetReport[]): AdTotals {
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const views = rows.reduce((a, r) => a + r.views, 0);
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const leads = rows.reduce((a, r) => a + r.leads, 0);
  return {
    spend,
    views,
    clicks,
    leads,
    ctr: views ? (clicks / views) * 100 : 0,
    cpl: leads ? spend / leads : 0,
    cpm: views ? (spend / views) * 1000 : 0,
  };
}

/** Loyiha bo'yicha hisobot tuzish mumkin bo'lgan davrlar (eng oxirgisi birinchi). */
export function reportPeriods(p: Project, today: string): Period[] {
  if (!p.periodStart) return [];
  const out: Period[] = [];
  for (let i = 0; ; i++) {
    const per = periodAt(p, i)!;
    if (per.start > today) break;
    if (p.status === "closed" && p.closedAt && per.start >= p.closedAt) break;
    out.push(per);
  }
  return out.reverse();
}

export function clientReport(s: ErpState, projectId: string, periodIndex: number, today: string): ClientReportData | null {
  const project = s.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const period = periodAt(project, periodIndex);
  if (!period) return null;
  const inPer = (d: string, per: Period) => d >= per.start && d < per.end;
  const posts = s.posts.filter((x) => x.projectId === projectId && inPer(x.date, period)).sort((a, b) => a.date.localeCompare(b.date));
  const published = posts.filter((x) => x.status === "published");
  const onTime = published.filter((x) => !x.publishedAt || x.publishedAt <= x.date).length;
  const byFormat: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const x of published) {
    const t = typeName(s, postTypeId(x));
    byFormat[t] = (byFormat[t] ?? 0) + 1;
    for (const pl of x.platforms) byPlatform[pl] = (byPlatform[pl] ?? 0) + 1;
  }
  const daily = s.targetReports.filter((r) => r.projectId === projectId && inPer(r.date, period)).sort((a, b) => a.date.localeCompare(b.date));
  const prev = periodIndex > 0 ? periodAt(project, periodIndex - 1) : null;
  const prevDaily = prev ? s.targetReports.filter((r) => r.projectId === projectId && inPer(r.date, prev)) : [];
  const next = periodAt(project, periodIndex + 1)!;
  const partial = period.end > today;
  return {
    project,
    period,
    partial,
    posts,
    published,
    onTime,
    byFormat,
    byPlatform,
    ads: totals(daily),
    prevAds: prevDaily.length ? totals(prevDaily) : null,
    daily,
    organic: s.reports.find((r) => r.projectId === projectId && r.periodIndex === periodIndex),
    prevOrganic: s.reports.find((r) => r.projectId === projectId && r.periodIndex === periodIndex - 1),
    nextPosts: s.posts
      .filter((x) => x.projectId === projectId && (partial ? x.date >= today && x.date < period.end : inPer(x.date, next)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8),
  };
}

/** O'zgarish foizi (oldingi davrga nisbatan). */
export const delta = (cur: number, prev?: number) => (prev ? ((cur - prev) / prev) * 100 : null);

/** Davrdagi kunlar soni va o'tgan kunlar. */
export function periodProgress(per: Period, today: string) {
  const total = diffDays(per.end, per.start);
  const done = Math.min(total, Math.max(0, diffDays(addDays(today, 1), per.start)));
  return { total, done };
}
