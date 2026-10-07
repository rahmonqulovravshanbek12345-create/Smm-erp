import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMetaSync, setUsdRate } from "./actions";
import { addDays } from "./dates";
import { demoMetaRow, fetchCbuRate, metaMissingDays, syncMeta } from "./integrations";
import { TODAY, demoState, makeCtx } from "./test-utils";

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
afterEach(() => vi.unstubAllGlobals());

describe("Meta Ads", () => {
  it("yetishmayotgan kunlar: faqat reklama boshlangandan keyin va kechagacha", () => {
    const s = demoState();
    const mebel = s.projects.find((p) => p.id === "p_mebel")!;
    expect(metaMissingDays(s, mebel, TODAY)).toEqual([addDays(TODAY, -1)]); // demo: kechagi hisobot ataylab kiritilmagan
    const dent = s.projects.find((p) => p.id === "p_dent")!;
    expect(metaMissingDays(s, dent, TODAY)).toEqual([]); // reklama hali yoqilmagan
  });

  it("demo rejim: token yo'q bo'lsa tarmoqqa chiqmaydi, raqamlar byudjetga mos va barqaror", async () => {
    const s = demoState();
    s.settings.integrations.meta.accounts.p_mebel = "act_123456";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await syncMeta(s, TODAY);
    expect(fetchSpy).not.toHaveBeenCalled();
    const mebel = res.find((r) => r.projectId === "p_mebel")!;
    expect(mebel.demo).toBe(true);
    const p = s.projects.find((x) => x.id === "p_mebel")!;
    expect(demoMetaRow(s, p, addDays(TODAY, -1))).toEqual(mebel.rows[0]);
    const daily = ((p.adBudgetUsd ?? 0) * s.settings.usdRate) / 30;
    expect(mebel.rows[0]!.spend).toBeGreaterThan(daily * 0.7);
    expect(mebel.rows[0]!.spend).toBeLessThan(daily * 1.3);
  });

  it("haqiqiy API: USD so'mga o'giriladi, lid turlari sozlamaga ko'ra, sahifalash qo'llanadi", async () => {
    const s = demoState();
    s.settings.integrations.meta.token = "EAAtest";
    s.settings.integrations.meta.leadMetric = "forms";
    const y = addDays(TODAY, -1);
    s.targetReports = s.targetReports.filter((r) => !(r.projectId === "p_gym" && r.date === y));
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        urls.push(url);
        if (url.includes("page=2")) return json({ data: [{ date_start: y, spend: "0", impressions: "0", clicks: "0", account_currency: "USD" }] });
        return json({
          data: [
            {
              date_start: y,
              spend: "10.00",
              impressions: "2000",
              clicks: "50",
              account_currency: "USD",
              actions: [
                { action_type: "lead", value: "4" },
                { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "6" },
              ],
            },
          ],
          paging: { next: "https://graph.facebook.com/next?page=2" },
        });
      }),
    );
    const res = await syncMeta(s, TODAY);
    const gym = res.find((r) => r.projectId === "p_gym")!;
    expect(gym.error).toBeUndefined();
    expect(gym.rows[0]).toMatchObject({ date: y, spend: 10 * s.settings.usdRate, views: 2000, clicks: 50, leads: 4, source: "meta" });
    expect(urls[0]).toContain("/act_1029384756/insights");
    expect(urls[0]).toContain("time_increment=1");
    expect(urls).toHaveLength(2);
  });

  it("API xatosi jurnalga yoziladi, ma'lumot buzilmaydi", async () => {
    const s = demoState();
    s.settings.integrations.meta.token = "bad";
    s.targetReports = s.targetReports.filter((r) => !(r.projectId === "p_gym" && r.date === addDays(TODAY, -1)));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({ error: { message: "Invalid OAuth access token." } }, 400)),
    );
    const res = await syncMeta(s, TODAY);
    const before = s.targetReports.length;
    const { c } = makeCtx(s);
    expect(applyMetaSync(c, res)).toBe(0);
    expect(s.targetReports.length).toBe(before);
    expect(s.integrationLog[0]).toMatchObject({ kind: "meta", ok: false });
    expect(s.integrationLog[0]!.text).toContain("Invalid OAuth");
  });
});

describe("Markaziy bank kursi", () => {
  it("javobdagi kurs va sana to'g'ri o'qiladi, sozlamaga yoziladi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json([{ Ccy: "USD", Rate: "12712.34", Date: "07.10.2026" }])),
    );
    const r = await fetchCbuRate();
    expect(r).toEqual({ rate: 12712.34, date: "2026-10-07" });
    const s = demoState();
    const { c } = makeCtx(s);
    setUsdRate(c, r.rate, r.date, "cbu");
    expect(s.settings.usdRate).toBe(12712.34);
    expect(s.integrationLog[0]!.text).toContain("12 712");
  });
  it("noto'g'ri javob yoki tarmoq xatosi tushunarli xato beradi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json([])),
    );
    await expect(fetchCbuRate()).rejects.toThrow(/kurs topilmadi/);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(fetchCbuRate()).rejects.toThrow(/ulanib bo'lmadi/);
    const { c } = makeCtx(demoState());
    expect(() => setUsdRate(c, 0, TODAY, "manual")).toThrow();
  });
});
