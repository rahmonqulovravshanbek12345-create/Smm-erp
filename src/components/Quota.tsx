import { useState } from "react";
import * as act from "../lib/actions";
import { AD_VIDEO, SHOOT_KEY, SHOOT_LABEL, quotaFor, typesFor, quotaProgress, quotaShortage, tariffQuota, typeName } from "../lib/content";
import { fmtDateTime, fmtMonth, shiftMonthKey } from "../lib/dates";
import { FORMAT_LABELS } from "../lib/labels";
import { useErp, useLookup } from "../lib/store";
import { tariffOf } from "../lib/tariffs";
import type { PostFormat, Project, Role } from "../lib/types";
import { Banner, Button, Card, CardHeader, Field, Input, Modal, Select } from "./ui";

/** Topshiriqni marketolog beradi; rahbar va admin ham o'zgartira oladi. */
export const canSetQuota = (role: Role) => role === "marketolog" || role === "rahbar" || role === "admin";

function Bar({ value, max, tone }: { value: number; max: number; tone: "green" | "orange" | "accent" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : value > 0 ? 100 : 0;
  const bg = tone === "green" ? "bg-green" : tone === "orange" ? "bg-orange" : "bg-accent";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-fill2" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Loyiha bo'yicha oylik topshiriq: reja (kontent rejaga qo'shilgan) va fakt (joylangan). */
export function QuotaPanel({ project, month, compact }: { project: Project; month: string; compact?: boolean }) {
  const { state, me } = useErp();
  const look = useLookup();
  const [edit, setEdit] = useState(false);
  const q = quotaFor(state, project, month);
  const rows = quotaProgress(state, project, month);
  const short = quotaShortage(rows);
  const editable = canSetQuota(me.role);

  return (
    <Card className={compact ? "" : "mb-4"}>
      <CardHeader
        icon={{ name: "gauge", color: "indigo" }}
        title={`Oylik topshiriq · ${fmtMonth(month)}`}
        sub={
          q.saved
            ? `Marketolog: ${look.userName(q.saved.updatedBy)} · ${fmtDateTime(q.saved.updatedAt)}${q.saved.note ? ` · ${q.saved.note}` : ""}`
            : rows.length
              ? "Tarif bo'yicha (marketolog hali alohida topshiriq bermagan)"
              : "Topshiriq berilmagan"
        }
        right={
          editable && (
            <Button size="sm" variant={q.saved ? "secondary" : "primary"} onClick={() => setEdit(true)}>
              {q.saved ? "O'zgartirish" : "Topshiriq berish"}
            </Button>
          )
        }
      />
      <div className="px-4 pb-4 pt-1">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-label2">Bu oy uchun sonlar yo'q.</p>
        ) : (
          <div className={`grid gap-x-6 gap-y-3 ${compact ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
            {rows.map((r) => {
              const ok = r.target > 0 && r.planned >= r.target;
              return (
                <div key={r.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-label">{r.label}</span>
                    <span className={`tabular font-semibold ${ok ? "text-green" : r.target ? "text-orange" : "text-label2"}`}>
                      {r.planned} / {r.target}
                      {ok ? " ✓" : ""}
                    </span>
                  </div>
                  <Bar value={r.planned} max={r.target} tone={ok ? "green" : "orange"} />
                  <div className="mt-1 text-[11px] text-label2">
                    {r.key === SHOOT_KEY ? `o'tkazildi: ${r.done}` : r.key === AD_VIDEO ? `targetologga berildi: ${r.done}` : `joylandi: ${r.done}`} · rejada:{" "}
                    {r.planned}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {short && <div className="mt-3 rounded-[12px] bg-orange/12 px-3 py-2 text-[13px] font-semibold text-orange">⚠ Rejada yetishmayapti: {short}</div>}
        {!compact && q.saved && q.saved.history.length > 0 && (
          <details className="mt-3 text-xs text-label2">
            <summary className="cursor-pointer select-none">O'zgarishlar tarixi ({q.saved.history.length})</summary>
            <ul className="mt-1.5 space-y-1">
              {q.saved.history.map((h, i) => (
                <li key={i}>
                  {fmtDateTime(h.at)} · {look.userName(h.userId)}: {h.text}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {edit && <QuotaModal project={project} month={month} onClose={() => setEdit(false)} />}
    </Card>
  );
}

export function QuotaModal({ project, month, onClose }: { project: Project; month: string; onClose: () => void }) {
  const { state, run } = useErp();
  const q = quotaFor(state, project, month);
  const fromTariff = tariffQuota(tariffOf(state, project.tariffId));
  const keys = [
    ...typesFor(state, project)
      .filter((t) => t.active || q.counts[t.id])
      .map((t) => t.id),
    SHOOT_KEY,
  ];
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(keys.map((k) => [k, String(q.counts[k] ?? 0)])));
  const [note, setNote] = useState(q.saved?.note ?? "");
  const [adding, setAdding] = useState<{ name: string; format: PostFormat } | null>(null);
  const allKeys = [
    ...new Set([
      ...keys,
      ...typesFor(state, project)
        .filter((t) => t.active)
        .map((t) => t.id),
    ]),
  ].sort((a, b) => (a === SHOOT_KEY ? 1 : 0) - (b === SHOOT_KEY ? 1 : 0));

  const save = () => {
    const nums = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v) || 0]));
    if (run((c) => act.saveQuota(c, project.id, month, nums, note), "Topshiriq saqlandi — SMM menejerga xabar ketdi")) onClose();
  };
  const addType = () => {
    if (!adding) return;
    if (run((c) => act.saveContentType(c, { ...adding, active: true }), "Yangi tur qo'shildi")) setAdding(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${project.name} · ${fmtMonth(month)} topshirig'i`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={save}>
            Saqlash va SMM'ga yuborish
          </Button>
        </>
      }
    >
      {q.fromTariff && Object.keys(fromTariff).length > 0 && <Banner tone="green">Sonlar tarifdan olindi — kerak bo'lsa o'zgartiring.</Banner>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-label2">
          <tr>
            <th className="py-1.5 font-medium">Turi</th>
            <th className="py-1.5 text-right font-medium">Tarifda</th>
            <th className="py-1.5 pl-4 font-medium">Bu oy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sep">
          {allKeys.map((k) => (
            <tr key={k}>
              <td className="py-2 text-label">{k === SHOOT_KEY ? SHOOT_LABEL : typeName(state, k)}</td>
              <td className="tabular py-2 text-right text-label2">{fromTariff[k] ?? "—"}</td>
              <td className="py-2 pl-4">
                <Input
                  type="number"
                  min={0}
                  aria-label={`${typeName(state, k)} — bu oy`}
                  value={counts[k] ?? "0"}
                  onChange={(e) => setCounts({ ...counts, [k]: e.target.value })}
                  className="!w-24 !py-1.5"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3">
        {adding ? (
          <div className="flex flex-wrap items-end gap-2 rounded-[14px] bg-fill p-3">
            <Field label="Yangi tur nomi" className="min-w-[180px] flex-1">
              <Input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Masalan: Jonli efir" />
            </Field>
            <Field label="Ishlab chiqarish">
              <Select
                value={adding.format}
                onChange={(e) => setAdding({ ...adding, format: e.target.value as PostFormat })}
                options={Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Button variant="primary" onClick={addType} disabled={!adding.name.trim()}>
              Qo'shish
            </Button>
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Bekor
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setAdding({ name: "", format: "video" })}>
            + Yangi tur qo'shish
          </Button>
        )}
      </div>
      <Field label="Izoh (ixtiyoriy)" className="mt-3">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: aksiya oyi — video ko'proq" />
      </Field>
      {q.saved && <p className="mt-2 text-xs text-label2">O'zgarish tarixga yoziladi va SMM menejerga Telegram orqali xabar boradi.</p>}
    </Modal>
  );
}

/** Barcha loyihalar bo'yicha: har loyiha topshiriqning qancha qismi rejaga tushgan; marketologga — «Topshiriq berish» tugmasi. */
export function QuotaSummary({ projects }: { projects: Project[] }) {
  const { state, me, today } = useErp();
  const month = today.slice(0, 7);
  const [editing, setEditing] = useState<Project | null>(null);
  const editable = canSetQuota(me.role);
  const rows = projects
    .map((p) => ({ p, rows: quotaProgress(state, p, month), given: Boolean(quotaFor(state, p, month).saved) }))
    .filter((x) => x.rows.length || editable)
    .map((x) => ({ ...x, target: x.rows.reduce((a, r) => a + r.target, 0), planned: x.rows.reduce((a, r) => a + Math.min(r.planned, r.target), 0) }));
  if (!rows.length) return null;
  const missing = rows.filter((x) => !x.given).length;
  return (
    <Card className="mb-4">
      <CardHeader
        icon={{ name: "gauge", color: "indigo" }}
        title={`Oylik topshiriqlar · ${fmtMonth(month)}`}
        sub={
          editable
            ? missing
              ? `${missing} ta loyihaga bu oy topshiriq berilmagan (tarif bo'yicha hisoblanmoqda). Har qatordagi tugma orqali bering`
              : "Hamma loyihaga topshiriq berilgan. O'zgartirish uchun qatordagi tugmani bosing"
            : "Loyihani tanlasangiz — batafsil reja va fakt"
        }
      />
      <ul className="divide-y divide-sep">
        {rows.map(({ p, rows: r, target, planned, given }) => {
          const short = quotaShortage(r);
          return (
            <li key={p.id} className="grid grid-cols-1 gap-2 px-4 py-2.5 text-sm sm:grid-cols-[170px_1fr_auto_auto] sm:items-center">
              <span className="font-medium text-label">
                {p.name}
                {!given && <span className="ml-1.5 rounded-full bg-orange/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange">berilmagan</span>}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-label2">
                {r.map((x) => (
                  <span key={x.key} className={x.target && x.planned >= x.target ? "text-green" : x.target ? "text-orange" : ""}>
                    {x.label.split(" (")[0]} {x.planned}/{x.target}
                  </span>
                ))}
              </span>
              <span className={`text-xs font-semibold ${short ? "text-orange" : "text-green"}`}>
                {short ? `yetishmaydi: ${short}` : `✓ ${planned}/${target}`}
              </span>
              {editable && (
                <Button size="sm" variant={given ? "secondary" : "primary"} onClick={() => setEditing(p)}>
                  {given ? "O'zgartirish" : "Topshiriq berish"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {editing && <QuotaModal project={editing} month={month} onClose={() => setEditing(null)} />}
    </Card>
  );
}

/** Loyiha kartasidagi alohida «Oylik topshiriq» tabi: shu oy va keyingi oy. */
export function QuotaTab({ project }: { project: Project }) {
  const { today } = useErp();
  const cur = today.slice(0, 7);
  const next = shiftMonthKey(cur, 1);
  const [month, setMonth] = useState(cur);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[cur, next].map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={month === m}
            onClick={() => setMonth(m)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${month === m ? "bg-accent text-white" : "bg-fill text-label2"}`}
          >
            {fmtMonth(m)}
            {m === next ? " (keyingi oy)" : ""}
          </button>
        ))}
      </div>
      <QuotaPanel project={project} month={month} />
      <p className="text-xs text-label2">
        Marketolog shu yerda oyiga nechta video, dizayn, matn, stories va syomka kuni kerakligini beradi. SMM menejer kontent rejani shu sonlarga qarab tuzadi;
        oy o'rtasida o'zgartirilsa, unga Telegram orqali xabar boradi.
      </p>
    </>
  );
}
