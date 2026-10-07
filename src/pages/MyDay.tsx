import { useMemo } from "react";
import { TaskBadge } from "../components/bits";
import { Icon, IconChip, type ChipColor, type IconName } from "../components/icons";
import { A, Badge, Card, CardHeader, Empty, PageHeader, Stat } from "../components/ui";
import { diffDays, fmtDate, fmtMoney, monthKey, relDays } from "../lib/dates";
import { employeeBalance } from "../lib/finance";
import { ROLE_LABELS, TASK_KIND_LABELS } from "../lib/labels";
import { homeFor } from "../lib/permissions";
import { alertsFor, isPostLate, isTaskLate, isTaskOpen } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";

interface Todo {
  id: string;
  title: string;
  sub: string;
  date?: string;
  late: boolean;
  href: string;
  icon: IconName;
  color: ChipColor;
  badge?: React.ReactNode;
}

const GREET = () => {
  const h = new Date().getHours();
  return h < 11 ? "Xayrli tong" : h < 17 ? "Xayrli kun" : "Xayrli kech";
};

/** Har bir xodimning bosh sahifasi: bugun nima qilishim kerak va qancha ishlab topdim. */
export function MyDay() {
  const { state, me, today } = useErp();
  const look = useLookup();

  const todos = useMemo(() => {
    const out: Todo[] = [];
    for (const t of state.tasks) {
      if (t.assigneeId !== me.id || !isTaskOpen(t)) continue;
      out.push({
        id: t.id,
        title: t.title,
        sub: `${TASK_KIND_LABELS[t.kind]} · ${look.projectName(t.projectId)}`,
        date: t.deadline,
        late: isTaskLate(t, today),
        href: t.kind === "montaj" ? "/montaj" : t.kind === "dizayn" ? "/dizayn" : "/target",
        icon: t.kind === "montaj" ? "film" : t.kind === "dizayn" ? "brush" : "target",
        color: t.kind === "montaj" ? "indigo" : t.kind === "dizayn" ? "orange" : "pink",
        badge: <TaskBadge task={t} today={today} />,
      });
    }
    for (const sh of state.shoots) {
      if (sh.operatorId !== me.id || sh.status !== "planned") continue;
      out.push({ id: sh.id, title: `Syomka: ${look.projectName(sh.projectId)}`, sub: `${sh.time} · ${sh.location} · ${sh.videoCount} video`, date: sh.date, late: sh.date < today, href: "/syomka", icon: "camera", color: "gray" });
    }
    if (me.role === "smm") {
      for (const p of state.posts) {
        if (p.assigneeId !== me.id || p.status === "published" || diffDays(p.date, today) > 3) continue;
        out.push({ id: p.id, title: p.topic, sub: `Post · ${look.projectName(p.projectId)}`, date: p.date, late: isPostLate(p, today), href: "/kontent", icon: "calendar", color: "red" });
      }
      for (const t of state.tasks) {
        if (t.status !== "review" || look.project(t.projectId)?.smmId !== me.id) continue;
        out.push({ id: `r-${t.id}`, title: `Qabul qiling: ${t.title}`, sub: `${TASK_KIND_LABELS[t.kind]} tayyor · ${look.userName(t.assigneeId)}`, late: false, href: t.kind === "montaj" ? "/montaj" : "/dizayn", icon: "checkSeal", color: "purple" });
      }
    }
    if (me.role === "operator") {
      for (const l of state.leads) {
        if (l.operatorId !== me.id || ["contract", "unfit", "lowquality"].includes(l.stage)) continue;
        if (l.stage === "new" || (l.nextContactDate && l.nextContactDate <= today))
          out.push({ id: l.id, title: `Qo'ng'iroq: ${l.name}`, sub: `${l.phone} · ${l.service}`, date: l.nextContactDate, late: Boolean(l.nextContactDate && l.nextContactDate < today), href: "/crm", icon: "phone", color: "green" });
      }
    }
    if (me.role === "marketolog") {
      const internal = state.posts.filter((p) => p.status === "internal").length;
      if (internal) out.push({ id: "appr", title: `${internal} ta material tasdiq kutyapti`, sub: "Ichki tasdiq", late: false, href: "/tasdiqlash", icon: "checkSeal", color: "purple" });
      for (const l of state.leads) if (l.meeting?.marketologId === me.id && l.stage === "meeting" && l.meeting.date >= today) out.push({ id: l.id, title: `Uchrashuv: ${l.name}`, sub: `${l.meeting.time} · ${l.phone}`, date: l.meeting.date, late: false, href: "/crm", icon: "users", color: "green" });
    }
    return out.sort((a, b) => Number(b.late) - Number(a.late) || (a.date ?? "9").localeCompare(b.date ?? "9"));
  }, [state, me, today, look]);

  const alerts = alertsFor(state, me, today);
  const month = monthKey(today);
  const earned = state.accruals.filter((a) => a.userId === me.id && monthKey(a.date) === month).reduce((x, a) => x + a.amount, 0);
  const balance = employeeBalance(state, me.id);
  const late = todos.filter((t) => t.late).length;
  const todayCount = todos.filter((t) => t.date === today).length;

  return (
    <>
      <PageHeader title={`${GREET()}, ${me.name.split(" ")[0]}`} sub={`${ROLE_LABELS[me.role]} · ${fmtDate(today)} — bugungi ishlaringiz va hisobingiz`} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="list" color="blue" label="Ochiq ishlarim" value={todos.length} />
        <Stat icon="clock" color="red" label="Kechikkan" value={late} tone={late ? "red" : "green"} />
        <Stat icon="calendar" color="orange" label="Bugun muddati" value={todayCount} tone={todayCount ? "amber" : undefined} />
        <Stat icon="wallet" color="green" label={`Shu oy ishlab topdim · qoldiq ${fmtMoney(balance)}`} value={fmtMoney(earned)} href="/hisobim" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Mening ishlarim" sub="Avval kechikkanlar, keyin muddati yaqinlari" right={<A href={homeFor(me.role) === "/mening" ? "/kontent" : homeFor(me.role)} className="text-[13px] font-semibold text-accent">Ish oynam</A>} />
          {todos.length === 0 ? (
            <Empty>Hamma ish bajarilgan. Ajoyib!</Empty>
          ) : (
            <ul className="space-y-1 px-3 pb-3">
              {todos.map((t) => (
                <li key={t.id}>
                  <A href={t.href} className={`flex items-center gap-3 rounded-[16px] px-3 py-2.5 transition hover:bg-fill ${t.late ? "bg-red/[0.06]" : ""}`}>
                    <IconChip name={t.icon} color={t.color} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-label">{t.title}</div>
                      <div className="truncate text-[13px] text-label2">{t.sub}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {t.date && <span className={`text-[12px] font-semibold ${t.late ? "text-red" : t.date === today ? "text-orange" : "text-label2"}`}>{relDays(t.date, today)}</span>}
                      {t.badge ?? (t.late ? <Badge tone="red">Kechikdi</Badge> : null)}
                    </div>
                  </A>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Eslatmalar" />
            <ul className="space-y-1 px-3 pb-3">
              {alerts.length === 0 && <Empty>Eslatma yo'q</Empty>}
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <A href={a.href} className="flex gap-2 rounded-[14px] px-2.5 py-2 text-[13px] transition hover:bg-fill">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone === "red" ? "bg-red" : "bg-orange"}`} />
                    <span className="text-label">{a.text}</span>
                  </A>
                </li>
              ))}
            </ul>
          </Card>
          <A href="/jarayon" className="block">
            <Card className="flex items-center gap-3 p-4 transition hover:-translate-y-0.5">
              <IconChip name="sparkle" color="indigo" size={36} />
              <div className="flex-1">
                <div className="font-semibold text-label">Jarayon qanday ishlaydi?</div>
                <div className="text-[13px] text-label2">Lid'dan to'lovgacha — kim, qachon, nima qiladi</div>
              </div>
              <Icon name="chevronRight" size={18} className="text-label3" />
            </Card>
          </A>
        </div>
      </div>
    </>
  );
}
