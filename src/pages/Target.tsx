import { useState } from "react";
import { TaskBadge } from "../components/bits";
import { TaskModal } from "../components/forms";
import { Badge, Banner, Button, Card, CardHeader, Empty, Field, Input, LinkOut, PageHeader, Select } from "../components/ui";
import * as act from "../lib/actions";
import { addDays, fmtDate, fmtMoney, fmtNum } from "../lib/dates";
import { access, canEdit, visibleProjects } from "../lib/permissions";
import { targetReportMissing } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";

export function Target() {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const own = access(me.role, "target") === "own";
  const editable = canEdit(me.role, "target");
  const projects = visibleProjects(state, me).filter((p) => p.targetologId);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [launch, setLaunch] = useState<Record<string, string>>({});
  const [f, setF] = useState({ date: addDays(today, -1), spend: "", views: "", clicks: "", leads: "", note: "" });

  const tasks = state.tasks
    .filter((t) => t.kind === "target" && (!own || t.assigneeId === me.id))
    .filter((t) => me.role !== "smm" || look.project(t.projectId)?.smmId === me.id)
    .sort((a, b) => Number(Boolean(a.launchedAt)) - Number(Boolean(b.launchedAt)) || a.deadline.localeCompare(b.deadline));
  const history = state.targetReports.filter((r) => r.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date));
  const missing = projects.filter((p) => targetReportMissing(state, p, today));
  const canReport = own || me.role === "admin";

  const totals = history.reduce(
    (a, r) => ({ spend: a.spend + r.spend, views: a.views + r.views, clicks: a.clicks + r.clicks, leads: a.leads + r.leads }),
    { spend: 0, views: 0, clicks: 0, leads: 0 },
  );

  const saveReport = () => {
    const ok = run(
      (c) =>
        act.saveTargetReport(c, {
          projectId,
          date: f.date,
          spend: Number(f.spend) || 0,
          views: Number(f.views) || 0,
          clicks: Number(f.clicks) || 0,
          leads: Number(f.leads) || 0,
          note: f.note,
          source: "manual",
        }),
      "Kunlik hisobot saqlandi",
    );
    if (ok) setF({ ...f, spend: "", views: "", clicks: "", leads: "", note: "" });
  };

  return (
    <>
      <PageHeader
        title={own ? "Targetolog oynasi" : "Target reklama"}
        sub="SMM menejer bergan target video va rasmlar, kunlik hisobot va loyiha bo'yicha tarix"
        actions={
          editable && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Targetga material berish
            </Button>
          )
        }
      />
      {missing.map((p) => (
        <Banner key={p.id} tone="red">
          {p.name}: kechagi ({fmtDate(addDays(today, -1))}) kunlik hisobot kiritilmagan — marketologga belgi chiqdi.
        </Banner>
      ))}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Target materiallari" sub="Reklama yoqilgan birinchi sana — hisob davrining boshi" />
          {tasks.length === 0 ? (
            <Empty>Material yo'q</Empty>
          ) : (
            <ul className="divide-y divide-sep">
              {tasks.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm font-medium text-label">{t.title}</div>
                    <TaskBadge task={t} today={today} />
                  </div>
                  <div className="mt-0.5 text-xs text-label2">
                    {look.projectName(t.projectId)} · deadline {fmtDate(t.deadline)}
                  </div>
                  {t.brief && <p className="mt-1.5 text-xs text-label2">{t.brief}</p>}
                  {t.files && (
                    <div className="mt-1 text-xs">
                      <LinkOut href={t.files}>Materiallar (Google Drive)</LinkOut>
                    </div>
                  )}
                  {t.launchedAt ? (
                    <div className="mt-1.5 text-xs text-green">Reklama yoqilgan: {fmtDate(t.launchedAt)}</div>
                  ) : (
                    canReport && (
                      <div className="mt-2 flex gap-2">
                        <Input type="date" value={launch[t.id] ?? today} onChange={(e) => setLaunch({ ...launch, [t.id]: e.target.value })} className="!w-40 !py-1.5 !text-xs" />
                        <Button size="sm" variant="primary" onClick={() => run((c) => act.launchTarget(c, t.id, launch[t.id] ?? today), "Reklama yoqildi")}>
                          Reklamani yoqdim
                        </Button>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader
              title="Kunlik hisobot"
              right={
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!w-48 !py-1 !text-xs" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
              }
            />
            {canReport ? (
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Sana">
                    <Input type="date" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} />
                  </Field>
                  <Field label="Sarflangan summa (so'm)">
                    <Input type="number" value={f.spend} onChange={(e) => setF({ ...f, spend: e.target.value })} />
                  </Field>
                  <Field label="Ko'rishlar">
                    <Input type="number" value={f.views} onChange={(e) => setF({ ...f, views: e.target.value })} />
                  </Field>
                  <Field label="Klik">
                    <Input type="number" value={f.clicks} onChange={(e) => setF({ ...f, clicks: e.target.value })} />
                  </Field>
                  <Field label="Lid soni">
                    <Input type="number" value={f.leads} onChange={(e) => setF({ ...f, leads: e.target.value })} />
                  </Field>
                  <Field label="Izoh">
                    <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button onClick={() => run((c) => act.importFromMeta(c, projectId, f.date), "Meta Ads'dan import qilindi (demo)")} disabled={!projectId}>
                    ⇩ Meta Ads'dan olish
                  </Button>
                  <Button variant="primary" onClick={saveReport} disabled={!projectId || !f.spend}>
                    Qo'lda saqlash
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-label2">
                  Ikkala usul ham bor: qo'lda kiritish yoki Meta Ads'dan avtomatik olish (demo'da namunaviy raqamlar).
                </p>
              </div>
            ) : (
              <p className="px-4 py-3 text-sm text-label2">Hisobotni targetolog kiritadi.</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`Tarix: ${look.projectName(projectId)}`}
              sub={
                history.length
                  ? `Jami: ${fmtMoney(totals.spend)} · ${fmtNum(totals.leads)} lid · lid narxi ${fmtMoney(totals.leads ? totals.spend / totals.leads : 0)}`
                  : undefined
              }
            />
            {history.length === 0 ? (
              <Empty>Hisobot yo'q</Empty>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-elevated text-left text-xs text-label2">
                    <tr>
                      <th className="px-4 py-2 font-medium">Sana</th>
                      <th className="px-4 py-2 text-right font-medium">Sarf</th>
                      <th className="px-4 py-2 text-right font-medium">Ko'rish</th>
                      <th className="px-4 py-2 text-right font-medium">Klik</th>
                      <th className="px-4 py-2 text-right font-medium">Lid</th>
                      <th className="px-4 py-2 font-medium">Manba</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sep">
                    {history.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-4 py-2 text-label/80">{fmtDate(r.date)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{fmtNum(r.spend)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{fmtNum(r.views)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{fmtNum(r.clicks)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-label">{r.leads}</td>
                        <td className="px-4 py-2">
                          <Badge tone={r.source === "meta" ? "blue" : "gray"}>{r.source === "meta" ? "Meta" : "Qo'lda"}</Badge>
                          {r.note && <span className="ml-1.5 text-xs text-label2">{r.note}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
      {creating && <TaskModal kind="target" onClose={() => setCreating(false)} />}
    </>
  );
}
