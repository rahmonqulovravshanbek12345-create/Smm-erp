import { useMemo, useState } from "react";
import { PlatformIcons, PostBadge } from "../components/bits";
import { PostModal, ShootModal, TaskModal } from "../components/forms";
import { QuotaPanel, QuotaSummary } from "../components/Quota";
import { Badge, Button, Card, Empty, PageHeader, Select } from "../components/ui";
import { WEEKDAYS, addDays, fmtDate, fmtMonth, monthKey, parseDate, shiftMonthKey, toISODate } from "../lib/dates";
import { postTypeId, typeName } from "../lib/content";
import { postStatusMeta } from "../lib/labels";
import { hasContent } from "../lib/services";
import { access, canEdit, visibleProjects } from "../lib/permissions";
import { isPostLate } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { Post, TaskKind } from "../lib/types";

export function Content() {
  const { state, me } = useErp();
  const projects = visibleProjects(state, me).filter((p) => hasContent(p) && p.status === "active");
  const [projectId, setProjectId] = useState(me.role === "smm" ? (projects[0]?.id ?? "") : "");
  const [modal, setModal] = useState<null | "shoot" | TaskKind>(null);
  const editable = canEdit(me.role, "content");

  return (
    <>
      <PageHeader
        title="Kontent reja"
        sub="Marketolog topshirig'i bo'yicha: sana, platformalar, tur, mavzu, mas'ul va status. Bitta post bir nechta platformaga qo'yilsa ham 1 ta post sanaladi"
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
          aria-label="Loyiha"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="!w-64"
          options={[{ value: "", label: "Barcha loyihalar" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
      </div>
      {!projectId && <QuotaSummary projects={projects} />}
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
    return state.posts.filter((p) => allowed.has(p.projectId) && (!projectId || p.projectId === projectId) && (!own || mineTaskPosts.has(p.id)));
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
  const newFor = projectId ?? visibleProjects(state, me).find((p) => p.smmId === me.id && hasContent(p))?.id ?? state.projects.find(hasContent)?.id ?? "";
  const project = projectId ? state.projects.find((p) => p.id === projectId) : undefined;
  const placements = inMonth.reduce((a, p) => a + p.platforms.length, 0);

  return (
    <>
      {project && hasContent(project) && <QuotaPanel project={project} month={month} />}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sep px-4 py-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonthKey(month, -1))} aria-label="Oldingi oy">
              ‹
            </Button>
            <span className="min-w-[130px] text-center text-sm font-semibold text-label">{fmtMonth(month)}</span>
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
            <Badge tone="gray">{inMonth.length} ta post</Badge>
            {placements > inMonth.length && <Badge tone="blue">{placements} ta joylash</Badge>}
            <Badge tone="green">{published} joylandi</Badge>
            {late > 0 && <Badge tone="red">{late} kechikdi</Badge>}
            <div className="ml-1 flex rounded-[10px] bg-fill p-[3px]">
              {(["calendar", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-[8px] px-3 py-1 text-[13px] font-semibold transition ${view === v ? "bg-elevated text-label shadow-sm" : "text-label2"}`}
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
                <div key={w} className="border-b border-sep px-2 py-1.5 text-center text-[11px] font-medium text-label2">
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
                    className={`min-h-[104px] border-b border-r border-sep p-1.5 ${inCur ? "" : "opacity-35"} `}
                  >
                    <div className="mb-1 flex">
                      <span
                        className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-semibold ${d === today ? "bg-red text-white" : "text-label2"}`}
                      >
                        {parseDate(d).getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items.map((p) => (
                        <PostChip
                          key={p.id}
                          post={p}
                          today={today}
                          onClick={() => setOpen({ id: p.id })}
                          showProject={!projectId}
                          projectName={look.projectName(p.projectId)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {editable && <p className="px-4 py-2 text-[11px] text-label2">Kunni ikki marta bossangiz — shu sanaga yangi post qo'shiladi.</p>}
          </div>
        ) : inMonth.length === 0 ? (
          <Empty>Bu oyda post yo'q</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-label2">
                <tr>
                  <th className="px-4 py-2 font-medium">Sana</th>
                  {!projectId && <th className="px-4 py-2 font-medium">Loyiha</th>}
                  <th className="px-4 py-2 font-medium">Platformalar</th>
                  <th className="px-4 py-2 font-medium">Turi</th>
                  <th className="px-4 py-2 font-medium">Mavzu</th>
                  <th className="px-4 py-2 font-medium">Mas'ul</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {inMonth.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-fill" onClick={() => setOpen({ id: p.id })}>
                    <td className="whitespace-nowrap px-4 py-2 text-label/80">{fmtDate(p.date)}</td>
                    {!projectId && <td className="px-4 py-2 text-label2">{look.projectName(p.projectId)}</td>}
                    <td className="px-4 py-2">
                      <PlatformIcons
                        platforms={p.platforms}
                        published={p.status === "approved" || p.status === "published" ? (p.publishedOn ?? {}) : undefined}
                      />
                    </td>
                    <td className="px-4 py-2 text-label2">{typeName(state, postTypeId(p))}</td>
                    <td className="px-4 py-2 text-label">
                      {p.topic} {p.forTarget && <Badge tone="blue">target</Badge>}
                    </td>
                    <td className="px-4 py-2 text-label2">{look.userName(p.assigneeId)}</td>
                    <td className="px-4 py-2">
                      <PostBadge post={p} today={today} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open && (
          <PostModal
            postId={open.id}
            newFor={open.id ? undefined : { projectId: newFor, date: open.date ?? toISODate(new Date()) }}
            onClose={() => setOpen(null)}
          />
        )}
      </Card>
    </>
  );
}

function PostChip({
  post,
  today,
  onClick,
  showProject,
  projectName,
}: {
  post: Post;
  today: string;
  onClick: () => void;
  showProject: boolean;
  projectName: string;
}) {
  const late = isPostLate(post, today);
  const meta = postStatusMeta(post.status);
  const dot = late
    ? "bg-red"
    : meta.tone === "green"
      ? "bg-green"
      : meta.tone === "violet"
        ? "bg-purple"
        : meta.tone === "amber"
          ? "bg-orange"
          : meta.tone === "blue"
            ? "bg-accent"
            : "bg-gray";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${post.topic} — ${late ? "Kechikdi" : meta.label}`}
      className={`block w-full truncate rounded-[9px] px-2 py-1 text-left text-[11px] leading-tight transition hover:brightness-95 ${
        late ? "bg-red/12" : "bg-fill"
      }`}
    >
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${dot}`} />
      <span className="text-label">{post.topic}</span>
      <span className="mt-0.5 block">
        <PlatformIcons
          platforms={post.platforms}
          size={13}
          published={post.status === "approved" || post.status === "published" ? (post.publishedOn ?? {}) : undefined}
        />
      </span>
      {showProject && <span className="block truncate text-[10px] text-label2">{projectName}</span>}
    </button>
  );
}
