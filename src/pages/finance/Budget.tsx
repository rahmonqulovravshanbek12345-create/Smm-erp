import { useMemo, useState } from "react";
import { Card, CardHeader, Input, PageHeader, Progress } from "../../components/ui";
import * as act from "../../lib/actions";
import { fmtMonth, monthKey } from "../../lib/dates";
import { pnl } from "../../lib/finance";
import { canEditFinance } from "../../lib/permissions";
import { useErp } from "../../lib/store";
import type { BudgetLine } from "../../lib/types";
import { FinNav, Money, MonthSelect, Note, TableWrap, td, tdr, th, thr } from "./common";

const LINES: { id: BudgetLine["line"] | "operating"; label: string; good: "up" | "down" }[] = [
  { id: "revenue", label: "Daromad", good: "up" },
  { id: "direct", label: "To'g'ridan-to'g'ri xarajatlar", good: "down" },
  { id: "overhead", label: "Doimiy xarajatlar", good: "down" },
  { id: "operating", label: "Operatsion foyda", good: "up" },
];

export function Budget() {
  const { state, me, run, today } = useErp();
  const editable = canEditFinance(me.role);
  const [month, setMonth] = useState(monthKey(today));
  const fact = useMemo(() => pnl(state, [month], today), [state, month, today]);
  const plan = (line: BudgetLine["line"]) => state.budget.find((b) => b.month === month && b.line === line)?.amount ?? 0;
  const planOf = (id: (typeof LINES)[number]["id"]) => (id === "operating" ? plan("revenue") - plan("direct") - plan("overhead") : plan(id));
  const factOf = (id: (typeof LINES)[number]["id"]) => (id === "operating" ? fact.sum.operating : fact.sum[id]);
  const isCur = month === monthKey(today);

  return (
    <>
      <PageHeader
        title="Reja-fakt (byudjet)"
        sub="Oylik reja va haqiqiy natijani solishtirish"
        actions={<MonthSelect value={month} onChange={setMonth} back={11} forward={2} />}
      />
      <FinNav />
      <Card>
        <CardHeader title={fmtMonth(month)} sub={isCur ? "Joriy oy — fakt bugungi kungacha" : undefined} />
        <TableWrap min={760}>
          <thead>
            <tr className="border-y border-sep">
              <th className={th}>Ko'rsatkich</th>
              <th className={thr}>Reja</th>
              <th className={thr}>Fakt</th>
              <th className={thr}>Farq</th>
              <th className={th}>Bajarilish</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sep">
            {LINES.map((l) => {
              const p = planOf(l.id);
              const f = factOf(l.id);
              const diff = f - p;
              const good = l.good === "up" ? diff >= 0 : diff <= 0;
              const pct = p ? (f / p) * 100 : 0;
              return (
                <tr key={l.id} className={l.id === "operating" ? "bg-fill font-semibold" : ""}>
                  <td className={`${td} text-label`}>{l.label}</td>
                  <td className={tdr}>
                    {editable && l.id !== "operating" ? (
                      <Input
                        type="number"
                        aria-label={`${l.label}: reja`}
                        step={1000000}
                        defaultValue={p || ""}
                        key={`${month}-${l.id}`}
                        onBlur={(e) => run((c) => act.setBudget(c, month, l.id as BudgetLine["line"], Number(e.target.value) || 0), "Reja saqlandi")}
                        className="!ml-auto !w-36 !py-1 text-right !text-[13px]"
                      />
                    ) : (
                      <Money v={p} />
                    )}
                  </td>
                  <td className={tdr}>
                    <Money v={f} strong />
                  </td>
                  <td className={`${tdr} font-semibold ${good ? "text-green" : "text-red"}`}>
                    {diff > 0 ? "+" : ""}
                    {Math.round(diff).toLocaleString("ru-RU").replace(/,/g, " ")}
                  </td>
                  <td className={`${td} w-56`}>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.max(0, f)} max={Math.max(1, p)} />
                      <span className="w-12 text-right text-[13px] text-label2">{p ? `${pct.toFixed(0)}%` : "—"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <div className="px-5 pb-4">
          <Note>
            Daromad uchun rejadan oshish yaxshi (yashil), xarajat uchun rejadan kam bo'lish yaxshi. Reja summalarini to'g'ridan-to'g'ri jadvalda o'zgartiring.
          </Note>
        </div>
      </Card>
    </>
  );
}
