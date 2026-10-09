// Mustaqil tekshiruv qoidalari (invariantlar): unit, tasodifiy (fuzz) va brauzer (e2e) testlari bir xil qoidalardan foydalanadi.
// Ilova kodiga kirmaydi — faqat testlar import qiladi.
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
import { currentPeriod } from "./period";
import { invoiceLines, isRecurring, recurringFee, serviceOf } from "./services";
import { nonFinite } from "./test-utils";
import type { ErpState } from "./types";

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

// ---------- Invariantlar ----------

export function check(s: ErpState, today: string): string[] {
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

  // 7. Ish haqi xarajati = hisoblanganlar + joriy davr/oy uchun «ishlab topilgan» ulush (xodim ishlagan kunlar bo'yicha, kunma-kun)
  const workedOn = (uid: string, d: string) => {
    const u = s.users.find((x) => x.id === uid);
    if (!u || (u.hiredAt && d < u.hiredAt)) return false;
    if (!u.archivedAt) return u.active;
    if (d < u.archivedAt) return true;
    return u.active && (!u.activeFrom || u.activeFrom <= u.archivedAt || d >= u.activeFrom);
  };
  const daysWorked = (uid: string, from: string, toIncl: string) => {
    let n = 0;
    for (let d = from; d <= toIncl; d = addDays(d, 1)) if (workedOn(uid, d)) n++;
    return n;
  };
  const billedAt = (p: (typeof s.projects)[number], d: string) =>
    !p.services.length
      ? p.monthlyFee > 0
      : p.services.some(
          (x) =>
            isRecurring(x.kind) &&
            (!x.billFrom || x.billFrom <= d) &&
            (x.status === "cancelled" ? Boolean(x.cancelledAt && x.cancelledAt > d) : true) &&
            x.price > 0,
        );
  let accrued = s.accruals.reduce((a, x) => a + x.amount, 0);
  for (const p of s.projects) {
    const per = currentPeriod(p, today);
    if (!per || p.status === "closed" || !billedAt(p, per.start)) continue;
    const total = diffDays(per.end, per.start);
    const act_ = p.services.filter((x) => x.status === "active");
    const staff = [
      !p.services.length || act_.some((x) => x.kind === "smm") ? p.smmId : undefined,
      act_.some((x) => x.kind === "target" || x.kind === "performance" || (x.kind === "smm" && x.withTarget)) ? p.targetologId : undefined,
      p.marketologId,
    ];
    for (const uid of new Set(staff.filter(Boolean) as string[])) {
      const rate = s.payProfiles.find((x) => x.userId === uid)?.perProject ?? 0;
      accrued += (rate * daysWorked(uid, per.start, today)) / total;
    }
  }
  for (const prof of s.payProfiles) {
    if (prof.fixed <= 0) continue;
    if (s.accruals.some((a) => a.sourceId === `fix:${prof.userId}:${cur}`)) continue;
    const dim = diffDays(`${shiftMonthKey(cur, 1)}-01`, `${cur}-01`);
    const from = prof.fixedFrom && prof.fixedFrom > `${cur}-01` ? prof.fixedFrom : `${cur}-01`;
    accrued += (prof.fixed * daysWorked(prof.userId, from, today)) / dim;
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
