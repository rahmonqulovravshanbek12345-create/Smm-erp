import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Tone } from "../lib/labels";
import { Icon, IconChip, type ChipColor, type IconName } from "./icons";

// ---------- Router ----------
// Joriy sahifa xotirada saqlanadi va imkon bo'lsa manzildagi #hash bilan sinxronlanadi.
// Shu tufayli sayt bitta HTML fayl sifatida ham, iframe ichida ham ishlaydi.

function readPath() {
  try {
    const h = window.location.hash.replace(/^#/, "");
    return h.startsWith("/") ? h : "/";
  } catch {
    return "/";
  }
}

let currentPath = readPath();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  const onHash = () => {
    const p = readPath();
    if (p !== currentPath) {
      currentPath = p;
      emit();
    }
  };
  window.addEventListener("hashchange", onHash);
  return () => {
    listeners.delete(l);
    window.removeEventListener("hashchange", onHash);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => currentPath);
}

export function navigate(path: string) {
  if (path === currentPath) return;
  currentPath = path;
  try {
    window.location.hash = path;
  } catch {
    // manzilni o'zgartirib bo'lmasa ham, ilova ichida sahifa almashadi
  }
  emit();
}

export function A({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${href}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

// ---------- Asosiy elementlar ----------

const TONES: Record<Tone, string> = {
  gray: "bg-fill text-label2",
  green: "bg-green/15 text-green",
  amber: "bg-orange/15 text-orange",
  red: "bg-red/15 text-red",
  blue: "bg-accent/15 text-accent",
  violet: "bg-purple/15 text-purple",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none ${TONES[tone]}`}>
      {children}
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "glass";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent text-white shadow-[0_6px_16px_-6px_rgb(var(--accent)/0.6)] hover:brightness-110",
  secondary: "bg-accent/12 text-accent hover:bg-accent/20",
  ghost: "text-accent hover:bg-fill",
  danger: "bg-red/12 text-red hover:bg-red/20",
  glass: "glass text-label hover:brightness-105",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[15px]";
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${sz} ${BTN[variant]} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({ icon, label, onClick, badge }: { icon: IconName; label: string; onClick?: () => void; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="glass relative flex h-10 w-10 items-center justify-center rounded-full text-label transition active:scale-95"
    >
      <Icon name={icon} size={19} />
      {badge ? (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red px-1 text-center text-[11px] font-bold leading-[18px] text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`glass min-w-0 rounded-[24px] ${className}`}>{children}</div>;
}

export function CardHeader({ title, right, sub, icon }: { title: ReactNode; right?: ReactNode; sub?: ReactNode; icon?: { name: IconName; color: ChipColor } }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconChip name={icon.name} color={icon.color} size={26} />}
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-tight text-label">{title}</h3>
          {sub && <p className="mt-0.5 text-[13px] text-label2">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] text-label sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-1 max-w-[70ch] text-[15px] text-label2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-[15px] text-label3">{children}</div>;
}

const STAT_TONE = { red: "text-red", amber: "text-orange", green: "text-green" } as const;

/** iOS vidjeti uslubidagi ko'rsatkich. */
export function Stat({
  label,
  value,
  tone,
  href,
  icon,
  color = "blue",
}: {
  label: string;
  value: ReactNode;
  tone?: "red" | "amber" | "green";
  href?: string;
  icon?: IconName;
  color?: ChipColor;
}) {
  const body = (
    <Card className="flex h-full flex-col gap-3 p-4 transition duration-300 hover:-translate-y-0.5">
      {(icon || href) && (
        <div className="flex items-center justify-between">
          {icon ? <IconChip name={icon} color={color} size={30} /> : <span />}
          {href && <Icon name="chevronRight" size={16} className="text-label3" />}
        </div>
      )}
      <div>
        <div
          className={`tabular font-bold leading-none tracking-tight ${typeof value === "string" && value.length > 12 ? "text-[20px] sm:text-[22px]" : "text-[26px] sm:text-[30px]"} ${tone ? STAT_TONE[tone] : "text-label"}`}
        >
          {value}
        </div>
        <div className="mt-1.5 text-[13px] font-medium text-label2">{label}</div>
      </div>
    </Card>
  );
  return href ? (
    <A href={href} className="block">
      {body}
    </A>
  ) : (
    body
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
      <div className="h-full rounded-full bg-gradient-to-r from-green to-teal transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Apple Watch aktivlik halqasi. */
export function Ring({
  value,
  max,
  size = 64,
  stroke = 8,
  color = "green",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: "green" | "red" | "orange" | "accent";
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  const cls = { green: "text-green", red: "text-red", orange: "text-orange", accent: "text-accent" }[color];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={`-rotate-90 ${cls}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.32,0.72,0,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

const AVATAR_GRADIENTS = [
  "from-[#5AC8FA] to-[#007AFF]",
  "from-[#FF9500] to-[#FF2D55]",
  "from-[#34C759] to-[#30B0C7]",
  "from-[#AF52DE] to-[#5856D6]",
  "from-[#FFCC00] to-[#FF9500]",
  "from-[#FF2D55] to-[#AF52DE]",
];

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const g = AVATAR_GRADIENTS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${g}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

/** iOS segment boshqaruvi. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar mb-5 overflow-x-auto">
      <div className="inline-flex min-w-full gap-0.5 rounded-[12px] bg-fill p-[3px] sm:min-w-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-4 py-1.5 text-[13px] font-semibold transition duration-200 sm:flex-none ${
              value === t.id ? "bg-elevated text-label shadow-[0_3px_8px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]" : "text-label2 hover:text-label"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Forma ----------

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block px-1 text-[13px] font-medium text-label2">{label}</span>
      {children}
      {hint && <span className="mt-1 block px-1 text-[12px] text-label3">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-[12px] border-0 bg-fill px-3.5 py-2.5 text-[15px] text-label placeholder:text-label3 transition focus:bg-elevated focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-60";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} resize-y ${props.className ?? ""}`} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select
      {...props}
      className={`${inputCls} cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 ${props.className ?? ""}`}
      style={{ backgroundImage: SELECT_ARROW, ...props.style }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const SELECT_ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 9.5l5 5 5-5'/%3E%3C/svg%3E\")";

/** iOS "sheet": telefonda pastdan chiqadi, kompyuterda markazda. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", on);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  // Portal: shisha (backdrop-filter) ota-element ichida "fixed" joylashuv buziladi, shuning uchun body'ga chiqaramiz.
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/25 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        className={`glass-strong flex max-h-[92vh] w-full animate-sheet-up flex-col rounded-t-[30px] sm:rounded-[30px] ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-label/20 sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <h2 className="min-w-0 truncate text-[19px] font-bold tracking-tight text-label">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-label2 transition hover:bg-fill2"
            aria-label="Yopish"
          >
            <Icon name="x" size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-2">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-sep px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function LinkOut({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span className="text-label3">—</span>;
  const url = /^https?:\/\//.test(href) ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 break-all font-medium text-accent hover:underline"
    >
      {children ?? href.replace(/^https?:\/\//, "")}
      <Icon name="arrowUpRight" size={13} className="shrink-0" />
    </a>
  );
}

export function Banner({ tone, children }: { tone: "red" | "amber" | "green"; children: ReactNode }) {
  const cls = tone === "red" ? "bg-red/12 text-red" : tone === "amber" ? "bg-orange/12 text-orange" : "bg-green/12 text-green";
  const icon: IconName = tone === "green" ? "check" : "alert";
  return (
    <div className={`mb-4 flex items-start gap-2.5 rounded-[16px] px-4 py-3 text-[14px] font-medium ${cls}`}>
      <Icon name={icon} size={18} className="mt-px shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export const userOptions = (users: { id: string; name: string }[], empty?: string) => [
  ...(empty !== undefined ? [{ value: "", label: empty }] : []),
  ...users.map((u) => ({ value: u.id, label: u.name })),
];
