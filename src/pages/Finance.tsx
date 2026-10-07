import { useState } from "react";
import { DebtBadge, PayBadge } from "../components/bits";
import { A, Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Stat, Tabs } from "../components/ui";
import * as act from "../lib/actions";
import { diffDays, fmtDate, fmtMoney, fmtMonth, monthKey, shiftMonthKey } from "../lib/dates";
import { PAYMENT_KIND_LABELS, ROLE_LABELS } from "../lib/labels";
import { canEditFinance } from "../lib/permissions";
import { acceptedMontajCount, currentPeriod, paidSum, paymentStatus, periodLabel, projectDebt } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { Payment } from "../lib/types";

type Tab = "payments" | "debts" | "periods" | "salaries";

export function Finance() {
  const { state, me, today } = useErp();
  const [tab, setTab] = useState<Tab>("payments");
  const editable = canEditFinance(me.role);

  const debtors = state.projects.map((p) => ({ p, debt: projectDebt(state, p.id, today) })).filter((x) => x.debt.amount > 0);
  const totalDebt = debtors.reduce((a, x) => a + x.debt.amount, 0);
  const month = monthKey(today);
  const receivedThisMonth = state.payments.flatMap((p) => p.transactions).filter((t) => t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0);
  const expected = state.payments.filter((p) => paymentStatus(p, today) !== "paid").reduce((a, p) => a + p.amount - paidSum(p), 0);

  return (
    <>
      <PageHeader title="Moliya" sub="Oldindan to'lov, hisob davrlari, qarzlar va xodimlar oyligi" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Tushum (${fmtMonth(month)})`} value={fmtMoney(receivedThisMonth)} tone="green" />
        <Stat label="Kutilayotgan to'lovlar" value={fmtMoney(expected)} />
        <Stat label="Umumiy qarz" value={fmtMoney(totalDebt)} tone={totalDebt ? "red" : "green"} />
        <Stat label="Qarzdor loyihalar" value={debtors.length} tone={debtors.length ? "red" : "green"} />
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "payments", label: "To'lovlar" },
          { id: "debts", label: <>Qarzdorlar {debtors.length > 0 && <Badge tone="red">{debtors.length}</Badge>}</> },
          { id: "periods", label: "Hisob davrlari" },
          { id: "salaries", label: "Xodimlar oyligi" },
        ]}
      />
      {tab === "payments" && <PaymentsTable editable={editable} />}
      {tab === "debts" && (
        <Card>
          {debtors.length === 0 ? (
            <Empty>Qarzdor loyiha yo'q</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {debtors.map(({ p, debt }) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <A href={`/loyiha/${p.id}`} className="font-medium text-white hover:underline">
                      {p.name}
                    </A>
                    <div className="text-xs text-mist-400">
                      {p.contactName} · {p.phone}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DebtBadge debt={debt} />
                    {p.pauseWork ? <Badge tone="amber">Ish to'xtatilgan</Badge> : <Badge tone="gray">Ish davom etmoqda</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-white/[0.06] px-4 py-2.5 text-xs text-mist-400">
            To'lov kechiksa ish to'xtamaydi. Kerak bo'lsa, loyiha kartasidagi «Ishni to'xtatish» opsiyasi qo'lda yoqiladi.
          </p>
        </Card>
      )}
      {tab === "periods" && <Periods />}
      {tab === "salaries" && <Salaries editable={editable} />}
    </>
  );
}

export function PaymentsTable({ editable, projectId }: { editable: boolean; projectId?: string }) {
  const { state, run, today } = useErp();
  const look = useLookup();
  const [paying, setPaying] = useState<Payment | null>(null);
  const rows = state.payments
    .filter((p) => !projectId || p.projectId === projectId)
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="text-left text-xs text-mist-400">
            <tr>
              {!projectId && <th className="px-4 py-2 font-medium">Loyiha</th>}
              <th className="px-4 py-2 font-medium">Turi</th>
              <th className="px-4 py-2 text-right font-medium">Summa</th>
              <th className="px-4 py-2 text-right font-medium">To'langan</th>
              <th className="px-4 py-2 font-medium">Muddat</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {editable && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((pay) => {
              const st = paymentStatus(pay, today);
              const paid = paidSum(pay);
              return (
                <tr key={pay.id} className={st === "overdue" ? "bg-red-500/[0.04]" : ""}>
                  {!projectId && (
                    <td className="px-4 py-2">
                      <A href={`/loyiha/${pay.projectId}`} className="text-white hover:underline">
                        {look.projectName(pay.projectId)}
                      </A>
                    </td>
                  )}
                  <td className="px-4 py-2 text-mist-200">
                    {PAYMENT_KIND_LABELS[pay.kind]}
                    {pay.kind === "monthly" && <span className="text-mist-400"> · {pay.periodIndex + 1}-davr</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{fmtMoney(pay.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-mist-200">{fmtMoney(paid)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {editable && pay.kind === "remainder" ? (
                      <Input
                        type="date"
                        value={pay.dueDate}
                        onChange={(e) => run((c) => act.setPaymentDue(c, pay.id, e.target.value), "Sana saqlandi")}
                        className="!w-36 !py-1 !text-xs"
                      />
                    ) : pay.dueDate ? (
                      fmtDate(pay.dueDate)
                    ) : (
                      <span className="text-amber-300">sana kiritilmagan</span>
                    )}
                    {st === "overdue" && <div className="text-[11px] text-red-300">{diffDays(today, pay.dueDate)} kun kechikdi</div>}
                  </td>
                  <td className="px-4 py-2">
                    <PayBadge pay={pay} today={today} />
                  </td>
                  {editable && (
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {st !== "paid" && (
                        <Button size="sm" onClick={() => setPaying(pay)}>
                          + To'lov
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>To'lovlar yo'q</Empty>}
      </div>
      {paying && <PayModal pay={paying} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function PayModal({ pay, onClose }: { pay: Payment; onClose: () => void }) {
  const { run, today } = useErp();
  const look = useLookup();
  const left = pay.amount - paidSum(pay);
  const [amount, setAmount] = useState(String(left));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={`To'lov: ${look.projectName(pay.projectId)} — ${PAYMENT_KIND_LABELS[pay.kind]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={() => run((c) => act.addPaymentTx(c, pay.id, Number(amount), date, note), "To'lov qayd etildi") && onClose()}>
            Qayd etish
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-mist-300">
        Qolgan summa: <span className="text-white">{fmtMoney(left)}</span>. Qisman to'lov ham qayd etiladi.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Summa (so'm)">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Sana">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Naqd / bank o'tkazmasi / karta" />
        </Field>
      </div>
    </Modal>
  );
}

function Periods() {
  const { state, today } = useErp();
  return (
    <Card>
      <CardHeader title="Hisob davrlari" sub="Birinchi reklama joylangan sanadan boshlanadi va keyingi oyning shu sanasida yopiladi" />
      <ul className="divide-y divide-white/[0.05]">
        {state.projects.map((p) => {
          const per = currentPeriod(p, today);
          const left = per ? diffDays(per.end, today) : null;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <A href={`/loyiha/${p.id}`} className="font-medium text-white hover:underline">
                  {p.name}
                </A>
                <div className="text-xs text-mist-400">{per ? periodLabel(per) : "Davr hali boshlanmagan — birinchi reklama kutilmoqda"}</div>
              </div>
              {per && left !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-mist-300">Keyingi to'lov: {fmtMoney(p.monthlyFee)}</span>
                  <Badge tone={left <= 3 ? "amber" : "gray"}>{left <= 3 ? `⚠ ${left} kun qoldi` : `${left} kun qoldi`}</Badge>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Salaries({ editable }: { editable: boolean }) {
  const { state, run, today } = useErp();
  const [month, setMonth] = useState(monthKey(today));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const staff = state.users.filter((u) => u.active && u.role !== "admin");
  const price = state.settings.montajPrice;

  let total = 0;
  const rows = staff.map((u) => {
    if (u.role === "montajyor") {
      const n = acceptedMontajCount(state, u.id, month);
      total += n * price;
      return { u, auto: true, amount: n * price, detail: `${n} ta qabul qilingan montaj × ${fmtMoney(price)}` };
    }
    const s = state.salaries.find((x) => x.userId === u.id && x.month === month);
    total += s?.amount ?? 0;
    return { u, auto: false, amount: s?.amount ?? 0, detail: s?.note ?? "" };
  });

  return (
    <Card>
      <CardHeader
        title="Xodimlar oyligi"
        sub="Montajyor — avtomatik (qabul qilingan montajlar soni bo'yicha), qolganlar — qo'lda"
        right={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonthKey(month, -1))}>
              ‹
            </Button>
            <span className="text-sm text-white">{fmtMonth(month)}</span>
            <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonthKey(month, 1))}>
              ›
            </Button>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(({ u, auto, amount, detail }) => (
              <tr key={u.id}>
                <td className="px-4 py-2 text-white">{u.name}</td>
                <td className="px-4 py-2 text-mist-400">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-2 text-xs text-mist-400">{auto ? <Badge tone="green">avto</Badge> : detail}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {auto || !editable ? (
                    <span className="font-medium text-white">{fmtMoney(amount)}</span>
                  ) : (
                    <div className="flex justify-end gap-1.5">
                      <Input
                        type="number"
                        value={drafts[u.id] ?? (amount ? String(amount) : "")}
                        placeholder="0"
                        onChange={(e) => setDrafts({ ...drafts, [u.id]: e.target.value })}
                        className="!w-36 !py-1 text-right !text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={() => run((c) => act.saveSalary(c, u.id, month, Number(drafts[u.id] ?? amount) || 0, "Oylik"), "Oylik saqlandi")}
                      >
                        Saqlash
                      </Button>
                    </div>
                  )}
                  {auto && <div className="text-[11px] text-mist-400">{detail}</div>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td colSpan={3} className="px-4 py-2.5 text-right text-mist-300">
                Jami fond:
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-white">{fmtMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
