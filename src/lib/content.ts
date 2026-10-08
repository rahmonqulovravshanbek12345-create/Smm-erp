// Kontent turlari va marketologning oylik topshirig'i (loyiha × oy × tur bo'yicha son).
import { monthKey } from "./dates";
import { tariffOf } from "./tariffs";
import type { ContentType, ErpState, Post, PostFormat, Project, Quota, Tariff } from "./types";

export const DEFAULT_CONTENT_TYPES: ContentType[] = [
  { id: "ct_video", name: "Video (reels)", format: "video", active: true },
  { id: "ct_design", name: "Dizayn (rasm, karusel)", format: "image", active: true },
  { id: "ct_text", name: "Matn (faqat matnli post)", format: "text", active: true },
  { id: "ct_stories", name: "Stories", format: "image", active: true },
];

/** Syomka kunlari topshiriqda alohida sanaladi (postlardan emas, syomkalardan). */
export const SHOOT_KEY = "shoot";
export const SHOOT_LABEL = "Syomka kuni";

const BY_FORMAT: Record<PostFormat, string> = { video: "ct_video", image: "ct_design", text: "ct_text", ai: "ct_design" };

export function contentTypes(s: ErpState): ContentType[] {
  return s.settings.contentTypes?.length ? s.settings.contentTypes : DEFAULT_CONTENT_TYPES;
}

export const typeName = (s: ErpState, id: string) => (id === SHOOT_KEY ? SHOOT_LABEL : (contentTypes(s).find((t) => t.id === id)?.name ?? "—"));

/** Post qaysi turga sanaladi (eski ma'lumotda tur yo'q bo'lsa — formatdan). */
export function postTypeId(p: Post): string {
  return p.typeId || BY_FORMAT[p.format];
}

/** Tarifdagi sonlar topshiriqning boshlang'ich qiymati bo'ladi. */
export function tariffQuota(t?: Tariff): Record<string, number> {
  if (!t) return {};
  return {
    ct_video: t.videos,
    ct_design: t.designs,
    ct_text: t.texts ?? 0,
    ct_stories: t.stories,
    [SHOOT_KEY]: t.shoots,
  };
}

export const findQuota = (s: ErpState, projectId: string, month: string): Quota | undefined =>
  s.quotas?.find((q) => q.projectId === projectId && q.month === month);

/** Topshiriq: saqlangan bo'lsa — o'zi, bo'lmasa — SMM paketidan. */
export function quotaFor(s: ErpState, p: Project, month: string): { counts: Record<string, number>; saved?: Quota; fromTariff: boolean } {
  const saved = findQuota(s, p.id, month);
  if (saved) return { counts: saved.counts, saved, fromTariff: false };
  const smm = p.services?.find((x) => x.kind === "smm" && x.status !== "cancelled");
  return { counts: tariffQuota(tariffOf(s, smm?.tariffId ?? p.tariffId)), fromTariff: true };
}

export interface QuotaRow {
  key: string;
  label: string;
  target: number;
  /** Kontent rejaga qo'shilgan (shu oy). */
  planned: number;
  /** Joylangan (syomka uchun — o'tkazilgan). */
  done: number;
}

/** Reja va fakt: har tur bo'yicha topshiriq, rejadagi va bajarilgan son. */
export function quotaProgress(s: ErpState, p: Project, month: string): QuotaRow[] {
  const { counts } = quotaFor(s, p, month);
  const posts = s.posts.filter((x) => x.projectId === p.id && monthKey(x.date) === month);
  const shoots = s.shoots.filter((x) => x.projectId === p.id && monthKey(x.date) === month);
  const keys = [
    ...contentTypes(s)
      .filter((t) => t.active || counts[t.id])
      .map((t) => t.id),
    SHOOT_KEY,
  ];
  const extra = Object.keys(counts).filter((k) => !keys.includes(k) && counts[k]);
  return [...keys, ...extra]
    .map((key) => {
      const target = counts[key] ?? 0;
      if (key === SHOOT_KEY) return { key, label: SHOOT_LABEL, target, planned: shoots.length, done: shoots.filter((x) => x.status === "handed").length };
      const list = posts.filter((x) => postTypeId(x) === key);
      return { key, label: typeName(s, key), target, planned: list.length, done: list.filter((x) => x.status === "published").length };
    })
    .filter((r) => r.target > 0 || r.planned > 0);
}

/** Rejada yetishmayotganlar: «3 ta video va 2 ta matn». */
export function quotaShortage(rows: QuotaRow[]): string {
  const miss = rows.filter((r) => r.planned < r.target).map((r) => `${r.target - r.planned} ta ${r.label.split(" (")[0]!.toLowerCase()}`);
  return miss.join(", ");
}

/** Topshiriq matni (Telegram uchun): «8 video, 6 dizayn, 4 matn, 2 syomka kuni». */
export function quotaText(s: ErpState, counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${typeName(s, k).split(" (")[0]!.toLowerCase()}`)
    .join(", ");
}
