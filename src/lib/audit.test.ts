// To'liq tekshiruv: hisob-kitoblar mustaqil usulda qayta hisoblanadi (kodning o'zini o'zi tasdiqlashi emas),
// turli sanalarda va tasodifiy amallar ketma-ketligidan keyin ham modullar bir-biriga mos kelishi tekshiriladi.
import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { addDays, monthKey, shiftMonthKey } from "./dates";
import { employeeBalance, invoiceOutstanding, invoiceOutstandingUsd, invoicePaid, invoiceStatus, pnl, projectDebt } from "./finance";
import { access } from "./permissions";
import { linkFor, moduleOfPath as moduleOf } from "./routes";
import { alertsFor } from "./rules";
import { serviceFromTariff } from "./tariffs";
import { hasAds, isRecurring, recurringFee } from "./services";
import { TODAY, demoState, makeCtx } from "./test-utils";
import { syncAll } from "./store-sync";
import type { Ctx } from "./store";
import type { ErpState } from "./types";

import { check } from "./audit-check";

const DATES = ["2026-01-31", "2026-02-28", "2026-03-01", "2026-05-31", "2026-07-15", "2026-10-07", "2026-12-31", "2027-03-31"];

describe("Tekshiruv: demo ma'lumot turli sanalarda izchil", () => {
  for (const d of DATES) {
    it(`bugun = ${d}`, () => {
      const s = demoState(d);
      expect(check(s, d)).toEqual([]);
      // Har rolning eslatmalari ocha oladigan sahifaga olib boradi
      const dead = s.users.flatMap((u) =>
        alertsFor(s, u, d)
          .filter((a) => linkFor(u.role, a.href) === undefined)
          .map((a) => `${u.role} → ${a.href}`),
      );
      expect([...new Set(dead)]).toEqual([]);
    });
  }
});

describe("Tekshiruv: bog'lanishlar (havola va rol huquqi)", () => {
  it("bildirishnoma, eslatma va faoliyat havolalari mavjud sahifaga olib boradi", () => {
    const s = demoState();
    const bad: string[] = [];
    for (const n of s.notifications) if (n.href && !moduleOf(n.href)) bad.push(`bildirishnoma «${n.text.slice(0, 40)}»: ${n.href}`);
    for (const a of s.activity) if (a.href && !moduleOf(a.href)) bad.push(`faoliyat: ${a.href}`);
    for (const u of s.users) for (const a of alertsFor(s, u, "2026-10-07")) if (!moduleOf(a.href)) bad.push(`eslatma (${u.name}): ${a.href}`);
    expect(bad).toEqual([]);
  });

  it("bildirishnoma egasi havolani ocha oladi (aks holda jimgina bosh sahifaga tushadi)", () => {
    const s = demoState();
    const bad: string[] = [];
    const roleOf = (id: string) => s.users.find((u) => u.id === id)!.role;
    for (const n of s.notifications) {
      const m = n.href ? moduleOf(n.href) : null;
      if (m && access(roleOf(n.userId), m) === "none") bad.push(`${roleOf(n.userId)} → ${n.href}: «${n.text.slice(0, 50)}»`);
    }
    for (const u of s.users)
      for (const a of alertsFor(s, u, "2026-10-07")) {
        const m = moduleOf(a.href);
        if (m && access(u.role, m) === "none") bad.push(`eslatma ${u.role} → ${a.href}: «${a.text.slice(0, 50)}»`);
      }
    expect(bad).toEqual([]);
  });
});

// ---------- Tasodifiy amallar ketma-ketligi ----------

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Tekshiruv: tasodifiy amallardan keyin ham hisob-kitoblar mos", () => {
  for (const seed of Array.from({ length: Number(process.env.AUDIT_SEEDS ?? 6) }, (_, i) => i + 1)) {
    it(`ketma-ketlik #${seed} (60 ta amal)`, () => {
      const r = rng(seed * 7919);
      const pick = <T>(a: T[]): T | undefined => a[Math.floor(r() * a.length)];
      let today = "2026-10-07";
      const s = demoState(today);
      const hrefs: { href: string; to: (string | undefined)[] }[] = [];
      const ctx = (uid: string): Ctx => {
        const me = s.users.find((u) => u.id === uid) ?? s.users[0]!;
        return {
          s,
          me,
          today,
          notify: (to, _t, href) => href && hrefs.push({ href, to }),
          log: (_t, href) => href && hrefs.push({ href, to: [] }),
        };
      };
      const log: string[] = [];
      const violations: string[] = [];
      const run = (name: string, fn: () => void) => {
        log.push(name);
        try {
          fn();
        } catch (e) {
          // Biznes qoidasi xatosi (Error) — kutilgan; TypeError va boshqalar — nosozlik
          if (!(e instanceof Error) || e.constructor !== Error) throw new Error(`${name}: ${(e as Error).stack}`);
        }
        const v = check(s, today);
        if (v.length) violations.push(`[${log.length}] ${name}: ${v.slice(0, 4).join(" | ")}`);
      };
      const kinds = ["smm", "target", "performance", "video", "branding", "web"] as const;

      for (let step = 0; step < 60 && violations.length === 0; step++) {
        const roll = r();
        if (roll < 0.1) {
          run("yangi loyiha", () => {
            const n = 1 + Math.floor(r() * 3);
            const chosen = [...new Set(Array.from({ length: n }, () => pick([...kinds])!))];
            const hasSmm = chosen.includes("smm");
            const ads = chosen.includes("target") || chosen.includes("performance");
            // Har uchinchi shartnoma dollarda
            const usdC = r() < 0.35;
            const usdPrice = (uzs: number) => (usdC ? { priceUsd: Math.round(uzs / 12_500) + (r() < 0.3 ? 0.5 : 0) } : {});
            act.createProject(ctx("u_mk"), {
              currency: usdC ? "USD" : undefined,
              name: `Fuzz ${step}`,
              contactName: "X",
              phone: "1",
              industry: "x",
              links: "",
              contractNo: `F-${step}`,
              contractDate: today,
              prepayType: r() < 0.5 ? 50 : 100,
              prepayDueDate: today,
              remainderDueDate: addDays(today, 15),
              marketologId: "u_mk",
              smmId: hasSmm ? "u_smm1" : "",
              targetologId: ads ? "u_tg" : undefined,
              adBudgetUsd: ads ? Math.round(300 + r() * 1200) : undefined,
              services: chosen.map((k) =>
                isRecurring(k)
                  ? (() => {
                      const price = 1_000_000 * (2 + Math.floor(r() * 10));
                      return { kind: k, title: "T", price, ...usdPrice(price), adPct: k === "performance" ? 10 : undefined };
                    })()
                  : {
                      kind: k,
                      title: "T",
                      ...(() => {
                        const price = 1_000_000 * (3 + Math.floor(r() * 20));
                        return { price, ...usdPrice(price) };
                      })(),
                      prepayPct: r() < 0.5 ? (50 as const) : (100 as const),
                      assigneeId: k === "web" ? "u_web" : "u_dz",
                      assigneeFee: 500_000,
                    },
              ),
            });
          });
        } else if (roll < 0.34) {
          run("to'lov", () => {
            const unpaid = s.invoices.filter((i) => i.issueDate <= today && !i.voidedAt && invoiceOutstanding(s, i) > 1);
            const inv = pick(unpaid);
            if (!inv) return;
            if (inv.usd) {
              // Dollardagi faktura: dollar karta, naqd so'm (ustamasiz) yoki bank (ustama bilan); kurs to'lov kunida farq qilishi mumkin
              const leftUsd = invoiceOutstandingUsd(s, inv);
              const part = r() < 0.5 ? leftUsd : Math.max(1, Math.round(leftUsd * (0.2 + r() * 0.6)));
              const acc = pick(["acc_usd", "acc_cash", "acc_bank"])!;
              const fxRate = Math.round(s.settings.usdRate * (0.97 + r() * 0.06));
              if (acc === "acc_usd") act.recordClientPayment(ctx("u_mol"), inv.id, { amount: part, date: today, accountId: acc, rate: fxRate, note: "" });
              else {
                const mk = acc === "acc_cash" ? 0 : 2;
                act.recordClientPayment(ctx("u_mol"), inv.id, {
                  amount: Math.round(part * fxRate * (1 + mk / 100)),
                  date: today,
                  accountId: acc,
                  fxRate,
                  note: "",
                });
              }
              return;
            }
            const left = inv.amount - invoicePaid(s, inv);
            const amount = r() < 0.5 ? left : Math.max(1000, Math.round((left * (0.2 + r() * 0.6)) / 1000) * 1000);
            act.recordClientPayment(ctx("u_mol"), inv.id, { amount, date: today, accountId: "acc_bank", note: "" });
          });
        } else if (roll < 0.5) {
          run("bosqich", () => {
            const all = s.projects.flatMap((p) => p.services.filter((x) => !isRecurring(x.kind) && x.status === "active").map((x) => ({ p, x })));
            const t = pick(all);
            if (t) act.advanceServiceStage(ctx("u_mk"), t.p.id, t.x.id);
          });
        } else if (roll < 0.56) {
          run("xizmat bekor", () => {
            const all = s.projects.flatMap((p) => p.services.filter((x) => x.status === "active" && p.status === "active").map((x) => ({ p, x })));
            const t = pick(all);
            if (t) act.cancelService(ctx("u_mk"), t.p.id, t.x.id);
          });
        } else if (roll < 0.63) {
          run("xizmat qo'shish", () => {
            const p = pick(s.projects.filter((x) => x.status === "active"));
            if (!p) return;
            const k = pick([...kinds])!;
            if (k === "smm" && !p.smmId) return;
            if ((k === "target" || k === "performance") && !p.targetologId) return;
            if (isRecurring(k) && p.services.some((x) => x.kind === k && x.status !== "cancelled")) return;
            const pu = p.currency === "USD" ? { priceUsd: isRecurring(k) ? 240 : 480.5 } : {};
            act.addService(
              ctx("u_mk"),
              p.id,
              isRecurring(k)
                ? { kind: k, title: "T", price: 3_000_000, ...pu }
                : { kind: k, title: "T", price: 6_000_000, prepayPct: 50, assigneeId: "u_dz", ...pu },
              { prorate: r() < 0.5 },
            );
          });
        } else if (roll < 0.7) {
          run("post joylash", () => {
            const post = pick(s.posts.filter((x) => x.status !== "published"));
            if (!post) return;
            const pl = pick(post.platforms)!;
            post.status = post.status === "plan" ? "approved" : post.status;
            act.publishPost(ctx("u_smm1"), post.id, r() < 0.5 ? pl : undefined);
          });
        } else if (roll < 0.76) {
          run("topshiriq", () => {
            const p = pick(s.projects);
            if (p) act.saveQuota(ctx("u_mk"), p.id, monthKey(today), { ct_video: 1 + Math.floor(r() * 12), ct_design: Math.floor(r() * 8) }, "x");
          });
        } else if (roll < 0.83) {
          run("ish haqi to'lovi", () => {
            const u = pick(s.users.filter((x) => employeeBalance(s, x.id, today) > 1000));
            if (u)
              act.payEmployee(ctx("u_mol"), {
                userId: u.id,
                amount: Math.max(1000, Math.round((employeeBalance(s, u.id) * (0.3 + r() * 0.7)) / 1000) * 1000),
                date: today,
                accountId: "acc_bank",
                note: "",
              });
          });
        } else if (roll < 0.87) {
          if (r() < 0.5)
            run("faktura bekor", () => {
              const inv = pick(s.invoices.filter((i) => !i.voidedAt && invoicePaid(s, i) < 0.5));
              if (inv) act.voidInvoice(ctx("u_mol"), inv.id, "test");
            });
          else
            run("qo'shimcha faktura", () => {
              const p = pick(s.projects.filter((x) => x.status === "active"));
              if (p)
                act.createExtraInvoice(ctx("u_mol"), { projectId: p.id, amount: 1_500_000, issueDate: today, dueDate: addDays(today, 5), note: "qo'shimcha" });
            });
        } else if (roll < 0.9) {
          run("bonus/jarima", () => {
            const u = pick(s.users.filter((x) => x.role !== "admin"));
            if (u) act.addManualAccrual(ctx("u_mol"), { userId: u.id, date: today, kind: r() < 0.5 ? "bonus" : "penalty", amount: 100_000, title: "x" });
          });
        } else if (roll < 0.92) {
          if (r() < 0.5)
            run("xodim arxiv/qaytarish", () => {
              const u = pick(s.users.filter((x) => !["admin", "rahbar"].includes(x.role)));
              if (!u) return;
              if (!u.active) return act.restoreUser(ctx("u_admin"), u.id);
              const rep = s.users.find((x) => x.active && x.role === u.role && x.id !== u.id);
              act.archiveUser(ctx("u_admin"), u.id, r() < 0.7 ? rep?.id : undefined);
            });
          else
            run("xarajat", () => {
              act.addTransaction(ctx("u_mol"), {
                date: today,
                accountId: "acc_card",
                dir: "out",
                amount: 250_000,
                articleId: "a_software",
                note: "x",
              } as never);
            });
        } else if (roll < 0.94) {
          run("loyiha yopish", () => {
            const p = pick(s.projects.filter((x) => x.status === "active" && x.id.startsWith("p_") && !["p_mebel", "p_gym"].includes(x.id)));
            if (p) act.closeProject(ctx("u_mk"), p.id, today);
          });
        } else {
          run("vaqt o'tdi", () => {
            today = addDays(today, 1 + Math.floor(r() * 12));
            // Kurs har kuni o'zgaradi
            if (r() < 0.6) act.setUsdRate(ctx("u_mol"), Math.round(12_000 + r() * 1_500), today, "manual");
            syncAll(s, today);
          });
        }
      }
      expect(violations).toEqual([]);
      // Hamma havolalar mavjud sahifaga olib boradi
      expect(hrefs.filter((h) => !moduleOf(h.href)).map((h) => h.href)).toEqual([]);
    });
  }
});

describe("Tekshiruvning o'zi ishlaydi (ataylab buzilgan ma'lumotni topadi)", () => {
  const s0 = () => demoState();
  it("qo'sh hisoblangan ish haqi", () => {
    const s = s0();
    const a = s.accruals.find((x) => x.sourceId)!;
    s.accruals.push({ ...a, id: "dup" });
    expect(check(s, TODAY).join()).toMatch(/takroriy hisoblash/);
  });
  it("qatorlari bilan mos kelmaydigan faktura summasi", () => {
    const s = s0();
    s.invoices[0]!.amount += 1000;
    s.invoices[0]!.lines = [{ kind: "smm", title: "x", amount: 1 }];
    expect(check(s, TODAY).join()).toMatch(/qatorlar yig'indisi/);
  });
  it("ba'zi platformada joylanmagan, lekin «Joylandi» post", () => {
    const s = s0();
    const p = s.posts.find((x) => x.platforms.length > 1 && x.status === "published")!;
    delete p.publishedOn![p.platforms[1]!];
    expect(check(s, TODAY).join()).toMatch(/ba'zi platformada/);
  });
  it("to'lov ustiga o'zgartirilgan daromad (P&L ga yetib bormagan)", () => {
    const s = s0();
    s.transactions.push({ id: "x", date: TODAY, accountId: "acc_bank", dir: "in", amount: 5_000_000, articleId: "a_other_in", note: "", createdBy: "u_mol" });
    expect(check(s, TODAY)).toEqual([]); // boshqa daromad P&L ga to'g'ri tushadi — buzilish emas
    const bad = s0();
    bad.accruals.push({
      id: "z",
      userId: "u_mt1",
      date: TODAY,
      kind: "piece",
      title: "x",
      qty: 1,
      rate: 1,
      amount: Number.NaN,
      approved: false,
      createdBy: "system",
    });
    expect(check(bad, TODAY).join()).toMatch(/chekli emas/);
  });
  it("yo'q xodimga bog'langan to'lov", () => {
    const s = s0();
    s.transactions.push({
      id: "y",
      date: TODAY,
      accountId: "acc_bank",
      dir: "out",
      amount: 1000,
      articleId: "a_payroll",
      userId: "nobody",
      note: "",
      createdBy: "u_mol",
    });
    expect(check(s, TODAY).join()).toMatch(/xodim yo'q/);
  });
  it("direktorga ish haqi xabari havolasiz yetkaziladi (u «Mening hisobim»ni ocha olmaydi)", () => {
    expect(linkFor("rahbar", "/hisobim")).toBeUndefined();
    expect(linkFor("montajyor", "/hisobim")).toBe("/hisobim");
    expect(linkFor("smm", "/yo'q-sahifa")).toBeUndefined();
  });
});

describe("To'lov kiritishdagi himoya", () => {
  const dent = (s: ErpState) => s.invoices.find((i) => i.projectId === "p_dent" && i.kind === "prepay")!;
  const ctx = (s: ErpState): Ctx => ({ s, me: s.users.find((u) => u.id === "u_mol")!, today: TODAY, notify: () => {}, log: () => {} });

  it("qolgan qarzdan keskin oshgan to'lov rad etiladi (nol ortiqcha yoki valyuta chalkashligi)", () => {
    const s = demoState();
    const inv = dent(s);
    expect(() => act.recordClientPayment(ctx(s), inv.id, { amount: inv.amount * 10, date: TODAY, accountId: "acc_bank", note: "" })).toThrow(
      /ancha oshib ketdi/,
    );
    // so'm summasi USD hisobga dollar sifatida kiritilsa ham
    expect(() => act.recordClientPayment(ctx(s), inv.id, { amount: inv.amount, date: TODAY, accountId: "acc_usd", rate: 12_650, note: "" })).toThrow(
      /ancha oshib ketdi/,
    );
    expect(s.transactions.some((t) => t.invoiceId === inv.id)).toBe(false);
  });

  it("to'g'ri to'lov (jumladan USD da, kurs bo'yicha) qabul qilinadi", () => {
    const s = demoState();
    const inv = dent(s);
    act.recordClientPayment(ctx(s), inv.id, {
      amount: Math.round((inv.amount / 12_650) * 100) / 100,
      date: TODAY,
      accountId: "acc_usd",
      rate: 12_650,
      note: "",
    });
    expect(Math.abs(invoicePaid(s, inv) - inv.amount)).toBeLessThan(100);
    // Sent yaxlitlash farqi (bir necha o'n so'm) faktura to'langanini va ishning ochilishini to'xtatmaydi
    expect(invoiceStatus(s, inv, TODAY)).toBe("paid");
    expect(invoiceOutstanding(s, inv)).toBe(0);
    expect(projectDebt(s, "p_dent", TODAY).amount).toBe(0);
  });

  it("sana kelajakda bo'lmaydi, USD hisobda kurs shart, to'langan fakturaga yana to'lab bo'lmaydi", () => {
    const s = demoState();
    const inv = dent(s);
    expect(() => act.recordClientPayment(ctx(s), inv.id, { amount: 1000, date: addDays(TODAY, 3), accountId: "acc_bank", note: "" })).toThrow(/kelajakda/);
    expect(() => act.recordClientPayment(ctx(s), inv.id, { amount: 100, date: TODAY, accountId: "acc_usd", note: "" })).toThrow(/kurs/i);
    act.recordClientPayment(ctx(s), inv.id, { amount: inv.amount, date: TODAY, accountId: "acc_bank", note: "" });
    expect(() => act.recordClientPayment(ctx(s), inv.id, { amount: 500_000, date: TODAY, accountId: "acc_bank", note: "" })).toThrow(/ancha oshib ketdi/);
  });

  it("ta'minotchi hujjatiga ham xuddi shunday", () => {
    const s = demoState();
    const b = s.bills.find((x) => x.amount > 0)!;
    expect(() => act.payBill(ctx(s), b.id, { amount: b.amount * 10, date: TODAY, accountId: "acc_bank" })).toThrow(/ancha oshib ketdi/);
  });
});

describe("Xizmatlar o'zgarganda hisob-kitob va mas'ullar", () => {
  const mk = () => {
    const s = demoState();
    return { s, c: makeCtx(s, "u_mk").c };
  };
  const payProject = (s: ErpState, id: string) =>
    pnl(s, [shiftMonthKey(monthKey(TODAY), -2), shiftMonthKey(monthKey(TODAY), -1), monthKey(TODAY)], TODAY, id).lines.find((l) => l.key === "pay_project")
      ?.total ?? 0;

  it("«Biznes» paketi (target kiritilgan) loyiha Target sahifasi uchun reklama loyihasi hisoblanadi", () => {
    const s = demoState();
    for (const id of ["p_gym", "p_baraka", "p_burger"]) expect(hasAds(s.projects.find((p) => p.id === id)!), id).toBe(true);
    // Yangi «Biznes» mijozi ham reklama loyihasi: hisob davri birinchi postdan emas, reklama yoqilgandan boshlanadi
    const { c } = { c: makeCtx(s, "u_mk").c };
    const id = act.createProject(c, {
      name: "Yangi Biznes",
      contactName: "x",
      phone: "1",
      industry: "x",
      links: "",
      contractNo: "B-1",
      contractDate: TODAY,
      prepayType: 100,
      prepayDueDate: TODAY,
      remainderDueDate: "",
      marketologId: "u_mk",
      smmId: "u_smm1",
      targetologId: "u_tg",
      services: [serviceFromTariff(s.tariffs.find((t) => t.id === "t_biznes")!)],
    });
    expect(hasAds(s.projects.find((p) => p.id === id)!)).toBe(true);
  });

  it("SMM xizmati bekor qilinsa SMM menejerga loyiha oyligi hisoblanmaydi", () => {
    const { s, c } = mk();
    const p = s.projects.find((x) => x.id === "p_mebel")!;
    const before = payProject(s, p.id);
    act.cancelService(c, p.id, p.services.find((x) => x.kind === "smm")!.id);
    const after = payProject(s, p.id);
    const smmRate = s.payProfiles.find((x) => x.userId === p.smmId)!.perProject;
    // Joriy davrning o'tgan qismi (21/30) uchun SMM ulushi chiqib ketadi; yopilgan davrlar o'zgarmaydi
    expect(before - after).toBeGreaterThan(smmRate * 0.5);
    expect(before - after).toBeLessThanOrEqual(smmRate + 1);
    expect(check(s, TODAY)).toEqual([]);
  });

  it("bir martalik ishi tugamagan loyihani yopib bo'lmaydi; topshirgach yopiladi", () => {
    const { s, c } = mk();
    expect(() => act.closeProject(c, "p_mebel", TODAY)).toThrow(/bir martalik/);
    const web = s.projects.find((p) => p.id === "p_mebel")!.services.find((x) => x.kind === "web")!;
    act.cancelService(c, "p_mebel", web.id);
    act.closeProject(c, "p_mebel", TODAY);
    expect(s.projects.find((p) => p.id === "p_mebel")!.status).toBe("closed");
  });

  it("USD kursi o'zgarsa, loyiha oylik summasi (performance foizi) va MRR bir xil yangilanadi", () => {
    const s = demoState();
    s.settings.usdRate = 13_500;
    syncAll(s, TODAY);
    const av = s.projects.find((p) => p.id === "p_avtolux")!;
    expect(av.monthlyFee).toBe(recurringFee(av, 13_500));
    expect(check(s, TODAY)).toEqual([]);
  });

  it("targetologi yo'q loyihaga target xizmati qo'shilsa — targetolog tayinlanadi va xabar oladi", () => {
    const s = demoState();
    const { c, notes } = makeCtx(s, "u_mk");
    act.addService(c, "p_dent", { kind: "target", title: "Target", price: 4_000_000 });
    const p = s.projects.find((x) => x.id === "p_dent")!;
    expect(p.targetologId).toBeTruthy();
    expect(notes.some((n) => n.to.includes(p.targetologId!))).toBe(true);
    expect(check(s, TODAY)).toEqual([]);
  });

  it("oy o'rtasida oylik xizmat qo'shilganda moliyaga ogohlantirish ketadi (joriy davr uchun faktura yo'q)", () => {
    const s = demoState();
    const { c, notes } = makeCtx(s, "u_mk");
    act.addService(c, "p_baraka", { kind: "performance", title: "P", price: 3_000_000 });
    expect(notes.some((n) => n.to.includes("u_mol") && /Joriy davr uchun faktura chiqmaydi/.test(n.text))).toBe(true);
  });
});
