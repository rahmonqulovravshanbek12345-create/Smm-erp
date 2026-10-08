// To'liq tekshiruv: hisob-kitoblar mustaqil usulda qayta hisoblanadi (kodning o'zini o'zi tasdiqlashi emas),
// turli sanalarda va tasodifiy amallar ketma-ketligidan keyin ham modullar bir-biriga mos kelishi tekshiriladi.
import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { contentTypes, isAdType, postTypeId } from "./content";
import { addDays, diffDays, monthKey, shiftMonthKey } from "./dates";
import {
  accountBalance,
  accountOf,
  articleOf,
  cashFlow,
  employeeBalance,
  employeeLedger,
  invoiceOutstanding,
  invoicePaid,
  invoiceStatus,
  mrr,
  payables,
  paymentCalendar,
  payrollSheet,
  pnl,
  projectDebt,
  projectProfitability,
  receivables,
  reconClient,
  signedUZS,
  totalCashUZS,
  transitBalance,
  unrecognizedRevenue,
} from "./finance";
import { outstandingOf } from "./money";
import { access } from "./permissions";
import { linkFor, moduleOfPath as moduleOf } from "./routes";
import { currentPeriod } from "./period";
import { alertsFor } from "./rules";
import { serviceFromTariff } from "./tariffs";
import { hasAds, invoiceLines, isRecurring, recurringFee, serviceOf } from "./services";
import { TODAY, demoState, makeCtx, nonFinite } from "./test-utils";
import { syncAll } from "./store-sync";
import type { Ctx } from "./store";
import type { ErpState } from "./types";

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

// ---------- Invariantlar ----------

function check(s: ErpState, today: string): string[] {
  const bad: string[] = [];
  const fail = (m: string) => bad.push(m);
  const cur = monthKey(today);

  // Oyna: eng birinchi hujjatdan joriy oygacha
  const firstDate =
    [...s.invoices.map((i) => i.issueDate), ...s.transactions.map((t) => t.date), ...s.accruals.map((a) => a.date), ...s.bills.map((b) => b.date)].sort()[0] ??
    today;
  const months: string[] = [];
  for (let m = monthKey(addDays(firstDate, -62)); m <= cur; m = shiftMonthKey(m, 1)) months.push(m);

  // 1. Hamma natijalar chekli son
  const P = pnl(s, months, today);
  const CF = cashFlow(s, months);
  const REC = receivables(s, today);
  const PAY = payables(s, today);
  const PF = projectProfitability(s, months, today);
  const CAL = paymentCalendar(s, today);
  for (const [name, v] of Object.entries({ P, CF, REC, PAY, PF, CAL, mrr: mrr(s, today) })) {
    const nf = nonFinite(v, name);
    if (nf.length) fail(`chekli emas: ${nf.slice(0, 3).join("; ")}`);
  }

  // 2. Havolalar butunligi
  const userIds = new Set(s.users.map((u) => u.id));
  const projIds = new Set(s.projects.map((p) => p.id));
  const svcIds = new Set(s.projects.flatMap((p) => p.services.map((x) => x.id)));
  const invIds = new Set(s.invoices.map((i) => i.id));
  const typeIds = new Set(contentTypes(s).map((t) => t.id));
  for (const p of s.projects) {
    if (!userIds.has(p.marketologId)) fail(`${p.name}: marketolog yo'q`);
    if (p.smmId && !userIds.has(p.smmId)) fail(`${p.name}: smm yo'q`);
    if (p.targetologId && !userIds.has(p.targetologId)) fail(`${p.name}: targetolog yo'q`);
    if (!p.services.length) fail(`${p.name}: xizmat yo'q`);
    const hasSmm = p.services.some((x) => x.kind === "smm" && x.status !== "cancelled");
    if (hasSmm && !p.smmId) fail(`${p.name}: SMM xizmati bor, SMM menejer yo'q`);
    const ads = p.services.some((x) => (x.kind === "target" || x.kind === "performance") && x.status !== "cancelled");
    if (ads && !p.targetologId) fail(`${p.name}: reklama xizmati bor, targetolog yo'q`);
    for (const x of p.services) {
      if ((x.status === "done") !== Boolean(x.deliveredAt)) fail(`${p.name}/${x.kind}: holat va topshirilgan sana mos emas`);
      if (!isRecurring(x.kind) && x.stages && x.status === "done" && x.stages.some((st) => !st.doneAt))
        fail(`${p.name}/${x.kind}: topshirilgan, lekin bosqichlar tugamagan`);
      if (!isRecurring(x.kind) && x.status !== "cancelled" && x.assigneeId && !userIds.has(x.assigneeId)) fail(`${p.name}/${x.kind}: ijrochi yo'q`);
    }
  }
  for (const p of s.projects) {
    const hasReports = s.targetReports.some((r) => r.projectId === p.id);
    const isAds = (x: (typeof p.services)[number]) => x.kind === "target" || x.kind === "performance" || (x.kind === "smm" && x.withTarget);
    // Tarixiy hisobotlar bekor qilingan xizmatdan ham qolishi mumkin; faol reklama xizmati esa targetologsiz bo'lmaydi
    if (hasReports && !p.services.some(isAds)) fail(`${p.name}: target hisobotlari bor, lekin reklama xizmati yo'q (Target sahifasida ko'rinmaydi)`);
    if (p.services.some((x) => x.status !== "cancelled" && isAds(x)) && !p.targetologId) fail(`${p.name}: reklama xizmati bor, targetolog yo'q`);
  }
  for (const x of s.posts) {
    if (!projIds.has(x.projectId)) fail(`post ${x.topic}: loyiha yo'q`);
    // Oddiy post kamida bitta platformada; reklama videosi (target) — platformasiz, targetologga beriladi
    const ad = isAdType(s, x.typeId);
    if (!ad && !x.platforms.length) fail(`post ${x.topic}: platforma yo'q`);
    if (ad && x.platforms.length) fail(`post ${x.topic}: reklama videosi platformaga bog'langan`);
    if (ad && x.status === "published" && !s.tasks.some((t) => t.postId === x.id && t.kind === "target"))
      fail(`post ${x.topic}: reklama videosi «berildi», lekin targetologga TZ yo'q`);
    if (!typeIds.has(postTypeId(x))) fail(`post ${x.topic}: noma'lum tur ${postTypeId(x)}`);
    for (const pl of Object.keys(x.publishedOn ?? {}))
      if (!x.platforms.includes(pl as never)) fail(`post ${x.topic}: ${pl} platformada emas, lekin joylangan deb belgilangan`);
    if (x.status === "published" && x.platforms.some((pl) => !x.publishedOn?.[pl])) fail(`post ${x.topic}: «Joylandi», lekin ba'zi platformada joylanmagan`);
    if (x.status !== "published" && x.publishedAt) fail(`post ${x.topic}: joylanmagan, lekin publishedAt bor`);
  }
  for (const q of s.quotas) {
    if (!projIds.has(q.projectId)) fail(`topshiriq: loyiha yo'q`);
    for (const k of Object.keys(q.counts)) if (k !== "shoot" && !typeIds.has(k)) fail(`topshiriq: noma'lum tur ${k}`);
  }
  for (const i of s.invoices) {
    if (!projIds.has(i.projectId)) fail(`${i.number}: loyiha yo'q`);
    if (i.serviceId && !svcIds.has(i.serviceId)) fail(`${i.number}: xizmat yo'q`);
    const sum = invoiceLines(s, i).reduce((a, l) => a + l.amount, 0);
    if (sum !== i.amount) fail(`${i.number}: qatorlar yig'indisi ${sum} ≠ ${i.amount}`);
    if (!(i.amount > 0)) fail(`${i.number}: summa ${i.amount}`);
  }
  for (const t of s.transactions) {
    if (!accountOf(s, t.accountId)) fail(`tx ${t.id}: hisob yo'q`);
    if (!articleOf(s, t.articleId)) fail(`tx ${t.id}: modda yo'q`);
    if (t.invoiceId && !invIds.has(t.invoiceId)) fail(`tx ${t.id}: faktura yo'q`);
    if (t.userId && !userIds.has(t.userId)) fail(`tx ${t.id}: xodim yo'q`);
    if (!(t.amount > 0)) fail(`tx ${t.id}: summa ${t.amount}`);
  }
  const numbers = s.invoices.map((i) => i.number);
  if (new Set(numbers).size !== numbers.length) fail("takroriy faktura raqami");
  const srcs = s.accruals.map((a) => a.sourceId).filter(Boolean);
  if (new Set(srcs).size !== srcs.length) fail("takroriy hisoblash manbasi (ish haqi ikki marta hisoblangan)");
  const ids = [...s.invoices, ...s.accruals, ...s.transactions, ...s.posts].map((x) => x.id);
  if (new Set(ids).size !== ids.length) fail("takroriy ID");

  // 3. Bir martalik xizmat: fakturalar xizmat narxiga teng
  for (const p of s.projects)
    for (const x of p.services) {
      if (isRecurring(x.kind) || x.status === "cancelled") continue;
      const sum = s.invoices.filter((i) => i.serviceId === x.id && !i.voidedAt).reduce((a, i) => a + i.amount, 0);
      if (x.deliveredAt && sum !== x.price) fail(`${p.name}/${x.kind}: topshirilgan, fakturalar ${sum} ≠ narx ${x.price}`);
      if (!x.deliveredAt && sum > x.price) fail(`${p.name}/${x.kind}: fakturalar narxdan oshib ketgan`);
    }

  // 4. Daromad — mustaqil hisob: har faktura bo'yicha kunma-kun
  // Bekor qilingan faktura: to'lov yo'q, qarz va daromad emas
  for (const inv of s.invoices) {
    if (!inv.voidedAt) continue;
    if (invoicePaid(s, inv) > 0.5) fail(`${inv.number}: bekor qilingan, lekin to'lov bor`);
    if (invoiceOutstanding(s, inv) !== 0) fail(`${inv.number}: bekor qilingan, lekin qarz sifatida qolgan`);
  }
  // Yopilgan loyiha: yopilgandan keyin boshlanadigan davr fakturasi faqat to'langan bo'lsa qoladi (avans)
  for (const p of s.projects) {
    if (p.status !== "closed" || !p.closedAt || !p.periodStart) continue;
    for (const inv of s.invoices) {
      if (inv.projectId !== p.id || inv.kind !== "monthly" || inv.voidedAt) continue;
      if (addMonthsLocal(p.periodStart, inv.periodIndex) >= p.closedAt && invoicePaid(s, inv) <= 0.5)
        fail(`${p.name}: yopilgandan keyingi davr fakturasi ${inv.number} qarz bo'lib qolgan`);
    }
  }

  let expectRevenue = 0;
  for (const inv of s.invoices) {
    if (inv.voidedAt) continue;
    const svc = serviceOf(s, inv.serviceId)?.service;
    let start: string;
    let end: string;
    if (inv.kind === "extra") [start, end] = [inv.issueDate, addDays(inv.issueDate, 1)];
    else if (inv.serviceId) {
      if (!svc?.deliveredAt) continue;
      [start, end] = [svc.deliveredAt, addDays(svc.deliveredAt, 1)];
    } else {
      const p = s.projects.find((x) => x.id === inv.projectId)!;
      if (!p.periodStart) continue;
      [start, end] = [addMonthsLocal(p.periodStart, inv.periodIndex), addMonthsLocal(p.periodStart, inv.periodIndex + 1)];
      // Yopilgandan keyin boshlangan davr xizmati ko'rsatilmagan — daromad emas
      if (p.status === "closed" && p.closedAt && start >= p.closedAt) continue;
    }
    const total = diffDays(end, start);
    let served = 0;
    for (let d = start; d < end && d <= today; d = addDays(d, 1)) served++;
    expectRevenue += (inv.amount * served) / total;
  }
  let otherRevenue = 0;
  for (const t of s.transactions) if (!t.invoiceId && !t.billId && articleOf(s, t.articleId)?.group === "revenue") otherRevenue += signedUZS(s, t);
  if (!near(P.sum.revenue, expectRevenue + otherRevenue, 1))
    fail(`P&L daromadi ${Math.round(P.sum.revenue)} ≠ mustaqil hisob ${Math.round(expectRevenue + otherRevenue)}`);
  // «tan olinmagan qism» funksiyasi bilan ham mos
  const unrec = s.invoices.reduce((a, i) => a + unrecognizedRevenue(s, i, today), 0);
  const invTotal = s.invoices.filter((i) => !i.voidedAt).reduce((a, i) => a + i.amount, 0);
  if (!near(invTotal - unrec, expectRevenue, 1)) fail(`tan olingan daromad ${Math.round(invTotal - unrec)} ≠ ${Math.round(expectRevenue)}`);

  // 5. P&L algebrasi va loyihalar yig'indisi
  for (const m of months) {
    const t = P.totals;
    if (!near(t.gross[m]!, t.revenue[m]! - t.direct[m]!, 0.01)) fail(`${m}: yalpi foyda formulasi`);
    if (!near(t.net[m]!, t.revenue[m]! - t.direct[m]! - t.overhead[m]! - t.tax[m]!, 0.01)) fail(`${m}: sof foyda formulasi`);
  }
  const byProject = s.projects.reduce((a, p) => a + pnl(s, months, today, p.id).sum.revenue, 0);
  const noProject = s.transactions
    .filter((t) => !t.invoiceId && !t.billId && !t.projectId && articleOf(s, t.articleId)?.group === "revenue")
    .reduce((a, t) => a + signedUZS(s, t), 0);
  if (!near(P.sum.revenue - byProject, noProject, 1))
    fail(`loyihalar daromadi yig'indisi mos emas (${Math.round(P.sum.revenue - byProject)} ≠ ${Math.round(noProject)})`);
  const rowsRev = PF.reduce((a, r) => a + r.revenue, 0);
  if (!near(rowsRev, byProject, 1)) fail(`rentabellik jadvali daromadi ${Math.round(rowsRev)} ≠ ${Math.round(byProject)}`);

  // 6. Xarajatlar — mustaqil hisob (ish haqidan tashqari)
  let expectExp = 0;
  for (const b of s.bills) if (["direct", "overhead"].includes(articleOf(s, b.articleId)?.group ?? "")) expectExp += b.amount;
  for (const t of s.transactions) {
    if (t.billId || t.invoiceId) continue;
    const g = articleOf(s, t.articleId)?.group;
    if (g === "direct" || g === "overhead" || g === "tax") expectExp += -signedUZS(s, t);
  }
  const gotExp = P.lines.filter((l) => l.section !== "revenue" && !l.key.startsWith("pay_")).reduce((a, l) => a + l.total, 0);
  if (!near(gotExp, expectExp, 1)) fail(`xarajatlar ${Math.round(gotExp)} ≠ mustaqil hisob ${Math.round(expectExp)}`);

  // 7. Ish haqi xarajati = hisoblanganlar + joriy davr/oy uchun «ishlab topilgan» ulush
  let accrued = s.accruals.reduce((a, x) => a + x.amount, 0);
  for (const p of s.projects) {
    const per = currentPeriod(p, today);
    if (!per || p.status === "closed") continue;
    const share = diffDays(addDays(today, 1), per.start) / diffDays(per.end, per.start);
    const act_ = p.services.filter((x) => x.status === "active");
    const staff = [
      act_.some((x) => x.kind === "smm") ? p.smmId : undefined,
      act_.some((x) => x.kind === "target" || x.kind === "performance" || (x.kind === "smm" && x.withTarget)) ? p.targetologId : undefined,
      p.marketologId,
    ];
    for (const uid of new Set(staff.filter(Boolean) as string[])) {
      const rate = s.payProfiles.find((x) => x.userId === uid)?.perProject ?? 0;
      accrued += rate * share;
    }
  }
  for (const prof of s.payProfiles) {
    if (prof.fixed <= 0 || !s.users.find((u) => u.id === prof.userId)?.active) continue;
    if (s.accruals.some((a) => a.sourceId === `fix:${prof.userId}:${cur}`)) continue;
    const dim = diffDays(`${shiftMonthKey(cur, 1)}-01`, `${cur}-01`);
    accrued += (prof.fixed * diffDays(addDays(today, 1), `${cur}-01`)) / dim;
  }
  const gotPay = P.lines.filter((l) => l.key.startsWith("pay_")).reduce((a, l) => a + l.total, 0);
  if (!near(gotPay, accrued, 2)) fail(`ish haqi xarajati P&L'da ${Math.round(gotPay)} ≠ hisoblangan ${Math.round(accrued)}`);

  // 8. Pul oqimi: zanjir va valyuta qayta baholash
  for (let i = 1; i < months.length; i++)
    if (!near(CF.opening[months[i]!]!, CF.closing[months[i - 1]!]!, 0.01)) fail(`pul oqimi zanjiri uzilgan: ${months[i]}`);
  let fxReval = 0;
  for (const acc of s.accounts) {
    if (acc.currency !== "USD") continue;
    let sumTx = acc.opening * s.settings.usdRate;
    for (const t of s.transactions) if (t.accountId === acc.id) sumTx += signedUZS(s, t);
    fxReval += accountBalance(s, acc.id) * s.settings.usdRate - sumTx;
  }
  const last = months[months.length - 1]!;
  if (!near(totalCashUZS(s) - CF.closing[last]!, fxReval, 1))
    fail(`kassa qoldig'i ${Math.round(totalCashUZS(s))} ≠ pul oqimi yakuni ${Math.round(CF.closing[last]!)} + kurs farqi`);

  // 9. Debitorlik
  for (const r of REC) {
    const issued = s.invoices.filter((i) => i.projectId === r.project.id && i.issueDate <= today && !i.voidedAt);
    const inv = issued.reduce((a, i) => a + i.amount, 0);
    const paid = issued.reduce((a, i) => a + invoicePaid(s, i), 0);
    const out = issued.reduce((a, i) => a + outstandingOf(i.amount, invoicePaid(s, i)), 0);
    if (!near(r.invoiced, inv, 0.01) || !near(r.paid, paid, 0.01)) fail(`${r.project.name}: debitorlik hisob-faktura/to'lov`);
    if (!near(r.notDue + r.d30 + r.d60 + r.d60plus, out, 0.01))
      fail(`${r.project.name}: qarz muddatlari yig'indisi ${Math.round(r.notDue + r.d30 + r.d60 + r.d60plus)} ≠ ${Math.round(out)}`);
    if (r.advance < -0.01) fail(`${r.project.name}: avans manfiy`);
    const recon = reconClient(s, r.project.id, "2000-01-01", today).closing;
    const futurePaid = s.transactions.some(
      (t) =>
        t.invoiceId &&
        s.invoices.find((i) => i.id === t.invoiceId)?.projectId === r.project.id &&
        s.invoices.find((i) => i.id === t.invoiceId)!.issueDate > today,
    );
    if (!futurePaid && !near(recon, r.balance, 0.01)) fail(`${r.project.name}: akt-sverka ${Math.round(recon)} ≠ debitorlik ${Math.round(r.balance)}`);
    // qarz (kechikkan) = projectDebt
    const d = projectDebt(s, r.project.id, today).amount;
    if (!near(d, r.d30 + r.d60 + r.d60plus, 0.01))
      fail(`${r.project.name}: qarz ${Math.round(d)} ≠ muddati o'tganlar ${Math.round(r.d30 + r.d60 + r.d60plus)}`);
  }

  // 10. Ish haqi: qoldiq = hisoblangan − to'langan; vedomost qatori yopiladi
  for (const u of s.users) {
    const led = employeeLedger(s, u.id);
    if (!near(led.balance, employeeBalance(s, u.id), 0.01))
      fail(`${u.name}: daftar ${Math.round(led.balance)} ≠ qoldiq ${Math.round(employeeBalance(s, u.id))}`);
  }
  for (const m of months.slice(-3)) {
    for (const row of payrollSheet(s, m)) {
      if (!near(row.opening + row.accrued - row.paid, row.closing, 0.01))
        fail(`vedomost ${m} ${row.user.name}: ${Math.round(row.opening)}+${Math.round(row.accrued)}−${Math.round(row.paid)} ≠ ${Math.round(row.closing)}`);
      const byKind = Object.values(row.byKind).reduce((a, v) => a + (v ?? 0), 0);
      if (!near(byKind, row.accrued, 0.01)) fail(`vedomost ${m} ${row.user.name}: turlar yig'indisi`);
    }
  }
  const owed = s.users.reduce((a, u) => a + Math.max(0, employeeBalance(s, u.id, today)), 0);
  if (
    !near(
      PAY.employees.reduce((a, r) => a + Math.max(0, r.balance), 0),
      owed,
      0.01,
    )
  )
    fail("majburiyatlar: xodimlar qarzi mos emas");

  // 11. Tranzit
  const transit = s.projects.reduce((a, p) => a + transitBalance(s, p.id), 0) + transitBalance(s, undefined) * 0;
  const transitAll = s.transactions.filter((t) => articleOf(s, t.articleId)?.group === "transit" && t.projectId).reduce((a, t) => a + signedUZS(s, t), 0);
  if (!near(transit, transitAll, 0.01)) fail("tranzit: loyihalar yig'indisi mos emas");

  // 12. MRR
  const mrrExpect = s.projects.filter((p) => p.status !== "closed" && currentPeriod(p, today)).reduce((a, p) => a + recurringFee(p, s.settings.usdRate), 0);
  if (!near(mrr(s, today), mrrExpect, 0.01)) fail("MRR mos emas");

  // 13. To'lov kalendari: oxirgi qoldiq = erkin pul + kunlik sof yig'indi
  if (CAL.days.length) {
    const net = CAL.days.reduce((a, d) => a + d.net, 0);
    if (!near(CAL.days[CAL.days.length - 1]!.balance, CAL.free + net, 0.01)) fail("to'lov kalendari: qoldiq zanjiri");
  }
  return bad;
}

// Mustaqil addMonths (oy oxiriga qisqartiradi) — dates.addMonths bilan solishtiriladi
function addMonthsLocal(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

// ---------- Testlar ----------

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
            act.createProject(ctx("u_mk"), {
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
                  ? { kind: k, title: "T", price: 1_000_000 * (2 + Math.floor(r() * 10)), adPct: k === "performance" ? 10 : undefined }
                  : {
                      kind: k,
                      title: "T",
                      price: 1_000_000 * (3 + Math.floor(r() * 20)),
                      prepayPct: r() < 0.5 ? (50 as const) : (100 as const),
                      assigneeId: k === "web" ? "u_web" : "u_dz",
                      assigneeFee: 500_000,
                    },
              ),
            });
          });
        } else if (roll < 0.34) {
          run("to'lov", () => {
            const unpaid = s.invoices.filter((i) => i.issueDate <= today && i.amount - invoicePaid(s, i) > 1);
            const inv = pick(unpaid);
            if (!inv) return;
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
            act.addService(
              ctx("u_mk"),
              p.id,
              isRecurring(k) ? { kind: k, title: "T", price: 3_000_000 } : { kind: k, title: "T", price: 6_000_000, prepayPct: 50, assigneeId: "u_dz" },
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
          run("xarajat", () => {
            act.addTransaction(ctx("u_mol"), { date: today, accountId: "acc_card", dir: "out", amount: 250_000, articleId: "a_software", note: "x" } as never);
          });
        } else if (roll < 0.94) {
          run("loyiha yopish", () => {
            const p = pick(s.projects.filter((x) => x.status === "active" && x.id.startsWith("p_") && !["p_mebel", "p_gym"].includes(x.id)));
            if (p) act.closeProject(ctx("u_mk"), p.id, today);
          });
        } else {
          run("vaqt o'tdi", () => {
            today = addDays(today, 1 + Math.floor(r() * 12));
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
