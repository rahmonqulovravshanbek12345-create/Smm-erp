import { useMemo, useState } from "react";
import { PayBadge } from "../../components/bits";
import { A, Button, Card, CardHeader, Empty, Input, PageHeader, Select, Stat } from "../../components/ui";
import * as act from "../../lib/actions";
import { diffDays, fmtDate, fmtMoney, monthKey } from "../../lib/dates";
import { invoicePaid, invoicePeriod, invoiceStatus, type PayStatus } from "../../lib/finance";
import { PAYMENT_KIND_LABELS, PAYMENT_STATUS } from "../../lib/labels";
import { canEditFinance } from "../../lib/permissions";
import { useErp, useLookup } from "../../lib/store";
import type { Invoice } from "../../lib/types";
import { FinNav, Money, TableWrap, td, tdr, th, thr } from "./common";
import { ExtraInvoiceModal, InvoicePayModal } from "./modals";

export function Invoices({ projectId }: { projectId?: string }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const editable = canEditFinance(me.role);
  const [status, setStatus] = useState<"" | PayStatus | "open">(projectId ? "" : "open");
  const [project, setProject] = useState(projectId ?? "");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [extra, setExtra] = useState(false);

  const rows = useMemo(
    () =>
      state.invoices
        .filter((i) => !project || i.projectId === project)
        .map((inv) => ({ inv, st: invoiceStatus(state, inv, today), paid: invoicePaid(state, inv) }))
        .filter((r) => !status || (status === "open" ? r.st !== "paid" : r.st === status))
        .sort((a, b) => (b.inv.dueDate || "9999").localeCompare(a.inv.dueDate || "9999")),
    [state, project, status, today],
  );

  const all = state.invoices.filter((i) => !project || i.projectId === project).map((inv) => ({ inv, st: invoiceStatus(state, inv, today), paid: invoicePaid(state, inv) }));
  const month = monthKey(today);
  const issued = all.filter((r) => monthKey(r.inv.issueDate) === month).reduce((a, r) => a + r.inv.amount, 0);
  const open = all.filter((r) => r.st !== "paid").reduce((a, r) => a + r.inv.amount - r.paid, 0);
  const overdue = all.filter((r) => r.st === "overdue").reduce((a, r) => a + r.inv.amount - r.paid, 0);

  const table = (
    <Card>
      {!projectId && (
        <CardHeader
          title="Hisob-fakturalar"
          sub="Oylik fakturalar davr boshlanishidan 3 kun oldin avtomatik chiqariladi"
          right={
            <div className="flex flex-wrap gap-2">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="!w-44 !py-1.5 !text-[13px]"
                options={[
                  { value: "open", label: "To'lanmaganlar" },
                  { value: "", label: "Hammasi" },
                  ...(Object.keys(PAYMENT_STATUS) as PayStatus[]).map((k) => ({ value: k, label: PAYMENT_STATUS[k].label })),
                ]}
              />
              <Select value={project} onChange={(e) => setProject(e.target.value)} className="!w-44 !py-1.5 !text-[13px]" options={[{ value: "", label: "Barcha mijozlar" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]} />
            </div>
          }
        />
      )}
      {rows.length === 0 ? (
        <Empty>Faktura yo'q</Empty>
      ) : (
        <TableWrap min={900}>
          <thead>
            <tr className="border-y border-sep">
              <th className={th}>Raqam</th>
              {!projectId && <th className={th}>Mijoz</th>}
              <th className={th}>Turi / davr</th>
              <th className={th}>Muddat</th>
              <th className={thr}>Summa</th>
              <th className={thr}>To'langan</th>
              <th className={thr}>Qoldiq</th>
              <th className={th}>Holat</th>
              {editable && <th className={th} />}
            </tr>
          </thead>
          <tbody className="divide-y divide-sep">
            {rows.map(({ inv, st, paid }) => {
              const per = invoicePeriod(state, inv);
              return (
                <tr key={inv.id} className={st === "overdue" ? "bg-red/[0.05]" : "hover:bg-fill"}>
                  <td className={`${td} font-semibold text-label`}>
                    {inv.number}
                    <div className="text-[12px] font-normal text-label3">{fmtDate(inv.issueDate)}</div>
                  </td>
                  {!projectId && (
                    <td className={td}>
                      <A href={`/loyiha/${inv.projectId}`} className="font-medium text-label hover:underline">
                        {look.projectName(inv.projectId)}
                      </A>
                    </td>
                  )}
                  <td className={td}>
                    <div className="text-label">{PAYMENT_KIND_LABELS[inv.kind]}</div>
                    <div className="text-[12px] text-label3">{per && inv.kind !== "extra" ? `${fmtDate(per.start)} – ${fmtDate(per.end)}` : inv.note}</div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {editable && !inv.dueDate ? (
                      <Input type="date" value="" onChange={(e) => run((c) => act.setInvoiceDue(c, inv.id, e.target.value), "Sana saqlandi")} className="!w-36 !py-1 !text-xs" />
                    ) : inv.dueDate ? (
                      <>
                        {fmtDate(inv.dueDate)}
                        {st === "overdue" && <div className="text-[12px] font-semibold text-red">{diffDays(today, inv.dueDate)} kun kechikdi</div>}
                      </>
                    ) : (
                      <span className="text-orange">sana kelishilmagan</span>
                    )}
                  </td>
                  <td className={tdr}>
                    <Money v={inv.amount} />
                  </td>
                  <td className={tdr}>
                    <Money v={paid} muted />
                  </td>
                  <td className={tdr}>
                    <Money v={inv.amount - paid} strong />
                  </td>
                  <td className={td}>
                    <PayBadge status={st} />
                  </td>
                  {editable && (
                    <td className={tdr}>
                      {st !== "paid" && (
                        <Button size="sm" onClick={() => setPaying(inv)}>
                          To'lov
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );

  const modals = (
    <>
      {paying && <InvoicePayModal invoice={paying} onClose={() => setPaying(null)} />}
      {extra && <ExtraInvoiceModal onClose={() => setExtra(false)} />}
    </>
  );

  if (projectId) {
    return (
      <>
        {table}
        {modals}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hisob-fakturalar"
        sub="Mijozlarga chiqarilgan hujjatlar va ular bo'yicha to'lovlar"
        actions={
          editable && (
            <Button variant="primary" onClick={() => setExtra(true)}>
              + Qo'shimcha xizmat fakturasi
            </Button>
          )
        }
      />
      <FinNav />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat icon="send" color="blue" label="Shu oy chiqarilgan" value={fmtMoney(issued)} />
        <Stat icon="clock" color="orange" label="To'lanmagan qoldiq" value={fmtMoney(open)} />
        <Stat icon="alert" color="red" label="Muddati o'tgan" value={fmtMoney(overdue)} tone={overdue ? "red" : "green"} />
      </div>
      {table}
      {modals}
    </>
  );
}
