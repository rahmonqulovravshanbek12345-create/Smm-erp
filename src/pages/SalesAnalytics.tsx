import { useMemo, useState } from "react";
import { BarList, ColumnsChart, Legend, VIZ, fmtShort } from "../components/charts";
import { A, Card, CardHeader, PageHeader, Select, Stat } from "../components/ui";
import { fmtMoney, monthShort } from "../lib/dates";
import { lastMonths, revenueByService } from "../lib/finance";
import { FUNNEL, salesAnalytics } from "../lib/sales";
import { leadStageMeta } from "../lib/labels";
import { useErp } from "../lib/store";
import { Money, Note, TableWrap, td, tdr, th, thr } from "./finance/common";
import { ExportButton } from "../components/ExportButton";

export function SalesAnalytics() {
  const { state, today } = useErp();
  const [span, setSpan] = useState("6");
  const months = useMemo(() => lastMonths(today, Number(span)), [today, span]);
  const a = useMemo(() => salesAnalytics(state, months, today), [state, months, today]);
  const revenue = useMemo(() => revenueByService(state, months, today), [state, months, today]);
  const top = a.funnel[0]?.count || 1;
  const ratio = a.cacFull ? a.ltv / a.cacFull : 0;

  return (
    <>
      <PageHeader
        title="Sotuv analitikasi"
        sub="Lid qayerdan keladi, qayerda yo'qoladi va bitta mijoz qanchaga tushadi"
        actions={
          <>
            <A href="/crm" className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-semibold text-accent hover:bg-fill">
              ← CRM
            </A>
            <ExportButton
              filename={`sotuv-analitikasi-${today}`}
              sheets={() => [
                {
                  name: "Manbalar",
                  columns: ["Manba", "Lidlar", "Bog'lanildi", "Uchrashuv", "Shartnoma", "Sifatsiz", "Konversiya %", "MRR (so'm)"],
                  rows: a.bySource.map((r) => [r.label, r.leads, r.contacted, r.meetings, r.contracts, r.lowquality, Number(r.conv.toFixed(1)), r.mrr]),
                },
                {
                  name: "Operatorlar",
                  columns: ["Operator", "Lidlar", "Bog'lanildi", "Uchrashuv", "Shartnoma", "Konversiya %", "Bonus (so'm)"],
                  rows: a.byOperator.map((r) => [r.label, r.leads, r.contacted, r.meetings, r.contracts, Number(r.conv.toFixed(1)), r.bonus]),
                },
                {
                  name: "Lidlar",
                  columns: ["Sana", "Nomi", "Telefon", "Manba", "Xizmat", "Bosqich", "Rad sababi"],
                  rows: a.leads.map((l) => [
                    l.createdAt.slice(0, 10),
                    l.name,
                    l.phone,
                    l.source,
                    l.service,
                    leadStageMeta(l.stage).label,
                    l.rejectReason ?? "",
                  ]),
                },
              ]}
            />
            <Select
              aria-label="Davr"
              value={span}
              onChange={(e) => setSpan(e.target.value)}
              className="!w-40"
              options={[
                { value: "3", label: "So'nggi 3 oy" },
                { value: "6", label: "So'nggi 6 oy" },
                { value: "12", label: "So'nggi 12 oy" },
              ]}
            />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat icon="users" color="blue" label="Lidlar" value={a.leads.length} />
        <Stat icon="checkSeal" color="green" label="Shartnomalar" value={a.contracts} tone="green" />
        <Stat icon="gauge" color="indigo" label="Lid → shartnoma" value={`${a.conv.toFixed(1)}%`} />
        <Stat icon="clock" color="orange" label="O'rtacha sotuv sikli" value={`${Math.round(a.avgCycle)} kun`} />
        <Stat icon="wallet" color="pink" label="Mijoz jalb qilish narxi (CAC)" value={fmtShort(a.cacFull)} />
        <Stat
          icon="sparkle"
          color="teal"
          label="LTV : CAC"
          value={ratio ? `${ratio.toFixed(1)} : 1` : "—"}
          tone={ratio >= 3 ? "green" : ratio ? "amber" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader icon={{ name: "list", color: "blue" }} title="Voronka" sub="Har bosqichga yetgan lidlar va keyingisiga o'tish foizi" />
          <div className="space-y-2.5 px-5 pb-5">
            {a.funnel.map((f, i) => {
              const prev = a.funnel[i - 1]?.count;
              const pct = (f.count / top) * 100;
              return (
                <div key={f.step}>
                  <div className="mb-1 flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-label">{f.label}</span>
                    <span className="tabular text-label2">
                      <b className="text-label">{f.count}</b>
                      {prev ? <span className="ml-2 text-[12px]">→ {((f.count / prev) * 100).toFixed(0)}%</span> : null}
                    </span>
                  </div>
                  <div className="h-7 w-full rounded-[10px] bg-fill">
                    <div
                      className="flex h-7 items-center rounded-[10px] px-2 text-[11px] font-semibold text-white transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, 4)}%`,
                        background: i === FUNNEL.length - 1 ? VIZ.c3 : VIZ.c1,
                        opacity: 1 - i * 0.12,
                      }}
                    >
                      {pct >= 12 ? `${pct.toFixed(0)}%` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            icon={{ name: "calendar", color: "indigo" }}
            title="Oylar bo'yicha"
            sub="Yangi lidlar va tuzilgan shartnomalar"
            right={
              <Legend
                items={[
                  { label: "Lidlar", color: VIZ.c1 },
                  { label: "Shartnomalar", color: VIZ.c3 },
                ]}
              />
            }
          />
          <div className="px-3 pb-4">
            <ColumnsChart
              labels={months.map(monthShort)}
              bars={[
                {
                  label: "Lidlar",
                  color: VIZ.c1,
                  values: a.monthly.map((m) => m.leads),
                },
                {
                  label: "Shartnomalar",
                  color: VIZ.c3,
                  values: a.monthly.map((m) => m.contracts),
                },
              ]}
            />
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader icon={{ name: "target", color: "pink" }} title="Manbalar kesimida" sub="Qaysi kanal sifatli mijoz olib keladi" />
          <TableWrap min={860}>
            <thead>
              <tr className="border-y border-sep">
                <th className={th}>Manba</th>
                <th className={thr}>Lidlar</th>
                <th className={thr}>Bog'lanildi</th>
                <th className={thr}>Uchrashuv</th>
                <th className={thr}>Shartnoma</th>
                <th className={thr}>Sifatsiz</th>
                <th className={thr}>Konversiya</th>
                <th className={thr}>Olib kelgan MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              {a.bySource.map((r) => (
                <tr key={r.key} className="hover:bg-fill">
                  <td className={`${td} font-semibold text-label`}>{r.label}</td>
                  <td className={tdr}>{r.leads}</td>
                  <td className={tdr}>{r.contacted}</td>
                  <td className={tdr}>{r.meetings}</td>
                  <td className={`${tdr} font-semibold`}>{r.contracts}</td>
                  <td className={`${tdr} ${r.lowquality / r.leads > 0.5 ? "text-red" : "text-label2"}`}>{((r.lowquality / r.leads) * 100).toFixed(0)}%</td>
                  <td className={`${tdr} font-semibold ${r.conv >= 10 ? "text-green" : "text-label"}`}>{r.conv.toFixed(1)}%</td>
                  <td className={tdr}>
                    <Money v={r.mrr} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            icon={{ name: "folder", color: "blue" }}
            title="Xizmatlar kesimida"
            sub="Lid qaysi xizmatga qiziqib keldi va qaysi xizmat qancha daromad keltirdi (hisoblash usulida)"
          />
          <div className="grid grid-cols-1 gap-4 p-4 pt-1 lg:grid-cols-[3fr_2fr]">
            <TableWrap min={560}>
              <thead>
                <tr className="border-y border-sep">
                  <th className={th}>Xizmat</th>
                  <th className={thr}>Lidlar</th>
                  <th className={thr}>Uchrashuv</th>
                  <th className={thr}>Shartnoma</th>
                  <th className={thr}>Konversiya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {a.byService.map((r) => (
                  <tr key={r.key} className="hover:bg-fill">
                    <td className={`${td} font-semibold text-label`}>{r.label}</td>
                    <td className={tdr}>{r.leads}</td>
                    <td className={tdr}>{r.meetings}</td>
                    <td className={`${tdr} font-semibold`}>{r.contracts}</td>
                    <td className={`${tdr} font-semibold ${r.conv >= 10 ? "text-green" : "text-label"}`}>{r.conv.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-label3">Daromad xizmatlar bo'yicha</div>
              <BarList color={VIZ.c1} format={(n) => fmtShort(n)} rows={revenue.map((r) => ({ label: r.label, value: Math.round(r.amount) }))} />
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader icon={{ name: "phone", color: "green" }} title="Operatorlar samaradorligi" />
          <TableWrap min={640}>
            <thead>
              <tr className="border-y border-sep">
                <th className={th}>Operator</th>
                <th className={thr}>Lidlar</th>
                <th className={thr}>Uchrashuv</th>
                <th className={thr}>Shartnoma</th>
                <th className={thr}>Konversiya</th>
                <th className={thr}>Bonus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              {a.byOperator.map((r) => (
                <tr key={r.key}>
                  <td className={`${td} font-semibold text-label`}>{r.label}</td>
                  <td className={tdr}>{r.leads}</td>
                  <td className={tdr}>
                    {r.meetings}{" "}
                    <span className="text-[12px] text-label3">
                      ({r.leads ? ((r.meetings / r.leads) * 100).toFixed(0) : 0}
                      %)
                    </span>
                  </td>
                  <td className={`${tdr} font-semibold`}>{r.contracts}</td>
                  <td className={tdr}>{r.conv.toFixed(1)}%</td>
                  <td className={tdr}>
                    <Money v={r.bonus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader icon={{ name: "wallet", color: "pink" }} title="Mijoz iqtisodiyoti" />
          <ul className="space-y-2 px-5 pb-5 text-[14px]">
            {[
              ["Agentlik reklamasiga sarf", fmtMoney(a.marketing)],
              ["Operatorlar xarajati (oylik + bonus)", fmtMoney(a.operatorCost)],
              ["Yangi mijozlar", `${a.newClients} ta`],
              ["CAC — faqat reklama", fmtMoney(a.cacAds)],
              ["CAC — to'liq", fmtMoney(a.cacFull)],
              ["O'rtacha oylik to'lov (ARPA)", fmtMoney(a.arpa)],
              ["Yalpi marja", `${(a.grossPct * 100).toFixed(0)}%`],
              ["O'rtacha hamkorlik (hozirgacha)", `${a.avgLife.toFixed(1)} oy`],
              ["LTV (mijozdan yalpi foyda)", fmtMoney(a.ltv)],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3 border-b border-sep pb-2 last:border-0">
                <span className="text-label2">{k}</span>
                <span className="tabular font-semibold text-label">{v}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader icon={{ name: "alert", color: "orange" }} title="Nega shartnoma bo'lmadi" sub="«To'g'ri kelmadi» sabablari" />
          <div className="px-5 pb-5">
            <BarList color={VIZ.c2} format={(n) => `${n} ta`} rows={a.unfit} />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            icon={{ name: "x", color: "red" }}
            title="Sifatsiz lidlar"
            sub={`${a.lowquality.reduce((x, r) => x + r.value, 0)} ta — reklama sozlamalarini tekshiring`}
          />
          <div className="px-5 pb-5">
            <BarList color={VIZ.neg} format={(n) => `${n} ta`} rows={a.lowquality} />
          </div>
        </Card>
      </div>
      <Note>
        CAC = (agentlik reklamasi + operatorlar xarajati) ÷ yangi mijozlar. LTV = o'rtacha oylik to'lov × yalpi marja × o'rtacha hamkorlik muddati (hozirgacha —
        konservativ baho). LTV : CAC 3:1 dan yuqori bo'lsa sotuv kanali foydali.
      </Note>
    </>
  );
}
