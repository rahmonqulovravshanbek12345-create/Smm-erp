import type { ReactNode } from "react";
import { A, Select, usePath } from "../../components/ui";
import { Icon, type IconName } from "../../components/icons";
import { fmtMoney, fmtMonth, monthKey, shiftMonthKey } from "../../lib/dates";
import { useErp } from "../../lib/store";

export const FIN_PAGES: { path: string; label: string; icon: IconName }[] = [
  { path: "/moliya", label: "Panel", icon: "gauge" },
  { path: "/moliya/kirim-chiqim", label: "Kirim-chiqim", icon: "list" },
  { path: "/moliya/fakturalar", label: "Fakturalar", icon: "send" },
  { path: "/moliya/pnl", label: "Foyda va zarar", icon: "sparkle" },
  { path: "/moliya/cashflow", label: "Pul oqimi", icon: "history" },
  { path: "/moliya/debitor", label: "Debitor / Kreditor", icon: "users" },
  { path: "/moliya/akt", label: "Akt-sverka", icon: "checkSeal" },
  { path: "/moliya/kalendar", label: "To'lov kalendari", icon: "calendar" },
  { path: "/moliya/ish-haqi", label: "Ish haqi", icon: "wallet" },
  { path: "/moliya/reja", label: "Reja-fakt", icon: "target" },
];

/** Moliya bo'limlari orasida tez o'tish (gorizontal pill'lar). */
export function FinNav() {
  const path = usePath();
  return (
    <nav className="no-scrollbar no-print -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {FIN_PAGES.map((p) => {
        const active = path === p.path;
        return (
          <A
            key={p.path}
            href={p.path}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
              active ? "bg-accent text-white shadow-[0_6px_16px_-8px_rgb(var(--accent)/0.8)]" : "glass text-label hover:brightness-105"
            }`}
          >
            <Icon name={p.icon} size={15} />
            {p.label}
          </A>
        );
      })}
    </nav>
  );
}

/** Summa: manfiy — qizil, ixtiyoriy belgi bilan. */
export function Money({ v, sign, strong, muted }: { v: number; sign?: boolean; strong?: boolean; muted?: boolean }) {
  const neg = v < -0.5;
  const txt = `${sign && v > 0.5 ? "+" : ""}${neg ? "−" : ""}${fmtMoney(Math.abs(v)).replace(" so'm", "")}`;
  return <span className={`tabular whitespace-nowrap ${strong ? "font-semibold" : ""} ${neg ? "text-red" : muted ? "text-label2" : "text-label"}`}>{txt}</span>;
}

export const th = "whitespace-nowrap px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-label3";
export const thr = `${th} !text-right`;
export const td = "px-4 py-2.5 align-top";
export const tdr = "px-4 py-2.5 text-right align-top";

export function TableWrap({ children, min = 720 }: { children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]" style={{ minWidth: min }}>
        {children}
      </table>
    </div>
  );
}

export function useAccountOptions(currency?: "UZS" | "USD") {
  const { state } = useErp();
  return state.accounts.filter((a) => !currency || a.currency === currency).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }));
}

export function MonthSelect({ value, onChange, back = 11, forward = 0 }: { value: string; onChange: (m: string) => void; back?: number; forward?: number }) {
  const { today } = useErp();
  const cur = monthKey(today);
  const opts = [];
  for (let i = forward; i >= -back; i--) {
    const m = shiftMonthKey(cur, i);
    opts.push({ value: m, label: fmtMonth(m) });
  }
  return <Select value={value} onChange={(e) => onChange(e.target.value)} options={opts} className="!w-44 !py-1.5 !text-[13px]" />;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 flex gap-2 px-1 text-[12px] leading-relaxed text-label3"><Icon name="alert" size={14} className="mt-0.5 shrink-0" />{children}</p>;
}
