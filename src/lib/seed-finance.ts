// Demo uchun 5–6 oylik moliyaviy tarix: fakturalar, mijoz to'lovlari, tranzit reklama byudjeti,
// ish haqi hisoblashlari va to'lovlari, doimiy xarajatlar, soliq, jihoz va dividend.
// Hammasi bugungi sanaga nisbatan quriladi va deterministik (har safar bir xil natija).
import { addDays, addMonths, diffDays, fmtMonth, monthKey, shiftMonthKey } from "./dates";
import { ART, DEFAULT_ARTICLES, clientCashIn, employeeBalance, pieceAccrual, syncAccruals, taskWorkType } from "./finance";
import { periodAt } from "./period";
import type { Accrual, ErpState, Invoice, Project, Transaction, WorkType } from "./types";

export function addFinanceHistory(s: ErpState, today: string): void {
  let seq = 0;
  const id = (p: string) => `${p}_h${(++seq).toString(36)}`;
  const d = (n: number) => addDays(today, n);
  const curMonth = monthKey(today);
  const histStart = `${s.settings.payrollStart}-01`;
  /** Deterministik kurs: 12 500 – 12 700 oralig'ida. */
  const rateOn = (date: string) => 12_500 + ((((diffDays(date, today) * 37) % 200) + 200) % 200);

  s.articles = DEFAULT_ARTICLES.map((a) => ({ ...a }));
  s.accounts = [
    { id: "acc_bank", name: "Bank hisob (Kapitalbank)", kind: "bank", currency: "UZS", opening: 48_000_000 },
    { id: "acc_cash", name: "Naqd kassa", kind: "cash", currency: "UZS", opening: 9_000_000 },
    { id: "acc_card", name: "Korporativ karta (Uzcard)", kind: "card", currency: "UZS", opening: 4_000_000 },
    { id: "acc_usd", name: "Valyuta karta (Visa, USD)", kind: "card", currency: "USD", opening: 300 },
  ];
  s.vendors = [
    { id: "v_rent", name: "«Poytaxt» biznes markazi", kind: "Ijara" },
    { id: "v_soft", name: "Adobe, Canva, CapCut", kind: "Dasturlar" },
    { id: "v_inet", name: "Uzonline", kind: "Internet" },
  ];
  s.payProfiles = [
    { userId: "u_mk", fixed: 6_000_000, perProject: 0, rates: {} },
    { userId: "u_mol", fixed: 3_500_000, perProject: 0, rates: {} },
    { userId: "u_op1", fixed: 2_000_000, perProject: 0, rates: { shartnoma: 150_000 } },
    { userId: "u_op2", fixed: 2_000_000, perProject: 0, rates: { shartnoma: 150_000 } },
    { userId: "u_smm1", fixed: 0, perProject: 2_000_000, rates: {} },
    { userId: "u_smm2", fixed: 0, perProject: 2_000_000, rates: {} },
    { userId: "u_tg", fixed: 0, perProject: 1_200_000, rates: {} },
    { userId: "u_sy", fixed: 0, perProject: 0, rates: { syomka: 350_000 } },
    { userId: "u_mt1", fixed: 0, perProject: 0, rates: { montaj: 200_000 } },
    { userId: "u_mt2", fixed: 0, perProject: 0, rates: { montaj: 200_000 } },
    { userId: "u_dz", fixed: 0, perProject: 0, rates: { dizayn_post: 70_000, dizayn_cover: 40_000 } },
  ];

  const tx = (t: Omit<Transaction, "id" | "createdBy" | "note"> & { note?: string }) => {
    if (t.date > today) return;
    s.transactions.push({ id: id("tx"), createdBy: "u_mol", note: "", ...t });
  };
  const usd = (date: string) => ({ rate: rateOn(date) });
  const active = (p: Project, date: string) => !(p.status === "closed" && p.closedAt && date >= p.closedAt);

  // ---------- 1. Fakturalar va mijoz to'lovlari ----------
  type Plan = { delay: number; part?: number; account?: string } | null;
  /** Har loyiha uchun to'lov intizomi: kechikish (kun) va qisman to'lov. */
  const behaviour = (p: Project, inv: Invoice): Plan => {
    if (p.id === "p_dent") return null;
    if (p.id === "p_gym") {
      if (inv.kind === "monthly" && inv.periodIndex === 2) return { delay: 6, account: "acc_cash" };
      if (inv.kind === "monthly" && inv.periodIndex === 3) return { delay: 1, part: 6_000_000 };
      return { delay: 0 };
    }
    if (p.id === "p_moda" && inv.kind === "monthly" && inv.periodIndex === 2) return { delay: 9, part: 3_000_000 };
    if (p.id === "p_moda") return { delay: 3 };
    if (p.id === "p_baraka") return { delay: 2 + (inv.periodIndex % 3) };
    if (p.id === "p_burger") return { delay: inv.kind === "remainder" ? 2 : 1 };
    return { delay: inv.periodIndex % 2 };
  };

  const invoices: Invoice[] = [];
  for (const p of s.projects) {
    const pre = Math.round((p.monthlyFee * p.prepayType) / 100);
    invoices.push({
      id: id("inv"),
      number: "",
      projectId: p.id,
      kind: "prepay",
      periodIndex: 0,
      amount: pre,
      issueDate: p.contractDate,
      dueDate: p.id === "p_dent" ? d(2) : addDays(p.contractDate, 2),
      note: `Oldindan to'lov (${p.prepayType}%)`,
    });
    if (p.prepayType === 50) {
      invoices.push({
        id: id("inv"),
        number: "",
        projectId: p.id,
        kind: "remainder",
        periodIndex: 0,
        amount: p.monthlyFee - pre,
        issueDate: p.contractDate,
        dueDate: p.periodStart ? addDays(p.periodStart, 15) : "",
        note: "Qoldiq to'lov (50%)",
      });
    }
    if (!p.periodStart) continue;
    for (let i = 1; addMonths(p.periodStart, i) <= addDays(today, 3); i++) {
      const due = addMonths(p.periodStart, i);
      if (!active(p, due)) break;
      invoices.push({
        id: id("inv"),
        number: "",
        projectId: p.id,
        kind: "monthly",
        periodIndex: i,
        amount: p.monthlyFee,
        issueDate: addDays(due, -3),
        dueDate: due,
        note: `${i + 1}-davr uchun abonent to'lovi`,
      });
    }
  }
  invoices.sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  invoices.forEach((inv, i) => (inv.number = `SF-${String(i + 1).padStart(4, "0")}`));
  s.invoices = invoices;

  for (const inv of invoices) {
    const p = s.projects.find((x) => x.id === inv.projectId)!;
    const plan = behaviour(p, inv);
    if (!plan || !inv.dueDate) continue;
    tx({
      date: addDays(inv.dueDate, plan.delay),
      accountId: plan.account ?? "acc_bank",
      dir: "in",
      amount: plan.part ?? inv.amount,
      articleId: ART.client,
      projectId: p.id,
      invoiceId: inv.id,
      note: plan.part ? "Qisman to'lov" : "",
    });
  }

  // ---------- 2. Tranzit: mijozlar reklama byudjeti (USD) ----------
  for (const p of s.projects) {
    if (!p.periodStart || !p.adBudgetUsd) continue;
    for (let i = 0; ; i++) {
      const per = periodAt(p, i)!;
      if (per.start > today || !active(p, per.start)) break;
      const inDate = addDays(per.start, 1);
      tx({
        date: inDate,
        accountId: "acc_usd",
        dir: "in",
        amount: p.adBudgetUsd,
        ...usd(inDate),
        articleId: ART.transitIn,
        projectId: p.id,
        note: `${i + 1}-davr reklama byudjeti`,
      });
      for (const [k, share] of [
        [3, 0.5],
        [16, 0.45],
      ] as const) {
        const date = addDays(per.start, k);
        tx({
          date,
          accountId: "acc_usd",
          dir: "out",
          amount: Math.round(p.adBudgetUsd * share),
          ...usd(date),
          articleId: ART.transitOut,
          projectId: p.id,
          note: "Meta Ads to'ldirish",
        });
      }
    }
  }

  // ---------- 3. Ish haqi hisoblashlari ----------
  const accruals: Accrual[] = [];
  const piece = (userId: string, wt: WorkType, projectId: string | undefined, date: string, title: string, sourceId: string) => {
    if (date < histStart || date > today) return;
    const a = pieceAccrual(s, userId, wt, { projectId, date, sourceId, title, createdBy: "system", id: id("acr") });
    if (a) accruals.push(a);
  };
  const volume: Record<string, { montaj: number; post: number; shoots: number }> = {
    p_mebel: { montaj: 6, post: 5, shoots: 2 },
    p_gym: { montaj: 8, post: 4, shoots: 2 },
    p_baraka: { montaj: 7, post: 6, shoots: 3 },
    p_moda: { montaj: 5, post: 5, shoots: 2 },
    p_burger: { montaj: 6, post: 5, shoots: 2 },
  };
  /** Joriy davri seed'dagi vazifalardan olinadigan loyihalar. */
  const liveTasks = new Set(["p_mebel", "p_gym"]);

  for (const p of s.projects) {
    const v = volume[p.id];
    if (!p.periodStart || !v) continue;
    for (let i = 0; ; i++) {
      const per = periodAt(p, i)!;
      if (per.start > today || !active(p, per.start)) break;
      const isCurrent = per.end > today;
      if (isCurrent && liveTasks.has(p.id)) break;
      const days = diffDays(per.end, per.start);
      for (let k = 0; k < v.montaj; k++) {
        const date = addDays(per.start, Math.round(((k + 1) * days) / (v.montaj + 1)));
        if (isCurrent && date >= today) continue;
        piece(k % 2 ? "u_mt2" : "u_mt1", "montaj", p.id, date, `${p.name}: montaj #${k + 1} (${i + 1}-davr)`, `h-m:${p.id}:${i}:${k}`);
        if (k < v.montaj - 1) piece("u_dz", "dizayn_cover", p.id, date, `${p.name}: oblojka #${k + 1}`, `h-c:${p.id}:${i}:${k}`);
      }
      for (let k = 0; k < v.post; k++) {
        const date = addDays(per.start, Math.round(((k + 0.5) * days) / v.post));
        if (isCurrent && date >= today) continue;
        piece("u_dz", "dizayn_post", p.id, date, `${p.name}: post dizayni #${k + 1}`, `h-p:${p.id}:${i}:${k}`);
      }
      for (let k = 0; k < v.shoots; k++) {
        const date = addDays(per.start, 2 + Math.round((k * days) / v.shoots));
        if (isCurrent && date >= today) continue;
        piece("u_sy", "syomka", p.id, date, `${p.name}: syomka #${k + 1}`, `h-s:${p.id}:${i}:${k}`);
        if (date >= histStart)
          tx({ date, accountId: "acc_cash", dir: "out", amount: 180_000, articleId: ART.transport, projectId: p.id, note: "Syomkaga taksi" });
      }
      if (p.id === "p_baraka") {
        const date = addDays(per.start, 5);
        if (date >= histStart)
          tx({ date, accountId: "acc_card", dir: "out", amount: 350_000, articleId: ART.production, projectId: p.id, note: "Rekvizit va mahsulot namunalari" });
      }
    }
  }

  // Seed'dagi qabul qilingan vazifalar va topshirilgan syomkalar ham hisoblanadi.
  for (const t of s.tasks) {
    const wt = taskWorkType(t);
    if (!wt || t.status !== "accepted" || !t.acceptedAt) continue;
    piece(t.assigneeId, wt, t.projectId, t.acceptedAt.slice(0, 10), `${t.title}`, `task:${t.id}`);
  }
  for (const sh of s.shoots) {
    if (sh.status !== "handed" || !sh.handedAt) continue;
    const p = s.projects.find((x) => x.id === sh.projectId);
    piece(sh.operatorId, "syomka", sh.projectId, sh.handedAt.slice(0, 10), `${p?.name}: syomka (${sh.location})`, `shoot:${sh.id}`);
    tx({ date: sh.date, accountId: "acc_cash", dir: "out", amount: 180_000, articleId: ART.transport, projectId: sh.projectId, note: "Syomkaga taksi" });
  }

  // Operator bonusi — har bir shartnoma uchun
  for (const p of s.projects) {
    const lead = s.leads.find((l) => l.projectId === p.id);
    if (lead) piece(lead.operatorId, "shartnoma", p.id, p.contractDate, `Shartnoma bonusi: ${p.name}`, `lead:${lead.id}`);
  }

  // Qo'lda kiritilgan namunalar: bonus va jarima
  const lastMonthMid = `${shiftMonthKey(curMonth, -1)}-20`;
  accruals.push({
    id: id("acr"),
    userId: "u_smm1",
    projectId: "p_mebel",
    date: lastMonthMid,
    kind: "manual",
    title: "KPI bonusi: Sharq Mebel — lidlar rejasi 120% bajarildi",
    qty: 1,
    rate: 500_000,
    amount: 500_000,
    approved: true,
    createdBy: "u_boss",
  });
  accruals.push({
    id: id("acr"),
    userId: "u_mt2",
    projectId: "p_gym",
    date: d(-1),
    kind: "penalty",
    title: "Jarima: «Trener maslahati» montaji 2 kun kechikdi",
    qty: 1,
    rate: -40_000,
    amount: -40_000,
    approved: false,
    createdBy: "u_mol",
  });
  s.accruals = accruals;

  // Loyiha oyliklari va fiks oyliklar — tizimning o'z qoidasi bilan
  syncAccruals(s, today, () => id("acr"));
  const curStart = `${curMonth}-01`;
  for (const a of s.accruals) if (a.date < curStart) a.approved = true;

  // ---------- 4. Doimiy xarajatlar, o'tkazmalar, soliq ----------
  const months: string[] = [];
  for (let m = s.settings.payrollStart; m <= curMonth; m = shiftMonthKey(m, 1)) months.push(m);

  for (const m of months) {
    const isCur = m === curMonth;
    const bill = (
      vendorId: string,
      articleId: string,
      amount: number,
      day: number,
      dueDay: number,
      payDay: number,
      account: string,
      note: string,
      payCurrent: boolean,
    ) => {
      const date = `${m}-${String(day).padStart(2, "0")}`;
      if (date > today) return;
      const b = { id: id("bill"), vendorId, articleId, amount, date, dueDate: `${m}-${String(dueDay).padStart(2, "0")}`, note };
      s.bills.push(b);
      if (!isCur || payCurrent)
        tx({ date: `${m}-${String(payDay).padStart(2, "0")}`, accountId: account, dir: "out", amount, articleId, vendorId, billId: b.id, note });
    };
    bill("v_rent", ART.rent, 4_500_000, 1, 5, 4, "acc_bank", "Ofis ijarasi", false);
    bill("v_soft", ART.software, 1_300_000, 3, 10, 8, "acc_card", "Adobe CC, Canva Pro, CapCut obunalari", false);
    bill("v_inet", ART.internet, 350_000, 1, 10, 6, "acc_card", "Internet 100 Mbit/s", true);

    tx({ date: `${m}-15`, accountId: "acc_card", dir: "out", amount: 1_000_000, articleId: ART.marketing, note: "Agentlik Instagram reklamasi" });
    tx({ date: `${m}-28`, accountId: "acc_bank", dir: "out", amount: 120_000, articleId: ART.bank, note: "Bank xizmati" });
    const transfer = (to: string, amount: number, note: string) => {
      const tid = id("trf");
      tx({ date: `${m}-02`, accountId: "acc_bank", dir: "out", amount, articleId: ART.transferOut, transferId: tid, note });
      tx({ date: `${m}-02`, accountId: to, dir: "in", amount, articleId: ART.transferIn, transferId: tid, note });
    };
    transfer("acc_cash", 6_000_000, "Kassaga naqd yechish");
    transfer("acc_card", 3_000_000, "Korporativ kartani to'ldirish");
  }

  // Aylanma soliq — faqat to'langan oylar uchun (avtomatik hisoblanmaydi, buxgalter qo'lda kiritadi)
  for (const m of months.slice(0, -1)) {
    const cash = clientCashIn(s, m);
    const payDate = `${shiftMonthKey(m, 1)}-15`;
    if (cash > 0)
      tx({
        date: payDate,
        accountId: "acc_bank",
        dir: "out",
        amount: Math.round((cash * 0.04) / 1000) * 1000,
        articleId: ART.tax,
        note: `Aylanma soliq — ${fmtMonth(m)} tushumidan`,
      });
  }

  tx({ date: d(-75), accountId: "acc_bank", dir: "out", amount: 24_000_000, articleId: ART.equipment, note: "Sony A7 IV kamera + obyektiv" });
  tx({ date: d(-33), accountId: "acc_bank", dir: "out", amount: 12_000_000, articleId: ART.dividend, note: "Ta'sischiga dividend" });

  // ---------- 5. Ish haqi to'lovlari: har oy 10-sanada o'tgan oy qoldig'i, 25-sanada fiks oylikdan avans ----------
  const payday = s.settings.payday;
  for (const m of months.slice(1)) {
    const date = `${m}-${String(payday).padStart(2, "0")}`;
    const prevEnd = addDays(`${m}-01`, -1);
    if (date <= today) {
      for (const u of s.users) {
        const bal = employeeBalance(s, u.id, prevEnd);
        if (bal <= 0) continue;
        // So'nggi to'lovda bitta montajyorga qisman to'langan — "qisman" holatini ko'rsatish uchun
        const partial = u.id === "u_mt2" && m === shiftMonthKey(curMonth, -1);
        tx({
          date,
          accountId: "acc_bank",
          dir: "out",
          amount: partial ? Math.round((bal * 0.6) / 1000) * 1000 : bal,
          articleId: ART.payroll,
          userId: u.id,
          note: `${fmtMonth(shiftMonthKey(m, -1))} uchun ish haqi${partial ? " (qisman)" : ""}`,
        });
      }
    }
    const advDate = `${m}-25`;
    if (advDate <= today) {
      for (const prof of s.payProfiles) {
        if (prof.fixed <= 0) continue;
        tx({
          date: advDate,
          accountId: "acc_cash",
          dir: "out",
          amount: Math.round(prof.fixed * 0.35),
          articleId: ART.payroll,
          userId: prof.userId,
          note: `${fmtMonth(m)} uchun avans`,
        });
      }
    }
  }

  // ---------- 6. Byudjet (reja) ----------
  for (const m of months.slice(-4)) {
    s.budget.push({ month: m, line: "revenue", amount: 62_000_000 });
    s.budget.push({ month: m, line: "direct", amount: 27_000_000 });
    s.budget.push({ month: m, line: "overhead", amount: 22_000_000 });
  }

  s.transactions.sort((a, b) => a.date.localeCompare(b.date));
}
