import { useState } from "react";
import * as act from "../lib/actions";
import { fmtDate, fmtMoney, fmtNum } from "../lib/dates";
import { invoicePaid, invoiceStatus } from "../lib/finance";
import { canEdit } from "../lib/permissions";
import { currentPeriod } from "../lib/rules";
import {
  AD_CHANNELS,
  SERVICE_META,
  adPctAmount,
  isRecurring,
  serviceLabel,
  serviceOwner,
  servicePrepayPaid,
  servicesOf,
  stageIndex,
  type ServiceInput,
} from "../lib/services";
import { useErp, useLookup } from "../lib/store";
import type { Project, ProjectService, Role } from "../lib/types";
import { PayBadge } from "./bits";
import { Icon } from "./icons";
import { defaultService, ServiceFields } from "./ProjectForm";
import { Badge, Banner, Button, Card, CardHeader, Field, Input, Modal } from "./ui";

const canManage = (role: Role) => role === "admin" || role === "rahbar" || role === "marketolog";

function statusOf(svc: ProjectService) {
  if (svc.status === "cancelled") return <Badge tone="gray">To'xtatilgan</Badge>;
  if (isRecurring(svc.kind)) return <Badge tone="green">Faol</Badge>;
  if (svc.deliveredAt) return <Badge tone="green">Topshirildi · {fmtDate(svc.deliveredAt)}</Badge>;
  const i = stageIndex(svc);
  return (
    <Badge tone="amber">
      {svc.stages?.[i]?.name ?? "—"} · {i + 1}/{svc.stages?.length ?? 0}
    </Badge>
  );
}

/** Mijozning barcha xizmatlari: narx, mas'ul, holat; bir martalik ishlar — bosqichlar bilan. */
export function ServicesPanel({ project: p }: { project: Project }) {
  const { state, me, run } = useErp();
  const look = useLookup();
  const [adding, setAdding] = useState(false);
  const list = (p.services ?? []).slice().sort((a, b) => Number(a.status === "cancelled") - Number(b.status === "cancelled"));
  const manage = canManage(me.role) && p.status === "active";
  const usd = state.settings.usdRate;

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          icon={{ name: "folder", color: "blue" }}
          title="Xizmatlar"
          sub="Har xizmatning o'z narxi, mas'uli va holati. Oylik xizmatlar bitta oylik fakturaga qatorlar bo'lib tushadi"
          right={
            manage && (
              <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                + Xizmat qo'shish
              </Button>
            )
          }
        />
        {/* Telefon: har xizmat alohida qator-kartochka */}
        <ul className="divide-y divide-sep sm:hidden">
          {list.map((svc) => (
            <li key={svc.id} className={`px-4 py-3 text-sm ${svc.status === "cancelled" ? "opacity-55" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-label">{serviceLabel(svc.kind)}</div>
                  {svc.title && <div className="text-xs text-label2">{svc.title}</div>}
                </div>
                <Badge tone={isRecurring(svc.kind) ? "blue" : "violet"}>{isRecurring(svc.kind) ? "Oylik" : "Bir martalik"}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="tabular text-label">
                  {fmtMoney(svc.price)}
                  {isRecurring(svc.kind) ? "/oy" : ""}
                </span>
                {statusOf(svc)}
              </div>
              <div className="mt-1 text-xs text-label2">Mas'ul: {look.userName(serviceOwner(p, svc))}</div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-label2">
              <tr>
                <th className="px-4 py-2 font-medium">Xizmat</th>
                <th className="px-4 py-2 font-medium">Turi</th>
                <th className="px-4 py-2 text-right font-medium">Narx</th>
                <th className="px-4 py-2 font-medium">Mas'ul</th>
                <th className="px-4 py-2 font-medium">Holat</th>
                {manage && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              {list.map((svc) => {
                const pct = adPctAmount(svc, p, usd);
                return (
                  <tr key={svc.id} className={svc.status === "cancelled" ? "opacity-55" : ""}>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-label">{serviceLabel(svc.kind)}</span>
                      {svc.title && <span className="text-label2"> · {svc.title}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={isRecurring(svc.kind) ? "blue" : "violet"}>{isRecurring(svc.kind) ? "Oylik" : "Bir martalik"}</Badge>
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2.5 text-right text-label">
                      {fmtMoney(svc.price)}
                      {isRecurring(svc.kind) ? "/oy" : ""}
                      {pct > 0 && (
                        <span className="block text-xs text-label2">
                          + {svc.adPct}% byudjetdan ≈ {fmtMoney(pct)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-label2">{look.userName(serviceOwner(p, svc))}</td>
                    <td className="px-4 py-2.5">{statusOf(svc)}</td>
                    {manage && (
                      <td className="px-4 py-2.5 text-right">
                        {svc.status === "active" && !svc.deliveredAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="!text-red"
                            onClick={() =>
                              window.confirm(`${serviceLabel(svc.kind)} to'xtatilsinmi?`) &&
                              run((c) => act.cancelService(c, p.id, svc.id), `${serviceLabel(svc.kind)} to'xtatildi`)
                            }
                          >
                            To'xtatish
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {p.monthlyFee > 0 && (
          <div className="border-t border-sep px-4 py-2.5 text-sm text-label2">
            Oylik jami: <b className="text-label">{fmtMoney(p.monthlyFee)}</b> · oldindan to'lov {p.prepayType}%
          </div>
        )}
      </Card>
      {servicesOf(p)
        .filter((x) => !isRecurring(x.kind))
        .map((svc) => (
          <OneTimeService key={svc.id} project={p} svc={svc} />
        ))}
      {servicesOf(p)
        .filter((x) => x.kind === "performance")
        .map((svc) => (
          <PerformanceKpi key={svc.id} project={p} svc={svc} />
        ))}
      {adding && <AddServiceModal project={p} onClose={() => setAdding(false)} />}
    </>
  );
}

/** Bir martalik xizmat: bosqichlar, to'lovlar va shartlar (namuna 2 ga mos). */
export function OneTimeService({ project: p, svc, compact }: { project: Project; svc: ProjectService; compact?: boolean }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const stages = svc.stages ?? [];
  const i = stageIndex(svc);
  const invs = state.invoices.filter((x) => x.serviceId === svc.id);
  const paidPre = servicePrepayPaid(state, svc.id, (inv) => invoicePaid(state, inv));
  const can = svc.status === "active" && (canManage(me.role) || svc.assigneeId === me.id);
  const last = i === stages.length - 1;
  const late = svc.status === "active" && svc.deadline && svc.deadline < today;
  const blocked = i >= 1 && !paidPre;
  const pre = Math.round((svc.price * (svc.prepayPct ?? 50)) / 100);

  return (
    <Card className="mb-4">
      <CardHeader
        title={`${compact ? `${p.name} · ` : ""}${serviceLabel(svc.kind)}${svc.title ? ` — ${svc.title}` : ""}`}
        sub={`Ijrochi: ${look.userName(svc.assigneeId)}${svc.deadline ? ` · muddat ${fmtDate(svc.deadline)}` : ""}`}
        right={
          can &&
          i < stages.length && (
            <span className="flex flex-wrap justify-end gap-1.5">
              {i > 0 && (
                <Button size="sm" variant="ghost" onClick={() => run((c) => act.revertServiceStage(c, p.id, svc.id), "Bosqich qayta ochildi")}>
                  Orqaga
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                disabled={blocked}
                onClick={() =>
                  (!last || window.confirm("Ish mijozga topshirildimi? Qoldiq faktura chiqadi va daromad tan olinadi.")) &&
                  run((c) => act.advanceServiceStage(c, p.id, svc.id), last ? "Topshirildi — moliyaga xabar ketdi" : "Bosqich bajarildi")
                }
              >
                {last ? "✓ Topshirildi" : "Keyingi bosqich →"}
              </Button>
            </span>
          )
        }
      />
      <div className="px-4 pb-4">
        {late && <Banner tone="red">Topshirish muddati o'tdi ({fmtDate(svc.deadline)})</Banner>}
        {blocked && svc.status === "active" && <Banner tone="amber">Oldindan to'lov hali kelmagan — ish to'lovdan keyin davom etadi.</Banner>}
        <ol className="no-scrollbar flex gap-0 overflow-x-auto pb-1">
          {stages.map((st, k) => {
            const done = Boolean(st.doneAt);
            const cur = k === i && svc.status === "active";
            return (
              <li key={st.name} className="flex min-w-[96px] flex-1 flex-col items-center gap-1.5 text-center">
                <div className="flex w-full items-center">
                  <span className={`h-[3px] flex-1 ${k === 0 ? "opacity-0" : done || cur ? "bg-green/70" : "bg-fill2"}`} />
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      done ? "bg-green text-white" : cur ? "bg-accent text-white ring-4 ring-accent/20" : "bg-fill text-label3"
                    }`}
                  >
                    {done ? <Icon name="check" size={13} strokeWidth={3} /> : k + 1}
                  </span>
                  <span className={`h-[3px] flex-1 ${k === stages.length - 1 ? "opacity-0" : done ? "bg-green/70" : "bg-fill2"}`} />
                </div>
                <span className={`px-1 text-[12px] leading-tight ${cur ? "font-semibold text-label" : done ? "text-label2" : "text-label3"}`}>{st.name}</span>
                {st.doneAt && <span className="text-[10px] text-label3">{fmtDate(st.doneAt)}</span>}
              </li>
            );
          })}
        </ol>
        {!compact && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] bg-fill p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-label2">To'lov · {fmtMoney(svc.price)}</div>
              <ul className="space-y-1.5 text-sm">
                {invs.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-label">
                      {inv.kind === "prepay" ? `${svc.prepayPct ?? 50}% oldindan` : "Topshirishda"} · {fmtMoney(inv.amount)}
                    </span>
                    <PayBadge status={invoiceStatus(state, inv, today)} />
                  </li>
                ))}
                {!svc.deliveredAt && svc.price > pre && (
                  <li className="flex flex-wrap items-center justify-between gap-2 text-label2">
                    <span>Topshirishda · {fmtMoney(svc.price - pre)}</span>
                    <Badge tone="gray">Topshirilganda faktura chiqadi</Badge>
                  </li>
                )}
              </ul>
            </div>
            <div className="rounded-[14px] bg-fill p-3 text-sm">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-label2">Shartlar</div>
              <div className="text-label">Boshlangan: {fmtDate(svc.startDate)}</div>
              <div className="text-label">Muddat: {svc.deadline ? fmtDate(svc.deadline) : "—"}</div>
              {canEdit(me.role, "finance") || canManage(me.role) ? (
                <div className="text-label">Ijrochi haqi: {svc.assigneeFee ? fmtMoney(svc.assigneeFee) : "—"} (topshirilganda hisoblanadi)</div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Performance: joriy davr KPI (lidlar va lid narxi) va kanallar kesimi. */
function PerformanceKpi({ project: p, svc }: { project: Project; svc: ProjectService }) {
  const { state, today } = useErp();
  const per = currentPeriod(p, today);
  if (!per) return null;
  const rows = state.targetReports.filter((r) => r.projectId === p.id && r.date >= per.start && r.date < per.end);
  const usd = state.settings.usdRate;
  const by = AD_CHANNELS.map((ch) => {
    const rs = rows.filter((r) => (r.channel ?? "meta") === ch.id);
    const spend = rs.reduce((a, r) => a + r.spend, 0);
    const leads = rs.reduce((a, r) => a + r.leads, 0);
    return { ...ch, spend, leads, cpl: leads ? spend / leads / usd : 0 };
  }).filter((x) => x.spend || x.leads);
  const spend = by.reduce((a, x) => a + x.spend, 0);
  const leads = by.reduce((a, x) => a + x.leads, 0);
  const cpl = leads ? spend / leads / usd : 0;
  const leadOk = svc.kpiLeads ? leads >= svc.kpiLeads : true;
  const cplOk = svc.kpiCpl ? cpl <= svc.kpiCpl : true;
  return (
    <Card className="mb-4">
      <CardHeader icon={{ name: "target", color: "pink" }} title="Performance KPI" sub={`${per.index + 1}-davr: ${fmtDate(per.start)} – ${fmtDate(per.end)}`} />
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-3">
        <div className="rounded-[14px] bg-fill p-3">
          <div className="text-xs text-label2">Lidlar</div>
          <div className={`tabular text-xl font-bold ${leadOk ? "text-green" : "text-orange"}`}>
            {fmtNum(leads)}
            {svc.kpiLeads ? <span className="text-sm font-semibold text-label2"> / {fmtNum(svc.kpiLeads)}</span> : null}
          </div>
        </div>
        <div className="rounded-[14px] bg-fill p-3">
          <div className="text-xs text-label2">Lid narxi (USD)</div>
          <div className={`tabular text-xl font-bold ${cplOk ? "text-green" : "text-red"}`}>
            ${cpl.toFixed(2)}
            {svc.kpiCpl ? <span className="text-sm font-semibold text-label2"> / ≤ ${svc.kpiCpl}</span> : null}
          </div>
        </div>
        <div className="rounded-[14px] bg-fill p-3">
          <div className="text-xs text-label2">Sarf</div>
          <div className="tabular text-xl font-bold text-label">{fmtMoney(spend)}</div>
        </div>
        <div className="sm:col-span-3">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-label2">
              <tr>
                <th className="py-1.5 font-medium">Kanal</th>
                <th className="py-1.5 text-right font-medium">Sarf</th>
                <th className="py-1.5 text-right font-medium">Lidlar</th>
                <th className="py-1.5 text-right font-medium">Lid narxi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sep">
              {by.map((x) => (
                <tr key={x.id}>
                  <td className="py-1.5 text-label">{x.label}</td>
                  <td className="tabular py-1.5 text-right">{fmtMoney(x.spend)}</td>
                  <td className="tabular py-1.5 text-right">{fmtNum(x.leads)}</td>
                  <td className="tabular py-1.5 text-right">${x.cpl.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function AddServiceModal({ project: p, onClose }: { project: Project; onClose: () => void }) {
  const { state, run, today } = useErp();
  const taken = new Set(
    servicesOf(p)
      .filter((x) => isRecurring(x.kind))
      .map((x) => x.kind),
  );
  const options = SERVICE_META.filter((m) => !taken.has(m.id));
  const [svc, setSvc] = useState<ServiceInput>(() => defaultService(state, options[0]?.id ?? "web", state.users));
  const [due, setDue] = useState(today);
  const valid = svc.price > 0 && (isRecurring(svc.kind) || svc.assigneeId) && (svc.tariffId || svc.title.trim());
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${p.name}: yangi xizmat`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => run((c) => act.addService(c, p.id, svc, { dueDate: due }), "Xizmat qo'shildi — moliyaga xabar ketdi") && onClose()}
          >
            Qo'shish
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Xizmat turi">
        {options.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={svc.kind === m.id}
            onClick={() => setSvc(defaultService(state, m.id, state.users))}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${svc.kind === m.id ? "bg-accent text-white" : "bg-fill text-label2"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ServiceFields value={svc} onChange={setSvc} usdRate={state.settings.usdRate} adBudgetUsd={p.adBudgetUsd} />
      {(!isRecurring(svc.kind) || !p.monthlyFee) && (
        <Field label="Oldindan to'lov sanasi" className="mt-3 max-w-xs">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      )}
      {isRecurring(svc.kind) && p.monthlyFee > 0 && (
        <p className="mt-3 text-xs text-label2">
          Oylik xizmat keyingi davr fakturasidan boshlab alohida qator bo'lib qo'shiladi. Joriy davr uchun faktura chiqmaydi — kerak bo'lsa Moliya → Fakturalar
          → «Qo'shimcha xizmat» orqali chiqariladi.
        </p>
      )}
    </Modal>
  );
}
