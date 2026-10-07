import { Fragment, useMemo, useState } from "react";
import { BarList, VIZ } from "../../components/charts";
import { Icon } from "../../components/icons";
import { A, Card, CardHeader, PageHeader, Select, Tabs } from "../../components/ui";
import { fmtMoney, monthKey, monthShort } from "../../lib/dates";
import { lastMonths, pnl, projectProfitability, type PnlResult } from "../../lib/finance";
import { useErp, useLookup } from "../../lib/store";
import { FinNav, Money, Note, TableWrap, td, tdr, th, thr } from "./common";
import { ExportButton } from "../../components/ExportButton";

type View = "months" | "projects";

export function Pnl() {
  const { state, today } = useErp();
  const look = useLookup();
  const [view, setView] = useState<View>("months");
  const [span, setSpan] = useState("6");
  const [projectId, setProjectId] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const months = useMemo(() => lastMonths(today, Number(span)), [today, span]);
  const r = useMemo(() => pnl(state, months, today, projectId || undefined), [state, months, today, projectId]);
  const profit = useMemo(() => projectProfitability(state, months, today), [state, months, today]);
  const cur = monthKey(today);

  return (
    <>
      <PageHeader title="Foyda va zarar (P&L)" sub="Hisoblash usulida: daromad xizmat ko'rsatilgan kunlarga, xarajat hisoblangan sanaga" />
      <FinNav />
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <Tabs<View>
          value={view}
          onChange={setView}
          tabs={[
            { id: "months", label: "Oyma-oy" },
            { id: "projects", label: "Loyihalar kesimida" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ExportButton
            filename={`foyda-zarar-${today}`}
            sheets={() => [
              {
                name: "P&L oyma-oy",
                columns: ["Ko'rsatkich", ...r.months, "Jami"],
                rows: [
                  ...r.lines.filter((l) => l.section === "revenue").map((l) => [l.label, ...r.months.map((m) => l.values[m] ?? 0), l.total]),
                  ["DAROMAD", ...r.months.map((m) => r.totals.revenue[m] ?? 0), r.sum.revenue],
                  ...r.lines.filter((l) => l.section === "direct").map((l) => [l.label, ...r.months.map((m) => -(l.values[m] ?? 0)), -l.total]),
                  ["YALPI FOYDA", ...r.months.map((m) => r.totals.gross[m] ?? 0), r.sum.gross],
                  ...r.lines.filter((l) => l.section === "overhead").map((l) => [l.label, ...r.months.map((m) => -(l.values[m] ?? 0)), -l.total]),
                  ["OPERATSION FOYDA", ...r.months.map((m) => r.totals.operating[m] ?? 0), r.sum.operating],
                  ...r.lines.filter((l) => l.section === "tax").map((l) => [l.label, ...r.months.map((m) => -(l.values[m] ?? 0)), -l.total]),
                  ["SOF FOYDA", ...r.months.map((m) => r.totals.net[m] ?? 0), r.sum.net],
                ],
              },
              {
                name: "Loyihalar rentabelligi",
                columns: ["Loyiha", "Daromad", "Tannarx", "Marja", "Marja %", "Doimiy xarajat ulushi", "Sof foyda"],
                rows: profit.map((x) => [x.project.name, x.revenue, x.direct, x.margin, Number(x.marginPct.toFixed(1)), x.overheadShare, x.net]),
              },
            ]}
          />
          {view === "months" && (
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!w-48 !py-1.5 !text-[13px]" options={[{ value: "", label: "Butun agentlik" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]} />
          )}
          <Select
            value={span}
            onChange={(e) => setSpan(e.target.value)}
            className="!w-40 !py-1.5 !text-[13px]"
            options={[
              { value: "3", label: "So'nggi 3 oy" },
              { value: "6", label: "So'nggi 6 oy" },
              { value: "12", label: "So'nggi 12 oy" },
            ]}
          />
        </div>
      </div>

      {view === "months" ? (
        <Card>
          <PnlTable r={r} cur={cur} />
          <div className="px-5 pb-4">
            <Note>
              Mijozning reklama byudjeti (tranzit) va jihoz xaridi (kapital xarajat) foyda-zararga kirmaydi. Aylanma soliq to'langan oyida. Joriy oy ({monthShort(cur)}) — bugungi kungacha.
              {projectId && " Loyiha bo'yicha: faqat shu loyihaga bog'langan daromad va xarajatlar; doimiy xarajat ulushi «Loyihalar kesimida» ko'rinishida."}
            </Note>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Loyihalar rentabelligi" sub={`${monthShort(months[0]!)} – ${monthShort(months[months.length - 1]!)} · doimiy xarajat daromad ulushiga ko'ra taqsimlangan`} />
            <TableWrap min={820}>
              <thead>
                <tr className="border-y border-sep">
                  <th className={th}>Loyiha</th>
                  <th className={thr}>Daromad</th>
                  <th className={thr}>Tannarx</th>
                  <th className={thr}>Marja</th>
                  <th className={thr}>Marja %</th>
                  <th className={thr}>Doimiy ulush</th>
                  <th className={thr}>Sof foyda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {profit.map((x) => (
                  <Fragment key={x.project.id}>
                    <tr className="cursor-pointer hover:bg-fill" onClick={() => setOpen(open === x.project.id ? null : x.project.id)}>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-label">
                          <Icon name="chevronRight" size={14} className={`text-label3 transition ${open === x.project.id ? "rotate-90" : ""}`} />
                          {x.project.name}
                        </span>
                        {x.project.status === "closed" && <div className="pl-5 text-[12px] text-label3">yopilgan</div>}
                      </td>
                      <td className={tdr}>
                        <Money v={x.revenue} />
                      </td>
                      <td className={tdr}>
                        <Money v={-x.direct} muted />
                      </td>
                      <td className={tdr}>
                        <Money v={x.margin} strong />
                      </td>
                      <td className={`${tdr} font-semibold ${x.marginPct < 45 ? "text-orange" : "text-green"}`}>{x.marginPct.toFixed(0)}%</td>
                      <td className={tdr}>
                        <Money v={-x.overheadShare} muted />
                      </td>
                      <td className={tdr}>
                        <Money v={x.net} strong />
                      </td>
                    </tr>
                    {open === x.project.id && (
                      <tr className="bg-fill">
                        <td colSpan={7} className="px-10 py-3">
                          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-label3">Tannarx xodimlar bo'yicha</div>
                          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                            {x.costByUser.map((c) => (
                              <div key={c.userId} className="flex justify-between text-[13px]">
                                <span className="text-label2">{look.userName(c.userId)}</span>
                                <Money v={c.amount} />
                              </div>
                            ))}
                            <div className="flex justify-between text-[13px]">
                              <span className="text-label2">Boshqa to'g'ridan-to'g'ri xarajat</span>
                              <Money v={x.direct - x.costByUser.reduce((a, c) => a + c.amount, 0)} />
                            </div>
                          </div>
                          <A href={`/loyiha/${x.project.id}`} className="mt-2 inline-block text-[13px] font-semibold text-accent">
                            Loyiha kartasi →
                          </A>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-sep font-semibold">
                  <td className={td}>Jami</td>
                  <td className={tdr}>
                    <Money v={profit.reduce((a, x) => a + x.revenue, 0)} strong />
                  </td>
                  <td className={tdr}>
                    <Money v={-profit.reduce((a, x) => a + x.direct, 0)} strong />
                  </td>
                  <td className={tdr}>
                    <Money v={profit.reduce((a, x) => a + x.margin, 0)} strong />
                  </td>
                  <td className={tdr} />
                  <td className={tdr}>
                    <Money v={-profit.reduce((a, x) => a + x.overheadShare, 0)} strong />
                  </td>
                  <td className={tdr}>
                    <Money v={profit.reduce((a, x) => a + x.net, 0)} strong />
                  </td>
                </tr>
              </tfoot>
            </TableWrap>
          </Card>
          <Card>
            <CardHeader title="Sof foyda reytingi" sub="Kim pul topib beryapti, kim zarar" />
            <div className="px-5 pb-5">
              <BarList signed rows={profit.map((x) => ({ label: x.project.name, value: x.net, sub: `Marja ${x.marginPct.toFixed(0)}% · daromad ${fmtMoney(x.revenue)}` }))} />
            </div>
            <div className="border-t border-sep px-5 py-4">
              <div className="mb-2 text-[13px] font-semibold text-label">Marja (doimiy xarajatsiz)</div>
              <BarList color={VIZ.c1} format={(n) => `${n.toFixed(0)}%`} rows={profit.map((x) => ({ label: x.project.name, value: x.marginPct }))} />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function PnlTable({ r, cur }: { r: PnlResult; cur: string }) {
  const sec = (s: string) => r.lines.filter((l) => l.section === s);
  const row = (label: string, values: Record<string, number>, total: number, opts: { strong?: boolean; sub?: boolean; neg?: boolean; tone?: string } = {}) => (
    <tr className={`${opts.strong ? "bg-fill font-semibold" : ""} ${opts.tone ?? ""}`}>
      <td className={`${td} ${opts.sub ? "pl-8 text-label2" : "text-label"} ${opts.strong ? "uppercase tracking-[0.02em] text-[13px]" : ""}`}>{label}</td>
      {r.months.map((m) => (
        <td key={m} className={tdr}>
          <Money v={(opts.neg ? -1 : 1) * (values[m] ?? 0)} strong={opts.strong} muted={opts.sub} />
        </td>
      ))}
      <td className={`${tdr} border-l border-sep`}>
        <Money v={(opts.neg ? -1 : 1) * total} strong />
      </td>
    </tr>
  );
  const pct = (num: Record<string, number>, den: Record<string, number>, label: string) => (
    <tr>
      <td className={`${td} pl-8 text-[13px] italic text-label2`}>{label}</td>
      {r.months.map((m) => (
        <td key={m} className={`${tdr} text-[13px] text-label2`}>
          {den[m] ? `${(((num[m] ?? 0) / den[m]!) * 100).toFixed(1)}%` : "—"}
        </td>
      ))}
      <td className={`${tdr} border-l border-sep text-[13px] font-semibold text-label2`}>
        {sumOf(den, r.months) ? `${((sumOf(num, r.months) / sumOf(den, r.months)) * 100).toFixed(1)}%` : "—"}
      </td>
    </tr>
  );
  return (
    <TableWrap min={260 + r.months.length * 120}>
      <thead>
        <tr className="border-b border-sep">
          <th className={th}>Ko'rsatkich</th>
          {r.months.map((m) => (
            <th key={m} className={thr}>
              {monthShort(m)} {m.slice(0, 4)}
              {m === cur ? "*" : ""}
            </th>
          ))}
          <th className={`${thr} border-l border-sep`}>Jami</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-sep">
        {sec("revenue").map((l) => (
          <Fragment key={l.key}>{row(l.label, l.values, l.total, { sub: true })}</Fragment>
        ))}
        {row("Daromad", r.totals.revenue, r.sum.revenue, { strong: true })}
        {sec("direct").map((l) => (
          <Fragment key={l.key}>{row(l.label, l.values, l.total, { sub: true, neg: true })}</Fragment>
        ))}
        {row("Yalpi foyda", r.totals.gross, r.sum.gross, { strong: true })}
        {pct(r.totals.gross, r.totals.revenue, "Yalpi marja")}
        {sec("overhead").map((l) => (
          <Fragment key={l.key}>{row(l.label, l.values, l.total, { sub: true, neg: true })}</Fragment>
        ))}
        {row("Operatsion foyda", r.totals.operating, r.sum.operating, { strong: true })}
        {sec("tax").map((l) => (
          <Fragment key={l.key}>{row(l.label, l.values, l.total, { sub: true, neg: true })}</Fragment>
        ))}
        {row("Sof foyda", r.totals.net, r.sum.net, { strong: true, tone: "text-[15px]" })}
        {pct(r.totals.net, r.totals.revenue, "Sof marja")}
      </tbody>
    </TableWrap>
  );
}

const sumOf = (rec: Record<string, number>, months: string[]) => months.reduce((a, m) => a + (rec[m] ?? 0), 0);
