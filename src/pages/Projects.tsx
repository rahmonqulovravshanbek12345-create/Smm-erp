import { useState } from "react";
import { DebtBadge, TaskBadge } from "../components/bits";
import { ProjectFormModal } from "../components/ProjectForm";
import { A, Badge, Banner, Button, Card, CardHeader, Empty, Field, Input, LinkOut, PageHeader, Progress, Tabs, Textarea, navigate } from "../components/ui";
import * as act from "../lib/actions";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from "../lib/dates";
import { DOC_BLOCKS, TASK_KIND_LABELS } from "../lib/labels";
import { canEdit, canEditFinance, canView, visibleProjects } from "../lib/permissions";
import { currentPeriod, isPostLate, periodLabel, periodPosts, projectDebt, workBlockedReason } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { DocBlock, Project } from "../lib/types";
import { ContentPlan } from "./Content";
import { ProjectJourney } from "../components/ProjectJourney";
import { QuotaTab } from "../components/Quota";
import { ServicesPanel } from "../components/Services";
import { quotaFor } from "../lib/content";
import { hasAds, hasContent, hasRecurring, isRecurring, serviceMeta, servicesOf, stageIndex } from "../lib/services";
import { Invoices } from "./finance/Invoices";
import { ProjectFinance } from "./finance/ProjectFinance";

export function Projects() {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const [creating, setCreating] = useState(false);
  const projects = visibleProjects(state, me);

  return (
    <>
      <PageHeader
        title="Loyihalar"
        sub="Har bir mijoz kartasiga brif, kontent reja, vazifalar, moliya va hisobot bog'langan"
        actions={
          canEdit(me.role, "projects") && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Yangi loyiha
            </Button>
          )
        }
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const debt = projectDebt(state, p.id, today);
          const { per, posts } = periodPosts(state, p, today);
          const done = posts.filter((x) => x.status === "published").length;
          const blocked = workBlockedReason(state, p);
          const docsDone = Object.values(p.docs).filter((d) => d.status === "done").length;
          return (
            <A key={p.id} href={`/loyiha/${p.id}`}>
              <Card className={`h-full p-4 transition hover:shadow-float ${debt.amount ? "border-red/40" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-label">{p.name}</div>
                    <div className="text-xs text-label2">{p.industry}</div>
                  </div>
                  <span className="text-right text-sm text-label/80">
                    {p.monthlyFee > 0 && <span className="block">{fmtMoney(p.monthlyFee)}/oy</span>}
                    {servicesOf(p).some((x) => !isRecurring(x.kind) && x.status === "active") && (
                      <span className="block text-xs text-label2">
                        +{" "}
                        {fmtMoney(
                          servicesOf(p)
                            .filter((x) => !isRecurring(x.kind) && x.status === "active")
                            .reduce((a, x) => a + x.price, 0),
                        )}{" "}
                        bir martalik
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {servicesOf(p).map((x) => (
                    <Badge key={x.id} tone={isRecurring(x.kind) ? "blue" : x.deliveredAt ? "green" : "violet"}>
                      {serviceMeta(x.kind).short}
                      {!isRecurring(x.kind) && x.stages ? (x.deliveredAt ? " ✓" : ` ${stageIndex(x) + 1}/${x.stages.length}`) : ""}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <DebtBadge debt={debt} />
                  {blocked && <Badge tone="amber">{p.pauseWork ? "Ish to'xtatilgan" : "Oldindan to'lov kutilmoqda"}</Badge>}
                  {!p.handedOffAt && hasRecurring(p) && <Badge tone="violet">Strategiya: {docsDone}/5</Badge>}
                  {hasContent(p) && p.status === "active" && !quotaFor(state, p, today.slice(0, 7)).saved && <Badge tone="amber">Topshiriq berilmagan</Badge>}
                  {per && <Badge>{per.index + 1}-davr</Badge>}
                </div>
                {hasContent(p) && (
                  <div className="mt-3 flex items-center gap-3 text-xs text-label2">
                    <Progress value={done} max={posts.length} />
                    <span className="whitespace-nowrap">
                      {done}/{posts.length} joylandi
                    </span>
                  </div>
                )}
                <div className="mt-2 text-xs text-label2">
                  Marketolog: {look.userName(p.marketologId)}
                  {hasContent(p) && ` · SMM: ${look.userName(p.smmId)}`}
                  {hasAds(p) && !hasContent(p) && ` · Targetolog: ${look.userName(p.targetologId)}`}
                </div>
              </Card>
            </A>
          );
        })}
      </div>
      {projects.length === 0 && (
        <Card>
          <Empty>Loyiha yo'q</Empty>
        </Card>
      )}
      {creating && (
        <ProjectFormModal
          title="Yangi loyiha (shartnoma)"
          initial={{}}
          onClose={() => setCreating(false)}
          onSubmit={(input) => {
            let id = "";
            if (run((c) => (id = act.createProject(c, input)), "Loyiha yaratildi")) {
              setCreating(false);
              navigate(`/loyiha/${id}`);
            }
          }}
        />
      )}
    </>
  );
}

type Tab = "info" | "marketing" | "quota" | "content" | "tasks" | "finance" | "report";

export function ProjectCard({ id }: { id: string }) {
  const { state, me, today } = useErp();
  const p = visibleProjects(state, me).find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("info");
  if (!p) return <Empty>Loyiha topilmadi yoki sizga ochiq emas</Empty>;

  const debt = projectDebt(state, p.id, today);
  const blocked = workBlockedReason(state, p);
  const per = currentPeriod(p, today);
  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Umumiy" },
    ...(canView(me.role, "marketing") ? [{ id: "marketing" as Tab, label: "Marketolog bo'limi" }] : []),
    ...(canView(me.role, "content") && hasContent(p)
      ? [
          { id: "quota" as Tab, label: "Oylik topshiriq" },
          { id: "content" as Tab, label: "Kontent reja" },
        ]
      : []),
    { id: "tasks", label: "Vazifalar" },
    ...(canView(me.role, "finance") ? [{ id: "finance" as Tab, label: "Moliya" }] : []),
    { id: "report", label: "Oylik hisobot" },
  ];

  return (
    <>
      <div className="mb-1 text-xs">
        <A href="/loyihalar" className="text-label2 hover:text-label">
          ← Loyihalar
        </A>
      </div>
      <PageHeader
        title={p.name}
        sub={`${p.industry} · shartnoma ${p.contractNo} (${fmtDate(p.contractDate)})${hasRecurring(p) ? ` · ${per ? periodLabel(per) : "hisob davri boshlanmagan"}` : ""}`}
        actions={<DebtBadge debt={debt} />}
      />
      {debt.amount > 0 && (
        <Banner tone="red">
          ● Qarz: {fmtMoney(debt.amount)} — {debt.days} kun kechikdi. Ish to'xtamaydi{p.pauseWork ? ", lekin ish qo'lda to'xtatilgan" : ""}.
        </Banner>
      )}
      {blocked && !debt.amount && <Banner tone="amber">{blocked}</Banner>}
      <ProjectJourney project={p} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "info" && (
        <>
          <ServicesPanel project={p} />
          <Info p={p} />
        </>
      )}
      {tab === "marketing" && <Marketing p={p} />}
      {tab === "quota" && <QuotaTab project={p} />}
      {tab === "content" && <ContentPlan projectId={p.id} />}
      {tab === "tasks" && <ProjectTasks p={p} />}
      {tab === "finance" && (
        <>
          <ProjectFinance project={p} />
          <Invoices projectId={p.id} />
        </>
      )}
      {tab === "report" && <Reports p={p} />}
    </>
  );
}

function Info({ p }: { p: Project }) {
  const { me, run } = useErp();
  const look = useLookup();
  const canSettings = canEdit(me.role, "projects") || canEditFinance(me.role);
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[150px_1fr] gap-2 py-1.5 text-sm">
      <span className="text-label2">{label}</span>
      <span className="text-label">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-label">Mijoz</h2>
        {row("Kontakt", p.contactName)}
        {row("Telefon", p.phone)}
        {row("Soha", p.industry)}
        {row(
          "Ijtimoiy tarmoqlar",
          <span className="flex flex-col">
            {p.links
              .split("\n")
              .filter(Boolean)
              .map((l) => (
                <LinkOut key={l} href={l} />
              ))}
          </span>,
        )}
        <h2 className="mb-2 mt-4 text-sm font-semibold text-label">Jamoa</h2>
        {row("Marketolog", look.userName(p.marketologId))}
        {hasContent(p) && row("SMM menejer", look.userName(p.smmId))}
        {hasAds(p) && row("Targetolog", look.userName(p.targetologId))}
        {servicesOf(p)
          .filter((x) => !isRecurring(x.kind) && x.assigneeId)
          .map((x) => row(serviceMeta(x.kind).short, look.userName(x.assigneeId)))}
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-label">Shartnoma</h2>
        {row(
          "Raqam / sana",
          <span>
            {p.contractNo} · {fmtDate(p.contractDate)}{" "}
            <A href={`/hujjat/shartnoma/${p.id}`} className="ml-1 font-semibold text-accent">
              Shartnoma hujjati →
            </A>
          </span>,
        )}
        {row("Yuridik nomi", p.legalName ?? "—")}
        {row("Xizmatlar", p.tariff)}
        {p.monthlyFee > 0 && row("Oylik summa", fmtMoney(p.monthlyFee))}
        {p.monthlyFee > 0 && row("Oldindan to'lov", `${p.prepayType}%`)}
        {hasRecurring(p) &&
          row(
            "Davr boshlanishi",
            p.periodStart
              ? `${fmtDate(p.periodStart)} (${hasAds(p) ? "birinchi reklama" : "birinchi joylangan post"})`
              : `— ${hasAds(p) ? "birinchi reklama" : "birinchi joylangan post"} kutilmoqda`,
          )}
        {canSettings && (
          <div className="mt-4 space-y-3 border-t border-sep pt-4">
            <Field
              label="Davr boshlanish sanasi"
              hint={hasAds(p) ? "Targetolog reklamani yoqqanda avtomatik qo'yiladi" : "Birinchi post joylanganda avtomatik qo'yiladi"}
            >
              <Input
                type="date"
                value={p.periodStart ?? ""}
                onChange={(e) => run((c) => act.updateProject(c, p.id, { periodStart: e.target.value || undefined }), "Saqlandi")}
                className="!w-48"
              />
            </Field>
            {p.status !== "closed" && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.pauseWork}
                  onChange={(e) => run((c) => act.updateProject(c, p.id, { pauseWork: e.target.checked }), "Saqlandi")}
                  className="mt-1"
                />
                <span>
                  <span className="text-label">Ishni to'xtatish</span>
                  <span className="block text-xs text-label2">Belgilansa, bu loyiha uchun yangi post, syomka va TZ ochilmaydi (qo'lda boshqariladi)</span>
                </span>
              </label>
            )}
            <CloseProject p={p} />
          </div>
        )}
      </Card>
    </div>
  );
}

/** Mijoz bilan hamkorlik tugasa: loyiha yopiladi, yangi fakturalar chiqmaydi, ish to'xtaydi. */
function CloseProject({ p }: { p: Project }) {
  const { run, today } = useErp();
  const [ask, setAsk] = useState(false);
  const [date, setDate] = useState(today);
  if (p.status === "closed") return <p className="text-sm text-label2">Loyiha yopilgan: {fmtDate(p.closedAt)}</p>;
  if (!ask)
    return (
      <Button size="sm" variant="ghost" className="!px-0 !text-red" onClick={() => setAsk(true)}>
        Loyihani yopish…
      </Button>
    );
  return (
    <div className="rounded-[14px] bg-red/10 p-3 text-sm">
      <div className="font-semibold text-label">Loyihani yopish</div>
      <p className="mt-0.5 text-xs text-label2">Yopilgan sanadan keyin yangi fakturalar chiqarilmaydi, ish to'xtaydi. Qarzlar va tarix saqlanadi.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="!w-44 !py-1.5" aria-label="Yopilish sanasi" />
        <Button size="sm" variant="primary" className="!bg-red" onClick={() => run((c) => act.closeProject(c, p.id, date), "Loyiha yopildi") && setAsk(false)}>
          Yopish
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>
          Bekor qilish
        </Button>
      </div>
    </div>
  );
}

function Marketing({ p }: { p: Project }) {
  const { me, run } = useErp();
  const editable = canEdit(me.role, "marketing");
  const allDone = Object.values(p.docs).every((d) => d.status === "done");
  const [drafts, setDrafts] = useState<Record<DocBlock, string>>(
    () => Object.fromEntries(DOC_BLOCKS.map((b) => [b.id, p.docs[b.id].content])) as Record<DocBlock, string>,
  );

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-semibold text-label">Tayyor bloklar: {Object.values(p.docs).filter((d) => d.status === "done").length}/5</div>
          <div className="text-xs text-label2">
            {p.handedOffAt ? `SMM menejer va targetologga uzatilgan: ${fmtDateTime(p.handedOffAt)}` : "Hammasi «Tayyor» bo'lgach uzatish tugmasi ishlaydi"}
          </div>
        </div>
        {editable && (
          <Button variant="primary" disabled={!allDone} onClick={() => run((c) => act.handOff(c, p.id), "Uzatildi — SMM va targetologga bildirishnoma ketdi")}>
            {p.handedOffAt ? "Qayta uzatish" : "SMM menejer va targetologga uzatish →"}
          </Button>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {DOC_BLOCKS.map((b) => {
          const doc = p.docs[b.id];
          const changed = drafts[b.id] !== doc.content;
          return (
            <Card key={b.id}>
              <CardHeader
                title={b.label}
                sub={b.hint}
                right={<Badge tone={doc.status === "done" ? "green" : "amber"}>{doc.status === "done" ? "Tayyor" : "Jarayonda"}</Badge>}
              />
              <div className="p-4">
                {editable ? (
                  <>
                    <Textarea rows={5} value={drafts[b.id]} onChange={(e) => setDrafts({ ...drafts, [b.id]: e.target.value })} />
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      {changed && (
                        <Button size="sm" onClick={() => run((c) => act.saveDoc(c, p.id, b.id, drafts[b.id], doc.status), "Saqlandi")}>
                          Saqlash
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={doc.status === "done" ? "ghost" : "primary"}
                        onClick={() => run((c) => act.saveDoc(c, p.id, b.id, drafts[b.id], doc.status === "done" ? "progress" : "done"), "Status yangilandi")}
                      >
                        {doc.status === "done" ? "Jarayonga qaytarish" : "✓ Tayyor"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="whitespace-pre-line text-sm text-label/80">{doc.content || "—"}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ProjectTasks({ p }: { p: Project }) {
  const { state, today } = useErp();
  const look = useLookup();
  const tasks = state.tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const shoots = state.shoots.filter((s) => s.projectId === p.id);
  const late = state.posts.filter((x) => x.projectId === p.id && isPostLate(x, today));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="TZ va vazifalar" sub={`${tasks.length} ta`} />
        <ul className="divide-y divide-sep">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <span className="text-label2">{TASK_KIND_LABELS[t.kind]}:</span> <span className="text-label">{t.title}</span>
                <span className="block text-xs text-label2">
                  {look.userName(t.assigneeId)} · deadline {fmtDate(t.deadline)}
                </span>
              </span>
              <TaskBadge task={t} today={today} />
            </li>
          ))}
          {tasks.length === 0 && <Empty>Vazifa yo'q</Empty>}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Syomkalar" />
          <ul className="divide-y divide-sep text-sm">
            {shoots.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <div className="text-label">
                  {fmtDate(s.date)} {s.time}
                </div>
                <div className="text-xs text-label2">
                  {s.location} · {s.videoCount} video · {s.status === "handed" ? "topshirildi" : "rejada"}
                </div>
              </li>
            ))}
            {shoots.length === 0 && <Empty>Syomka yo'q</Empty>}
          </ul>
        </Card>
        {late.length > 0 && (
          <Card className="border-red/40">
            <CardHeader title={<span className="text-red">Kechikkan postlar</span>} />
            <ul className="divide-y divide-sep text-sm">
              {late.map((x) => (
                <li key={x.id} className="px-4 py-2">
                  {fmtDate(x.date)} · {x.topic}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Reports({ p }: { p: Project }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const per = currentPeriod(p, today);
  const reports = state.reports.filter((r) => r.projectId === p.id).sort((a, b) => b.periodIndex - a.periodIndex);
  const canSubmit = me.role === "admin" || (me.role === "smm" && p.smmId === me.id);
  const [f, setF] = useState({ periodIndex: per?.index ?? 0, fileLink: "", reach: "", followers: "", leads: "", summary: "" });
  const { posts } = periodPosts(state, p, today);
  const done = posts.filter((x) => x.status === "published").length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canSubmit && (
        <Card>
          <CardHeader title="Oylik hisobot topshirish" sub="Raqamlar ERP'da saqlanadi va hisobot fayli (Google Drive) biriktiriladi" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Davr">
              <Input type="number" min={1} value={f.periodIndex + 1} onChange={(e) => setF({ ...f, periodIndex: Math.max(0, Number(e.target.value) - 1) })} />
            </Field>
            <Field label="Hisobot fayli (Google Drive)">
              <Input value={f.fileLink} onChange={(e) => setF({ ...f, fileLink: e.target.value })} placeholder="https://drive.google.com/…" />
            </Field>
            <Field label="Qamrov (reach)">
              <Input type="number" value={f.reach} onChange={(e) => setF({ ...f, reach: e.target.value })} />
            </Field>
            <Field label="Yangi obunachilar">
              <Input type="number" value={f.followers} onChange={(e) => setF({ ...f, followers: e.target.value })} />
            </Field>
            <Field label="Lidlar">
              <Input type="number" value={f.leads} onChange={(e) => setF({ ...f, leads: e.target.value })} />
            </Field>
            <div className="self-end pb-2 text-xs text-label2">
              Joriy davr rejasi: {posts.length} ta, joylandi: {done} ta
            </div>
            <Field label="Xulosa" className="sm:col-span-2">
              <Textarea
                value={f.summary}
                onChange={(e) => setF({ ...f, summary: e.target.value })}
                placeholder={`Reja: ${posts.length} post, joylandi: ${done}. …`}
              />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button
                variant="primary"
                disabled={!f.fileLink && !f.reach}
                onClick={() =>
                  run(
                    (c) =>
                      act.submitReport(c, {
                        projectId: p.id,
                        periodIndex: f.periodIndex,
                        fileLink: f.fileLink,
                        reach: Number(f.reach) || 0,
                        followers: Number(f.followers) || 0,
                        leads: Number(f.leads) || 0,
                        summary: f.summary,
                      }),
                    "Hisobot topshirildi — marketolog va moliyaga xabar ketdi",
                  )
                }
              >
                Hisobotni topshirish
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card className={canSubmit ? "" : "lg:col-span-2"}>
        <CardHeader
          title="Topshirilgan hisobotlar"
          sub="Mijozga — ERP ma'lumotlaridan avtomatik tuziladigan hisobot"
          right={
            p.periodStart && (
              <A
                href={`/hisobot/${p.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white"
              >
                Mijoz uchun hisobot
              </A>
            )
          }
        />
        <ul className="divide-y divide-sep">
          {reports.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-label">{r.periodIndex + 1}-davr</span>
                <span className="text-xs text-label2">
                  {fmtDateTime(r.submittedAt)} · {look.userName(r.authorId)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>Qamrov: {fmtNum(r.reach)}</Badge>
                <Badge>Obunachi: +{fmtNum(r.followers)}</Badge>
                <Badge tone="green">Lid: {fmtNum(r.leads)}</Badge>
              </div>
              {r.summary && <p className="mt-1.5 text-label2">{r.summary}</p>}
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                {r.fileLink && <LinkOut href={r.fileLink}>Hisobot fayli</LinkOut>}
                <A href={`/hisobot/${p.id}/${r.periodIndex}`} className="font-semibold text-accent">
                  Mijoz hisoboti →
                </A>
              </div>
            </li>
          ))}
          {reports.length === 0 && <Empty>Hali hisobot yo'q</Empty>}
        </ul>
      </Card>
    </div>
  );
}
