import { useEffect, useState, type ReactNode } from "react";
import { A, Select, navigate, usePath } from "./components/ui";
import { ROLE_LABELS } from "./lib/labels";
import { canView, homeFor, type Module } from "./lib/permissions";
import { alertsFor } from "./lib/rules";
import { useErp } from "./lib/store";
import { Admin } from "./pages/Admin";
import { Approvals } from "./pages/Approvals";
import { Content } from "./pages/Content";
import { Crm } from "./pages/Crm";
import { Dashboard } from "./pages/Dashboard";
import { Finance } from "./pages/Finance";
import { Activity, Notifications } from "./pages/Notifications";
import { ProjectCard, Projects } from "./pages/Projects";
import { Shoots } from "./pages/Shoots";
import { Target } from "./pages/Target";
import { TaskBoard } from "./pages/TaskBoard";

const NAV: { module: Module; path: string; label: string; icon: string }[] = [
  { module: "dashboard", path: "/", label: "Nazorat paneli", icon: "◎" },
  { module: "crm", path: "/crm", label: "CRM (lidlar)", icon: "☎" },
  { module: "projects", path: "/loyihalar", label: "Loyihalar", icon: "▣" },
  { module: "content", path: "/kontent", label: "Kontent reja", icon: "▦" },
  { module: "approvals", path: "/tasdiqlash", label: "Tasdiqlash", icon: "✓" },
  { module: "shoots", path: "/syomka", label: "Syomka", icon: "◉" },
  { module: "montaj", path: "/montaj", label: "Montaj", icon: "✂" },
  { module: "dizayn", path: "/dizayn", label: "Dizayn", icon: "✎" },
  { module: "target", path: "/target", label: "Target", icon: "◈" },
  { module: "finance", path: "/moliya", label: "Moliya", icon: "₿" },
  { module: "notifications", path: "/bildirishnomalar", label: "Bildirishnomalar", icon: "🔔" },
  { module: "activity", path: "/tarix", label: "Faoliyat tarixi", icon: "↺" },
  { module: "admin", path: "/admin", label: "Admin", icon: "⚙" },
];

function route(path: string): { module: Module; node: ReactNode } {
  if (path.startsWith("/loyiha/")) return { module: "projects", node: <ProjectCard id={path.slice(8)} /> };
  switch (path) {
    case "/crm":
      return { module: "crm", node: <Crm /> };
    case "/loyihalar":
      return { module: "projects", node: <Projects /> };
    case "/kontent":
      return { module: "content", node: <Content /> };
    case "/tasdiqlash":
      return { module: "approvals", node: <Approvals /> };
    case "/syomka":
      return { module: "shoots", node: <Shoots /> };
    case "/montaj":
      return { module: "montaj", node: <TaskBoard kind="montaj" /> };
    case "/dizayn":
      return { module: "dizayn", node: <TaskBoard kind="dizayn" /> };
    case "/target":
      return { module: "target", node: <Target /> };
    case "/moliya":
      return { module: "finance", node: <Finance /> };
    case "/bildirishnomalar":
      return { module: "notifications", node: <Notifications /> };
    case "/tarix":
      return { module: "activity", node: <Activity /> };
    case "/admin":
      return { module: "admin", node: <Admin /> };
    default:
      return { module: "dashboard", node: <Dashboard /> };
  }
}

export function App() {
  const path = usePath();
  const { state, me, run, today, toast } = useErp();
  const [menu, setMenu] = useState(false);
  const { module, node } = route(path);
  const allowed = canView(me.role, module);

  // Ruxsat yo'q sahifaga tushsa — rolning bosh sahifasiga yo'naltiramiz.
  useEffect(() => {
    if (!allowed) navigate(homeFor(me.role));
  }, [allowed, me.role]);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [path]);

  const unread = state.notifications.filter((n) => n.userId === me.id && !n.read).length + alertsFor(state, me, today).length;
  const nav = NAV.filter((n) => canView(me.role, n.module));

  const switchUser = (id: string) => {
    run((c) => {
      c.s.currentUserId = id;
    });
    const u = state.users.find((x) => x.id === id);
    if (u) navigate(homeFor(u.role));
  };

  const sidebar = (
    <nav className="flex flex-col gap-0.5">
      {nav.map((n) => {
        const active = n.path === "/" ? path === "/" : path.startsWith(n.path) || (n.path === "/loyihalar" && path.startsWith("/loyiha/"));
        return (
          <A
            key={n.path}
            href={n.path}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-signal-500/10 text-signal-300" : "text-mist-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="w-4 text-center text-xs opacity-80">{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {n.module === "notifications" && unread > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{unread}</span>
            )}
          </A>
        );
      })}
    </nav>
  );

  const userSwitcher = (
    <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-300/90">Demo: kim sifatida kirish</div>
      <Select
        value={me.id}
        onChange={(e) => switchUser(e.target.value)}
        options={state.users.filter((u) => u.active).map((u) => ({ value: u.id, label: `${u.name} — ${ROLE_LABELS[u.role]}` }))}
        className="!py-1.5 !text-xs"
      />
      <p className="mt-1.5 text-[11px] leading-snug text-mist-400">Rolni almashtirib, har bir xodim nimani ko'rishini sinab ko'ring.</p>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/[0.06] bg-ink-900/60 p-4 lg:flex">
        <Logo />
        {userSwitcher}
        {sidebar}
        <p className="mt-auto text-[11px] text-mist-400">MVP demo · ma'lumotlar brauzeringizda saqlanadi</p>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-950/85 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <A href="/bildirishnomalar" className="relative rounded-lg border border-white/10 px-2.5 py-1.5 text-sm">
              🔔
              {unread > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
            </A>
            <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white" aria-label="Menyu">
              ☰
            </button>
          </div>
        </header>
        {menu && (
          <div className="space-y-3 border-b border-white/[0.06] bg-ink-900 p-4 lg:hidden">
            {userSwitcher}
            {sidebar}
          </div>
        )}

        <div className="hidden items-center justify-end gap-3 border-b border-white/[0.06] px-6 py-2.5 text-sm lg:flex">
          <span className="text-mist-400">
            {me.name} · <span className="text-mist-300">{ROLE_LABELS[me.role]}</span>
          </span>
          <A href="/bildirishnomalar" className="relative rounded-lg border border-white/10 px-2.5 py-1 hover:border-white/25">
            🔔
            {unread > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
          </A>
        </div>

        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:py-6">{allowed ? node : null}</main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-signal-500/30 bg-ink-800 px-4 py-2 text-sm text-signal-200 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <A href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-500/15 font-mono text-sm font-semibold text-signal-400">S</span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">SMM agentlik ERP</span>
        <span className="block text-[11px] text-mist-400">lid → kontent → to'lov</span>
      </span>
    </A>
  );
}
