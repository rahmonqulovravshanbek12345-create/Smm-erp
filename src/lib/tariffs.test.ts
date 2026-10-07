import { describe, expect, it } from "vitest";
import { createProposal, setProposalStatus } from "./actions";
import { DEFAULT_TARIFFS, agencyStats, caseStudies, discounted, nextProposalNumber, proposalPrice, proposalStats, proposalView, tariffLabel } from "./tariffs";
import { TODAY, demoState, emptyState, makeCtx, nonFinite } from "./test-utils";

describe("Tariflar", () => {
  it("chegirma mingga yaxlitlanadi", () => {
    expect(discounted(12_000_000, 10)).toBe(10_800_000);
    expect(discounted(8_333_333, 7)).toBe(7_750_000);
    expect(discounted(5_000_000, 0)).toBe(5_000_000);
  });
  it("loyiha kartasidagi nom tarkibni aks ettiradi", () => {
    expect(tariffLabel(DEFAULT_TARIFFS[1]!)).toBe("Biznes (Instagram + target)");
    expect(tariffLabel(DEFAULT_TARIFFS[2]!)).toBe("Premium (Instagram + Telegram + target)");
  });
  it("demo loyihalar narxi tarif katalogiga mos", () => {
    const s = demoState();
    for (const p of s.projects.filter((x) => x.tariffId)) {
      expect(p.monthlyFee).toBe(s.tariffs.find((t) => t.id === p.tariffId)!.price);
    }
  });
});

describe("Tijorat takliflari", () => {
  it("demo: bitta lidda bir vaqtda faqat bitta ochiq taklif, raqamlar takrorlanmaydi", () => {
    const s = demoState();
    const open = s.proposals.filter((p) => p.status === "sent" || p.status === "draft").map((p) => p.leadId);
    expect(new Set(open).size).toBe(open.length);
    expect(new Set(s.proposals.map((p) => p.number)).size).toBe(s.proposals.length);
  });
  it("raqamlash yil bo'yicha ketma-ket", () => {
    const s = demoState();
    const n = s.proposals.length;
    expect(nextProposalNumber(s, TODAY)).toBe(`TK-2026/${String(n + 1).padStart(3, "0")}`);
    expect(nextProposalNumber(s, "2027-01-02")).toBe("TK-2027/001");
  });
  it("yuborilgan taklif muddati o'tsa «Muddati o'tdi» bo'ladi", () => {
    const s = demoState();
    const p = s.proposals.find((x) => x.status === "sent")!;
    expect(proposalView(p, p.validUntil)).toBe("sent");
    expect(proposalView({ ...p, validUntil: "2026-10-01" }, TODAY)).toBe("expired");
  });
  it("to'liq oqim: yaratish → yuborish → qabul; rahbar va operatorga xabar, lid tarixiga yozuv", () => {
    const s = demoState();
    const { c, notes } = makeCtx(s, "u_mk");
    const id = createProposal(c, { leadId: "l_3", tariffIds: ["t_start", "t_biznes"], recommendedId: "t_biznes", discountPct: 10, validDays: 7, note: "" });
    setProposalStatus(c, id, "sent");
    setProposalStatus(c, id, "accepted", { tariffId: "t_biznes" });
    const p = s.proposals.find((x) => x.id === id)!;
    expect(p.status).toBe("accepted");
    expect(
      proposalPrice(
        p,
        s.tariffs.find((t) => t.id === "t_biznes")!,
      ),
    ).toBe(10_800_000);
    expect(notes.at(-1)!.to).toEqual(expect.arrayContaining(["u_op1", "u_boss"]));
    expect(s.leads.find((l) => l.id === "l_3")!.history[0]!.text).toContain("qabul qilindi");
  });
  it("noto'g'ri kiritish rad etiladi", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    expect(() => createProposal(c, { leadId: "l_3", tariffIds: [], recommendedId: "t_biznes", discountPct: 0, validDays: 7, note: "" })).toThrow();
    expect(() => createProposal(c, { leadId: "l_3", tariffIds: ["t_start"], recommendedId: "t_biznes", discountPct: 0, validDays: 7, note: "" })).toThrow();
    expect(() => createProposal(c, { leadId: "l_3", tariffIds: ["t_start"], recommendedId: "t_start", discountPct: 80, validDays: 7, note: "" })).toThrow();
    const id = createProposal(c, { leadId: "l_3", tariffIds: ["t_start"], recommendedId: "t_start", discountPct: 0, validDays: 7, note: "" });
    expect(() => setProposalStatus(c, id, "rejected", { reason: "  " })).toThrow();
  });
  it("statistika: ulushlar 0..1, bo'sh tizimda NaN yo'q", () => {
    const s = demoState();
    const st = proposalStats(s, TODAY, "2026-01-01");
    expect(st.winRate).toBeGreaterThan(0);
    expect(st.winRate).toBeLessThanOrEqual(1);
    expect(st.accepted + st.rejected + st.open + st.expired).toBe(st.sent);
    const e = emptyState();
    expect(nonFinite({ st: proposalStats(e, TODAY, "2026-01-01"), a: agencyStats(e, TODAY), c: caseStudies(e, TODAY) })).toEqual([]);
  });
  it("mijozga ko'rsatiladigan natijalar: lid narxi pasaygan holatlar", () => {
    const cases = caseStudies(demoState(), TODAY);
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) expect(c.cplTo).toBeLessThan(c.cplFrom);
  });
});
