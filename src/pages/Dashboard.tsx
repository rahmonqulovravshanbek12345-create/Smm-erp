import { useMemo, useState } from "react";
import { DebtBadge, PostBadge, TaskBadge } from "../components/bits";
import { PostModal } from "../components/forms";
import { A, Badge, Card, CardHeader, Empty, PageHeader, Ring, Select, Stat } from "../components/ui";
import { diffDays, fmtDate, fmtMoney, relDays } from "../lib/dates";
import { PLATFORM_LABELS, ROLE_LABELS, TASK_KIND_LABELS } from "../lib/labels";
import { isPostLate, isTaskLate, isTaskOpen, periodPosts, postNeedsWarning, projectDebt, targetReportMissing, workBlockedReason } from "../lib/rules";
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
          tasks.filter((t) => isTaskLate(t, today)).length + posts.filter((p) => isPostLate(p, today)).length + shoots.filter((s) => s.date < today).length;
        return { u, open: tasks.length + posts.length + shoots.length, late };
      });
    return rows.sort((a, b) => b.late - a.late || b.open - a.open);
  }, [state, today, roleFilter]);

  const lateCount = d.latePosts.length + d.lateTasks.length;

  return (
    <>
      <PageHeader title="Nazorat paneli" sub="Barcha loyihalar bo'yicha postlar va vazifalar vaqtida ketyaptimi" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="upload" color="blue" label="Bugun joylanishi kerak" value={d.todayPosts.length} tone={d.todayPosts.length ? "amber" : undefined} />
        <Stat icon="clock" color="red" label="Muddati o'tgan (Kechikdi)" value={lateCount} tone={lateCount ? "red" : "green"} />
        <Stat
          icon="checkSeal"
          color="purple"
          label="Tasdiq kutayotganlar"
          value={d.internal.length}
          href="/tasdiqlash"
          tone={d.internal.length ? "amber" : undefined}
        />
        <Stat icon="wallet" color="orange" label="Qarzdor loyihalar" value={d.debtors.length} href="/moliya" tone={d.debtors.length ? "red" : "green"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={{ name: "gauge", color: "green" }} title="Reja bajarilishi" sub="Joriy hisob davri ichidagi kontent reja" />
          <div className="grid gap-3 p-3 pt-1 sm:grid-cols-2 2xl:grid-cols-3">
            {state.projects.map((p) => {
              const { per, posts } = periodPosts(state, p, today);
              const done = posts.filter((x) => x.status === "published").length;
              const late = posts.filter((x) => isPostLate(x, today)).length;
              const debt = projectDebt(state, p.id, today);
              const blocked = workBlockedReason(state, p);
              const pct = posts.length ? Math.round((done / posts.length) * 100) : 0;
              return (
                <A
                  key={p.id}
                  href={`/loyiha/${p.id}`}
                  className="tile flex gap-4 rounded-[20px] p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-card"
                >
                  <Ring value={done} max={posts.length} size={72} stroke={9} color={late ? "orange" : "green"}>
                    <span className="tabular text-[15px] font-bold text-label">{pct}%</span>
                  </Ring>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold text-label">{p.name}</div>
                    <div className="mt-0.5 text-[13px] text-label2">
                      {posts.length ? `${posts.length} ta rejadan ${done} tasi joylandi` : "Reja hali tuzilmagan"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {late > 0 && <Badge tone="red">{late} ta kechikkan</Badge>}
                      <DebtBadge debt={debt} />
                      {blocked && <Badge tone="amber">{p.pauseWork ? "Ish to'xtatilgan" : "To'lov kutilmoqda"}</Badge>}
                      {!late && !debt.amount && !blocked && <Badge tone="green">Rejada</Badge>}
                    </div>
                    <div className="mt-2 truncate text-[12px] text-label3">
                      {per ? `${per.index + 1}-davr · ${fmtDate(per.start)} – ${fmtDate(per.end)}` : "Davr birinchi reklamadan boshlanadi"}
                    </div>
                  </div>
                </A>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader icon={{ name: "upload", color: "blue" }} title="Bugun joylanishi kerak" sub={`${d.todayPosts.length} ta post`} />
          {d.todayPosts.length === 0 ? (
            <Empty>Bugun uchun joylanmagan post yo'q</Empty>
          ) : (
            <ul className="divide-y divide-sep">
              {d.todayPosts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setOpenPost(p.id)} className="w-full px-5 py-2.5 text-left hover:bg-fill">
                    <div className="text-sm text-label">{p.topic}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-label2">
                      {look.projectName(p.projectId)} · {PLATFORM_LABELS[p.platform]} <PostBadge post={p} today={today} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader icon={{ name: "clock", color: "red" }} title="Muddati o'tganlar" sub="Deadline o'tgan va status «Tayyor» emas — avtomatik Kechikdi" />
          {lateCount === 0 ? (
            <Empty>Kechikkan ish yo'q — hammasi vaqtida</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-label2">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Nima</th>
                    <th className="px-5 py-2.5 font-medium">Loyiha</th>
                    <th className="px-5 py-2.5 font-medium">Mas'ul</th>
                    <th className="px-5 py-2.5 font-medium">Muddat</th>
                    <th className="px-5 py-2.5 font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sep">
                  {d.latePosts.map((p) => (
                    <tr key={p.id} className="cursor-pointer hover:bg-fill" onClick={() => setOpenPost(p.id)}>
                      <td className="px-5 py-2.5 text-label">Post: {p.topic}</td>
                      <td className="px-5 py-2.5 text-label2">{look.projectName(p.projectId)}</td>
                      <td className="px-5 py-2.5 text-label2">{look.userName(p.assigneeId)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-red">
                        {fmtDate(p.date)} · {diffDays(today, p.date)} kun
                      </td>
                      <td className="px-5 py-2.5">
                        <PostBadge post={p} today={today} />
                      </td>
                    </tr>
                  ))}
                  {d.lateTasks.map((t) => (
                    <tr key={t.id}>
                      <td className="px-5 py-2.5 text-label">
                        {TASK_KIND_LABELS[t.kind]}: {t.title}
                      </td>
                      <td className="px-5 py-2.5 text-label2">{look.projectName(t.projectId)}</td>
                      <td className="px-5 py-2.5 text-label2">{look.userName(t.assigneeId)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-red">
                        {fmtDate(t.deadline)} · {diffDays(today, t.deadline)} kun
                      </td>
                      <td className="px-5 py-2.5">
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
          <CardHeader icon={{ name: "checkSeal", color: "purple" }} title="Tasdiq kutayotganlar" />
          <ul className="divide-y divide-sep text-sm">
            {d.internal.map((p) => (
              <li key={p.id}>
                <A href="/tasdiqlash" className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-fill">
                  <span className="text-label">{p.topic}</span>
                  <Badge tone="violet">Sizdan</Badge>
                </A>
              </li>
            ))}
            {d.atClient.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                <span className="text-label/80">{p.topic}</span>
                <Badge tone="gray">Mijozda · {relDays(p.date, today)}</Badge>
              </li>
            ))}
            {d.review.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                <span className="text-label/80">{t.title}</span>
                <Badge tone="gray">SMM qabul qilishi kerak</Badge>
              </li>
            ))}
            {d.internal.length + d.atClient.length + d.review.length === 0 && <Empty>Tasdiq kutayotgan narsa yo'q</Empty>}
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            icon={{ name: "users", color: "indigo" }}
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
              <thead className="text-left text-xs text-label2">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Xodim</th>
                  <th className="px-5 py-2.5 font-medium">Rol</th>
                  <th className="px-5 py-2.5 text-right font-medium">Ochiq ishlar</th>
                  <th className="px-5 py-2.5 text-right font-medium">Kechikkan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {workload.map(({ u, open, late }) => (
                  <tr key={u.id}>
                    <td className="px-5 py-2.5 text-label">{u.name}</td>
                    <td className="px-5 py-2.5 text-label2">{ROLE_LABELS[u.role]}</td>
                    <td className="px-5 py-2.5 text-right">{open}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${late ? "text-red" : "text-label2"}`}>{late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader icon={{ name: "alert", color: "orange" }} title="Ogohlantirishlar" />
          <ul className="divide-y divide-sep text-sm">
            {d.warnings.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpenPost(p.id)} className="w-full px-5 py-2.5 text-left hover:bg-fill">
                  <span className="text-orange">⚠ {relDays(p.date, today)} joylanadi, hali mijoz tasdig'ida emas:</span>{" "}
                  <span className="text-label">{p.topic}</span> <span className="text-label2">({look.projectName(p.projectId)})</span>
                </button>
              </li>
            ))}
            {d.noReport.map((p) => (
              <li key={p.id} className="px-5 py-2.5">
                <A href="/target" className="text-red hover:underline">
                  ● {p.name}: kechagi target kunlik hisoboti kiritilmagan ({look.userName(p.targetologId)})
                </A>
              </li>
            ))}
            {d.debtors.map(({ p, debt }) => (
              <li key={p.id} className="px-5 py-2.5">
                <A href="/moliya" className="text-red hover:underline">
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
