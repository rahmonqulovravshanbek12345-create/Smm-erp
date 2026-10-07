import { useMemo, useState } from "react";
import { StackBar, VIZ } from "../../components/charts";
import { A, Badge, Button, Card, CardHeader, Empty, PageHeader, Stat } from "../../components/ui";
import { diffDays, fmtDate, fmtMoney } from "../../lib/dates";
import { billPaid, payables, receivables } from "../../lib/finance";
import { ROLE_LABELS } from "../../lib/labels";
import { canEditFinance } from "../../lib/permissions";
import { useErp } from "../../lib/store";
import type { Bill } from "../../lib/types";
import { FinNav, Money, Note, TableWrap, td, tdr, th, thr } from "./common";
import { BillModal, PayBillModal, PayEmployeeModal } from "./modals";
import { ExportButton } from "../../components/ExportButton";

export function Receivables() {
  const { state, me, today } = useErp();
  const editable = canEditFinance(me.role);
  const ar = useMemo(() => receivables(state, today), [state, today]);
  const ap = useMemo(() => payables(state, today), [state, today]);
  const [payUser, setPayUser] = useState<string | null>(null);
  const [payBill, setPayBill] = useState<Bill | null>(null);
  const [newBill, setNewBill] = useState(false);

  const arTotal = ar.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const arLate = ar.reduce((a, r) => a + r.d30 + r.d60 + r.d60plus, 0);
  const empOwed = ap.employees.filter((e) => e.balance > 0);
  const empAdvances = ap.employees.filter((e) => e.balance < 0);
  const apEmp = empOwed.reduce((a, r) => a + r.balance, 0);
  const apVend = ap.vendors.reduce((a, r) => a + r.outstanding, 0);
  const apAdv = ap.advances.reduce((a, r) => a + r.amount, 0);
  const apTransit = ap.transit.reduce((a, r) => a + r.amount, 0);
  const openBills = state.bills.filter((b) => b.amount - billPaid(state, b) > 0.5).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <>
      <PageHeader
        title="Debitorlik va kreditorlik"
        sub={`${fmtDate(today)} holatiga: kim bizga qarzdor va biz kimga qarzdormiz`}
        actions={
          <>
            <ExportButton
              filename={`debitor-kreditor-${today}`}
              sheets={() => [
                {
                  name: "Debitorlik",
                  columns: ["Mijoz", "Fakturalar", "To'langan", "Saldo", "Muddati kelmagan", "1–30 kun", "31–60 kun", "60+ kun", "Olingan avans"],
                  rows: ar.map((r) => [r.project.name, r.invoiced, r.paid, r.balance, r.notDue, r.d30, r.d60, r.d60plus, r.advance]),
                },
                {
                  name: "Kreditorlik",
                  columns: ["Turi", "Kontragent", "Summa"],
                  rows: [
                    ...ap.employees.map((e) => ["Xodim (ish haqi)", e.user.name, e.balance]),
                    ...ap.vendors.map((v) => ["Ta'minotchi", v.vendor.name, v.outstanding]),
                    ...ap.advances.map((a) => ["Mijoz avansi", a.project.name, a.amount]),
                    ...ap.transit.map((a) => ["Tranzit (reklama puli)", a.project.name, a.amount]),
                  ],
                },
              ]}
            />
            {editable && <Button onClick={() => setNewBill(true)}>+ Xarajat hujjati</Button>}
          </>
        }
      />
      <FinNav />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="users" color="orange" label="Debitorlik (mijozlar qarzi)" value={fmtMoney(arTotal)} />
        <Stat icon="alert" color="red" label="Shundan muddati o'tgan" value={fmtMoney(arLate)} tone={arLate ? "red" : "green"} />
        <Stat icon="clock" color="purple" label="Kreditorlik (biz qarzdormiz)" value={fmtMoney(apEmp + apVend)} />
        <Stat icon="wallet" color="teal" label="Mijozlar puli bizda" value={fmtMoney(apAdv + apTransit)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader icon={{ name: "users", color: "orange" }} title="Debitorlik: mijozlar" sub="Faktura − to'lov; muddati bo'yicha guruhlangan" />
          <div className="px-5 pb-4">
            <StackBar
              parts={[
                { label: "Muddati kelmagan", value: ar.reduce((a, r) => a + r.notDue, 0), color: VIZ.c1 },
                { label: "1–30 kun", value: ar.reduce((a, r) => a + r.d30, 0), color: VIZ.c2 },
                { label: "31–60 kun", value: ar.reduce((a, r) => a + r.d60, 0), color: "rgb(var(--viz-neg) / 0.6)" },
                { label: "60+ kun", value: ar.reduce((a, r) => a + r.d60plus, 0), color: VIZ.neg },
              ]}
            />
          </div>
          <TableWrap min={900}>
            <thead>
              <tr className="border-y border-sep">
                <th className={th}>Mijoz</th>
                <th className={thr}>Fakturalar</th>
                <th className={thr}>To'langan</th>
                <th className={thr}>Saldo</th>
                <th className={thr}>Muddati kelmagan</th>
                <th className={thr}>1–30</th>
                <th className={thr}>31–60</th>
                <th className={thr}>60+</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              {ar.map((r) => (
                <tr key={r.project.id} className="hover:bg-fill">
                  <td className={td}>
                    <A href={`/loyiha/${r.project.id}`} className="font-semibold text-label hover:underline">
                      {r.project.name}
                    </A>
                    {r.project.status === "closed" && <div className="text-[12px] text-label3">loyiha yopilgan</div>}
                  </td>
                  <td className={tdr}>
                    <Money v={r.invoiced} muted />
                  </td>
                  <td className={tdr}>
                    <Money v={r.paid} muted />
                  </td>
                  <td className={tdr}>
                    <Money v={r.balance} strong />
                  </td>
                  <td className={tdr}>{r.notDue ? <Money v={r.notDue} /> : "—"}</td>
                  <td className={`${tdr} text-orange`}>{r.d30 ? <Money v={r.d30} /> : "—"}</td>
                  <td className={tdr}>{r.d60 ? <Money v={r.d60} /> : "—"}</td>
                  <td className={tdr}>
                    {r.d60plus ? (
                      <span className="font-semibold text-red">
                        <Money v={r.d60plus} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={tdr}>
                    <A href={`/moliya/akt?client=${r.project.id}`} className="text-[13px] font-semibold text-accent">
                      Akt-sverka
                    </A>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader
            icon={{ name: "users", color: "indigo" }}
            title="Kreditorlik: xodimlar"
            sub="Hisoblangan, lekin hali to'lanmagan ish haqi"
            right={
              <A href="/moliya/ish-haqi" className="text-[13px] font-semibold text-accent">
                Ish haqi
              </A>
            }
          />
          {empOwed.length === 0 ? (
            <Empty>Xodimlardan qarz yo'q</Empty>
          ) : (
            <ul className="divide-y divide-sep">
              {empOwed.map((e) => (
                <li key={e.user.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div>
                    <div className="font-medium text-label">{e.user.name}</div>
                    <div className="text-[12px] text-label3">{ROLE_LABELS[e.user.role]}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Money v={e.balance} strong />
                    {editable && (
                      <Button size="sm" onClick={() => setPayUser(e.user.id)}>
                        To'lash
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              <li className="flex justify-between bg-fill px-5 py-2.5 font-semibold">
                <span>Jami</span>
                <Money v={apEmp} strong />
              </li>
            </ul>
          )}
          {empAdvances.length > 0 && (
            <div className="border-t border-sep px-5 py-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-label3">Debitorlik: xodimlarga berilgan avanslar</div>
              {empAdvances.map((e) => (
                <div key={e.user.id} className="flex justify-between text-[14px]">
                  <span className="text-label2">{e.user.name}</span>
                  <Money v={-e.balance} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader icon={{ name: "folder", color: "gray" }} title="Kreditorlik: ta'minotchilar" sub="To'lanmagan xarajat hujjatlari" />
          {openBills.length === 0 ? (
            <Empty>Qarz yo'q</Empty>
          ) : (
            <ul className="divide-y divide-sep">
              {openBills.map((b) => {
                const left = b.amount - billPaid(state, b);
                const late = b.dueDate < today;
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-label">{state.vendors.find((v) => v.id === b.vendorId)?.name}</div>
                      <div className="text-[12px] text-label3">
                        {b.note} · muddat {fmtDate(b.dueDate)} {late && <Badge tone="red">{diffDays(today, b.dueDate)} kun o'tdi</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money v={left} strong />
                      {editable && (
                        <Button size="sm" onClick={() => setPayBill(b)}>
                          To'lash
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-sep px-5 py-3">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-label3">Mijozlardan olingan avanslar</div>
            {ap.advances.length === 0 && <div className="text-[13px] text-label3">Yo'q</div>}
            {ap.advances.map((a) => (
              <div key={a.project.id} className="flex justify-between text-[14px]">
                <span className="text-label2">{a.project.name}</span>
                <Money v={a.amount} />
              </div>
            ))}
            <div className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-label3">Tranzit: mijozlar reklama puli</div>
            {ap.transit.map((a) => (
              <div key={a.project.id} className="flex justify-between text-[14px]">
                <span className="text-label2">{a.project.name}</span>
                <Money v={a.amount} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Note>
        Olingan avans — to'langan, lekin hali ko'rsatilmagan xizmat (kelgusi kunlar daromadi). Tranzit — mijozning reklama uchun bergan, Meta'ga hali
        sarflanmagan puli. Ikkisi ham mijozga tegishli mablag'.
      </Note>
      {payUser && <PayEmployeeModal userId={payUser} onClose={() => setPayUser(null)} />}
      {payBill && <PayBillModal bill={payBill} onClose={() => setPayBill(null)} />}
      {newBill && <BillModal onClose={() => setNewBill(false)} />}
    </>
  );
}
