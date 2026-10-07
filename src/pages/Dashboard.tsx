import { useMemo, useState } from "react";
import { DebtBadge, PostBadge, TaskBadge } from "../components/bits";
import { PostModal } from "../components/forms";
import { A, Badge, Card, CardHeader, Empty, PageHeader, Progress, Select, Stat } from "../components/ui";
import { diffDays, fmtDate, fmtMoney, relDays } from "../lib/dates";
import { PLATFORM_LABELS, ROLE_LABELS, TASK_KIND_LABELS } from "../lib/labels";
import {
  isPostLate,
  isTaskLate,
  isTaskOpen,
  periodLabel,
  periodPosts,
  postNeedsWarning,
  projectDebt,
  targetReportMissing,
  workBlockedReason,
} from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { Role } from "../lib/types";

export function Dashboard() {
  const { state, today } = useErp();
  const look = useLookup();
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");

  const d = useMemo(() => {
    const todayPosts = state.posts.filter((p) => p.date === today && p.status !== "published");
    const latePosts = state.posts.filter((p) => isPostLate(p, today)).sort((a, b) => a.date.localeCompare(b.date));
    const lateTasks = state.tasks.filter((t) => isTaskLate(t, today)).sort((a, b) => a.deadline.localeCompare(b.deadline));
    const internal = state.posts.filter((p) => p.status === "internal");
    const atClient = state.posts.filter((p) => p.status === "client");
    const review = state.tasks.filter((t) => t.status === "review");
    const warnings = state.posts.filter((p) => postNeedsWarning(p, today));
    const noReport = state.projects.filter((p) => targetReportMissing(state, p, today));
    const debtors = state.projects
      .map((p) => ({ p, debt: projectDebt(state, p.id, today) }))
      .filter((x) => x.debt.amount > 0)
      .sort((a, b) => b.debt.days - a.debt.days);
    return { todayPosts, latePosts, lateTasks, internal, atClient, review, warnings, noReport, debtors };
  }, [state, today]);

  // Kimda nechta vazifa turibdi va kim kechiktirmoqda
  const workload = useMemo(() => {
    const rows = state.users
      .filter((u) => u.active && ["smm", "montajyor", "dizayner", "targetolog", "syomka"].includes(u.role))
      .filter((u) => !roleFilter || u.role === roleFilter)
      .map((u) => {
        const tasks = state.tasks.filter((t) => t.assigneeId === u.id && isTaskOpen(t));
        const posts = u.role === "smm" ? state.posts.filter((p) => p.assigneeId === u.id && p.status !== "published") : [];
        const shoots = u.role === "syomka" ? state.shoots.filter((s) => s.operatorId === u.id && s.status === "planned") : [];
        const late =
          tasks.filter((t) => isTaskLate(t, today)).length +
          posts.filter((p) => isPostLate(p, today)).length +
          shoots.filter((s) => s.date < today).length;
        return { u, open: tasks.length + posts.length + shoots.length, late };
      });
    return rows.sort((a, b) => b.late - a.late || b.open - a.open);
  }, [state, today, roleFilter]);

  const lateCount = d.latePosts.length + d.lateTasks.length;

  return (
    <>
      <PageHeader
        title="Marketolog nazorat paneli"
        sub={`Bugun: ${fmtDate(today)} · barcha loyihalar bo'yicha postlar va vazifalar vaqtida ketyaptimi`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bugun joylanishi kerak" value={d.todayPosts.length} tone={d.todayPosts.length ? "amber" : undefined} />
        <Stat label="Muddati o'tgan (Kechikdi)" value={lateCount} tone={lateCount ? "red" : "green"} />
        <Stat label="Tasdiq kutayotganlar" value={d.internal.length} href="/tasdiqlash" tone={d.internal.length ? "amber" : undefined} />
        <Stat label="Qarzdor loyihalar" value={d.debtors.length} href="/moliya" tone={d.debtors.length ? "red" : "green"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Loyihalar bo'yicha reja bajarilishi" sub="Joriy hisob davri ichidagi kontent reja" />
          <div className="divide-y divide-white/[0.05]">
            {state.projects.map((p) => {
              const { per, posts } = periodPosts(state, p, today);
              const done = posts.filter((x) => x.status === "published").length;
              const late = posts.filter((x) => isPostLate(x, today)).length;
              const debt = projectDebt(state, p.id, today);
              const blocked = workBlockedReason(state, p);
              return (
                <A key={p.id} href={`/loyiha/${p.id}`} className="block px-4 py-3 transition hover:bg-white/[0.02]">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-white">{p.name}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {late > 0 && <Badge tone="red">{late} ta kechikkan</Badge>}
                      <DebtBadge debt={debt} />
                      {blocked && <Badge tone="amber">{p.pauseWork ? "Ish to'xtatilgan" : "To'lov kutilmoqda"}</Badge>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={done} max={posts.length} />
                    <span className="whitespace-nowrap text-sm text-mist-200">
                      {posts.length ? `${posts.length} ta rejadan ${done} tasi joylandi` : "Reja hali tuzilmagan"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-mist-400">
                    {per ? periodLabel(per) : "Hisob davri birinchi reklama yoqilganda boshlanadi"} · SMM: {look.userName(p.smmId)}
                  </div>
                </A>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Bugun joylanishi kerak" sub={`${d.todayPosts.length} ta post`} />
          {d.todayPosts.length === 0 ? (
            <Empty>Bugun uchun joylanmagan post yo'q</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {d.todayPosts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setOpenPost(p.id)} className="w-full px-4 py-2.5 text-left hover:bg-white/[0.02]">
                    <div className="text-sm text-white">{p.topic}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-mist-400">
                      {look.projectName(p.projectId)} · {PLATFORM_LABELS[p.platform]} <PostBadge post={p} today={today} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="border-red-500/25 xl:col-span-2">
          <CardHeader title={<span className="text-red-300">Muddati o'tganlar</span>} sub="Deadline o'tgan va status «Tayyor» emas — avtomatik Kechikdi" />
          {lateCount === 0 ? (
            <Empty>Kechikkan ish yo'q 🎉</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-mist-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nima</th>
                    <th className="px-4 py-2 font-medium">Loyiha</th>
                    <th className="px-4 py-2 font-medium">Mas'ul</th>
                    <th className="px-4 py-2 font-medium">Muddat</th>
                    <th className="px-4 py-2 font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {d.latePosts.map((p) => (
                    <tr key={p.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpenPost(p.id)}>
                      <td className="px-4 py-2 text-white">Post: {p.topic}</td>
                      <td className="px-4 py-2 text-mist-300">{look.projectName(p.projectId)}</td>
                      <td className="px-4 py-2 text-mist-300">{look.userName(p.assigneeId)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-red-300">{fmtDate(p.date)} · {diffDays(today, p.date)} kun</td>
                      <td className="px-4 py-2">
                        <PostBadge post={p} today={today} />
                      </td>
                    </tr>
                  ))}
                  {d.lateTasks.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-white">
                        {TASK_KIND_LABELS[t.kind]}: {t.title}
                      </td>
                      <td className="px-4 py-2 text-mist-300">{look.projectName(t.projectId)}</td>
                      <td className="px-4 py-2 text-mist-300">{look.userName(t.assigneeId)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-red-300">{fmtDate(t.deadline)} · {diffDays(today, t.deadline)} kun</td>
                      <td className="px-4 py-2">
                        <TaskBadge task={t} today={today} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Tasdiq kutayotganlar" />
          <ul className="divide-y divide-white/[0.05] text-sm">
            {d.internal.map((p) => (
              <li key={p.id}>
                <A href="/tasdiqlash" className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/[0.02]">
                  <span className="text-white">{p.topic}</span>
                  <Badge tone="violet">Sizdan</Badge>
                </A>
              </li>
            ))}
            {d.atClient.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-mist-200">{p.topic}</span>
                <Badge tone="gray">Mijozda · {relDays(p.date, today)}</Badge>
              </li>
            ))}
            {d.review.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-mist-200">{t.title}</span>
                <Badge tone="gray">SMM qabul qilishi kerak</Badge>
              </li>
            ))}
            {d.internal.length + d.atClient.length + d.review.length === 0 && <Empty>Tasdiq kutayotgan narsa yo'q</Empty>}
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Xodimlar yuklamasi"
            sub="Kimda nechta ish turibdi va kim kechiktirmoqda"
            right={
              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
                className="!w-44 !py-1 !text-xs"
                options={[
                  { value: "", label: "Barcha rollar" },
                  ...(["smm", "montajyor", "dizayner", "targetolog", "syomka"] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
                ]}
              />
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-mist-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Xodim</th>
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 text-right font-medium">Ochiq ishlar</th>
                  <th className="px-4 py-2 text-right font-medium">Kechikkan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {workload.map(({ u, open, late }) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 text-white">{u.name}</td>
                    <td className="px-4 py-2 text-mist-300">{ROLE_LABELS[u.role]}</td>
                    <td className="px-4 py-2 text-right">{open}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${late ? "text-red-300" : "text-mist-400"}`}>{late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ogohlantirishlar" />
          <ul className="divide-y divide-white/[0.05] text-sm">
            {d.warnings.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpenPost(p.id)} className="w-full px-4 py-2.5 text-left hover:bg-white/[0.02]">
                  <span className="text-amber-300">⚠ {relDays(p.date, today)} joylanadi, hali mijoz tasdig'ida emas:</span>{" "}
                  <span className="text-white">{p.topic}</span> <span className="text-mist-400">({look.projectName(p.projectId)})</span>
                </button>
              </li>
            ))}
            {d.noReport.map((p) => (
              <li key={p.id} className="px-4 py-2.5">
                <A href="/target" className="text-red-300 hover:underline">
                  ● {p.name}: kechagi target kunlik hisoboti kiritilmagan ({look.userName(p.targetologId)})
                </A>
              </li>
            ))}
            {d.debtors.map(({ p, debt }) => (
              <li key={p.id} className="px-4 py-2.5">
                <A href="/moliya" className="text-red-300 hover:underline">
                  ● {p.name}: qarz {fmtMoney(debt.amount)}, {debt.days} kun kechikdi
                </A>
              </li>
            ))}
            {d.warnings.length + d.noReport.length + d.debtors.length === 0 && <Empty>Ogohlantirish yo'q</Empty>}
          </ul>
        </Card>
      </div>

      {openPost && <PostModal postId={openPost} onClose={() => setOpenPost(null)} />}
    </>
  );
}
