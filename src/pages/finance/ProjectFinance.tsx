import { useMemo } from "react";
import { Card, CardHeader } from "../../components/ui";
import { fmtMoney } from "../../lib/dates";
import { lastMonths, pnl, projectDebt, transitBalance } from "../../lib/finance";
import { useErp, useLookup } from "../../lib/store";
import type { Project } from "../../lib/types";

/** Loyiha kartasidagi moliyaviy xulosa: daromad, tannarx, marja, qarz, tranzit. */
export function ProjectFinance({ project }: { project: Project }) {
  const { state, today } = useErp();
  const look = useLookup();
  const d = useMemo(() => {
    const months = lastMonths(today, 12);
    const r = pnl(state, months, today, project.id);
    const byUser = new Map<string, number>();
    for (const a of state.accruals) if (a.projectId === project.id) byUser.set(a.userId, (byUser.get(a.userId) ?? 0) + a.amount);
    return { r, byUser: [...byUser.entries()].sort((a, b) => b[1] - a[1]) };
  }, [state, today, project.id]);
  const margin = d.r.sum.revenue - d.r.sum.direct;
  const pct = d.r.sum.revenue ? (margin / d.r.sum.revenue) * 100 : 0;
  const debt = projectDebt(state, project.id, today);
  const tiles = [
    { l: "Daromad (tan olingan)", v: fmtMoney(d.r.sum.revenue) },
    { l: "Tannarx (ish haqi + xarajat)", v: fmtMoney(d.r.sum.direct) },
    { l: "Marja", v: `${fmtMoney(margin)} · ${pct.toFixed(0)}%`, tone: pct < 45 ? "text-orange" : "text-green" },
    { l: "Qarz (muddati o'tgan)", v: fmtMoney(debt.amount), tone: debt.amount ? "text-red" : "" },
    { l: "Reklama puli bizda (tranzit)", v: fmtMoney(Math.max(0, transitBalance(state, project.id))) },
  ];
  return (
    <Card className="mb-4">
      <CardHeader title="Loyiha moliyasi" sub="Butun hamkorlik davri, hisoblash usulida" />
      <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.l} className="tile rounded-[16px] p-3">
            <div className="text-[12px] text-label2">{t.l}</div>
            <div className={`mt-1 text-[16px] font-bold ${t.tone ?? "text-label"}`}>{t.v}</div>
          </div>
        ))}
      </div>
      {d.byUser.length > 0 && (
        <div className="border-t border-sep px-5 py-3">
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-label3">Kim qancha ishlab topdi (shu loyihada)</div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {d.byUser.map(([uid, v]) => (
              <div key={uid} className="flex justify-between text-[13px]">
                <span className="text-label2">{look.userName(uid)}</span>
                <span className="tabular font-semibold text-label">{fmtMoney(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
