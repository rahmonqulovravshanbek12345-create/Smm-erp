// SVG grafiklar: bitta o'q, ingichka belgilar, sirt rangidagi bo'shliqlar, ustiga kelganda tooltip.
// Ranglar index.css'dagi tekshirilgan --viz-* tokenlaridan olinadi (yorug' va qorong'i rejim alohida).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtMoney } from "../lib/dates";

export const VIZ = {
  c1: "rgb(var(--viz-1))",
  c2: "rgb(var(--viz-2))",
  c3: "rgb(var(--viz-3))",
  neg: "rgb(var(--viz-neg))",
};

/** Qisqa pul formati: 12,4 mln / 850 ming. */
export function fmtShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1).replace(".", ",")} mlrd`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace(".", ",")} mln`;
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3)} ming`;
  return `${sign}${Math.round(a)}`;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Toza bo'linmalar: 0, 10 mln, 20 mln … */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(1, max - min);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v));
  return out;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x - 90), width - 188);
  return (
    <div
      className="pointer-events-none absolute z-10 w-[180px] rounded-[12px] bg-elevated px-3 py-2 text-[12px] shadow-float ring-1 ring-black/5"
      style={{ left, top: Math.max(0, y) }}
    >
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-label2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.line ? (
            <span className="inline-block h-[2px] w-3.5 rounded-full" style={{ background: i.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export interface Series {
  label: string;
  color: string;
  values: number[];
}

/**
 * Guruhlangan ustunlar (masalan, daromad va xarajat) + ixtiyoriy chiziq (sof foyda) — hammasi so'mda, bitta o'qda.
 */
export function ColumnsChart({ labels, bars, line, height = 240 }: { labels: string[]; bars: Series[]; line?: Series; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const all = [...bars.flatMap((s) => s.values), ...(line?.values ?? []), 0];
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const ih = height - pad.t - pad.b;
  const iw = width - pad.l - pad.r;
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const band = iw / labels.length;
  const barW = Math.min(24, (band * 0.62) / bars.length);
  const groupW = barW * bars.length + 2 * (bars.length - 1);
  const cx = (i: number) => pad.l + band * i + band / 2;
  const zero = y(0);
  // Ko'p ustunda yorliqlar bir-biriga tegmasligi uchun har k-chisini ko'rsatamiz
  const labelStep = Math.max(1, Math.ceil(labels.length / Math.max(4, Math.floor(iw / 56))));

  const roundTop = (x: number, top: number, w: number, bottom: number) => {
    const h = bottom - top;
    if (h <= 0) return "";
    const r = Math.min(4, h, w / 2);
    return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
  };
  const roundBottom = (x: number, top: number, w: number, bottom: number) => {
    const h = bottom - top;
    if (h <= 0) return "";
    const r = Math.min(4, h, w / 2);
    return `M${x},${top} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${x + w - r} Q${x + w},${bottom} ${x + w},${bottom - r} V${top} Z`;
  };

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Oylar bo'yicha grafik">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--sep)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--label2)" className="tabular">
              {fmtShort(t)}
            </text>
          </g>
        ))}
        {labels.map((lab, i) => (
          <g key={lab}>
            {hover === i && <rect x={pad.l + band * i + 2} y={pad.t} width={band - 4} height={ih} rx={8} fill="var(--fill)" />}
            {bars.map((s, k) => {
              const v = s.values[i] ?? 0;
              const x = cx(i) - groupW / 2 + k * (barW + 2);
              const d = v >= 0 ? roundTop(x, y(v), barW, zero) : roundBottom(x, zero, barW, y(v));
              return <path key={s.label} d={d} fill={s.color} />;
            })}
            {i % labelStep === 0 && (
              <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--label2)">
                {lab}
              </text>
            )}
            <rect
              x={pad.l + band * i}
              y={pad.t}
              width={band}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          </g>
        ))}
        {line && (
          <>
            <path
              d={line.values.map((v, i) => `${i ? "L" : "M"}${cx(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
            {line.values.map((v, i) => (
              <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill={line.color} stroke="rgb(var(--elevated))" strokeWidth={2} pointerEvents="none" />
            ))}
          </>
        )}
      </svg>
      {hover !== null && (
        <Tooltip x={cx(hover)} y={8} width={width}>
          <div className="mb-1 font-semibold text-label">{labels[hover]}</div>
          {[...bars, ...(line ? [line] : [])].map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-2 text-label2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tabular font-semibold text-label">{fmtShort(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** Bitta qator chiziq (masalan, pul qoldig'i) — maydon bilan, oxirgi nuqta ajratilgan. */
export function LineChart({ labels, series, height = 200 }: { labels: string[]; series: Series; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 56, r: 16, t: 14, b: 28 };
  const vals = series.values;
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const ih = height - pad.t - pad.b;
  const iw = width - pad.l - pad.r;
  const x = (i: number) => pad.l + (labels.length > 1 ? (iw * i) / (labels.length - 1) : iw / 2);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const last = vals.length - 1;
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={series.label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--sep)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--label2)">
              {fmtShort(t)}
            </text>
          </g>
        ))}
        <path d={`${path} L${x(last)},${y(lo)} L${x(0)},${y(lo)} Z`} fill={series.color} opacity={0.1} />
        <path d={path} fill="none" stroke={series.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--label3)" strokeWidth={1} />}
        {(hover !== null ? [hover] : [last]).map((i) => (
          <circle key={i} cx={x(i)} cy={y(vals[i] ?? 0)} r={5} fill={series.color} stroke="rgb(var(--elevated))" strokeWidth={2} />
        ))}
        {hover === null && (
          <text x={x(last)} y={y(vals[last] ?? 0) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="rgb(var(--label))">
            {fmtShort(vals[last] ?? 0)}
          </text>
        )}
        {labels.map((lab, i) => (
          <g key={lab}>
            <text x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--label2)">
              {lab}
            </text>
            <rect
              x={x(i) - iw / Math.max(1, labels.length - 1) / 2}
              y={pad.t}
              width={iw / Math.max(1, labels.length - 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={8} width={width}>
          <div className="font-semibold text-label">{labels[hover]}</div>
          <div className="text-label2">
            {series.label}: <span className="tabular font-semibold text-label">{fmtMoney(vals[hover] ?? 0)}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

/** Gorizontal ustunlar ro'yxati; signed — musbat/manfiy (foyda/zarar) ikki rangda, nol o'rtada. */
export function BarList({
  rows,
  color = VIZ.c1,
  signed,
  format = fmtShort,
}: {
  rows: { label: ReactNode; value: number; sub?: ReactNode }[];
  color?: string;
  signed?: boolean;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const hasNeg = signed && rows.some((r) => r.value < 0);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pct = (Math.abs(r.value) / max) * (hasNeg ? 50 : 100);
        const neg = r.value < 0;
        return (
          <div key={i} className="group" title={`${typeof r.label === "string" ? r.label : ""}: ${fmtMoney(r.value)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate font-medium text-label">{r.label}</span>
              <span className="tabular shrink-0 font-semibold text-label">{format(r.value)}</span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-fill">
              {hasNeg && <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-label3" />}
              <span
                className="absolute top-0 h-2 rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  left: hasNeg ? (neg ? `${50 - pct}%` : "50%") : 0,
                  background: signed ? (neg ? VIZ.neg : VIZ.c3) : color,
                }}
              />
            </div>
            {r.sub && <div className="mt-1 text-[12px] text-label2">{r.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** 100% to'plangan gorizontal ustun (masalan, debitorlik muddatlari) — bo'laklar orasida 2px bo'shliq. */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-fill">
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span
                key={p.label}
                title={`${p.label}: ${fmtMoney(p.value)}`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              />
            ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} className="text-[12px]">
            <div className="flex items-center gap-1.5 text-label2">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
              {p.label}
            </div>
            <div className="tabular font-semibold text-label">{fmtShort(p.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kichik trend chizig'i (KPI plitkalari uchun). */
export function Sparkline({ values, color = VIZ.c1, width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 2 + ((width - 4) * i) / (values.length - 1);
  const y = (v: number) => 2 + (height - 4) * (1 - (v - min) / (max - min || 1));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={3} fill={color} />
    </svg>
  );
}
