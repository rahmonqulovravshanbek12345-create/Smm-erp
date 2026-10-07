import { useMemo, useState } from "react";
import { Icon } from "../../components/icons";
import { Button, Card, Field, Input, PageHeader, Select, Tabs, usePath } from "../../components/ui";
import { addMonths, fmtDate, fmtMoney } from "../../lib/dates";
import { reconClient, reconEmployee } from "../../lib/finance";
import { ROLE_LABELS } from "../../lib/labels";
import { useErp } from "../../lib/store";
import { FinNav, Money } from "./common";
import { ExportButton } from "../../components/ExportButton";

type Kind = "client" | "employee";

/** Solishtirma dalolatnoma (akt-sverka) — chop etishga tayyor forma. */
export function Recon() {
  const { state, today } = useErp();
  const path = usePath();
  const query = new URLSearchParams(path.split("?")[1] ?? "");
  const [kind, setKind] = useState<Kind>(query.get("user") ? "employee" : "client");
  const [clientId, setClientId] = useState(query.get("client") ?? state.projects[0]?.id ?? "");
  const [userId, setUserId] = useState(query.get("user") ?? state.users.find((u) => u.role === "smm")?.id ?? "");
  const [from, setFrom] = useState(addMonths(today, -3).slice(0, 8) + "01");
  const [to, setTo] = useState(today);

  const r = useMemo(
    () => (kind === "client" ? reconClient(state, clientId, from, to) : reconEmployee(state, userId, from, to)),
    [state, kind, clientId, userId, from, to],
  );
  const project = state.projects.find((p) => p.id === clientId);
  const user = state.users.find((u) => u.id === userId);
  const company = state.settings.companyName;
  const party = kind === "client" ? project?.name ?? "—" : user?.name ?? "—";
  const partyRole = kind === "client" ? `mijoz (${project?.contactName ?? ""})` : `xodim (${user ? ROLE_LABELS[user.role] : ""})`;

  const conclusion =
    kind === "client"
      ? r.closing > 0.5
        ? `${fmtDate(to)} holatiga ${party}ning ${company} oldidagi qarzi ${fmtMoney(r.closing)}.`
        : r.closing < -0.5
          ? `${fmtDate(to)} holatiga ${company}ning ${party} oldidagi qarzi (oldindan to'lov) ${fmtMoney(-r.closing)}.`
          : `${fmtDate(to)} holatiga tomonlar o'rtasida qarzdorlik yo'q.`
      : r.closing > 0.5
        ? `${fmtDate(to)} holatiga ${company}ning xodim ${party} oldidagi ish haqi qarzi ${fmtMoney(r.closing)}.`
        : r.closing < -0.5
          ? `${fmtDate(to)} holatiga xodim ${party}ga ortiqcha to'langan (avans) ${fmtMoney(-r.closing)}.`
          : `${fmtDate(to)} holatiga tomonlar o'rtasida qarzdorlik yo'q.`;

  const debitLabel = kind === "client" ? "Debet (xizmat)" : "Debet (to'langan)";
  const creditLabel = kind === "client" ? "Kredit (to'lov)" : "Kredit (hisoblangan)";

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Akt-sverka"
          sub="Solishtirma dalolatnoma: mijoz yoki xodim bilan hisob-kitob"
          actions={
            <>
            <ExportButton
              filename={`akt-sverka-${party}-${to}`}
              sheets={() => [
                {
                  name: "Akt-sverka",
                  title: [`Akt-sverka: ${company} — ${party}`, `${from} – ${to}`],
                  columns: ["№", "Sana", "Hujjat / operatsiya", debitLabel, creditLabel],
                  rows: [
                    ["", "", "Davr boshidagi saldo", kind === "client" ? r.opening : -r.opening, null],
                    ...r.rows.map((x, i) => [i + 1, x.date, x.doc, x.debit || null, x.credit || null]),
                    ["", "", "Davr aylanmasi", r.debit, r.credit],
                    ["", "", "Davr oxiridagi saldo", kind === "client" ? r.closing : -r.closing, null],
                  ],
                },
              ]}
            />
            <Button variant="primary" onClick={() => window.print()}>
              <Icon name="upload" size={16} /> Chop etish / PDF
            </Button>
            </>
          }
        />
        <FinNav />
        <Tabs<Kind>
          value={kind}
          onChange={setKind}
          tabs={[
            { id: "client", label: "Mijoz bilan" },
            { id: "employee", label: "Xodim bilan" },
          ]}
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {kind === "client" ? (
            <Field label="Mijoz">
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} options={state.projects.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
          ) : (
            <Field label="Xodim">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)} options={state.users.filter((u) => u.role !== "admin").map((u) => ({ value: u.id, label: `${u.name} — ${ROLE_LABELS[u.role]}` }))} />
            </Field>
          )}
          <Field label="Davr boshi">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Davr oxiri">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>

      <Card className="print-area mx-auto max-w-4xl p-6 sm:p-10">
        <div className="text-center">
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-label3">Solishtirma dalolatnoma</div>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight text-label">Akt-sverka</h2>
          <p className="mt-1 text-[14px] text-label2">
            {fmtDate(from)} – {fmtDate(to)} davri uchun o'zaro hisob-kitoblar
          </p>
        </div>
        <div className="mt-6 grid gap-4 text-[14px] sm:grid-cols-2">
          <div className="rounded-[14px] bg-fill p-3">
            <div className="text-[12px] text-label3">1-tomon</div>
            <div className="font-semibold text-label">{company}</div>
          </div>
          <div className="rounded-[14px] bg-fill p-3">
            <div className="text-[12px] text-label3">2-tomon — {partyRole}</div>
            <div className="font-semibold text-label">{party}</div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b-2 border-label/20 text-left text-[12px] uppercase tracking-[0.04em] text-label2">
                <th className="py-2 pr-2">№</th>
                <th className="py-2 pr-2">Sana</th>
                <th className="py-2 pr-2">Hujjat / operatsiya</th>
                <th className="py-2 pr-2 text-right">{debitLabel}</th>
                <th className="py-2 text-right">{creditLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              <tr className="font-semibold">
                <td className="py-2" colSpan={3}>
                  Davr boshidagi saldo
                </td>
                <td className="py-2 pr-2 text-right">{(kind === "client" ? r.opening : -r.opening) > 0.5 ? <Money v={Math.abs(r.opening)} /> : Math.abs(r.opening) <= 0.5 ? "0" : ""}</td>
                <td className="py-2 text-right">{(kind === "client" ? r.opening : -r.opening) < -0.5 ? <Money v={Math.abs(r.opening)} /> : ""}</td>
              </tr>
              {r.rows.map((x, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2 text-label3">{i + 1}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-label2">{fmtDate(x.date)}</td>
                  <td className="py-2 pr-2 text-label">{x.doc}</td>
                  <td className="py-2 pr-2 text-right">{x.debit ? <Money v={x.debit} /> : ""}</td>
                  <td className="py-2 text-right">{x.credit ? <Money v={x.credit} /> : ""}</td>
                </tr>
              ))}
              {r.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-label3">
                    Davrda operatsiya yo'q
                  </td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-2" colSpan={3}>
                  Davr aylanmasi
                </td>
                <td className="py-2 pr-2 text-right">
                  <Money v={r.debit} />
                </td>
                <td className="py-2 text-right">
                  <Money v={r.credit} />
                </td>
              </tr>
              <tr className="border-t-2 border-label/20 font-bold">
                <td className="py-2" colSpan={3}>
                  Davr oxiridagi saldo
                </td>
                <td className="py-2 pr-2 text-right">{(kind === "client" ? r.closing : -r.closing) > 0.5 ? <Money v={Math.abs(r.closing)} strong /> : Math.abs(r.closing) <= 0.5 ? "0" : ""}</td>
                <td className="py-2 text-right">{(kind === "client" ? r.closing : -r.closing) < -0.5 ? <Money v={Math.abs(r.closing)} strong /> : ""}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-6 rounded-[14px] bg-accent/10 px-4 py-3 text-[14px] font-semibold text-label">{conclusion}</p>

        <div className="mt-10 grid gap-10 text-[14px] sm:grid-cols-2">
          {[company, party].map((p, i) => (
            <div key={i}>
              <div className="text-label2">{i === 0 ? "1-tomon" : "2-tomon"}</div>
              <div className="font-semibold text-label">{p}</div>
              <div className="mt-10 border-b border-label/30" />
              <div className="mt-1 text-[12px] text-label3">imzo, F.I.Sh.{i === 0 ? ", muhr" : ""}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
