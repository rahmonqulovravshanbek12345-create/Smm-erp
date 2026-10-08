import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { quotaFor, quotaProgress, quotaShortage } from "./content";
import { alertsFor } from "./rules";
import { addDays, monthKey } from "./dates";
import { invoicePaid, mrr, pnl, prepayPaid, receivables, syncInvoices, unrecognizedRevenue } from "./finance";
import { invoiceLines, recurringFee, recurringLines, servicePrepayPaid, stageIndex } from "./services";
import { TODAY, demoState, makeCtx, nonFinite } from "./test-utils";
import type { ErpState, Post } from "./types";

const base = (over: Partial<act.ProjectInput> = {}): act.ProjectInput => ({
  name: "Test Mijoz",
  contactName: "Ali",
  phone: "+998 00 111 22 33",
  industry: "Savdo",
  links: "",
  contractNo: "SH-2026/200",
  contractDate: TODAY,
  prepayType: 100,
  prepayDueDate: TODAY,
  remainderDueDate: "",
  marketologId: "u_mk",
  smmId: "u_smm1",
  targetologId: "u_tg",
  services: [{ kind: "smm", tariffId: "t_biznes", title: "Biznes", price: 12_000_000 }],
  ...over,
});

const pay = (s: ErpState, invoiceId: string, date = TODAY) => {
  const inv = s.invoices.find((i) => i.id === invoiceId)!;
  act.recordClientPayment(makeCtx(s, "u_mol").c, invoiceId, { amount: inv.amount - invoicePaid(s, inv), date, accountId: "acc_bank", note: "" });
};

describe("Xizmatlar: bitta mijoz — bir nechta xizmat", () => {
  it("SMM + sayt: oylik summa faqat SMM, sayt uchun alohida 50% oldindan faktura", () => {
    const s = demoState();
    const id = act.createProject(
      makeCtx(s, "u_mk").c,
      base({
        services: [
          ...base().services,
          { kind: "web", tariffId: "t_web_corp", title: "Korporativ sayt", price: 15_000_000, prepayPct: 50, assigneeId: "u_web", assigneeFee: 4_000_000 },
        ],
      }),
    );
    const p = s.projects.find((x) => x.id === id)!;
    expect(p.monthlyFee).toBe(12_000_000);
    expect(p.tariff).toBe("SMM: Biznes · Sayt");
    const invs = s.invoices.filter((i) => i.projectId === id);
    expect(invs.map((i) => [i.kind, i.amount, Boolean(i.serviceId)])).toEqual([
      ["prepay", 12_000_000, false],
      ["prepay", 7_500_000, true],
    ]);
    // Sayt oldindan to'lovi SMM ishini to'xtatmaydi va aksincha
    pay(s, invs[0]!.id);
    expect(prepayPaid(s, id)).toBe(true);
    expect(servicePrepayPaid(s, p.services[1]!.id, (inv) => invoicePaid(s, inv))).toBe(false);
  });

  it("faqat branding: oylik faktura va hisob davri yo'q, SMM menejer shart emas", () => {
    const s = demoState();
    const id = act.createProject(
      makeCtx(s, "u_mk").c,
      base({ smmId: "", services: [{ kind: "branding", tariffId: "t_brand_logo", title: "Logo", price: 5_000_000, prepayPct: 50, assigneeId: "u_dz" }] }),
    );
    const p = s.projects.find((x) => x.id === id)!;
    expect(p.monthlyFee).toBe(0);
    expect(recurringLines(p, s.settings.usdRate)).toEqual([]);
    p.periodStart = addDays(TODAY, -40);
    syncInvoices(s, TODAY, () => "x");
    expect(s.invoices.filter((i) => i.projectId === id && i.kind === "monthly")).toHaveLength(0);
  });

  it("bir martalik xizmatda ijrochi majburiy", () => {
    const s = demoState();
    expect(() => act.createProject(makeCtx(s, "u_mk").c, base({ services: [{ kind: "web", title: "Landing", price: 6_000_000, prepayPct: 50 }] }))).toThrow(
      /ijrochini/,
    );
  });

  it("performance: oylik faktura qatorlari — oylik haq + byudjetdan foiz", () => {
    const s = demoState();
    const id = act.createProject(
      makeCtx(s, "u_mk").c,
      base({ smmId: "", adBudgetUsd: 1000, services: [{ kind: "performance", tariffId: "t_performance", title: "Performance", price: 6_000_000, adPct: 10 }] }),
    );
    const p = s.projects.find((x) => x.id === id)!;
    const lines = recurringLines(p, 12_650);
    expect(lines.map((l) => l.amount)).toEqual([6_000_000, 1_265_000]);
    expect(recurringFee(p, 12_650)).toBe(7_265_000);
    expect(p.monthlyFee).toBe(6_000_000 + Math.round((1000 * s.settings.usdRate * 0.1) / 1000) * 1000);
  });

  it("mavjud mijozga xizmat qo'shish va to'xtatish oylik summani yangilaydi", () => {
    const s = demoState();
    const c = makeCtx(s, "u_mk").c;
    act.addService(c, "p_gym", { kind: "target", tariffId: "t_target", title: "Target", price: 4_000_000 });
    const p = s.projects.find((x) => x.id === "p_gym")!;
    expect(p.monthlyFee).toBe(16_000_000);
    const svc = p.services.find((x) => x.kind === "target")!;
    act.cancelService(c, "p_gym", svc.id);
    expect(p.monthlyFee).toBe(12_000_000);
  });
});

describe("Bir martalik xizmat bosqichlari", () => {
  const setup = () => {
    const s = demoState();
    const id = act.createProject(
      makeCtx(s, "u_mk").c,
      base({
        smmId: "",
        services: [{ kind: "web", tariffId: "t_web_landing", title: "Landing", price: 6_000_000, prepayPct: 50, assigneeId: "u_web", assigneeFee: 2_000_000 }],
      }),
    );
    const p = s.projects.find((x) => x.id === id)!;
    return { s, p, svc: p.services[0]! };
  };

  it("oldindan to'lovsiz 2-bosqichga o'tib bo'lmaydi", () => {
    const { s, p, svc } = setup();
    const c = makeCtx(s, "u_web").c;
    act.advanceServiceStage(c, p.id, svc.id); // 1-bosqich (brif) — to'lovsiz ham mumkin
    expect(stageIndex(svc)).toBe(1);
    expect(() => act.advanceServiceStage(c, p.id, svc.id)).toThrow(/Oldindan to'lov/);
  });

  it("topshirilganda: qoldiq faktura, ijrochiga haq, daromad topshirilgan oyda tan olinadi", () => {
    const { s, p, svc } = setup();
    const pre = s.invoices.find((i) => i.serviceId === svc.id && i.kind === "prepay")!;
    pay(s, pre.id);
    // Topshirilguncha olingan pul — avans (daromad emas)
    expect(unrecognizedRevenue(s, pre, TODAY)).toBe(3_000_000);
    expect(receivables(s, TODAY).find((r) => r.project.id === p.id)!.advance).toBe(3_000_000);

    const c = makeCtx(s, "u_web").c;
    for (let i = 0; i < svc.stages!.length; i++) act.advanceServiceStage(c, p.id, svc.id);
    expect(svc.status).toBe("done");
    expect(svc.deliveredAt).toBe(TODAY);
    const rest = s.invoices.find((i) => i.serviceId === svc.id && i.kind === "remainder")!;
    expect(rest.amount).toBe(3_000_000);
    expect(rest.dueDate).toBe(addDays(TODAY, 3));
    expect(s.accruals.filter((a) => a.sourceId === `svc:${svc.id}`).map((a) => a.amount)).toEqual([2_000_000]);

    const r = pnl(s, [monthKey(TODAY)], TODAY, p.id);
    expect(r.lines.find((l) => l.key === "rev_web")!.total).toBeCloseTo(6_000_000, 0);
    expect(unrecognizedRevenue(s, pre, TODAY)).toBe(0);
    // Takror bosish hech narsa qo'shmaydi
    act.advanceServiceStage(c, p.id, svc.id);
    expect(s.invoices.filter((i) => i.serviceId === svc.id)).toHaveLength(2);
  });

  it("topshirilgan xizmatni bekor qilib bo'lmaydi; bosqichni orqaga qaytarish faqat topshirilguncha", () => {
    const { s, p, svc } = setup();
    const c = makeCtx(s, "u_mk").c;
    act.advanceServiceStage(c, p.id, svc.id);
    act.revertServiceStage(c, p.id, svc.id);
    expect(stageIndex(svc)).toBe(0);
    pay(s, s.invoices.find((i) => i.serviceId === svc.id)!.id);
    for (let i = 0; i < svc.stages!.length; i++) act.advanceServiceStage(c, p.id, svc.id);
    expect(() => act.cancelService(c, p.id, svc.id)).toThrow(/bekor qilib bo'lmaydi/);
    act.revertServiceStage(c, p.id, svc.id);
    expect(svc.status).toBe("done");
  });
});

describe("Demo ma'lumotlar: xizmatlar izchil", () => {
  it("har loyihada xizmat bor, oylik summa xizmatlardan, fakturalar qatorlari yig'indisiga teng", () => {
    const s = demoState();
    for (const p of s.projects) {
      expect(p.services.length, p.name).toBeGreaterThan(0);
      expect(p.monthlyFee, p.name).toBe(recurringFee(p, 12_650));
    }
    for (const inv of s.invoices) {
      const sum = invoiceLines(s, inv).reduce((a, l) => a + l.amount, 0);
      expect(sum, inv.number).toBe(inv.amount);
    }
    expect(nonFinite({ mrr: mrr(s, TODAY), pnl: pnl(s, [monthKey(TODAY)], TODAY) })).toEqual([]);
  });

  it("P&L daromadi xizmatlar bo'yicha bo'linadi, jami o'zgarmaydi", () => {
    const s = demoState();
    const months = [monthKey(addDays(TODAY, -35)), monthKey(TODAY)];
    const r = pnl(s, months, TODAY);
    const rev = r.lines.filter((l) => l.section === "revenue");
    expect(rev.map((l) => l.key)).toEqual(expect.arrayContaining(["rev_smm", "rev_target", "rev_performance", "rev_video"]));
    expect(rev.reduce((a, l) => a + l.total, 0)).toBeCloseTo(r.sum.revenue, 2);
  });
});

describe("Platformalar: bitta post — bir nechta joy", () => {
  const post = (s: ErpState): Post => s.posts.find((p) => p.topic === "Yotoqxona to'plami obzori")!;

  it("har platforma alohida belgilanadi; hammasiga joylangach — Joylandi", () => {
    const s = demoState();
    const p = post(s);
    expect(p.platforms).toEqual(["instagram", "telegram", "tiktok"]);
    const c = makeCtx(s, "u_smm1").c;
    act.publishPost(c, p.id, "telegram");
    expect(p.status).toBe("approved");
    act.publishPost(c, p.id, "tiktok");
    expect(p.status).toBe("published");
    expect(Object.keys(p.publishedOn!).sort()).toEqual(["instagram", "telegram", "tiktok"]);
    act.unpublishPlatform(c, p.id, "tiktok");
    expect(p.status).toBe("approved");
  });

  it("platformasiz post saqlanmaydi", () => {
    const s = demoState();
    const p = post(s);
    expect(() => act.savePost(makeCtx(s, "u_smm1").c, { ...p, platforms: [] })).toThrow(/platforma/);
  });

  it("faqat SMM mijozida hisob davri birinchi joylangan postdan boshlanadi", () => {
    const s = demoState();
    const c = makeCtx(s, "u_mk").c;
    const id = act.createProject(c, base({ services: [{ kind: "smm", tariffId: "t_start", title: "Start", price: 8_000_000 }] }));
    pay(s, s.invoices.find((i) => i.projectId === id)!.id);
    act.savePost(makeCtx(s, "u_smm1").c, {
      projectId: id,
      date: TODAY,
      platforms: ["instagram", "facebook"],
      typeId: "ct_design",
      format: "image",
      topic: "Birinchi post",
      script: "",
      assigneeId: "u_smm1",
      forTarget: false,
    });
    const newPost = s.posts.find((x) => x.projectId === id)!;
    act.publishPost(makeCtx(s, "u_smm1").c, newPost.id);
    expect(s.projects.find((x) => x.id === id)!.periodStart).toBe(TODAY);
  });
});

describe("Oylik topshiriq", () => {
  it("3 platformali post 1 ta deb sanaladi; syomka kunlari syomkalardan", () => {
    const s = demoState();
    const p = s.projects.find((x) => x.id === "p_mebel")!;
    const month = monthKey(TODAY);
    const rows = quotaProgress(s, p, month);
    const video = rows.find((r) => r.key === "ct_video")!;
    const videosInMonth = s.posts.filter((x) => x.projectId === p.id && monthKey(x.date) === month && x.typeId === "ct_video");
    expect(video.planned).toBe(videosInMonth.length);
    expect(video.target).toBe(8);
    expect(rows.find((r) => r.key === "shoot")!.planned).toBe(s.shoots.filter((x) => x.projectId === p.id && monthKey(x.date) === month).length);
    expect(quotaShortage(rows)).toContain("video");
  });

  it("topshiriq tarifdan to'ladi, saqlanganda tarix va SMM'ga xabar", () => {
    const s = demoState();
    const month = monthKey(TODAY);
    const p = s.projects.find((x) => x.id === "p_baraka")!;
    const q0 = quotaFor(s, p, month);
    expect(q0.fromTariff).toBe(true);
    expect(q0.counts.ct_video).toBe(10);
    const { c, notes } = makeCtx(s, "u_mk");
    act.saveQuota(c, p.id, month, { ...q0.counts, ct_video: 12 }, "aksiya");
    act.saveQuota(c, p.id, month, { ...q0.counts, ct_video: 14 }, "aksiya");
    const q = quotaFor(s, p, month);
    expect(q.saved!.counts.ct_video).toBe(14);
    expect(q.saved!.history).toHaveLength(2);
    expect(q.saved!.history[0]!.text).toContain("Video 12 → 14");
    expect(notes.filter((n) => n.to.includes(p.smmId))).toHaveLength(2);
    expect(() => act.saveQuota(c, p.id, month, { ct_video: 0 })).toThrow();
  });

  it("agentlik yangi kontent turi qo'shadi; takror nom qabul qilinmaydi", () => {
    const s = demoState();
    const c = makeCtx(s, "u_mk").c;
    act.saveContentType(c, { name: "Jonli efir", format: "video", active: true });
    expect(s.settings.contentTypes.some((t) => t.name === "Jonli efir")).toBe(true);
    expect(() => act.saveContentType(c, { name: "jonli efir", format: "video", active: true })).toThrow(/bor/);
  });
});

describe("Tijorat taklifi: bir nechta xizmat", () => {
  it("har xizmatdan bittadan paket qabul qilinadi; bir xizmatdan ikkitasi — xato", () => {
    const s = demoState();
    const c = makeCtx(s, "u_mk").c;
    const id = act.createProposal(c, {
      leadId: "l_3",
      tariffIds: ["t_start", "t_biznes", "t_web_landing", "t_web_corp"],
      recommendedId: "t_biznes",
      discountPct: 10,
      validDays: 7,
      note: "",
    });
    expect(() => act.setProposalStatus(c, id, "accepted", { tariffIds: ["t_start", "t_biznes"] })).toThrow(/bitta/);
    act.setProposalStatus(c, id, "accepted", { tariffIds: ["t_biznes", "t_web_corp"] });
    const p = s.proposals.find((x) => x.id === id)!;
    expect(p.acceptedTariffIds).toEqual(["t_biznes", "t_web_corp"]);
    expect(p.acceptedTariffId).toBe("t_biznes");
  });
});

describe("Marketologga eslatma: topshiriq berilmagan", () => {
  const quotaAlerts = (s: ErpState, uid: string, today = TODAY) =>
    alertsFor(
      s,
      s.users.find((u) => u.id === uid)!,
      today,
    ).filter((a) => a.id.startsWith("quota-"));

  it("topshiriq berilmagan loyiha uchun marketolog va rahbarga chiqadi, SMM menejerga chiqmaydi", () => {
    const s = demoState();
    const names = quotaAlerts(s, "u_mk").map((a) => a.text);
    expect(names.some((t) => t.startsWith("Baraka Market"))).toBe(true);
    expect(names.some((t) => t.startsWith("Sharq Mebel"))).toBe(false); // topshiriq berilgan
    expect(quotaAlerts(s, "u_boss").length).toBe(quotaAlerts(s, "u_mk").length);
    expect(quotaAlerts(s, "u_smm1")).toHaveLength(0);
  });

  it("topshiriq berilgach eslatma yo'qoladi", () => {
    const s = demoState();
    const before = quotaAlerts(s, "u_mk").length;
    act.saveQuota(makeCtx(s, "u_mk").c, "p_baraka", "2026-10", { ct_video: 10 });
    expect(quotaAlerts(s, "u_mk")).toHaveLength(before - 1);
  });

  it("oy oxirida keyingi oy uchun ham eslatadi; faol bo'lmagan va strategiyasi tugamagan loyihaga emas", () => {
    const s = demoState();
    const eve = "2026-10-28";
    const texts = quotaAlerts(s, "u_mk", eve).map((a) => a.text);
    expect(texts.some((t) => t.startsWith("Sharq Mebel") && t.includes("Noyabr"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Moda House"))).toBe(false); // yopilgan
    expect(texts.some((t) => t.startsWith("Dent Plus"))).toBe(false); // strategiya hali tugamagan
  });
});
