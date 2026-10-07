import { describe, expect, it } from "vitest";
import { lastMonths } from "./finance";
import { clientReport, delta, reportPeriods } from "./report";
import { salesAnalytics } from "./sales";
import { TODAY, demoState, emptyState, nonFinite } from "./test-utils";

const months = lastMonths(TODAY, 6);

describe("Sotuv analitikasi", () => {
  const s = demoState();
  const a = salesAnalytics(s, months, TODAY);
  it("voronka bosqichma-bosqich kamayadi, konversiya 0–100%", () => {
    for (let i = 1; i < a.funnel.length; i++) expect(a.funnel[i]!.count).toBeLessThanOrEqual(a.funnel[i - 1]!.count);
    expect(a.conv).toBeGreaterThanOrEqual(0);
    expect(a.conv).toBeLessThanOrEqual(100);
  });
  it("manbalar va operatorlar yig'indisi umumiy lidlar soniga teng", () => {
    expect(a.bySource.reduce((x, r) => x + r.leads, 0)).toBe(a.leads.length);
    expect(a.byOperator.reduce((x, r) => x + r.leads, 0)).toBe(a.leads.length);
    expect(a.bySource.reduce((x, r) => x + r.contracts, 0)).toBe(a.contracts);
  });
  it("sotuv sikli manfiy emas, NaN yo'q (bo'sh tizimda ham)", () => {
    expect(a.avgCycle).toBeGreaterThanOrEqual(0);
    expect(nonFinite(a)).toEqual([]);
    expect(nonFinite(salesAnalytics(emptyState(), months, TODAY))).toEqual([]);
  });
});

describe("Mijoz hisoboti", () => {
  const s = demoState();
  it("har bir loyiha va davr uchun: joylangan ≤ reja, o'z vaqtida ≤ joylangan, reklama jami kunlik yig'indiga teng", () => {
    for (const p of s.projects) {
      for (const per of reportPeriods(p, TODAY)) {
        const r = clientReport(s, p.id, per.index, TODAY)!;
        expect(r.published.length).toBeLessThanOrEqual(r.posts.length);
        expect(r.onTime).toBeLessThanOrEqual(r.published.length);
        expect(r.ads.spend).toBeCloseTo(
          r.daily.reduce((x, d) => x + d.spend, 0),
          5,
        );
        expect(r.ads.leads).toBe(r.daily.reduce((x, d) => x + d.leads, 0));
        expect(nonFinite({ ads: r.ads, prev: r.prevAds })).toEqual([]);
      }
    }
  });
  it("o'zgarish foizi: oldingi qiymat 0 yoki yo'q bo'lsa ko'rsatilmaydi", () => {
    expect(delta(120, 100)).toBe(20);
    expect(delta(5, 0)).toBeNull();
    expect(delta(5)).toBeNull();
  });
  it("yopilgan loyiha uchun yopilgandan keyingi davrlar chiqmaydi", () => {
    const moda = s.projects.find((p) => p.id === "p_moda")!;
    for (const per of reportPeriods(moda, TODAY)) expect(per.start < moda.closedAt!).toBe(true);
  });
});
