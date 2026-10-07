import { useMemo, useState } from "react";
import { Icon } from "../../components/icons";
import { A, Avatar, Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select, Stat, Tabs } from "../../components/ui";
import * as act from "../../lib/actions";
import { fmtDate, fmtMoney, fmtMonth, monthKey, shiftMonthKey } from "../../lib/dates";
import { ACCRUAL_KIND_LABELS, WORK_LABELS, employeeBalance, employeeLedger, payrollSheet, profileOf, txUZS } from "../../lib/finance";
import { ROLE_LABELS } from "../../lib/labels";
import { canEditFinance } from "../../lib/permissions";
import { useErp, useLookup } from "../../lib/store";
import type { Accrual, PayProfile, WorkType } from "../../lib/types";
import { FinNav, Money, MonthSelect, Note, TableWrap, td, tdr, th, thr } from "./common";
import { ManualAccrualModal, PayEmployeeModal } from "./modals";
import { ExportButton } from "../../components/ExportButton";

type Tab = "balances" | "accruals" | "sheet" | "rates";

export function Payroll() {
  const { state, me, today } = useErp();
  const editable = canEditFinance(me.role);
  const [tab, setTab] = useState<Tab>("balances");
  const [pay, setPay] = useState<string | null | "new">(null);
  const [manual, setManual] = useState(false);
  const month = monthKey(today);
  const staff = state.users.filter((u) => u.role !== "admin" && u.active);
  const owed = staff.reduce((a, u) => a + Math.max(0, employeeBalance(state, u.id)), 0);
  const accruedMonth = state.accruals.filter((a) => monthKey(a.date) === month).reduce((a, x) => a + x.amount, 0);
  const paidMonth = state.transactions.filter((t) => t.userId && monthKey(t.date) === month).reduce((a, t) => a + txUZS(state, t), 0);
  const unapproved = state.accruals.filter((a) => !a.approved).length;
  const dd = String(state.settings.payday).padStart(2, "0");
  const nextPayday = `${month}-${dd}` >= today ? `${month}-${dd}` : `${shiftMonthKey(month, 1)}-${dd}`;

  return (
    <>
      <PageHeader
        title="Ish haqi"
        sub="Ishbay, loyiha oyligi va fiks oylik: hisoblash, tasdiqlash va to'lov"
        actions={
          editable && (
            <>
              <Button onClick={() => setManual(true)}>+ Bonus / jarima</Button>
              <Button variant="primary" onClick={() => setPay("new")}>
                Xodimga to'lash
              </Button>
            </>
          )
        }
      />
      <FinNav />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="wallet" color="purple" label="Xodimlarga qarzimiz" value={fmtMoney(owed)} />
        <Stat icon="sparkle" color="blue" label={`${fmtMonth(month)} hisoblandi`} value={fmtMoney(accruedMonth)} />
        <Stat icon="send" color="green" label={`${fmtMonth(month)} to'landi`} value={fmtMoney(paidMonth)} />
        <Stat icon="calendar" color="orange" label="Keyingi to'lov kuni" value={fmtDate(nextPayday)} />
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "balances", label: "Balanslar" },
          { id: "accruals", label: <>Hisoblashlar {unapproved > 0 && <Badge tone="amber">{unapproved}</Badge>}</> },
          { id: "sheet", label: "Vedomost" },
          { id: "rates", label: "Stavkalar" },
        ]}
      />
      {tab === "balances" && <Balances onPay={(id) => setPay(id)} editable={editable} />}
      {tab === "accruals" && <Accruals editable={editable} />}
      {tab === "sheet" && <Sheet />}
      {tab === "rates" && <Rates editable={editable} />}
      {pay && <PayEmployeeModal userId={pay === "new" ? undefined : pay} onClose={() => setPay(null)} />}
      {manual && <ManualAccrualModal onClose={() => setManual(false)} />}
    </>
  );
}

function schemeText(p: PayProfile): string {
  const parts: string[] = [];
  if (p.fixed) parts.push(`fiks ${fmtMoney(p.fixed)}`);
  if (p.perProject) parts.push(`${fmtMoney(p.perProject)} / loyiha`);
  for (const [k, v] of Object.entries(p.rates)) if (v) parts.push(`${WORK_LABELS[k as WorkType].toLowerCase()} ${fmtMoney(v)}`);
  return parts.join(" · ") || "stavka belgilanmagan";
}

function Balances({ onPay, editable }: { onPay: (id: string) => void; editable: boolean }) {
  const { state, today } = useErp();
  const month = monthKey(today);
  const rows = state.users
    .filter((u) => u.role !== "admin" && u.active)
    .map((u) => {
      const led = employeeLedger(state, u.id);
      return {
        u,
        led,
        month: state.accruals.filter((a) => a.userId === u.id && monthKey(a.date) === month).reduce((x, a) => x + a.amount, 0),
        unpaidCount: led.rows.filter((r) => r.payStatus !== "paid").length,
      };
    })
    .filter((r) => r.led.accrued || r.led.paid || r.led.balance)
    .sort((a, b) => b.led.balance - a.led.balance);
  return (
    <Card>
      <TableWrap min={1080}>
        <thead>
          <tr className="border-b border-sep">
            <th className={th}>Xodim</th>
            <th className={th}>Sxema</th>
            <th className={thr}>Shu oy hisoblandi</th>
            <th className={thr}>Jami hisoblangan</th>
            <th className={thr}>Jami to'langan</th>
            <th className={thr}>Qoldiq</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-sep">
          {rows.map(({ u, led, month: m, unpaidCount }) => (
            <tr key={u.id} className="hover:bg-fill">
              <td className={td}>
                <div className="flex items-center gap-2.5">
                  <Avatar name={u.name} size={32} />
                  <div className="whitespace-nowrap">
                    <div className="font-semibold text-label">{u.name}</div>
                    <div className="text-[12px] text-label3">{ROLE_LABELS[u.role]}</div>
                  </div>
                </div>
              </td>
              <td className={`${td} min-w-[200px] text-[13px] text-label2`}>{schemeText(profileOf(state, u.id))}</td>
              <td className={tdr}>
                <Money v={m} />
              </td>
              <td className={tdr}>
                <Money v={led.accrued} muted />
              </td>
              <td className={tdr}>
                <Money v={led.paid} muted />
              </td>
              <td className={tdr}>
                <Money v={led.balance} strong />
                {unpaidCount > 0 && <div className="whitespace-nowrap text-[12px] text-label3">{unpaidCount} ta ochiq yozuv</div>}
              </td>
              <td className={tdr}>
                <div className="flex justify-end gap-1.5">
                  <A
                    href={`/moliya/akt?user=${u.id}`}
                    className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-fill"
                  >
                    Akt
                  </A>
                  {editable && led.balance > 0.5 && (
                    <Button size="sm" onClick={() => onPay(u.id)}>
                      To'lash
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}

const STATUS = { paid: { l: "To'langan", t: "green" }, partial: { l: "Qisman", t: "amber" }, unpaid: { l: "To'lanmagan", t: "gray" } } as const;

export function AccrualTable({
  userId,
  month,
  kind,
  editable,
  selectable,
}: {
  userId?: string;
  month?: string;
  kind?: string;
  editable?: boolean;
  selectable?: boolean;
}) {
  const { state, run } = useErp();
  const look = useLookup();
  const [sel, setSel] = useState<string[]>([]);
  const rows = useMemo(() => {
    const users = userId ? [userId] : state.users.map((u) => u.id);
    return users
      .flatMap((uid) => employeeLedger(state, uid).rows)
      .filter((a) => (!month || monthKey(a.date) === month) && (!kind || a.kind === kind))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state, userId, month, kind]);
  const pending = rows.filter((r) => !r.approved).map((r) => r.id);
  const total = rows.reduce((a, r) => a + r.amount, 0);

  if (rows.length === 0) return <Empty>Bu davrda hisoblash yo'q</Empty>;
  return (
    <>
      {selectable && editable && pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <Button size="sm" onClick={() => setSel(sel.length ? [] : pending)}>
            {sel.length ? "Tanlovni bekor qilish" : `Tasdiqlanmaganlarni tanlash (${pending.length})`}
          </Button>
          {sel.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => run((c) => act.approveAccruals(c, sel), `${sel.length} ta tasdiqlandi`) && setSel([])}>
              <Icon name="check" size={14} /> Tasdiqlash ({sel.length})
            </Button>
          )}
        </div>
      )}
      <TableWrap min={880}>
        <thead>
          <tr className="border-y border-sep">
            {selectable && editable && <th className={th} />}
            <th className={th}>Sana</th>
            {!userId && <th className={th}>Xodim</th>}
            <th className={th}>Ish / izoh</th>
            <th className={th}>Loyiha</th>
            <th className={th}>Turi</th>
            <th className={thr}>Summa</th>
            <th className={th}>Holat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sep">
          {rows.map((a) => (
            <AccrualRow
              key={a.id}
              a={a}
              showUser={!userId}
              selectable={Boolean(selectable && editable)}
              checked={sel.includes(a.id)}
              onCheck={(v) => setSel(v ? [...sel, a.id] : sel.filter((x) => x !== a.id))}
              projectName={look.projectName(a.projectId)}
              userName={look.userName(a.userId)}
              onDelete={
                editable && (a.createdBy !== "system" || a.kind === "piece" || a.kind === "bonus")
                  ? () => run((c) => act.deleteAccrual(c, a.id), "Hisoblash o'chirildi")
                  : undefined
              }
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-sep font-semibold">
            <td className={td} colSpan={(selectable && editable ? 1 : 0) + (userId ? 4 : 5)}>
              Jami ({rows.length} ta)
            </td>
            <td className={tdr}>
              <Money v={total} strong />
            </td>
            <td />
          </tr>
        </tfoot>
      </TableWrap>
    </>
  );
}

function AccrualRow({
  a,
  showUser,
  selectable,
  checked,
  onCheck,
  projectName,
  userName,
  onDelete,
}: {
  a: Accrual & { payStatus: "paid" | "partial" | "unpaid"; paid: number };
  showUser: boolean;
  selectable: boolean;
  checked: boolean;
  onCheck: (v: boolean) => void;
  projectName: string;
  userName: string;
  onDelete?: () => void;
}) {
  const st = STATUS[a.payStatus];
  const [ask, setAsk] = useState(false);
  return (
    <tr className="hover:bg-fill">
      {selectable && <td className={td}>{!a.approved && <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />}</td>}
      <td className={`${td} whitespace-nowrap text-label2`}>{fmtDate(a.date)}</td>
      {showUser && <td className={`${td} text-label`}>{userName}</td>}
      <td className={td}>
        <div className="text-label">{a.title}</div>
        {a.workType && a.qty > 0 && (
          <div className="text-[12px] text-label3">
            {WORK_LABELS[a.workType]} · stavka {fmtMoney(a.rate)}
          </div>
        )}
      </td>
      <td className={`${td} text-label2`}>{a.projectId ? projectName : "—"}</td>
      <td className={td}>
        <Badge tone={a.kind === "penalty" ? "red" : a.kind === "fixed" ? "violet" : a.kind === "project" ? "blue" : "gray"}>
          {ACCRUAL_KIND_LABELS[a.kind]}
        </Badge>
      </td>
      <td className={tdr}>
        <Money v={a.amount} strong />
      </td>
      <td className={td}>
        <div className="flex flex-wrap gap-1">
          {a.amount > 0 && <Badge tone={st.t}>{st.l}</Badge>}
          {!a.approved && <Badge tone="amber">tasdiqlanmagan</Badge>}
          {onDelete &&
            (ask ? (
              <span className="inline-flex items-center gap-1">
                <Button size="sm" variant="primary" className="!h-6 !bg-red !px-2 !text-[12px]" onClick={onDelete}>
                  O'chirish
                </Button>
                <Button size="sm" variant="ghost" className="!h-6 !px-2 !text-[12px]" onClick={() => setAsk(false)}>
                  Yo'q
                </Button>
              </span>
            ) : (
              <button type="button" onClick={() => setAsk(true)} className="text-label3 hover:text-red" aria-label={`O'chirish: ${a.title}`} title="O'chirish">
                <Icon name="trash" size={15} />
              </button>
            ))}
        </div>
      </td>
    </tr>
  );
}

function Accruals({ editable }: { editable: boolean }) {
  const { state, today } = useErp();
  const [month, setMonth] = useState(monthKey(today));
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState("");
  return (
    <Card>
      <div className="flex flex-wrap gap-2 px-5 pb-3 pt-4">
        <MonthSelect value={month} onChange={setMonth} />
        <Select
          aria-label="Xodim bo'yicha filtr"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="!w-52 !py-1.5 !text-[13px]"
          options={[{ value: "", label: "Barcha xodimlar" }, ...state.users.filter((u) => u.role !== "admin").map((u) => ({ value: u.id, label: u.name }))]}
        />
        <Select
          aria-label="Hisoblash turi bo'yicha filtr"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="!w-44 !py-1.5 !text-[13px]"
          options={[{ value: "", label: "Barcha turlar" }, ...Object.entries(ACCRUAL_KIND_LABELS).map(([value, label]) => ({ value, label }))]}
        />
      </div>
      <AccrualTable userId={userId || undefined} month={month} kind={kind || undefined} editable={editable} selectable />
      <div className="px-5 pb-4">
        <Note>
          Avtomatik: ishbay — vazifa qabul qilinganda yoki syomka topshirilganda; loyiha oyligi — loyiha davri yopilganda; fiks oylik — oy oxirida; operator
          bonusi — shartnoma tuzilganda. Holat (to'langan/qisman) to'lovlar eng eski yozuvlarga navbat bilan taqsimlanishidan kelib chiqadi.
        </Note>
      </div>
    </Card>
  );
}

function Sheet() {
  const { state, today } = useErp();
  const [month, setMonth] = useState(monthKey(today));
  const rows = useMemo(() => payrollSheet(state, month), [state, month]);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const k = (r: (typeof rows)[number], kinds: string[]) => kinds.reduce((a, x) => a + (r.byKind[x as Accrual["kind"]] ?? 0), 0);
  return (
    <Card className="print-area">
      <CardHeader
        title={`Ish haqi vedomosti — ${fmtMonth(month)}`}
        sub={state.settings.companyName}
        right={
          <div className="no-print flex flex-wrap gap-2">
            <MonthSelect value={month} onChange={setMonth} />
            <ExportButton
              filename={`vedomost-${month}`}
              sheets={() => [
                {
                  name: `Vedomost ${month}`,
                  columns: [
                    "Xodim",
                    "Lavozim",
                    "Oy boshi qoldig'i",
                    "Ishbay",
                    "Loyiha oyligi",
                    "Fiks",
                    "Bonus / jarima",
                    "Jami hisoblandi",
                    "To'landi",
                    "Oy oxiri qoldig'i",
                  ],
                  rows: rows.map((r) => [
                    r.user.name,
                    ROLE_LABELS[r.user.role],
                    r.opening,
                    k(r, ["piece"]),
                    k(r, ["project"]),
                    k(r, ["fixed"]),
                    k(r, ["bonus", "manual", "penalty"]),
                    r.accrued,
                    r.paid,
                    r.closing,
                  ]),
                },
                {
                  name: "Hisoblashlar",
                  columns: ["Sana", "Xodim", "Ish / izoh", "Loyiha", "Turi", "Summa", "Tasdiqlangan"],
                  rows: state.accruals
                    .filter((a) => a.date.startsWith(month))
                    .map((a) => [
                      a.date,
                      state.users.find((u) => u.id === a.userId)?.name,
                      a.title,
                      state.projects.find((p) => p.id === a.projectId)?.name ?? "",
                      ACCRUAL_KIND_LABELS[a.kind],
                      a.amount,
                      a.approved ? "ha" : "yo'q",
                    ]),
                },
              ]}
            />
            <Button size="sm" onClick={() => window.print()}>
              Chop etish
            </Button>
          </div>
        }
      />
      <TableWrap min={1000}>
        <thead>
          <tr className="border-y border-sep">
            <th className={th}>Xodim</th>
            <th className={thr}>Oy boshi qoldig'i</th>
            <th className={thr}>Ishbay</th>
            <th className={thr}>Loyiha oyligi</th>
            <th className={thr}>Fiks</th>
            <th className={thr}>Bonus / jarima</th>
            <th className={thr}>Jami hisoblandi</th>
            <th className={thr}>To'landi</th>
            <th className={thr}>Oy oxiri qoldig'i</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sep">
          {rows.map((r) => (
            <tr key={r.user.id}>
              <td className={td}>
                <div className="font-medium text-label">{r.user.name}</div>
                <div className="text-[12px] text-label3">{ROLE_LABELS[r.user.role]}</div>
              </td>
              <td className={tdr}>
                <Money v={r.opening} muted />
              </td>
              <td className={tdr}>
                <Money v={k(r, ["piece"])} />
              </td>
              <td className={tdr}>
                <Money v={k(r, ["project"])} />
              </td>
              <td className={tdr}>
                <Money v={k(r, ["fixed"])} />
              </td>
              <td className={tdr}>
                <Money v={k(r, ["bonus", "manual", "penalty"])} />
              </td>
              <td className={tdr}>
                <Money v={r.accrued} strong />
              </td>
              <td className={tdr}>
                <Money v={r.paid} />
              </td>
              <td className={tdr}>
                <Money v={r.closing} strong />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-sep bg-fill font-semibold">
            <td className={td}>Jami</td>
            <td className={tdr}>
              <Money v={sum((r) => r.opening)} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => k(r, ["piece"]))} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => k(r, ["project"]))} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => k(r, ["fixed"]))} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => k(r, ["bonus", "manual", "penalty"]))} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => r.accrued)} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => r.paid)} strong />
            </td>
            <td className={tdr}>
              <Money v={sum((r) => r.closing)} strong />
            </td>
          </tr>
        </tfoot>
      </TableWrap>
    </Card>
  );
}

const RATE_KEYS: WorkType[] = ["montaj", "dizayn_post", "dizayn_cover", "syomka", "shartnoma"];

function Rates({ editable }: { editable: boolean }) {
  const { state, run } = useErp();
  const staff = state.users.filter((u) => u.role !== "admin" && u.active);
  const [drafts, setDrafts] = useState<Record<string, PayProfile>>({});
  const get = (uid: string) => drafts[uid] ?? profileOf(state, uid);
  const set = (uid: string, p: PayProfile) => setDrafts({ ...drafts, [uid]: p });
  return (
    <Card>
      <CardHeader title="Stavkalar (namunaviy)" sub="Har xodimga bir yoki bir nechta sxema: fiks oylik, har loyiha uchun oylik, ishbay stavkalar" />
      <TableWrap min={1080}>
        <thead>
          <tr className="border-y border-sep">
            <th className={th}>Xodim</th>
            <th className={thr}>Fiks oylik</th>
            <th className={thr}>Loyiha uchun / oy</th>
            {RATE_KEYS.map((k) => (
              <th key={k} className={thr}>
                {WORK_LABELS[k]}
              </th>
            ))}
            {editable && <th className={th} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-sep">
          {staff.map((u) => {
            const p = get(u.id);
            const dirty = Boolean(drafts[u.id]);
            const num = (v: number, on: (n: number) => void) =>
              editable ? (
                <Input
                  type="number"
                  min={0}
                  step={10000}
                  value={v || ""}
                  placeholder="—"
                  onChange={(e) => on(Number(e.target.value) || 0)}
                  className="!w-28 !py-1 text-right !text-[13px]"
                />
              ) : v ? (
                <Money v={v} />
              ) : (
                <span className="text-label3">—</span>
              );
            return (
              <tr key={u.id}>
                <td className={td}>
                  <div className="font-medium text-label">{u.name}</div>
                  <div className="text-[12px] text-label3">{ROLE_LABELS[u.role]}</div>
                </td>
                <td className={tdr}>{num(p.fixed, (n) => set(u.id, { ...p, fixed: n }))}</td>
                <td className={tdr}>{num(p.perProject, (n) => set(u.id, { ...p, perProject: n }))}</td>
                {RATE_KEYS.map((k) => (
                  <td key={k} className={tdr}>
                    {num(p.rates[k] ?? 0, (n) => set(u.id, { ...p, rates: { ...p.rates, [k]: n } }))}
                  </td>
                ))}
                {editable && (
                  <td className={tdr}>
                    {dirty && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          if (run((c) => act.savePayProfile(c, { ...p, userId: u.id }), "Stavkalar saqlandi")) {
                            setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== u.id)));
                          }
                        }}
                      >
                        Saqlash
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <div className="px-5 pb-4">
        <Note>
          Yangi stavka keyingi hisoblashlarga qo'llanadi; oldin hisoblanganlar o'zgarmaydi. Loyiha oyligi xodim SMM, targetolog yoki marketolog sifatida
          biriktirilgan har bir loyiha uchun hisoblanadi.
        </Note>
      </div>
    </Card>
  );
}
