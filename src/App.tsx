import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, IconChip, type ChipColor, type IconName } from "./components/icons";
import { A, Avatar, IconButton, navigate, usePath } from "./components/ui";
import { ROLE_LABELS } from "./lib/labels";
import { canView, homeFor, type Module } from "./lib/permissions";
import { alertsFor } from "./lib/rules";
import { useErp } from "./lib/store";
import type { Role, User } from "./lib/types";
import { Admin } from "./pages/Admin";
import { Approvals } from "./pages/Approvals";
import { Content } from "./pages/Content";
import { Crm } from "./pages/Crm";
import { Dashboard } from "./pages/Dashboard";
import { Budget } from "./pages/finance/Budget";
import { CashFlow } from "./pages/finance/CashFlow";
import { FinDashboard } from "./pages/finance/FinDashboard";
import { Invoices } from "./pages/finance/Invoices";
import { PayCalendar } from "./pages/finance/PayCalendar";
import { Payroll } from "./pages/finance/Payroll";
import { Pnl } from "./pages/finance/Pnl";
import { Receivables } from "./pages/finance/Receivables";
import { Recon } from "./pages/finance/Recon";
import { Transactions } from "./pages/finance/Transactions";
import { ClientReport } from "./pages/ClientReport";
import { MyAccount } from "./pages/MyAccount";
import { Documents, DocumentView } from "./pages/Documents";
import { SalesAnalytics } from "./pages/SalesAnalytics";
import { ProposalPage, Proposals } from "./pages/Proposals";
import { Integrations } from "./pages/Integrations";
import { useAutoSync } from "./components/AutoSync";
import { MyDay } from "./pages/MyDay";
import { Process } from "./pages/Process";
import { Activity, Notifications } from "./pages/Notifications";
import { ProjectCard, Projects } from "./pages/Projects";
import { Shoots } from "./pages/Shoots";
import { Target } from "./pages/Target";
import { TaskBoard } from "./pages/TaskBoard";

interface NavItem {
  module: Module;
  path: string;
  label: string;
  short: string;
  icon: IconName;
  color: ChipColor;
}

const NAV_GROUPS: { title?: string; collapsible?: string; items: NavItem[] }[] = [
  {
    items: [
      { module: "myday", path: "/mening", label: "Mening kunim", short: "Kunim", icon: "sun", color: "orange" },
      { module: "myaccount", path: "/hisobim", label: "Mening hisobim", short: "Hisobim", icon: "wallet", color: "green" },
      { module: "dashboard", path: "/", label: "Nazorat paneli", short: "Panel", icon: "gauge", color: "blue" },
      { module: "notifications", path: "/bildirishnomalar", label: "Bildirishnomalar", short: "Xabarlar", icon: "bell", color: "red" },
      { module: "process", path: "/jarayon", label: "Qanday ishlaydi", short: "Jarayon", icon: "sparkle", color: "indigo" },
    ],
  },
  {
    title: "Savdo",
    items: [
      { module: "crm", path: "/crm", label: "CRM — lidlar", short: "CRM", icon: "phone", color: "green" },
      { module: "crm", path: "/crm/analitika", label: "Sotuv analitikasi", short: "Analitika", icon: "gauge", color: "blue" },
      { module: "crm", path: "/takliflar", label: "Tariflar va takliflar", short: "Takliflar", icon: "send", color: "purple" },
      { module: "projects", path: "/loyihalar", label: "Loyihalar", short: "Loyihalar", icon: "folder", color: "teal" },
      { module: "projects", path: "/hujjatlar", label: "Hujjatlar", short: "Hujjatlar", icon: "list", color: "gray" },
    ],
  },
  {
    title: "Ishlab chiqarish",
    items: [
      { module: "content", path: "/kontent", label: "Kontent reja", short: "Kontent", icon: "calendar", color: "red" },
      { module: "approvals", path: "/tasdiqlash", label: "Tasdiqlash", short: "Tasdiq", icon: "checkSeal", color: "purple" },
      { module: "shoots", path: "/syomka", label: "Syomka", short: "Syomka", icon: "camera", color: "gray" },
      { module: "montaj", path: "/montaj", label: "Montaj", short: "Montaj", icon: "film", color: "indigo" },
      { module: "dizayn", path: "/dizayn", label: "Dizayn", short: "Dizayn", icon: "brush", color: "orange" },
      { module: "target", path: "/target", label: "Target reklama", short: "Target", icon: "target", color: "pink" },
    ],
  },
  {
    title: "Moliya",
    collapsible: "/moliya",
    items: [
      { module: "finance", path: "/moliya", label: "Moliyaviy panel", short: "Moliya", icon: "sparkle", color: "green" },
      { module: "finance", path: "/moliya/kirim-chiqim", label: "Kirim-chiqim", short: "Kassa", icon: "list", color: "blue" },
      { module: "finance", path: "/moliya/fakturalar", label: "Hisob-fakturalar", short: "Faktura", icon: "send", color: "teal" },
      { module: "finance", path: "/moliya/pnl", label: "Foyda va zarar", short: "P&L", icon: "gauge", color: "indigo" },
      { module: "finance", path: "/moliya/cashflow", label: "Pul oqimi", short: "Cash Flow", icon: "history", color: "purple" },
      { module: "finance", path: "/moliya/debitor", label: "Debitor / Kreditor", short: "Qarzlar", icon: "users", color: "orange" },
      { module: "finance", path: "/moliya/akt", label: "Akt-sverka", short: "Akt", icon: "checkSeal", color: "gray" },
      { module: "finance", path: "/moliya/kalendar", label: "To'lov kalendari", short: "Kalendar", icon: "calendar", color: "red" },
      { module: "payroll", path: "/moliya/ish-haqi", label: "Ish haqi", short: "Ish haqi", icon: "wallet", color: "green" },
      { module: "finance", path: "/moliya/reja", label: "Reja-fakt", short: "Reja", icon: "target", color: "pink" },
    ],
  },
  {
    title: "Boshqaruv",
    items: [
      { module: "activity", path: "/tarix", label: "Faoliyat tarixi", short: "Tarix", icon: "history", color: "indigo" },
      { module: "integrations", path: "/integratsiyalar", label: "Integratsiyalar", short: "Integratsiya", icon: "link", color: "teal" },
      { module: "admin", path: "/admin", label: "Sozlamalar", short: "Sozlamalar", icon: "gear", color: "gray" },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
const TAB_PRIORITY: string[] = [
  "/mening",
  "/",
  "/moliya",
  "/crm",
  "/kontent",
  "/tasdiqlash",
  "/montaj",
  "/dizayn",
  "/syomka",
  "/target",
  "/loyihalar",
  "/hisobim",
];

function route(full: string): { module: Module; node: ReactNode } {
  const path = full.split("?")[0]!;
  if (path.startsWith("/loyiha/")) return { module: "projects", node: <ProjectCard id={path.slice(8)} /> };
  if (path.startsWith("/hujjat/")) {
    const [, , kind = "", id = "", idx] = path.split("/");
    return { module: "projects", node: <DocumentView key={path} kind={kind} id={id} index={idx === undefined ? undefined : Number(idx)} /> };
  }
  if (path.startsWith("/hisobot/")) {
    const [, , pid = "", idx] = path.split("/");
    return { module: "projects", node: <ClientReport key={path} projectId={pid} periodIndex={idx === undefined ? undefined : Number(idx)} /> };
  }
  if (path.startsWith("/taklif/")) return { module: "crm", node: <ProposalPage key={path} id={path.slice(8)} /> };
  switch (path) {
    case "/takliflar":
      return { module: "crm", node: <Proposals /> };
    case "/crm/analitika":
      return { module: "crm", node: <SalesAnalytics /> };
    case "/hujjatlar":
      return { module: "projects", node: <Documents /> };
    case "/mening":
      return { module: "myday", node: <MyDay /> };
    case "/hisobim":
      return { module: "myaccount", node: <MyAccount /> };
    case "/jarayon":
      return { module: "process", node: <Process /> };
    case "/moliya/kirim-chiqim":
      return { module: "finance", node: <Transactions /> };
    case "/moliya/fakturalar":
      return { module: "finance", node: <Invoices /> };
    case "/moliya/pnl":
      return { module: "finance", node: <Pnl /> };
    case "/moliya/cashflow":
      return { module: "finance", node: <CashFlow /> };
    case "/moliya/debitor":
      return { module: "finance", node: <Receivables /> };
    case "/moliya/akt":
      return { module: "finance", node: <Recon /> };
    case "/moliya/kalendar":
      return { module: "finance", node: <PayCalendar /> };
    case "/moliya/ish-haqi":
      return { module: "payroll", node: <Payroll /> };
    case "/moliya/reja":
      return { module: "finance", node: <Budget /> };
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
      return { module: "finance", node: <FinDashboard /> };
    case "/bildirishnomalar":
      return { module: "notifications", node: <Notifications /> };
    case "/tarix":
      return { module: "activity", node: <Activity /> };
    case "/admin":
      return { module: "admin", node: <Admin /> };
    case "/integratsiyalar":
      return { module: "integrations", node: <Integrations /> };
    default:
      return { module: "dashboard", node: <Dashboard /> };
  }
}

/** Eng uzun mos keladigan menyu bandi faol hisoblanadi (masalan, /crm/analitika — CRM emas). */
const isActive = (item: NavItem, full: string) => {
  let path = full.split("?")[0]!;
  if (path.startsWith("/loyiha/") || path.startsWith("/hisobot/") || path.startsWith("/hujjat")) path = "/loyihalar";
  if (path.startsWith("/taklif/")) path = "/takliflar";
  const best = ALL_NAV.filter((n) => path === n.path || (n.path !== "/" && path.startsWith(`${n.path}/`))).sort((a, b) => b.path.length - a.path.length)[0];
  return best?.path === item.path;
};

// ---------- Mavzu (yorug' / qorong'i / tizim) ----------

type Theme = "system" | "light" | "dark";
const THEME_KEY = "smm-erp-theme";

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = window.localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // mavzu faqat shu sessiyada saqlanadi
    }
  }, [theme]);
  return [theme, setTheme];
}

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const MONTHS_GEN = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const todayLabel = () => {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}-${MONTHS_GEN[d.getMonth()]}`;
};

export function App() {
  const path = usePath();
  const { state, me, run, today, toast } = useErp();
  const [theme, setTheme] = useTheme();
  useAutoSync();
  const [more, setMore] = useState(false);
  const [account, setAccount] = useState(false);
  const { module, node } = route(path);
  const allowed = canView(me.role, module);

  // Ruxsat yo'q sahifaga tushsa — rolning bosh sahifasiga yo'naltiramiz.
  useEffect(() => {
    if (!allowed) navigate(homeFor(me.role));
  }, [allowed, me.role]);
  useEffect(() => {
    setMore(false);
    setAccount(false);
    window.scrollTo(0, 0);
  }, [path]);

  const unread = state.notifications.filter((n) => n.userId === me.id && !n.read).length + alertsFor(state, me, today).length;
  const visible = (item: NavItem) => canView(me.role, item.module);
  const tabs = TAB_PRIORITY.map((p) => ALL_NAV.find((n) => n.path === p)!)
    .filter(visible)
    .slice(0, 4);

  const switchUser = (id: string) => {
    run((c) => {
      c.s.currentUserId = id;
    });
    setAccount(false);
    setMore(false);
    const u = state.users.find((x) => x.id === id);
    if (u) navigate(homeFor(u.role));
  };

  const navList = (compact = false) => (
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((g, gi) => {
        const all = g.items.filter(visible);
        // Yig'iladigan guruh: bo'limga kirilmaganda faqat birinchi band ko'rinadi.
        const items = g.collapsible && !compact && !path.startsWith(g.collapsible) ? all.slice(0, 1) : all;
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.title && <div className="mb-1 px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-label3">{g.title}</div>}
            <div className="flex flex-col gap-0.5">
              {items.map((n) => {
                const active = isActive(n, path);
                return (
                  <A
                    key={n.path}
                    href={n.path}
                    className={`group flex items-center gap-3 rounded-[12px] px-2.5 ${compact ? "py-2" : "py-[7px]"} text-[15px] font-medium transition duration-200 ${
                      active ? "bg-accent/12 text-accent" : "text-label hover:bg-fill"
                    }`}
                  >
                    <IconChip name={n.icon} color={n.color} size={28} />
                    <span className="flex-1 truncate">{n.label}</span>
                    {g.collapsible && items.length === 1 && all.length > 1 && <Icon name="chevronRight" size={14} className="text-label3" />}
                    {n.module === "notifications" && unread > 0 && (
                      <span className="min-w-[22px] rounded-full bg-red px-1.5 text-center text-[12px] font-bold leading-[20px] text-white">{unread}</span>
                    )}
                  </A>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <div className="wallpaper" />

      {/* ---------- Kompyuter: suzuvchi shisha sidebar ---------- */}
      <aside className="no-print glass fixed bottom-3 left-3 top-3 z-30 hidden w-[272px] flex-col rounded-[28px] lg:flex">
        <div className="px-5 pb-3 pt-5">
          <Logo />
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">{navList()}</div>
        <div className="relative border-t border-sep p-3">
          <AccountButton me={me} onClick={() => setAccount((v) => !v)} open={account} />
          {account && (
            <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 z-40">
              <AccountMenu users={state.users} meId={me.id} onPick={switchUser} theme={theme} setTheme={setTheme} onClose={() => setAccount(false)} />
            </div>
          )}
        </div>
      </aside>

      {/* ---------- Telefon: yuqori panel ---------- */}
      <header className="no-print glass sticky top-0 z-30 flex items-center justify-between gap-3 rounded-b-[22px] border-t-0 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+10px)] lg:hidden">
        <Logo small />
        <div className="flex items-center gap-2">
          <IconButton icon="bell" label="Bildirishnomalar" badge={unread} onClick={() => navigate("/bildirishnomalar")} />
          <button type="button" onClick={() => setAccount(true)} aria-label={`Akkaunt: ${me.name}`} className="rounded-full transition active:scale-95">
            <Avatar name={me.name} size={40} decorative />
          </button>
        </div>
      </header>

      <div className="lg:pl-[288px] print:!pl-0">
        <div className="no-print hidden items-center justify-end gap-3 px-8 pt-6 lg:flex">
          <span className="text-[13px] font-medium text-label2">{todayLabel()}</span>
          <IconButton icon="bell" label="Bildirishnomalar" badge={unread} onClick={() => navigate("/bildirishnomalar")} />
        </div>
        <main key={path} className="mx-auto max-w-[1360px] animate-fade-in px-4 pb-32 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-2">
          {allowed ? node : null}
        </main>
      </div>

      {/* ---------- Telefon: suzuvchi tab bar ---------- */}
      <nav className="no-print fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] z-30 lg:hidden">
        <div className="glass mx-auto flex max-w-md items-stretch justify-between rounded-full p-1.5">
          {tabs.map((t) => {
            const active = isActive(t, path);
            return (
              <A
                key={t.path}
                href={t.path}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold transition ${active ? "bg-fill text-accent" : "text-label2"}`}
              >
                <Icon name={t.icon} size={22} strokeWidth={active ? 2.2 : 1.8} />
                {t.short}
              </A>
            );
          })}
          <button
            type="button"
            onClick={() => setMore(true)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold transition ${more ? "bg-fill text-accent" : "text-label2"}`}
          >
            <Icon name="grid" size={22} />
            Yana
          </button>
        </div>
      </nav>

      {more && (
        <Sheet onClose={() => setMore(false)} title="Bo'limlar">
          {navList(true)}
        </Sheet>
      )}
      {account && (
        <div className="lg:hidden">
          <Sheet onClose={() => setAccount(false)} title="Akkaunt">
            <AccountMenu users={state.users} meId={me.id} onPick={switchUser} theme={theme} setTheme={setTheme} onClose={() => setAccount(false)} flat />
          </Sheet>
        </div>
      )}

      {toast && <Island text={toast} />}
    </div>
  );
}

function Logo({ small }: { small?: boolean }) {
  return (
    <A href="/" className="flex items-center gap-3">
      <span
        className={`flex items-center justify-center rounded-[12px] bg-gradient-to-br from-[#5856D6] via-[#007AFF] to-[#5AC8FA] text-white shadow-[0_6px_16px_-6px_rgb(0_122_255/0.7),inset_0_1px_0_rgb(255_255_255/0.35)] ${small ? "h-9 w-9" : "h-11 w-11"}`}
      >
        <Icon name="sparkle" size={small ? 18 : 22} strokeWidth={2} />
      </span>
      <span className="leading-tight">
        <span className={`block font-bold tracking-tight text-label ${small ? "text-[16px]" : "text-[17px]"}`}>SMM Studio</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-label2">
          Agentlik ERP
          <span
            className="rounded-full bg-orange/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-orange"
            title="Namunaviy ma'lumotlar bilan demo versiya"
          >
            demo
          </span>
        </span>
      </span>
    </A>
  );
}

function AccountButton({ me, onClick, open }: { me: User; onClick: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[16px] p-2 text-left transition ${open ? "bg-fill" : "hover:bg-fill"}`}
    >
      <Avatar name={me.name} size={38} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-label">{me.name}</span>
        <span className="block truncate text-[12px] text-label2">{ROLE_LABELS[me.role]}</span>
      </span>
      <Icon name="chevronDown" size={16} className={`text-label3 transition ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

const ROLE_ORDER: Role[] = ["rahbar", "marketolog", "operator", "smm", "targetolog", "syomka", "montajyor", "dizayner", "moliya", "admin"];

function AccountMenu({
  users,
  meId,
  onPick,
  theme,
  setTheme,
  onClose,
  flat,
}: {
  users: User[];
  meId: string;
  onPick: (id: string) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onClose: () => void;
  flat?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flat) return;
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("aside button")) onClose();
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [flat, onClose]);

  const sorted = users.filter((u) => u.active).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const themes: { id: Theme; icon: IconName; label: string }[] = [
    { id: "light", icon: "sun", label: "Yorug'" },
    { id: "system", icon: "monitor", label: "Tizim" },
    { id: "dark", icon: "moon", label: "Qorong'i" },
  ];

  return (
    <div ref={ref} className={flat ? "" : "glass-strong animate-pop rounded-[22px] p-2"}>
      <div className="px-2 pb-1.5 pt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-label3">Mavzu</div>
      <div className="mb-2 flex gap-1 rounded-[12px] bg-fill p-[3px]">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-1.5 text-[13px] font-semibold transition ${theme === t.id ? "bg-elevated text-label shadow-sm" : "text-label2"}`}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-label3">Demo: kim sifatida kirish</div>
      <div className={`no-scrollbar flex flex-col overflow-y-auto ${flat ? "" : "max-h-[46vh]"}`}>
        {sorted.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onPick(u.id)}
            className={`flex items-center gap-3 rounded-[12px] px-2 py-1.5 text-left transition ${u.id === meId ? "bg-accent/12" : "hover:bg-fill"}`}
          >
            <Avatar name={u.name} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-label">{u.name}</span>
              <span className="block truncate text-[12px] text-label2">{ROLE_LABELS[u.role]}</span>
            </span>
            {u.id === meId && <Icon name="check" size={16} className="text-accent" strokeWidth={2.4} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-end bg-black/25 lg:hidden" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-strong max-h-[85vh] w-full animate-sheet-up overflow-y-auto rounded-t-[30px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-label/20" />
        <div className="flex items-center justify-between py-3">
          <h2 className="text-[19px] font-bold tracking-tight text-label">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-label2" aria-label="Yopish">
            <Icon name="x" size={16} strokeWidth={2.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Dynamic Island uslubidagi xabar. */
function Island({ text }: { text: string }) {
  const warn = text.startsWith("⚠");
  const clean = text.replace(/^⚠\s*/, "");
  return (
    <div
      role="status"
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[60] flex max-w-[92vw] animate-island items-center gap-2.5 rounded-full bg-black py-2.5 pl-3 pr-5 text-[14px] font-semibold text-white shadow-float"
      style={{ transform: "translateX(-50%)" }}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${warn ? "bg-[#FF9F0A]" : "bg-[#30D158]"}`}>
        <Icon name={warn ? "alert" : "check"} size={14} strokeWidth={2.6} />
      </span>
      <span className="truncate">{clean}</span>
    </div>
  );
}
