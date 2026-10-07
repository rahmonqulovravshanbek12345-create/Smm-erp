import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Tone } from "../lib/labels";

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
  gray: "border-white/10 bg-white/5 text-mist-300",
  green: "border-signal-500/30 bg-signal-500/10 text-signal-300",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  red: "border-red-500/40 bg-red-500/15 text-red-300",
  blue: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-signal-500 text-ink-950 hover:bg-signal-400",
  secondary: "border border-white/15 text-white hover:border-white/30 hover:bg-white/5",
  ghost: "text-mist-300 hover:bg-white/5 hover:text-white",
  danger: "border border-red-500/40 text-red-300 hover:bg-red-500/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${BTN[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-white/[0.07] bg-ink-900/70 ${className}`}>{children}</div>;
}

export function CardHeader({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-mist-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mist-400">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-mist-400">{children}</div>;
}

export function Stat({ label, value, tone, href }: { label: string; value: ReactNode; tone?: "red" | "amber" | "green"; href?: string }) {
  const color = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : tone === "green" ? "text-signal-300" : "text-white";
  const body = (
    <Card className="h-full px-4 py-3 transition hover:border-white/20">
      <div className="text-xs text-mist-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold sm:text-2xl ${color}`}>{value}</div>
    </Card>
  );
  return href ? <A href={href}>{body}</A> : body;
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-signal-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-white/[0.07]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
            value === t.id ? "border-signal-500 text-white" : "border-transparent text-mist-400 hover:text-white"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Forma ----------

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mist-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white placeholder:text-mist-400/60 focus:border-signal-500/60 focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-900">
          {o.label}
        </option>
      ))}
    </select>
  );
}

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
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-mist-400 hover:text-white" aria-label="Yopish">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function LinkOut({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span className="text-mist-400">—</span>;
  const url = /^https?:\/\//.test(href) ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300 underline-offset-2 hover:underline">
      {children ?? href}
    </a>
  );
}

export function Banner({ tone, children }: { tone: "red" | "amber" | "green"; children: ReactNode }) {
  const cls =
    tone === "red"
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : tone === "amber"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : "border-signal-500/30 bg-signal-500/10 text-signal-200";
  return <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}

export const userOptions = (users: { id: string; name: string }[], empty?: string) => [
  ...(empty !== undefined ? [{ value: "", label: empty }] : []),
  ...users.map((u) => ({ value: u.id, label: u.name })),
];
