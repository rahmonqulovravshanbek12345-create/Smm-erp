import { useMemo, useState } from "react";
import { Icon } from "../../components/icons";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select } from "../../components/ui";
import * as act from "../../lib/actions";
import { fmtDate, fmtMoney, fmtNum, monthKey } from "../../lib/dates";
import { GROUP_LABELS, accountBalance, accountOf, articleOf, txUZS } from "../../lib/finance";
import { canEditFinance } from "../../lib/permissions";
import { useErp, useLookup } from "../../lib/store";
import { FinNav, MonthSelect, TableWrap, td, tdr, th, thr } from "./common";
import { TransferModal, TxModal } from "./modals";
import { ExportButton } from "../../components/ExportButton";

export function Transactions() {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const editable = canEditFinance(me.role);
  const [month, setMonth] = useState(monthKey(today));
  const [account, setAccount] = useState("");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "in" | "out" | "transfer">(null);

  const rows = useMemo(
    () =>
      state.transactions
        .filter((t) => (month === "all" || monthKey(t.date) === month) && (!account || t.accountId === account))
        .filter((t) => !group || articleOf(state, t.articleId)?.group === group)
        .filter((t) => {
          if (!q) return true;
          const hay = `${t.note} ${articleOf(state, t.articleId)?.name} ${look.projectName(t.projectId)} ${look.userName(t.userId)}`.toLowerCase();
          return hay.includes(q.toLowerCase());
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state, month, account, group, q, look],
  );
  const inSum = rows.filter((t) => t.dir === "in" && articleOf(state, t.articleId)?.group !== "transfer").reduce((a, t) => a + txUZS(state, t), 0);
  const outSum = rows.filter((t) => t.dir === "out" && articleOf(state, t.articleId)?.group !== "transfer").reduce((a, t) => a + txUZS(state, t), 0);

  const counterparty = (t: (typeof rows)[number]) =>
    t.userId ? look.userName(t.userId) : t.vendorId ? state.vendors.find((v) => v.id === t.vendorId)?.name : t.projectId ? look.projectName(t.projectId) : "";

  return (
    <>
      <PageHeader
        title="Kirim-chiqim"
        sub="Barcha hisoblar bo'yicha pul harakati jurnali"
        actions={
          <>
            <ExportButton
              filename={`kirim-chiqim-${month}`}
              sheets={() => [
                {
                  name: "Kirim-chiqim",
                  columns: ["Sana", "Modda", "Guruh", "Kontragent", "Izoh", "Hisob", "Valyuta", "Summa", "Summa (so'm)"],
                  rows: rows.map((t) => {
                    const art = articleOf(state, t.articleId);
                    const acc = accountOf(state, t.accountId);
                    const sign = t.dir === "in" ? 1 : -1;
                    return [
                      t.date,
                      art?.name,
                      art ? GROUP_LABELS[art.group] : "",
                      counterparty(t) ?? "",
                      t.note,
                      acc?.name,
                      acc?.currency,
                      sign * t.amount,
                      sign * txUZS(state, t),
                    ];
                  }),
                },
              ]}
            />
            {editable && (
              <>
                <Button onClick={() => setModal("transfer")}>
                  <Icon name="history" size={16} /> O'tkazma
                </Button>
                <Button variant="secondary" onClick={() => setModal("out")}>
                  − Chiqim
                </Button>
                <Button variant="primary" onClick={() => setModal("in")}>
                  + Kirim
                </Button>
              </>
            )}
          </>
        }
      />
      <FinNav />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {state.accounts.map((a) => {
          const bal = accountBalance(state, a.id);
          return (
            <button key={a.id} type="button" onClick={() => setAccount(account === a.id ? "" : a.id)} className="text-left">
              <Card className={`p-4 transition ${account === a.id ? "ring-2 ring-accent/60" : ""}`}>
                <div className="flex items-center justify-between text-[12px] text-label2">
                  <span className="truncate">{a.name}</span>
                  <Badge tone={a.currency === "USD" ? "violet" : "gray"}>{a.currency}</Badge>
                </div>
                <div className="mt-2 text-[22px] font-bold tracking-tight text-label">{a.currency === "USD" ? `$${fmtNum(bal)}` : fmtNum(bal)}</div>
                {a.currency === "USD" && <div className="text-[12px] text-label2">≈ {fmtMoney(bal * state.settings.usdRate)}</div>}
              </Card>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Jurnal"
          sub={
            <>
              Kirim <span className="font-semibold text-green">{fmtMoney(inSum)}</span> · chiqim{" "}
              <span className="font-semibold text-red">{fmtMoney(outSum)}</span> · o'tkazmalar hisobga olinmagan
            </>
          }
        />
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          <MonthSelect value={month} onChange={setMonth} />
          <Select
            aria-label="Modda guruhi bo'yicha filtr"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="!w-52 !py-1.5 !text-[13px]"
            options={[
              { value: "", label: "Barcha guruhlar" },
              ...Object.entries(GROUP_LABELS)
                .filter(([k]) => k !== "vendor")
                .map(([value, label]) => ({ value, label })),
            ]}
          />
          <Input placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} className="!w-56 !py-1.5 !text-[13px]" />
          {account && (
            <Button size="sm" variant="ghost" onClick={() => setAccount("")}>
              Hisob filtri: {accountOf(state, account)?.name} ✕
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <Empty>Bu davrda yozuv yo'q</Empty>
        ) : (
          <TableWrap min={860}>
            <thead>
              <tr className="border-y border-sep">
                <th className={th}>Sana</th>
                <th className={th}>Modda</th>
                <th className={th}>Kontragent</th>
                <th className={th}>Izoh</th>
                <th className={th}>Hisob</th>
                <th className={thr}>Summa</th>
                {editable && <th className={th} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              {rows.map((t) => {
                const art = articleOf(state, t.articleId);
                const acc = accountOf(state, t.accountId);
                return (
                  <tr key={t.id} className="hover:bg-fill">
                    <td className={`${td} whitespace-nowrap text-label2`}>{fmtDate(t.date)}</td>
                    <td className={td}>
                      <div className="font-medium text-label">{art?.name}</div>
                      <div className="text-[12px] text-label3">{art && GROUP_LABELS[art.group]}</div>
                    </td>
                    <td className={`${td} text-label2`}>{counterparty(t)}</td>
                    <td className={`${td} max-w-[260px] text-label2`}>{t.note}</td>
                    <td className={`${td} whitespace-nowrap text-label2`}>{acc?.name}</td>
                    <td className={tdr}>
                      {acc?.currency === "USD" ? (
                        <>
                          <span className={`tabular font-semibold ${t.dir === "in" ? "text-green" : "text-label"}`}>
                            {t.dir === "in" ? "+" : "−"}${fmtNum(t.amount)}
                          </span>
                          <div className="text-[11px] text-label3">≈ {fmtMoney(txUZS(state, t))}</div>
                        </>
                      ) : (
                        <span className={`tabular font-semibold ${t.dir === "in" ? "text-green" : "text-label"}`}>
                          {t.dir === "in" ? "+" : "−"}
                          {fmtNum(t.amount)}
                        </span>
                      )}
                    </td>
                    {editable && (
                      <td className={tdr}>
                        <button
                          type="button"
                          title="O'chirish"
                          className="rounded-full p-1.5 text-label3 transition hover:bg-red/12 hover:text-red"
                          onClick={() => run((c) => act.deleteTransaction(c, t.id), "O'chirildi")}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {modal === "transfer" && <TransferModal onClose={() => setModal(null)} />}
      {(modal === "in" || modal === "out") && <TxModal dir={modal} onClose={() => setModal(null)} />}
      <p className="mt-3 px-1 text-[12px] text-label3">
        Mijoz to'lovlari «Fakturalar»dan, ish haqi to'lovlari «Ish haqi»dan, ta'minotchiga to'lov «Debitor / Kreditor»dan kiritiladi — shunda ular hujjatga
        bog'lanadi.
      </p>
    </>
  );
}
