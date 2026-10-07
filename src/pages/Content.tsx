import { useMemo, useState } from "react";
import { PostBadge } from "../components/bits";
import { PostModal, ShootModal, TaskModal } from "../components/forms";
import { Badge, Button, Card, Empty, PageHeader, Select } from "../components/ui";
import { WEEKDAYS, addDays, fmtDate, fmtMonth, monthKey, parseDate, shiftMonthKey, toISODate } from "../lib/dates";
import { FORMAT_LABELS, PLATFORM_LABELS, postStatusMeta } from "../lib/labels";
import { access, canEdit, visibleProjects } from "../lib/permissions";
import { isPostLate } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { Post, TaskKind } from "../lib/types";

export function Content() {
  const { state, me } = useErp();
  const projects = visibleProjects(state, me);
  const [projectId, setProjectId] = useState(me.role === "smm" ? projects[0]?.id ?? "" : "");
  const [modal, setModal] = useState<null | "shoot" | TaskKind>(null);
  const editable = canEdit(me.role, "content");

  return (
    <>
      <PageHeader
        title="Kontent reja"
        sub="Oy bo'yicha 12–15 ta post: sana, platforma, format, mavzu, mas'ul va status"
        actions={
          editable && (
            <>
              <Button onClick={() => setModal("shoot")}>+ Syomka</Button>
              <Button onClick={() => setModal("montaj")}>+ Montaj TZ</Button>
              <Button onClick={() => setModal("dizayn")}>+ Dizayn TZ</Button>
              <Button onClick={() => setModal("target")}>+ Target</Button>
            </>
          )
        }
      />
      <div className="mb-4">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="!w-64"
          options={[{ value: "", label: "Barcha loyihalar" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </div>
      <ContentPlan projectId={projectId || undefined} />
      {modal === "shoot" && <ShootModal projectId={projectId || undefined} onClose={() => setModal(null)} />}
      {modal && modal !== "shoot" && <TaskModal kind={modal} projectId={projectId || undefined} onClose={() => setModal(null)} />}
    </>
  );
}

/** Kalendar + ro'yxat. Loyiha kartasida ham shu komponent ishlatiladi. */
export function ContentPlan({ projectId }: { projectId?: string }) {
  const { state, me, today } = useErp();
  const look = useLookup();
  const [month, setMonth] = useState(monthKey(today));
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [open, setOpen] = useState<{ id?: string; date?: string } | null>(null);
  const editable = canEdit(me.role, "content");
  const own = access(me.role, "content") === "own";

  const visible = useMemo(() => {
    const allowed = new Set(visibleProjects(state, me).map((p) => p.id));
    const mineTaskPosts = new Set(state.tasks.filter((t) => t.assigneeId === me.id).map((t) => t.postId));
    return state.posts.filter(
      (p) => allowed.has(p.projectId) && (!projectId || p.projectId === projectId) && (!own || mineTaskPosts.has(p.id)),
    );
  }, [state, me, projectId, own]);

  const inMonth = visible.filter((p) => monthKey(p.date) === month).sort((a, b) => a.date.localeCompare(b.date));
  const published = inMonth.filter((p) => p.status === "published").length;
  const late = inMonth.filter((p) => isPostLate(p, today)).length;

  // Kalendar katakchalari: dushanbadan boshlanadigan haftalar
  const cells = useMemo(() => {
    const first = parseDate(`${month}-01`);
    const offset = (first.getDay() + 6) % 7;
    const start = addDays(`${month}-01`, -offset);
    const count = Math.ceil((offset + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => addDays(start, i));
  }, [month]);

  const byDate = (d: string) => visible.filter((p) => p.date === d);
  const newFor = projectId ?? visibleProjects(state, me).find((p) => p.smmId === me.id)?.id ?? state.projects[0]?.id ?? "";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Oldingi oy">
            ‹
          </Button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-white">{fmtMonth(month)}</span>
          <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonthKey(month, 1))} aria-label="Keyingi oy">
            ›
          </Button>
          {month !== monthKey(today) && (
            <Button size="sm" variant="ghost" onClick={() => setMonth(monthKey(today))}>
              Bugun
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={projectId && (inMonth.length < 12 || inMonth.length > 15) ? "amber" : "gray"}>{inMonth.length} ta post</Badge>
          <Badge tone="green">{published} joylandi</Badge>
          {late > 0 && <Badge tone="red">{late} kechikdi</Badge>}
          <div className="ml-1 flex rounded-lg border border-white/10 p-0.5">
            {(["calendar", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 ${view === v ? "bg-white/10 text-white" : "text-mist-400"}`}
              >
                {v === "calendar" ? "Kalendar" : "Ro'yxat"}
              </button>
            ))}
          </div>
          {editable && (
            <Button size="sm" variant="primary" onClick={() => setOpen({ date: today })}>
              + Post
            </Button>
          )}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div key={w} className="border-b border-white/[0.06] px-2 py-1.5 text-center text-[11px] font-medium text-mist-400">
                {w}
              </div>
            ))}
            {cells.map((d) => {
              const inCur = monthKey(d) === month;
              const items = byDate(d);
              return (
                <div
                  key={d}
                  onDoubleClick={() => editable && setOpen({ date: d })}
                  className={`min-h-[104px] border-b border-r border-white/[0.04] p-1.5 ${inCur ? "" : "opacity-35"} ${d === today ? "bg-signal-500/[0.06]" : ""}`}
                >
                  <div className={`mb-1 text-[11px] ${d === today ? "font-semibold text-signal-300" : "text-mist-400"}`}>{parseDate(d).getDate()}</div>
                  <div className="space-y-1">
                    {items.map((p) => (
                      <PostChip key={p.id} post={p} today={today} onClick={() => setOpen({ id: p.id })} showProject={!projectId} projectName={look.projectName(p.projectId)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {editable && <p className="px-4 py-2 text-[11px] text-mist-400">Kunni ikki marta bossangiz — shu sanaga yangi post qo'shiladi.</p>}
        </div>
      ) : inMonth.length === 0 ? (
        <Empty>Bu oyda post yo'q</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-mist-400">
              <tr>
                <th className="px-4 py-2 font-medium">Sana</th>
                {!projectId && <th className="px-4 py-2 font-medium">Loyiha</th>}
                <th className="px-4 py-2 font-medium">Platforma</th>
                <th className="px-4 py-2 font-medium">Format</th>
                <th className="px-4 py-2 font-medium">Mavzu</th>
                <th className="px-4 py-2 font-medium">Mas'ul</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {inMonth.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpen({ id: p.id })}>
                  <td className="whitespace-nowrap px-4 py-2 text-mist-200">{fmtDate(p.date)}</td>
                  {!projectId && <td className="px-4 py-2 text-mist-300">{look.projectName(p.projectId)}</td>}
                  <td className="px-4 py-2 text-mist-300">{PLATFORM_LABELS[p.platform]}</td>
                  <td className="px-4 py-2 text-mist-300">{FORMAT_LABELS[p.format]}</td>
                  <td className="px-4 py-2 text-white">
                    {p.topic} {p.forTarget && <Badge tone="blue">target</Badge>}
                  </td>
                  <td className="px-4 py-2 text-mist-300">{look.userName(p.assigneeId)}</td>
                  <td className="px-4 py-2">
                    <PostBadge post={p} today={today} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <PostModal postId={open.id} newFor={open.id ? undefined : { projectId: newFor, date: open.date ?? toISODate(new Date()) }} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function PostChip({ post, today, onClick, showProject, projectName }: { post: Post; today: string; onClick: () => void; showProject: boolean; projectName: string }) {
  const late = isPostLate(post, today);
  const meta = postStatusMeta(post.status);
  const dot =
    late ? "bg-red-400" : meta.tone === "green" ? "bg-signal-400" : meta.tone === "violet" ? "bg-violet-400" : meta.tone === "amber" ? "bg-amber-400" : meta.tone === "blue" ? "bg-sky-400" : "bg-mist-400";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${post.topic} — ${late ? "Kechikdi" : meta.label}`}
      className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition hover:border-white/25 ${
        late ? "border-red-500/40 bg-red-500/10" : "border-white/[0.06] bg-ink-800/80"
      }`}
    >
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${dot}`} />
      <span className="text-mist-400">{post.platform === "instagram" ? "IG" : "TG"} · </span>
      <span className="text-mist-100">{post.topic}</span>
      {showProject && <span className="block truncate text-[10px] text-mist-400">{projectName}</span>}
    </button>
  );
}
