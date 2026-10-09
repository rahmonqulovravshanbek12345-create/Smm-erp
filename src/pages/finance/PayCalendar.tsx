import { useMemo, useState } from "react";
import { LineChart, VIZ, fmtShort } from "../../components/charts";
import { Badge, Banner, Card, CardHeader, PageHeader, Select, Stat } from "../../components/ui";
import { fmtDate, fmtMoney, relDays } from "../../lib/dates";
import { paymentCalendar } from "../../lib/finance";
import { useErp } from "../../lib/store";
import { FinNav, Money, Note } from "./common";

const WEEK = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export function PayCalendar() {
  const { state, today } = useErp();
  const [horizon, setHorizon] = useState("45");
  const cal = useMemo(() => paymentCalendar(state, today, Number(horizon)), [state, today, horizon]);
  const inflow = cal.days.reduce((a, d) => a + d.items.filter((i) => i.amount > 0).reduce((b, i) => b + i.amount, 0), 0);
  const outflow = cal.days.reduce((a, d) => a + d.items.filter((i) => i.amount < 0).reduce((b, i) => b + i.amount, 0), 0);
  const minDay = cal.days.reduce<(typeof cal.days)[number] | null>((m, d) => (!m || d.balance < m.balance ? d : m), null);

  return (
    <>
      <PageHeader
        title="To'lov kalendari"
        sub="Kutilayotgan kirim va rejadagi chiqimlar bo'yicha kunma-kun pul qoldig'i"
        actions={
          <Select
            aria-label="Prognoz muddati"
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            className="!w-40 !py-1.5 !text-[13px]"
            options={[
              { value: "14", label: "14 kun" },
              { value: "30", label: "30 kun" },
              { value: "45", label: "45 kun" },
              { value: "60", label: "60 kun" },
            ]}
          />
        }
      />
      <FinNav />
      {cal.firstNegative ? (
        <Banner tone="red">
          {fmtDate(cal.firstNegative)} kuni erkin pul minusga tushadi. Mijoz to'lovlarini tezlashtiring yoki chiqimlarni keyinga suring.
        </Banner>
      ) : (
        <Banner tone="green">
          Tanlangan davrda pul yetarli: eng past qoldiq {fmtMoney(cal.min)}
          {minDay ? ` (${fmtDate(minDay.date)})` : ""}.
        </Banner>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="wallet" color="green" label="Bugun erkin pul" value={fmtShort(cal.free)} />
        <Stat icon="arrowUpRight" color="blue" label="Kutilayotgan kirim" value={fmtShort(inflow)} />
        <Stat icon="send" color="orange" label="Rejadagi chiqim" value={fmtShort(-outflow)} />
        <Stat icon="alert" color={cal.min < 0 ? "red" : "teal"} label="Eng past qoldiq" value={fmtShort(cal.min)} tone={cal.min < 0 ? "red" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-3">
          <CardHeader title="Prognoz qoldiq" sub={`Bugundan ${fmtDate(cal.end)} gacha · mijozlarning tranzit puli chiqarib tashlangan`} />
          <div className="px-3 pb-4">
            <LineChart
              height={180}
              labels={[fmtDate(today).slice(0, 5), ...cal.days.map((d) => fmtDate(d.date).slice(0, 5))]}
              series={{ label: "Qoldiq", color: VIZ.c1, values: [cal.free, ...cal.days.map((d) => d.balance)] }}
            />
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Kunlar bo'yicha" sub="Prognoz — hali hujjat chiqmagan, takrorlanuvchi to'lovlar asosida" />
          <ul className="divide-y divide-sep">
            {cal.days.map((d) => {
              const dt = new Date(`${d.date}T00:00:00`);
              return (
                <li key={d.date} className="grid grid-cols-[minmax(0,1fr)] gap-3 px-5 py-3 sm:grid-cols-[160px_minmax(0,1fr)_150px]">
                  <div>
                    <div className="font-semibold text-label">{fmtDate(d.date)}</div>
                    <div className="text-[12px] text-label3">
                      {WEEK[dt.getDay()]} · {relDays(d.date, today)}
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {d.items.map((i, k) => (
                      <li key={k} className="flex items-center justify-between gap-3 text-[14px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${i.amount > 0 ? "bg-green" : "bg-orange"}`} />
                          <span className="truncate text-label">{i.label}</span>
                          {i.forecast && <Badge>prognoz</Badge>}
                          {i.overdue && <Badge tone="red">muddati o'tgan</Badge>}
                        </span>
                        <Money v={i.amount} sign />
                      </li>
                    ))}
                  </ul>
                  <div className="text-right">
                    <div className="text-[12px] text-label3">Qoldiq</div>
                    <div className={`tabular font-semibold ${d.balance < 0 ? "text-red" : "text-label"}`}>{fmtMoney(d.balance)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Note>
        Kirim: to'lanmagan fakturalar muddati bo'yicha (muddati o'tganlari bugunga) va hali chiqmagan oylik fakturalar prognozi. Chiqim: ish haqi kuni (
        {state.settings.payday}-sana), ta'minotchi hujjatlari va oxirgi oylardagi takrorlanuvchi xarajatlar. Aylanma soliq avtomatik qo'shilmaydi.
      </Note>
    </>
  );
}
