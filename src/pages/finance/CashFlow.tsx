import { Fragment, useMemo, useState } from "react";
import { ColumnsChart, Legend, VIZ } from "../../components/charts";
import { Card, CardHeader, PageHeader, Select } from "../../components/ui";
import { fmtMoney, fmtNum, monthKey, monthShort } from "../../lib/dates";
import { accountBalance, cashFlow, lastMonths, transitBalance } from "../../lib/finance";
import { useErp } from "../../lib/store";
import { FinNav, Money, Note, TableWrap, td, tdr, th, thr } from "./common";
import { ExportButton } from "../../components/ExportButton";

export function CashFlow() {
  const { state, today } = useErp();
  const [span, setSpan] = useState("6");
  const months = useMemo(() => lastMonths(today, Number(span)), [today, span]);
  const cf = useMemo(() => cashFlow(state, months), [state, months]);
  const cur = monthKey(today);
  const sumOf = (rec: Record<string, number>) => months.reduce((a, m) => a + (rec[m] ?? 0), 0);
  const opNet = cf.sections.find((s) => s.key === "operating")!.net;

  return (
    <>
      <PageHeader
        title="Pul oqimi (Cash Flow)"
        sub="Faqat haqiqiy kirim va chiqimlar — qayerdan keldi, qayerga ketdi"
        actions={
          <ExportButton
            filename={`cash-flow-${today}`}
            sheets={() => [
              {
                name: "Cash Flow",
                columns: ["Modda", ...months, "Jami"],
                rows: [
                  ["Davr boshidagi qoldiq", ...months.map((m) => cf.opening[m] ?? 0), cf.opening[months[0]!] ?? 0],
                  ...cf.sections.flatMap((sec) => [
                    [sec.title.toUpperCase(), ...months.map(() => null), null],
                    ...sec.rows.map((r) => [r.label, ...months.map((m) => r.values[m] ?? 0), r.total]),
                    [`Sof oqim: ${sec.title}`, ...months.map((m) => sec.net[m] ?? 0), sumOf(sec.net)],
                  ]),
                  ["Sof pul oqimi", ...months.map((m) => cf.net[m] ?? 0), sumOf(cf.net)],
                  ["Davr oxiridagi qoldiq", ...months.map((m) => cf.closing[m] ?? 0), cf.closing[months[months.length - 1]!] ?? 0],
                ],
              },
            ]}
          />
        }
      />
      <FinNav />

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Oylik kirim va chiqim"
            sub="O'tkazmalarsiz, tranzit bilan birga"
            right={
              <Legend
                items={[
                  { label: "Kirim", color: VIZ.c3 },
                  { label: "Chiqim", color: VIZ.c2 },
                ]}
              />
            }
          />
          <div className="px-3 pb-4">
            <ColumnsChart
              labels={months.map((m) => monthShort(m) + (m === cur ? "*" : ""))}
              bars={[
                {
                  label: "Kirim",
                  color: VIZ.c3,
                  values: months.map((m) =>
                    cf.sections.reduce((a, s) => a + s.rows.filter((r) => (r.values[m] ?? 0) > 0).reduce((b, r) => b + (r.values[m] ?? 0), 0), 0),
                  ),
                },
                {
                  label: "Chiqim",
                  color: VIZ.c2,
                  values: months.map(
                    (m) => -cf.sections.reduce((a, s) => a + s.rows.filter((r) => (r.values[m] ?? 0) < 0).reduce((b, r) => b + (r.values[m] ?? 0), 0), 0),
                  ),
                },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Hisoblar qoldig'i" sub="Bugun" />
          <ul className="divide-y divide-sep px-5 pb-3">
            {state.accounts.map((a) => {
              const b = accountBalance(state, a.id);
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2.5 text-[14px]">
                  <span className="text-label2">{a.name}</span>
                  <span className="tabular font-semibold text-label">{a.currency === "USD" ? `$${fmtNum(b)}` : fmtNum(b)}</span>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-2 py-2.5 text-[14px]">
              <span className="text-label2">Shundan mijozlar reklama puli (tranzit)</span>
              <span className="tabular font-semibold text-orange">{fmtMoney(transitBalance(state))}</span>
            </li>
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Pul harakati hisoboti"
          sub="Bevosita usul, faoliyat turlari bo'yicha"
          right={
            <Select
              aria-label="Davr"
              value={span}
              onChange={(e) => setSpan(e.target.value)}
              className="!w-40 !py-1.5 !text-[13px]"
              options={[
                { value: "3", label: "So'nggi 3 oy" },
                { value: "6", label: "So'nggi 6 oy" },
                { value: "12", label: "So'nggi 12 oy" },
              ]}
            />
          }
        />
        <TableWrap min={260 + months.length * 120}>
          <thead>
            <tr className="border-y border-sep">
              <th className={th}>Modda</th>
              {months.map((m) => (
                <th key={m} className={thr}>
                  {monthShort(m)}
                  {m === cur ? "*" : ""}
                </th>
              ))}
              <th className={`${thr} border-l border-sep`}>Jami</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sep">
            <tr className="bg-fill font-semibold">
              <td className={td}>Davr boshidagi qoldiq</td>
              {months.map((m) => (
                <td key={m} className={tdr}>
                  <Money v={cf.opening[m] ?? 0} strong />
                </td>
              ))}
              <td className={`${tdr} border-l border-sep`}>
                <Money v={cf.opening[months[0]!] ?? 0} strong />
              </td>
            </tr>
            {cf.sections.map((sec) =>
              sec.rows.length === 0 ? null : (
                <Fragment key={sec.key}>
                  <tr>
                    <td colSpan={months.length + 2} className="px-4 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-label3">
                      {sec.title}
                    </td>
                  </tr>
                  {sec.rows.map((r) => (
                    <tr key={r.label}>
                      <td className={`${td} pl-8 text-label2`}>{r.label}</td>
                      {months.map((m) => (
                        <td key={m} className={tdr}>
                          {r.values[m] ? <Money v={r.values[m]!} muted={r.values[m]! > 0} /> : <span className="text-label3">—</span>}
                        </td>
                      ))}
                      <td className={`${tdr} border-l border-sep`}>
                        <Money v={r.total} />
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className={`${td} pl-8`}>Sof oqim: {sec.title.toLowerCase()}</td>
                    {months.map((m) => (
                      <td key={m} className={tdr}>
                        <Money v={sec.net[m] ?? 0} strong />
                      </td>
                    ))}
                    <td className={`${tdr} border-l border-sep`}>
                      <Money v={sumOf(sec.net)} strong />
                    </td>
                  </tr>
                </Fragment>
              ),
            )}
            {Object.values(cf.fx).some((v) => Math.abs(v) > 1) && (
              <tr>
                <td className={`${td} text-label2`}>Valyuta ayirboshlash farqi</td>
                {months.map((m) => (
                  <td key={m} className={tdr}>
                    <Money v={cf.fx[m] ?? 0} muted />
                  </td>
                ))}
                <td className={`${tdr} border-l border-sep`}>
                  <Money v={sumOf(cf.fx)} />
                </td>
              </tr>
            )}
            <tr className="bg-fill font-semibold">
              <td className={td}>Sof pul oqimi</td>
              {months.map((m) => (
                <td key={m} className={tdr}>
                  <Money v={cf.net[m] ?? 0} strong sign />
                </td>
              ))}
              <td className={`${tdr} border-l border-sep`}>
                <Money v={sumOf(cf.net)} strong sign />
              </td>
            </tr>
            <tr className="bg-fill font-semibold">
              <td className={td}>Davr oxiridagi qoldiq</td>
              {months.map((m) => (
                <td key={m} className={tdr}>
                  <Money v={cf.closing[m] ?? 0} strong />
                </td>
              ))}
              <td className={`${tdr} border-l border-sep`}>
                <Money v={cf.closing[months[months.length - 1]!] ?? 0} strong />
              </td>
            </tr>
          </tbody>
        </TableWrap>
        <div className="px-5 pb-4">
          <Note>
            Operatsion pul oqimi {months.length} oyda: <b>{fmtMoney(sumOf(opNet))}</b>. USD summalar tranzaksiya kunidagi kursda so'mga o'girilgan. Hisoblar
            o'rtasidagi o'tkazmalar natijaga ta'sir qilmaydi.
          </Note>
        </div>
      </Card>
    </>
  );
}
