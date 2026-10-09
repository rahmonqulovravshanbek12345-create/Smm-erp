import { fmtDate } from "../lib/dates";
import { invoiceStatus, prepayPaid } from "../lib/finance";
import { POST_STATUSES, postStatusMeta } from "../lib/labels";
import { currentPeriod, isPostLate, isTaskLate, periodPosts, postStage } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import { quotaProgress } from "../lib/content";
import { hasContent, hasRecurring, recurringServices } from "../lib/services";
import type { Post, Project } from "../lib/types";
import { Icon } from "./icons";
import { Card } from "./ui";

type StepState = "done" | "current" | "todo" | "problem";

interface Step {
  title: string;
  who: string;
  state: StepState;
  detail: string;
}

/** Loyiha yo'li: 8 bosqich, har birining holati, mas'uli va "keyingi qadam". */
export function ProjectJourney({ project: p }: { project: Project }) {
  const { state, today, now } = useErp();
  const look = useLookup();
  const docsDone = Object.values(p.docs).filter((d) => d.status === "done").length;
  const per = currentPeriod(p, today);
  const { posts } = periodPosts(state, p, today);
  const published = posts.filter((x) => x.status === "published").length;
  const latePosts = posts.filter((x) => isPostLate(x, today)).length;
  const openTasks = state.tasks.filter((t) => t.projectId === p.id && t.status !== "accepted" && t.kind !== "target");
  const lateTasks = openTasks.filter((t) => isTaskLate(t, today, now)).length;
  const report = per ? state.reports.find((r) => r.projectId === p.id && r.periodIndex === Math.max(0, per.index - 1)) : undefined;
  const nextInv = state.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly").sort((a, b) => b.periodIndex - a.periodIndex)[0];
  const nextInvSt = nextInv ? invoiceStatus(state, nextInv, today) : null;
  const paidPre = prepayPaid(state, p.id);
  const content = hasContent(p);
  const quotaTarget = quotaProgress(state, p, today.slice(0, 7))
    .filter((r) => r.key !== "shoot")
    .reduce((a, r) => a + r.target, 0);
  const perf = recurringServices(p).find((x) => x.kind === "performance");
  const perLeads = per
    ? state.targetReports.filter((r) => r.projectId === p.id && r.date >= per.start && r.date < per.end).reduce((a, r) => a + r.leads, 0)
    : 0;

  const contentSteps: Step[] = [
    {
      title: "Kontent reja",
      who: look.userName(p.smmId),
      state: !p.handedOffAt ? "todo" : posts.length >= (quotaTarget || 12) ? "done" : "current",
      detail: per ? `${posts.length} ta post rejada (topshiriq: ${quotaTarget || "—"})` : "Davr boshlanmagan",
    },
    {
      title: "Ishlab chiqarish",
      who: "Syomka · montaj · dizayn",
      state: !p.handedOffAt ? "todo" : lateTasks ? "problem" : openTasks.length ? "current" : "done",
      detail: lateTasks ? `${lateTasks} ta vazifa kechikmoqda` : `${openTasks.length} ta ochiq vazifa`,
    },
    {
      title: "Joylash",
      who: look.userName(p.smmId),
      state: !per ? "todo" : latePosts ? "problem" : published >= posts.length && posts.length ? "done" : "current",
      detail: per
        ? `${posts.length} tadan ${published} tasi joylandi${latePosts ? ` · ${latePosts} kechikkan` : ""}`
        : "Birinchi joylash yoki reklamadan keyin",
    },
  ];
  const adSteps: Step[] = [
    {
      title: "Reklama ishga tushdi",
      who: look.userName(p.targetologId),
      state: !p.handedOffAt ? "todo" : per ? "done" : "current",
      detail: p.periodStart ? fmtDate(p.periodStart) : "Kreativlar va sozlash",
    },
    {
      title: "KPI",
      who: look.userName(p.targetologId),
      state: !per ? "todo" : perf?.kpiLeads && perLeads >= perf.kpiLeads ? "done" : "current",
      detail: per ? `${perLeads} ta lid${perf?.kpiLeads ? ` / reja ${perf.kpiLeads}` : ""}` : "Davr boshlangach",
    },
  ];

  const steps: Step[] = [
    {
      title: "Shartnoma",
      who: look.userName(state.leads.find((l) => l.projectId === p.id)?.operatorId),
      state: "done",
      detail: `${p.contractNo} · ${fmtDate(p.contractDate)}`,
    },
    {
      title: "Oldindan to'lov",
      who: "Moliya",
      state: paidPre ? "done" : "current",
      detail: paidPre ? `${p.prepayType}% to'langan` : `${p.prepayType}% kutilmoqda — ish to'lovdan keyin`,
    },
    {
      title: "Strategiya",
      who: look.userName(p.marketologId),
      state: !paidPre ? "todo" : p.handedOffAt ? "done" : "current",
      detail: p.handedOffAt ? "SMM va targetologga uzatilgan" : `${docsDone}/5 blok tayyor`,
    },
    ...(content ? contentSteps : adSteps),
    {
      title: "Oylik hisobot",
      who: look.userName(content ? p.smmId : p.targetologId),
      state: !per || per.index === 0 ? "todo" : report ? "done" : "current",
      detail: !per || per.index === 0 ? "1-davr oxirida" : report ? `${per.index}-davr hisoboti topshirilgan` : `${per.index}-davr hisoboti kutilmoqda`,
    },
    {
      title: "Keyingi oy to'lovi",
      who: "Moliya",
      state: !per ? "todo" : nextInvSt === "overdue" ? "problem" : nextInvSt === "paid" ? "done" : "current",
      detail: !per
        ? "Davr boshlangach"
        : nextInv
          ? `${nextInv.number}: ${nextInvSt === "overdue" ? "muddati o'tgan" : nextInvSt === "paid" ? "to'langan" : `muddat ${fmtDate(nextInv.dueDate)}`}`
          : `Davr tugashi ${fmtDate(per.end)}`,
    },
  ];
  const next = steps.find((s) => s.state === "problem") ?? steps.find((s) => s.state === "current");
  const color: Record<StepState, string> = {
    done: "bg-green text-white",
    current: "bg-accent text-white",
    todo: "bg-fill text-label3",
    problem: "bg-red text-white",
  };

  // Faqat bir martalik xizmat (sayt, branding) olgan mijozda — xizmat bosqichlari ko'rsatiladi
  if (p.status === "closed" || !hasRecurring(p)) return null;
  return (
    <Card className="mb-5 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-label3">
          Loyiha yo'li {per ? `· ${per.index + 1}-davr (har oy 4–8 bosqichlar takrorlanadi)` : ""}
        </div>
        {next && (
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${next.state === "problem" ? "bg-red/12 text-red" : "bg-accent/12 text-accent"}`}
          >
            <Icon name={next.state === "problem" ? "alert" : "arrowUpRight"} size={15} />
            Keyingi qadam: {next.who} — {next.title.toLowerCase()} ({next.detail})
          </div>
        )}
      </div>
      <ol className="no-scrollbar grid auto-cols-[minmax(130px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <li key={s.title} className="relative">
            <div className="flex items-center">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${color[s.state]}`}>
                {s.state === "done" ? <Icon name="check" size={14} strokeWidth={3} /> : s.state === "problem" ? "!" : i + 1}
              </span>
              {i < steps.length - 1 && <span className={`mx-1 h-[2px] flex-1 rounded-full ${s.state === "done" ? "bg-green/60" : "bg-fill2"}`} />}
            </div>
            <div className={`mt-2 text-[13px] font-semibold ${s.state === "todo" ? "text-label3" : "text-label"}`}>{s.title}</div>
            <div className="text-[12px] text-label2">{s.who}</div>
            <div className={`mt-0.5 text-[12px] ${s.state === "problem" ? "font-semibold text-red" : "text-label3"}`}>{s.detail}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Post yo'li: reja → syomka → montaj → dizayn → ichki tasdiq → mijoz → tasdiqlandi → joylandi. */
export function PostJourney({ post, today }: { post: Post; today: string }) {
  const cur = postStage(post.status);
  const late = isPostLate(post, today);
  const steps = POST_STATUSES.filter(
    (s) => (post.format === "video" || (s.id !== "shoot" && s.id !== "editing")) && (post.format !== "text" || s.id !== "design"),
  );
  return (
    <ol className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
      {steps.map((s, i) => {
        const st = postStage(s.id);
        const done = st < cur || post.status === "published";
        const active = s.id === post.status;
        return (
          <li key={s.id} className="flex min-w-[78px] flex-1 flex-col items-center gap-1 text-center">
            <div className="flex w-full items-center">
              <span className={`h-[2px] flex-1 ${i === 0 ? "opacity-0" : done || active ? "bg-green/60" : "bg-fill2"}`} />
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  active ? (late ? "bg-red text-white" : "bg-accent text-white") : done ? "bg-green text-white" : "bg-fill text-label3"
                }`}
              >
                {done && !active ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`h-[2px] flex-1 ${i === steps.length - 1 ? "opacity-0" : done ? "bg-green/60" : "bg-fill2"}`} />
            </div>
            <span className={`text-[11px] leading-tight ${active ? "font-semibold text-label" : "text-label3"}`}>
              {postStatusMeta(s.id, !post.platforms.length).label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
