import { useMemo, useState } from "react";
import { PayBadge } from "../../components/bits";
import { A, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Select, Stat } from "../../components/ui";
import * as act from "../../lib/actions";
import { diffDays, fmtDate, fmtMoney, fmtUsd, monthKey } from "../../lib/dates";
import { invoiceOutstanding, invoiceOutstandingUsd, invoicePaid, invoicePaidUsd, invoicePeriod, invoiceStatus, type PayStatus } from "../../lib/finance";
import { PAYMENT_KIND_LABELS, PAYMENT_STATUS } from "../../lib/labels";
import { canEditFinance } from "../../lib/permissions";
import { useErp, useLookup } from "../../lib/store";
import type { Invoice } from "../../lib/types";
import { FinNav, Money, TableWrap, td, tdr, th, thr } from "./common";
import { ExtraInvoiceModal, InvoicePayModal } from "./modals";
import { ExportButton } from "../../components/ExportButton";

function Usd({ v, strong, muted }: { v: number; strong?: boolean; muted?: boolean }) {
  return <span className={`tabular whitespace-nowrap ${strong ? "font-semibold" : ""} ${muted ? "text-label2" : "text-label"}`}>${fmtUsd(v)}</span>;
}

export function Invoices({ projectId }: { projectId?: string }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const editable = canEditFinance(me.role);
  const [status, setStatus] = useState<"" | PayStatus | "open">(projectId ? "" : "open");
  const [project, setProject] = useState(projectId ?? "");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [extra, setExtra] = useState(false);
  const [voiding, setVoiding] = useState<Invoice | null>(null);

  const rows = useMemo(
    () =>
      state.invoices
        .filter((i) => !project || i.projectId === project)
        .map((inv) => ({ inv, st: invoiceStatus(state, inv, today), paid: invoicePaid(state, inv), out: invoiceOutstanding(state, inv) }))
        .filter((r) => !status || (status === "open" ? r.st !== "paid" && r.st !== "void" : r.st === status))
        .sort((a, b) => (b.inv.dueDate || "9999").localeCompare(a.inv.dueDate || "9999")),
    [state, project, status, today],
  );

  const all = state.invoices
    .filter((i) => !project || i.projectId === project)
    .map((inv) => ({ inv, st: invoiceStatus(state, inv, today), paid: invoicePaid(state, inv), out: invoiceOutstanding(state, inv) }));
  const month = monthKey(today);
  const issued = all.filter((r) => monthKey(r.inv.issueDate) === month).reduce((a, r) => a + r.inv.amount, 0);
  const open = all.reduce((a, r) => a + r.out, 0);
  const overdue = all.filter((r) => r.st === "overdue").reduce((a, r) => a + r.out, 0);

  const table = (
    <Card>
      {!projectId && (
        <CardHeader
          title="Hisob-fakturalar"
          sub="Oylik fakturalar davr boshlanishidan 3 kun oldin avtomatik chiqariladi"
          right={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Holat bo'yicha filtr"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="!w-44 !py-1.5 !text-[13px]"
                options={[
                  { value: "open", label: "To'lanmaganlar" },
                  { value: "", label: "Hammasi" },
                  ...(Object.keys(PAYMENT_STATUS) as PayStatus[]).map((k) => ({ value: k, label: PAYMENT_STATUS[k].label })),
                ]}
              />
              <Select
                aria-label="Mijoz bo'yicha filtr"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="!w-44 !py-1.5 !text-[13px]"
                options={[{ value: "", label: "Barcha mijozlar" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
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
            {rows.map(({ inv, st, paid, out }) => {
              const per = invoicePeriod(state, inv);
              return (
                <tr key={inv.id} className={st === "overdue" ? "bg-red/[0.05]" : st === "void" ? "opacity-60" : "hover:bg-fill"}>
                  <td className={`${td} font-semibold text-label`}>
                    <A href={`/hujjat/faktura/${inv.id}`} className="text-accent hover:underline">
                      {inv.number}
                    </A>
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
                      <Input
                        type="date"
                        aria-label={`${inv.number}: to'lov sanasini belgilash`}
                        value=""
                        onChange={(e) => run((c) => act.setInvoiceDue(c, inv.id, e.target.value), "Sana saqlandi")}
                        className="!w-36 !py-1 !text-xs"
                      />
                    ) : inv.dueDate ? (
                      <>
                        {fmtDate(inv.dueDate)}
                        {st === "overdue" && <div className="text-[12px] font-semibold text-red">{diffDays(today, inv.dueDate)} kun kechikdi</div>}
                      </>
                    ) : (
                      <span className="text-orange">sana kelishilmagan</span>
                    )}
                  </td>
                  {inv.usd ? (
                    <>
                      <td className={tdr}>
                        <Usd v={inv.usd} />
                        <div className="tabular text-[12px] text-label3">≈ {fmtMoney(inv.amount)}</div>
                      </td>
                      <td className={tdr}>
                        <Usd v={invoicePaidUsd(state, inv)} muted />
                      </td>
                      <td className={tdr}>
                        <Usd v={invoiceOutstandingUsd(state, inv)} strong />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={tdr}>
                        <Money v={inv.amount} />
                      </td>
                      <td className={tdr}>
                        <Money v={paid} muted />
                      </td>
                      <td className={tdr}>
                        <Money v={out} strong />
                      </td>
                    </>
                  )}
                  <td className={td}>
                    <PayBadge status={st} />
                    {inv.voidReason && <div className="mt-0.5 text-[12px] text-label3">{inv.voidReason}</div>}
                  </td>
                  {editable && (
                    <td className={tdr}>
                      {st !== "paid" && st !== "void" && (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" onClick={() => setPaying(inv)}>
                            To'lov
                          </Button>
                          {paid <= 0.5 && (
                            <Button size="sm" variant="ghost" onClick={() => setVoiding(inv)} aria-label={`${inv.number}: bekor qilish`}>
                              Bekor
                            </Button>
                          )}
                        </div>
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
      {voiding && <VoidInvoiceModal invoice={voiding} onClose={() => setVoiding(null)} />}
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
          <>
            <ExportButton
              filename={`fakturalar-${today}`}
              sheets={() => [
                {
                  name: "Fakturalar",
                  columns: ["Raqam", "Sana", "Mijoz", "Turi", "Davr", "Muddat", "Summa", "To'langan", "Qoldiq", "Summa (USD)", "Qoldiq (USD)", "Holat"],
                  rows: all.map(({ inv, st, paid, out }) => {
                    const per = invoicePeriod(state, inv);
                    return [
                      inv.number,
                      inv.issueDate,
                      look.projectName(inv.projectId),
                      PAYMENT_KIND_LABELS[inv.kind],
                      per ? `${per.start} – ${per.end}` : "",
                      inv.dueDate,
                      inv.amount,
                      Math.round(paid),
                      Math.round(out),
                      inv.usd ?? "",
                      inv.usd ? invoiceOutstandingUsd(state, inv) : "",
                      PAYMENT_STATUS[st].label,
                    ];
                  }),
                },
              ]}
            />
            {editable && (
              <Button variant="primary" onClick={() => setExtra(true)}>
                + Qo'shimcha xizmat fakturasi
              </Button>
            )}
          </>
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

/** To'lanmagan fakturani sabab bilan bekor qilish (xizmat ko'rsatilmadi, xato chiqarilgan va h.k.). */
function VoidInvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { run } = useErp();
  const [reason, setReason] = useState("");
  const save = () => {
    if (run((c) => act.voidInvoice(c, invoice.id, reason), `Faktura ${invoice.number} bekor qilindi`)) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Fakturani bekor qilish: ${invoice.number}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Yopish</Button>
          <Button variant="danger" onClick={save} disabled={!reason.trim()}>
            Bekor qilish
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-label2">
        Bekor qilingan faktura qarzga, daromadga va to'lov kalendariga kirmaydi. Ro'yxatda «Bekor qilingan» bo'lib qoladi (o'chirilmaydi).
      </p>
      <Field label="Sabab">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: xizmat ko'rsatilmadi, xato chiqarilgan" />
      </Field>
    </Modal>
  );
}
