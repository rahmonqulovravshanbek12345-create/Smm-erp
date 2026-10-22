import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "./components/BrandMark";
import { Icon, IconChip, type ChipColor, type IconName } from "./components/icons";
import { useAvatarPicker } from "./components/AvatarUploader";
import { A, Avatar, IconButton, Modal, navigate, usePath } from "./components/ui";
import { SERVER_MODE } from "./lib/api";
import { BRAND } from "./lib/brand";
import { PasswordForm, TwoFactorForm } from "./components/Security";
import { ROLE_LABELS } from "./lib/labels";
import { MINI_MODULES, miniPathAllowed } from "./lib/miniapp";
import { canView, homeFor, type Module } from "./lib/permissions";
import { MINI_APP, tgBackButton, tgDark, tgOpenLink } from "./lib/tg";
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

const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
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

/** Telegram Mini App'da faqat kundalik ish bo'limlari (pul, hujjatlar va sozlamalar — saytda). */
const inMini = (module: Module, path: string) => !MINI_APP || (MINI_MODULES.has(module) && miniPathAllowed(path.split("?")[0]!));
/** Rolning bosh sahifasi; Mini App'da — ochiq bo'limlardan birinchisi. */
const homeOf = (role: Role) =>
  MINI_APP ? (["/", "/mening", "/bildirishnomalar"].find((p) => canView(role, route(p).module)) ?? "/bildirishnomalar") : homeFor(role);
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

// ---------- Menyu guruhlari: ▾ bilan yig'iladi / ochiladi, tanlov brauzerda eslab qolinadi ----------

const NAV_KEY = "smm-erp-nav-open";

/** Joriy sahifa tegishli guruh sarlavhasi (sarlavhasiz tepadagi guruh — har doim ochiq). */
const activeGroup = (path: string) => NAV_GROUPS.find((g) => g.title && g.items.some((n) => isActive(n, path)))?.title;

/** Birinchi marta hammasi yopiq; joriy sahifa guruhi esa sahifaga kirilganda o'zi ochiladi. */
function useNavOpen(path: string): [Record<string, boolean>, (title: string) => void] {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    let saved: Record<string, boolean> = {};
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(NAV_KEY) ?? "null");
      if (raw && typeof raw === "object") saved = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "boolean"));
    } catch {
      // saqlangan tanlov o'qilmadi — hammasi yopiq
    }
    const a = activeGroup(path);
    return a ? { ...saved, [a]: true } : saved;
  });
  useEffect(() => {
    const a = activeGroup(path);
    if (a) setOpen((o) => (o[a] ? o : { ...o, [a]: true }));
  }, [path]);
  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_KEY, JSON.stringify(open));
    } catch {
      // tanlov faqat shu sessiyada saqlanadi
    }
  }, [open]);
  return [open, (title) => setOpen((o) => ({ ...o, [title]: !o[title] }))];
}

// ---------- Mavzu (yorug' / qorong'i; tanlanmaguncha — qurilma sozlamasi) ----------

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
    const tg = tgDark();
    // Mini App'da «tizim» — Telegram'ning mavzusi
    if (theme === "system" && MINI_APP && tg !== null) root.setAttribute("data-theme", tg ? "dark" : "light");
    else if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // mavzu faqat shu sessiyada saqlanadi
    }
  }, [theme]);
  return [theme, setTheme];
}

/** Hozir ko'rinib turgan mavzu: «tizim» bo'lsa — qurilmaning joriy sozlamasi. */
function useEffectiveTheme(theme: Theme): "light" | "dark" {
  const query = () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const [system, setSystem] = useState<"light" | "dark">(query);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const tg = MINI_APP ? tgDark() : null;
  return theme === "system" ? (tg === null ? system : tg ? "dark" : "light") : theme;
}

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const MONTHS_GEN = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const todayLabel = () => {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}-${MONTHS_GEN[d.getMonth()]}`;
};

export function App() {
  const path = usePath();
  const { state, me, run, today, now, toast, saveError, session } = useErp();
  const [theme, setTheme] = useTheme();
  const [navOpen, toggleNav] = useNavOpen(path);
  useAutoSync();
  const [more, setMore] = useState(false);
  const [account, setAccount] = useState(false);
  const [security, setSecurity] = useState<"password" | "2fa" | null>(null);
  const { module, node } = route(path);
  const allowed = canView(me.role, module) && inMini(module, path);
  const home = homeOf(me.role);

  // Ruxsat yo'q sahifaga tushsa — rolning bosh sahifasiga yo'naltiramiz.
  useEffect(() => {
    if (!allowed) navigate(home);
  }, [allowed, home]);
  // Mini App: Telegram sarlavhasidagi «Orqaga» — bosh sahifadan boshqa joyda
  useEffect(() => tgBackButton(path !== home, () => (window.history.length > 1 ? window.history.back() : navigate(home))), [path, home]);
  useEffect(() => {
    setMore(false);
    setAccount(false);
    window.scrollTo(0, 0);
  }, [path]);

  const unread = state.notifications.filter((n) => n.userId === me.id && !n.read).length + alertsFor(state, me, today, now).length;
  const visible = (item: NavItem) => canView(me.role, item.module) && inMini(item.module, item.path);
  const tabs = TAB_PRIORITY.map((p) => ALL_NAV.find((n) => n.path === p)!)
    .filter(visible)
    .slice(0, 4);

  const switchUser = (id: string) => {
    run("switchUser", [id]);
    setAccount(false);
    setMore(false);
    const u = state.users.find((x) => x.id === id);
    if (u) navigate(homeOf(u.role));
  };

  const navList = (compact = false) => (
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((g, gi) => {
        const items = g.items.filter(visible);
        if (!items.length) return null;
        // Telefondagi «Boshqa» menyusida hammasi ochiq; kompyuterda sarlavhadagi ▾ bilan yig'iladi.
        const isOpen = compact || !g.title || Boolean(navOpen[g.title]);
        const label = "px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-label3";
        return (
          <div key={gi}>
            {g.title &&
              (compact ? (
                <div className={`mb-1 ${label}`}>{g.title}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleNav(g.title!)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${gi}`}
                  className={`mb-1 flex w-full items-center justify-between rounded-[10px] py-1 text-left transition hover:bg-fill ${label}`}
                >
                  <span>{g.title}</span>
                  <Icon name="chevronDown" size={14} className={`transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
                </button>
              ))}
            <div id={`nav-group-${gi}`} hidden={!isOpen}>
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
                      {n.module === "notifications" && unread > 0 && (
                        <span className="min-w-[22px] rounded-full bg-red px-1.5 text-center text-[12px] font-bold leading-[20px] text-white">{unread}</span>
                      )}
                    </A>
                  );
                })}
              </div>
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
              <AccountMenu
                users={state.users}
                meId={me.id}
                onPick={switchUser}
                theme={theme}
                setTheme={setTheme}
                onClose={() => setAccount(false)}
                onSecurity={setSecurity}
              />
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
            <Avatar name={me.name} size={40} decorative user={me} />
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
            <AccountMenu
              users={state.users}
              meId={me.id}
              onPick={switchUser}
              theme={theme}
              setTheme={setTheme}
              onClose={() => setAccount(false)}
              onSecurity={setSecurity}
              flat
            />
          </Sheet>
        </div>
      )}

      {session?.offline && (
        <div
          role="alert"
          className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-xl rounded-[14px] bg-red px-4 py-2.5 text-center text-[14px] font-semibold text-white shadow-float"
        >
          ⚠ Server bilan aloqa yo'q — oxirgi o'zgarishlar saqlanmagan bo'lishi mumkin. Internetni tekshiring.
        </div>
      )}
      {security && <SecurityModal kind={security} onClose={() => setSecurity(null)} />}
      {saveError && (
        <div
          role="alert"
          className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-xl rounded-[14px] bg-red px-4 py-2.5 text-center text-[14px] font-semibold text-white shadow-float"
        >
          ⚠ Ma'lumot brauzerga saqlanmadi (joy tugagan yoki yashirin rejim). Sahifani yopsangiz, oxirgi o'zgarishlar yo'qoladi.
        </div>
      )}
      {toast && <Island text={toast} />}
    </div>
  );
}

function Logo({ small }: { small?: boolean }) {
  return (
    <A href="/" className="flex items-center gap-3">
      <BrandMark small={small} />
      <span className="leading-tight">
        <span className={`block font-bold tracking-tight text-label ${small ? "text-[16px]" : "text-[17px]"}`}>{BRAND}</span>
        {/* Haqiqiy tizimda faqat agentlik nomi; demo'da izoh va «demo» belgisi */}
        {!SERVER_MODE && (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-label2">
            Agentlik ERP
            <span
              className="rounded-full bg-orange/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-orange"
              title="Namunaviy ma'lumotlar bilan demo versiya"
            >
              demo
            </span>
          </span>
        )}
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
      <Avatar name={me.name} size={38} user={me} />
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
  onSecurity,
  flat,
}: {
  users: User[];
  meId: string;
  onPick: (id: string) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onClose: () => void;
  onSecurity: (k: "password" | "2fa") => void;
  flat?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { session } = useErp();
  useEffect(() => {
    if (flat) return;
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("aside button")) onClose();
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [flat, onClose]);

  const sorted = users.filter((u) => u.active).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const shown = useEffectiveTheme(theme);

  return (
    <div ref={ref} className={flat ? "" : "glass-strong animate-pop rounded-[22px] p-2"}>
      <div className="mb-2 flex items-center justify-between px-2 pt-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-label3">Mavzu</div>
        <button
          type="button"
          onClick={() => setTheme(shown === "dark" ? "light" : "dark")}
          aria-label={shown === "dark" ? "Yorug' mavzuga o'tish" : "Qorong'i mavzuga o'tish"}
          title={shown === "dark" ? "Yorug' mavzuga o'tish" : "Qorong'i mavzuga o'tish"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-label transition hover:bg-fill/70"
        >
          <Icon name={shown === "dark" ? "moon" : "sun"} size={17} />
        </button>
      </div>
      {session ? (
        <AccountSession users={users} meId={meId} onSecurity={onSecurity} onClose={onClose} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/** Serverli tizim: kirgan xodim, parol, 2FA va chiqish. */
function AccountSession({
  users,
  meId,
  onSecurity,
  onClose,
}: {
  users: User[];
  meId: string;
  onSecurity: (k: "password" | "2fa") => void;
  onClose: () => void;
}) {
  const { session } = useErp();
  const me = users.find((u) => u.id === meId);
  const photo = useAvatarPicker(meId);
  if (!session || !me) return null;
  const item = (icon: IconName, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left text-[14px] font-semibold transition hover:bg-fill ${danger ? "text-red" : "text-label"}`}
    >
      <Icon name={icon} size={17} />
      {label}
    </button>
  );
  return (
    <div className="pt-1">
      <div className="flex items-center gap-3 rounded-[12px] px-2 py-1.5">
        <Avatar name={me.name} size={34} user={me} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-label">{me.name}</span>
          <span className="block truncate text-[12px] text-label2">
            {ROLE_LABELS[me.role]} · {session.login}
          </span>
        </span>
      </div>
      {MINI_APP ? (
        <div className="mt-1 border-t border-sep pt-1">
          <p className="px-2 py-1.5 text-[13px] text-label2">Telegram versiyasi: pul, hujjatlar, parol va sozlamalar — saytda.</p>
          {item("link", "Saytning to'liq versiyasi", () => tgOpenLink(`${window.location.origin}/`))}
          {item("logout", "Chiqish", () => void session.logout(), true)}
        </div>
      ) : (
        <div className="mt-1 border-t border-sep pt-1">
          {photo.input}
          {item("camera", photo.busy ? "Yuklanmoqda…" : "Profil rasmini yuklash", photo.pick)}
          {me.avatarAt && item("x", "Profil rasmini o'chirish", () => void photo.remove())}
          {item("gear", "Parolni o'zgartirish", () => {
            onClose();
            onSecurity("password");
          })}
          {!session.has2fa &&
            item("checkSeal", "Ikki bosqichli kirishni yoqish", () => {
              onClose();
              onSecurity("2fa");
            })}
          {session.has2fa && <div className="px-2 py-1.5 text-[13px] text-green">✓ Ikki bosqichli kirish yoqilgan</div>}
          {item("logout", "Chiqish", () => void session.logout(), true)}
        </div>
      )}
    </div>
  );
}

function SecurityModal({ kind, onClose }: { kind: "password" | "2fa"; onClose: () => void }) {
  const { showToast } = useErp();
  return (
    <Modal open onClose={onClose} title={kind === "password" ? "Parolni o'zgartirish" : "Ikki bosqichli kirish"}>
      {kind === "password" ? (
        <PasswordForm
          onDone={() => {
            onClose();
            showToast("Parol o'zgartirildi — boshqa qurilmalardagi sessiyalar yopildi");
          }}
        />
      ) : (
        <TwoFactorForm
          onDone={() => {
            onClose();
            showToast("Ikki bosqichli kirish yoqildi");
            // Akkaunt ma'lumoti (2FA holati) yangilanishi uchun
            window.setTimeout(() => window.location.reload(), 1200);
          }}
        />
      )}
    </Modal>
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
