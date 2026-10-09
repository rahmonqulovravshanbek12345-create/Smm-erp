import { useMemo, useState } from "react";
import { BarList, VIZ } from "../components/charts";
import { Avatar, Card, CardHeader, Empty, PageHeader, Stat } from "../components/ui";
import { addDays, fmtDate, fmtMoney, fmtMonth, monthKey, shiftMonthKey } from "../lib/dates";
import { WORK_LABELS, employeeBalance, employeeLedger, profileOf, txUZS } from "../lib/finance";
import { ROLE_LABELS } from "../lib/labels";
import { useErp, useLookup } from "../lib/store";
import type { WorkType } from "../lib/types";
import { AccrualTable } from "./finance/Payroll";
import { Money, MonthSelect, Note } from "./finance/common";

/** Xodim kabineti: o'z hisob-kitobi — nima uchun qancha hisoblandi, qancha to'landi, qancha qoldi. */
export function MyAccount() {
  const { state, me, today } = useErp();
  const look = useLookup();
  const [month, setMonth] = useState(monthKey(today));
  const prof = profileOf(state, me.id);
  const led = useMemo(() => employeeLedger(state, me.id), [state, me.id]);
  const monthRows = led.rows.filter((a) => monthKey(a.date) === month);
  const accrued = monthRows.reduce((a, r) => a + r.amount, 0);
  const paid = led.payouts.filter((t) => monthKey(t.date) === month).reduce((a, t) => a + txUZS(state, t), 0);
  const opening = employeeBalance(state, me.id, addDays(`${month}-01`, -1));
  const closing = employeeBalance(state, me.id, addDays(`${shiftMonthKey(month, 1)}-01`, -1));
  const byProject = new Map<string, number>();
  for (const a of monthRows) byProject.set(a.projectId ?? "", (byProject.get(a.projectId ?? "") ?? 0) + a.amount);
  const dd = String(state.settings.payday).padStart(2, "0");
  const nextPayday = `${monthKey(today)}-${dd}` >= today ? `${monthKey(today)}-${dd}` : `${shiftMonthKey(monthKey(today), 1)}-${dd}`;

  const scheme: string[] = [];
  if (prof.fixed) scheme.push(`Fiks oylik — ${fmtMoney(prof.fixed)}`);
  if (prof.perProject) scheme.push(`Har bir loyiha uchun — ${fmtMoney(prof.perProject)} / oy`);
  for (const [k, v] of Object.entries(prof.rates)) if (v) scheme.push(`${WORK_LABELS[k as WorkType]} — ${fmtMoney(v)}`);

  return (
    <>
      <PageHeader
        title="Mening hisobim"
        sub="Ish haqim: nima uchun hisoblandi, qachon to'landi, qancha qoldi"
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />
      <Card className="mb-5 flex flex-wrap items-center gap-4 p-5">
        <Avatar name={me.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-bold tracking-tight text-label">{me.name}</div>
          <div className="text-[14px] text-label2">{ROLE_LABELS[me.role]}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scheme.length ? (
              scheme.map((x) => (
                <span key={x} className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium text-label">
                  {x}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-label3">Stavka belgilanmagan</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] text-label2">Kompaniya sizga qarzdor</div>
          <div className={`text-[32px] font-bold tracking-tight ${led.balance < 0 ? "text-orange" : "text-label"}`}>{fmtMoney(Math.abs(led.balance))}</div>
          <div className="text-[12px] text-label3">{led.balance < 0 ? "ortiqcha olingan avans" : `keyingi to'lov kuni: ${fmtDate(nextPayday)}`}</div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="history" color="gray" label={`${fmtMonth(month)} boshida qoldiq`} value={fmtMoney(opening)} />
        <Stat icon="sparkle" color="blue" label="Shu oy hisoblandi" value={fmtMoney(accrued)} />
        <Stat icon="send" color="green" label="Shu oy to'landi" value={fmtMoney(paid)} />
        <Stat icon="wallet" color="purple" label="Oy oxirida qoldiq" value={fmtMoney(closing)} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Hisoblashlar" sub="Har bir ish, loyiha va holati" />
        <AccrualTable userId={me.id} month={month} />
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <>
          <Card>
            <CardHeader title="Loyihalar bo'yicha" sub={fmtMonth(month)} />
            <div className="px-5 pb-5">
              {byProject.size === 0 ? (
                <Empty>Hisoblash yo'q</Empty>
              ) : (
                <BarList
                  color={VIZ.c1}
                  rows={[...byProject.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([pid, v]) => ({ label: pid ? look.projectName(pid) : "Umumiy (fiks, bonus)", value: v }))}
                />
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="To'lovlar" sub="Menga to'langan pul" />
            <ul className="divide-y divide-sep">
              {led.payouts.length === 0 && <Empty>To'lov yo'q</Empty>}
              {[...led.payouts]
                .reverse()
                .slice(0, 8)
                .map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-[14px]">
                    <div>
                      <div className="text-label">{t.note || "Ish haqi"}</div>
                      <div className="text-[12px] text-label3">{fmtDate(t.date)}</div>
                    </div>
                    <Money v={txUZS(state, t)} strong />
                  </li>
                ))}
            </ul>
          </Card>
        </>
      </div>
      <Note>
        To'lovlar eng eski hisoblashlarni navbat bilan yopadi — shuning uchun har bir ishning holati (to'langan, qisman, to'lanmagan) aniq ko'rinadi. Savol
        bo'lsa, moliya bo'limidan akt-sverka so'rang.
      </Note>
    </>
  );
}
