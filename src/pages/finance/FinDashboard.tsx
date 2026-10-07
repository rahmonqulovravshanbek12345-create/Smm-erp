import { useMemo } from "react";
import { BarList, ColumnsChart, Legend, LineChart, Sparkline, StackBar, VIZ, fmtShort } from "../../components/charts";
import { Icon, IconChip, type ChipColor, type IconName } from "../../components/icons";
import { A, Card, CardHeader, PageHeader } from "../../components/ui";
import { diffDays, fmtDate, fmtMoney, fmtMonth, monthKey, monthShort, shiftMonthKey } from "../../lib/dates";
import {
  cashFlow,
  clientCashIn,
  lastMonths,
  mrr,
  payables,
  paymentCalendar,
  pnl,
  projectProfitability,
  receivables,
  totalCashUZS,
  transitBalance,
} from "../../lib/finance";
import { useErp } from "../../lib/store";
import { FinNav } from "./common";

function Kpi({
  label,
  value,
  sub,
  icon,
  color,
  trend,
  trendColor,
  href,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: IconName;
  color: ChipColor;
  trend?: number[];
  trendColor?: string;
  href?: string;
  tone?: "red" | "green";
}) {
  const body = (
    <Card className="flex h-full flex-col justify-between gap-3 p-4 transition duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <IconChip name={icon} color={color} size={30} />
        {trend && <Sparkline values={trend} color={trendColor} />}
      </div>
      <div>
        <div
          className={`text-[24px] font-bold leading-none tracking-tight sm:text-[26px] ${tone === "red" ? "text-red" : tone === "green" ? "text-green" : "text-label"}`}
        >
          {value}
        </div>
        <div className="mt-1.5 text-[13px] font-semibold text-label">{label}</div>
        {sub && <div className="mt-0.5 text-[12px] text-label2">{sub}</div>}
      </div>
    </Card>
  );
  return href ? (
    <A href={href} className="block">
      {body}
    </A>
  ) : (
    body
  );
}

export function FinDashboard() {
  const { state, today } = useErp();
  const d = useMemo(() => {
    const months = lastMonths(today, 6);
    const cur = monthKey(today);
    const prev = shiftMonthKey(cur, -1);
    const p = pnl(state, months, today);
    const cf = cashFlow(state, months);
    const profit = projectProfitability(state, months.slice(-3), today);
    const ar = receivables(state, today);
    const ap = payables(state, today);
    const cal = paymentCalendar(state, today, 30);
    const cash = totalCashUZS(state);
    const transit = Math.max(0, transitBalance(state));
    const arTotal = ar.reduce((a, r) => a + Math.max(0, r.balance), 0);
    const arOverdue = ar.reduce((a, r) => a + r.d30 + r.d60 + r.d60plus, 0);
    const apEmployees = ap.employees.reduce((a, r) => a + Math.max(0, r.balance), 0);
    const apVendors = ap.vendors.reduce((a, r) => a + r.outstanding, 0);
    const lastFull = pnl(state, [prev], today);
    const costLines = lastFull.lines.filter((l) => l.section !== "revenue").sort((a, b) => b.total - a.total);
    const activeClients = state.projects.filter((x) => x.status === "active" && x.periodStart).length;
    return { months, cur, prev, p, cf, profit, ar, ap, cal, cash, transit, arTotal, arOverdue, apEmployees, apVendors, lastFull, costLines, activeClients };
  }, [state, today]);

  const { p, months, prev } = d;
  const costs = months.map((m) => (p.totals.direct[m] ?? 0) + (p.totals.overhead[m] ?? 0) + (p.totals.tax[m] ?? 0));
  const revPrev = p.totals.revenue[prev] ?? 0;
  const netPrev = p.totals.net[prev] ?? 0;
  const marginPrev = revPrev ? (netPrev / revPrev) * 100 : 0;
  const labels = months.map((m) => (m === d.cur ? `${monthShort(m)}*` : monthShort(m)));
  const dayOfMonth = Number(today.slice(8, 10));

  // Avtomatik xulosalar — rahbar e'tiborini talab qiladigan narsalar
  const insights: { tone: "red" | "amber" | "green"; text: string; href: string }[] = [];
  for (const r of d.ar) {
    const late = r.d30 + r.d60 + r.d60plus;
    if (late > 0)
      insights.push({
        tone: r.d60plus ? "red" : "amber",
        text: `${r.project.name}: muddati o'tgan qarz ${fmtMoney(late)}${r.d60plus ? " (60 kundan ortiq)" : ""}`,
        href: "/moliya/debitor",
      });
  }
  const avgMargin = d.profit.length ? d.profit.reduce((a, x) => a + x.marginPct, 0) / d.profit.length : 0;
  for (const x of d.profit) {
    if (x.net < 0)
      insights.push({
        tone: "red",
        text: `${x.project.name}: so'nggi 3 oyda sof zarar ${fmtMoney(-x.net)} — narx yoki hajmni qayta ko'rib chiqing`,
        href: "/moliya/pnl",
      });
    else if (x.marginPct < avgMargin - 8)
      insights.push({
        tone: "amber",
        text: `${x.project.name}: marja ${x.marginPct.toFixed(0)}% — o'rtachadan (${avgMargin.toFixed(0)}%) past`,
        href: "/moliya/pnl",
      });
  }
  const payroll = d.cal.days.flatMap((x) => x.items.filter((i) => i.kind === "payroll").map((i) => ({ date: x.date, amount: -i.amount })))[0];
  if (payroll)
    insights.push({
      tone: d.cal.free >= payroll.amount ? "green" : "red",
      text: `${fmtDate(payroll.date)} — ish haqi kuni: ${fmtMoney(payroll.amount)} kerak, erkin pul ${d.cal.free >= payroll.amount ? "yetarli" : "yetmaydi"}`,
      href: "/moliya/kalendar",
    });
  if (d.cal.firstNegative)
    insights.push({ tone: "red", text: `${fmtDate(d.cal.firstNegative)} kuni kassa minusga tushadi — to'lovlarni rejalashtiring`, href: "/moliya/kalendar" });
  for (const v of d.ap.vendors)
    if (v.overdue > 0) insights.push({ tone: "amber", text: `${v.vendor.name}: to'lov muddati o'tgan — ${fmtMoney(v.overdue)}`, href: "/moliya/debitor" });

  return (
    <>
      <PageHeader title="Moliyaviy panel" sub={`Hisoblash usulidagi natija, haqiqiy pul oqimi va qarzlar · bugun ${fmtDate(today)}`} />
      <FinNav />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          icon="wallet"
          color="green"
          label="Erkin pul"
          value={fmtShort(d.cash - d.transit)}
          sub={`Hisoblarda ${fmtShort(d.cash)}, shundan mijoz reklama puli ${fmtShort(d.transit)}`}
          trend={months.map((m) => d.cf.closing[m] ?? 0)}
          trendColor={VIZ.c3}
          href="/moliya/cashflow"
        />
        <Kpi
          icon="arrowUpRight"
          color="blue"
          label={`Daromad — ${fmtMonth(prev)}`}
          value={fmtShort(revPrev)}
          sub={`Kassaga tushgan: ${fmtShort(clientCashIn(state, prev))}`}
          trend={months.slice(0, -1).map((m) => p.totals.revenue[m] ?? 0)}
          trendColor={VIZ.c1}
          href="/moliya/pnl"
        />
        <Kpi
          icon="sparkle"
          color={netPrev >= 0 ? "teal" : "red"}
          label={`Sof foyda — ${fmtMonth(prev)}`}
          value={fmtShort(netPrev)}
          sub={`Sof marja ${marginPrev.toFixed(1)}%`}
          tone={netPrev < 0 ? "red" : undefined}
          trend={months.slice(0, -1).map((m) => p.totals.net[m] ?? 0)}
          trendColor={VIZ.c3}
          href="/moliya/pnl"
        />
        <Kpi
          icon="history"
          color="indigo"
          label="MRR (oylik abonent)"
          value={fmtShort(mrr(state, today))}
          sub={`${d.activeClients} faol mijoz · o'rtacha chek ${fmtShort(mrr(state, today) / Math.max(1, d.activeClients))}`}
        />
        <Kpi
          icon="users"
          color="orange"
          label="Debitorlik"
          value={fmtShort(d.arTotal)}
          sub={`Muddati o'tgan: ${fmtShort(d.arOverdue)}`}
          tone={d.arOverdue > 0 ? "red" : undefined}
          href="/moliya/debitor"
        />
        <Kpi
          icon="clock"
          color="purple"
          label="Kreditorlik"
          value={fmtShort(d.apEmployees + d.apVendors)}
          sub={`Xodimlarga ${fmtShort(d.apEmployees)} · ta'minotchilarga ${fmtShort(d.apVendors)}`}
          href="/moliya/debitor"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={{ name: "sparkle", color: "blue" }}
            title="Daromad, xarajat va sof foyda"
            sub={`So'nggi 6 oy, hisoblash usulida · * joriy oy — ${dayOfMonth} kun`}
            right={
              <Legend
                items={[
                  { label: "Daromad", color: VIZ.c1 },
                  { label: "Xarajatlar", color: VIZ.c2 },
                  { label: "Sof foyda", color: VIZ.c3, line: true },
                ]}
              />
            }
          />
          <div className="px-3 pb-4">
            <ColumnsChart
              labels={labels}
              bars={[
                { label: "Daromad", color: VIZ.c1, values: months.map((m) => p.totals.revenue[m] ?? 0) },
                { label: "Xarajatlar", color: VIZ.c2, values: costs },
              ]}
              line={{ label: "Sof foyda", color: VIZ.c3, values: months.map((m) => p.totals.net[m] ?? 0) }}
            />
          </div>
        </Card>

        <Card>
          <CardHeader icon={{ name: "alert", color: "orange" }} title="Diqqat talab qiladi" sub="Avtomatik xulosalar" />
          <ul className="space-y-1.5 px-3 pb-4">
            {insights.length === 0 && <li className="px-2 py-6 text-center text-[14px] text-label3">Hammasi joyida</li>}
            {insights.slice(0, 7).map((x, i) => (
              <li key={i}>
                <A href={x.href} className="flex items-start gap-2.5 rounded-[14px] px-2.5 py-2 text-[13px] transition hover:bg-fill">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${x.tone === "red" ? "bg-red" : x.tone === "amber" ? "bg-orange" : "bg-green"}`} />
                  <span className="text-label">{x.text}</span>
                </A>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={{ name: "wallet", color: "green" }} title="Pul qoldig'i" sub="Barcha hisoblar, oy oxirida (so'mda)" />
          <div className="px-3 pb-4">
            <LineChart labels={labels} series={{ label: "Qoldiq", color: VIZ.c3, values: months.map((m) => d.cf.closing[m] ?? 0) }} />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={{ name: "folder", color: "teal" }}
            title="Loyihalar foydaliligi"
            sub="So'nggi 3 oy · doimiy xarajat ulushi bilan sof foyda"
            right={
              <A href="/moliya/pnl" className="text-[13px] font-semibold text-accent">
                Batafsil
              </A>
            }
          />
          <div className="px-5 pb-5">
            <BarList
              signed
              rows={d.profit.map((x) => ({ label: x.project.name, value: x.net, sub: `Daromad ${fmtShort(x.revenue)} · marja ${x.marginPct.toFixed(0)}%` }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader icon={{ name: "list", color: "orange" }} title="Xarajatlar tuzilishi" sub={fmtMonth(prev)} />
          <div className="px-5 pb-5">
            <BarList color={VIZ.c2} rows={d.costLines.slice(0, 7).map((l) => ({ label: l.label, value: l.total }))} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={{ name: "users", color: "orange" }} title="Debitorlik muddatlari" sub={`Jami ${fmtMoney(d.arTotal)}`} />
          <div className="px-5 pb-5">
            <StackBar
              parts={[
                { label: "Muddati kelmagan", value: d.ar.reduce((a, r) => a + r.notDue, 0), color: VIZ.c1 },
                { label: "1–30 kun", value: d.ar.reduce((a, r) => a + r.d30, 0), color: VIZ.c2 },
                { label: "31–60 kun", value: d.ar.reduce((a, r) => a + r.d60, 0), color: "rgb(var(--viz-neg) / 0.6)" },
                { label: "60+ kun", value: d.ar.reduce((a, r) => a + r.d60plus, 0), color: VIZ.neg },
              ]}
            />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            icon={{ name: "calendar", color: "red" }}
            title="Keyingi 30 kun"
            sub="To'lov kalendari bo'yicha prognoz"
            right={
              <A href="/moliya/kalendar" className="text-[13px] font-semibold text-accent">
                Kalendar
              </A>
            }
          />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-4">
            {[
              {
                l: "Kutilayotgan kirim",
                v: d.cal.days.reduce((a, x) => a + x.items.filter((i) => i.amount > 0).reduce((b, i) => b + i.amount, 0), 0),
                tone: "text-green",
              },
              {
                l: "Rejadagi chiqim",
                v: -d.cal.days.reduce((a, x) => a + x.items.filter((i) => i.amount < 0).reduce((b, i) => b + i.amount, 0), 0),
                tone: "text-red",
              },
              { l: "Minimal qoldiq", v: d.cal.min, tone: d.cal.min < 0 ? "text-red" : "text-label" },
              { l: "30-kun oxirida", v: d.cal.days[d.cal.days.length - 1]?.balance ?? d.cal.free, tone: "text-label" },
            ].map((x) => (
              <div key={x.l} className="tile rounded-[16px] p-3">
                <div className="text-[12px] text-label2">{x.l}</div>
                <div className={`mt-1 text-[18px] font-bold ${x.tone}`}>{fmtShort(x.v)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={{ name: "target", color: "pink" }} title="Hisob siyosati" />
          <ul className="space-y-2 px-5 pb-5 text-[13px] text-label2">
            {[
              "Foyda-zarar — hisoblash usulida: daromad xizmat ko'rsatilgan kunlarga taqsimlanadi.",
              "Mijozning reklama byudjeti — tranzit, daromadga kirmaydi.",
              "Ish haqi — hisoblangan kunida xarajat; to'lov qarzni yopadi.",
              "Aylanma soliq — faqat to'langanda xarajat sifatida kiritiladi.",
              `Valyuta: so'm va USD (joriy kurs ${state.settings.usdRate.toLocaleString("ru-RU")}).`,
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Icon name="check" size={15} className="mt-0.5 shrink-0 text-green" />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-4 px-1 text-[12px] text-label3">
        * Joriy oy yakunlanmagan: daromad va oyliklar {diffDays(today, `${d.cur}-01`) + 1} kun uchun proporsional hisoblangan.
      </p>
    </>
  );
}
