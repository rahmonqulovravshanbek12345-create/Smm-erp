import { useState } from "react";
import { Banner, Button, Field, Input, Modal, Select, userOptions } from "../../components/ui";
import * as act from "../../lib/actions";
import { fmtMoney } from "../../lib/dates";
import { WORK_LABELS, accountOf, billPaid, employeeBalance, invoiceOutstanding, payrollStaff } from "../../lib/finance";
import { useErp, useLookup } from "../../lib/store";
import type { Bill, Invoice } from "../../lib/types";
import { useAccountOptions } from "./common";

interface MoneyState {
  accountId: string;
  setAccountId: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  rate: string;
  setRate: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  isUsd: boolean;
  /** Kiritilgan summa hisob valyutasida. */
  value: number;
  /** So'mdagi qiymati (USD hisobda kurs bo'yicha). */
  uzs: number;
  rateNum: number | undefined;
}

/** Hisob tanlash + USD bo'lsa kurs maydoni. */
function useMoneyFields(defaultAccount = "acc_bank") {
  const { state, today } = useErp();
  const [accountId, setAccountId] = useState(state.accounts.some((a) => a.id === defaultAccount) ? defaultAccount : (state.accounts[0]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(String(state.settings.usdRate));
  const [date, setDate] = useState(today);
  const isUsd = accountOf(state, accountId)?.currency === "USD";
  const rateVal = Number(rate) || state.settings.usdRate;
  const value = Number(amount) || 0;
  const base: MoneyState = {
    accountId,
    setAccountId,
    amount,
    setAmount,
    rate,
    setRate,
    date,
    setDate,
    isUsd,
    value,
    uzs: isUsd ? value * rateVal : value,
    rateNum: isUsd ? rateVal : undefined,
  };
  return {
    ...base,
    /**
     * Summa kiritilmagan bo'lsa — taklif etiladigan summa (so'mda berilgan) hisob valyutasiga o'giriladi:
     * USD hisobda so'm summasi dollar bo'lib yozilib ketmasligi uchun.
     */
    withDefault(suggestedUzs: number): MoneyState {
      if (amount !== "") return base;
      const v = isUsd ? Math.round((Math.max(0, suggestedUzs) / rateVal) * 100) / 100 : Math.round(Math.max(0, suggestedUzs));
      return { ...base, amount: String(v), value: v, uzs: isUsd ? v * rateVal : v };
    },
  };
}

function MoneyFields({ m, label = "Summa" }: { m: MoneyState; label?: string }) {
  const accounts = useAccountOptions();
  return (
    <>
      <Field label="Hisob (kassa)">
        <Select value={m.accountId} onChange={(e) => m.setAccountId(e.target.value)} options={accounts} />
      </Field>
      <Field label="Sana">
        <Input type="date" value={m.date} onChange={(e) => m.setDate(e.target.value)} />
      </Field>
      <Field label={`${label} (${m.isUsd ? "USD" : "so'm"})`} hint={m.isUsd ? `≈ ${fmtMoney(m.uzs)}` : undefined}>
        <Input type="number" min={0} value={m.amount} onChange={(e) => m.setAmount(e.target.value)} placeholder="0" />
      </Field>
      {m.isUsd && (
        <Field label="Kurs (1 USD = so'm)">
          <Input type="number" value={m.rate} onChange={(e) => m.setRate(e.target.value)} />
        </Field>
      )}
    </>
  );
}

function Footer({ onClose, onSave, label, disabled }: { onClose: () => void; onSave: () => void; label: string; disabled?: boolean }) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        Bekor qilish
      </Button>
      <Button variant="primary" onClick={onSave} disabled={disabled}>
        {label}
      </Button>
    </>
  );
}

// ---------- Erkin kirim / chiqim ----------

export function TxModal({ dir, onClose }: { dir: "in" | "out"; onClose: () => void }) {
  const { state, run } = useErp();
  const m = useMoneyFields(dir === "out" ? "acc_card" : "acc_bank");
  // Mijoz to'lovi, ish haqi va o'tkazmalar o'z oynalaridan kiritiladi (fakturaga/xodimga bog'lanadi).
  const order = ["overhead", "direct", "tax", "revenue", "investing", "financing", "transit"];
  const articles = state.articles
    .filter((a) => a.dir === dir && !["client", "payroll", "transfer"].includes(a.group))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const art = state.articles.find((a) => a.id === articleId);
  const needsProject = art?.group === "transit";

  const save = () => {
    const ok = run(
      (c) =>
        act.addTransaction(c, {
          date: m.date,
          accountId: m.accountId,
          dir,
          amount: m.value,
          rate: m.rateNum,
          articleId,
          projectId: projectId || undefined,
          note,
        }),
      dir === "in" ? "Kirim qayd etildi" : "Chiqim qayd etildi",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={dir === "in" ? "Yangi kirim" : "Yangi chiqim"}
      footer={<Footer onClose={onClose} onSave={save} label="Saqlash" disabled={!m.value || (needsProject && !projectId)} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Modda" className="sm:col-span-2">
          <Select value={articleId} onChange={(e) => setArticleId(e.target.value)} options={articles.map((a) => ({ value: a.id, label: a.name }))} />
        </Field>
        <MoneyFields m={m} />
        <Field label={needsProject ? "Loyiha (majburiy)" : "Loyiha (ixtiyoriy)"} hint="Loyihaga bog'langan xarajat loyiha tannarxiga kiradi">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[{ value: "", label: "— umumiy —" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {art?.group === "tax" && <Banner tone="amber">Aylanma soliq avtomatik hisoblanmaydi — to'langan summani shu yerda kiriting.</Banner>}
      {art?.group === "transit" && <Banner tone="amber">Tranzit: mijozning reklama puli. Foyda-zararga kirmaydi, Pul oqimida alohida ko'rinadi.</Banner>}
    </Modal>
  );
}

// ---------- O'tkazma ----------

export function TransferModal({ onClose }: { onClose: () => void }) {
  const { state, run, today } = useErp();
  const accounts = useAccountOptions();
  const [from, setFrom] = useState("acc_bank");
  const [to, setTo] = useState("acc_cash");
  const [amountFrom, setAmountFrom] = useState("");
  const [rate, setRate] = useState(String(state.settings.usdRate));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const cf = accountOf(state, from)?.currency;
  const ct = accountOf(state, to)?.currency;
  const r = Number(rate) || state.settings.usdRate;
  const a = Number(amountFrom) || 0;
  const amountTo = cf === ct ? a : cf === "UZS" ? Math.round((a / r) * 100) / 100 : Math.round(a * r);
  const save = () => {
    if (run((c) => act.addTransfer(c, { from, to, amountFrom: a, amountTo, rate: cf !== ct ? r : undefined, date, note }), "O'tkazma bajarildi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Hisoblar o'rtasida o'tkazma"
      footer={<Footer onClose={onClose} onSave={save} label="O'tkazish" disabled={!a || from === to} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Qayerdan">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} options={accounts} />
        </Field>
        <Field label="Qayerga">
          <Select value={to} onChange={(e) => setTo(e.target.value)} options={accounts} />
        </Field>
        <Field label={`Summa (${cf})`} hint={cf !== ct ? `Tushadi: ${amountTo} ${ct}` : undefined}>
          <Input type="number" value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)} />
        </Field>
        {cf !== ct ? (
          <Field label="Kurs (1 USD = so'm)">
            <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        ) : (
          <Field label="Sana">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: kassaga naqd yechish" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Mijoz to'lovi ----------

export function InvoicePayModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { state, run } = useErp();
  const look = useLookup();
  const left = invoiceOutstanding(state, invoice);
  const m = useMoneyFields("acc_bank").withDefault(left);
  const [note, setNote] = useState("");
  const save = () => {
    if (
      run(
        (c) => act.recordClientPayment(c, invoice.id, { amount: m.value, date: m.date, accountId: m.accountId, rate: m.rateNum, note }),
        "To'lov qabul qilindi",
      )
    )
      onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`To'lov: ${invoice.number} — ${look.projectName(invoice.projectId)}`}
      footer={<Footer onClose={onClose} onSave={save} label="Qabul qilish" />}
    >
      <p className="mb-3 text-[14px] text-label2">
        Faktura: <b className="text-label">{fmtMoney(invoice.amount)}</b> · qolgan: <b className="text-label">{fmtMoney(left)}</b>. Qisman to'lov ham qayd
        etiladi.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyFields m={m} />
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank o'tkazmasi / naqd / karta" />
        </Field>
      </div>
    </Modal>
  );
}

export function ExtraInvoiceModal({ onClose }: { onClose: () => void }) {
  const { state, run, today } = useErp();
  const [projectId, setProjectId] = useState(state.projects.find((p) => p.status === "active")?.id ?? "");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [note, setNote] = useState("Qo'shimcha syomka");
  const save = () => {
    if (run((c) => act.createExtraInvoice(c, { projectId, amount: Number(amount), issueDate, dueDate, note }), "Faktura chiqarildi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Qo'shimcha xizmat uchun faktura"
      footer={<Footer onClose={onClose} onSave={save} label="Chiqarish" disabled={!Number(amount)} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loyiha" className="sm:col-span-2">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} options={state.projects.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label="Xizmat" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Summa (so'm)">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Chiqarilgan sana">
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label="To'lov muddati">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Xodimga to'lov ----------

export function PayEmployeeModal({ userId, onClose }: { userId?: string; onClose: () => void }) {
  const { state, run } = useErp();
  const staff = payrollStaff(state);
  const [uid, setUid] = useState(userId ?? staff[0]?.id ?? "");
  const balance = employeeBalance(state, uid);
  const m = useMoneyFields("acc_bank").withDefault(Math.max(0, balance));
  const [kind, setKind] = useState<"pay" | "advance">("pay");
  const [note, setNote] = useState("");
  const value = m.value;
  const save = () => {
    const n = note || (kind === "advance" ? "Avans" : "Ish haqi");
    if (
      run(
        (c) => act.payEmployee(c, { userId: uid, amount: value, date: m.date, accountId: m.accountId, rate: m.rateNum, note: n }),
        "To'lov qayd etildi — xodimga xabar ketdi",
      )
    )
      onClose();
  };
  return (
    <Modal open onClose={onClose} title="Xodimga to'lov" footer={<Footer onClose={onClose} onSave={save} label="To'lash" disabled={!value} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Xodim">
          <Select
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            options={userOptions(staff).map((o, i) => (staff[i]?.active === false ? { ...o, label: `${o.label} (arxivda)` } : o))}
          />
        </Field>
        <Field label="Turi">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as "pay" | "advance")}
            options={[
              { value: "pay", label: "Hisoblangan ish haqi" },
              { value: "advance", label: "Avans (oldindan)" },
            ]}
          />
        </Field>
        <MoneyFields m={m} />
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: sentyabr uchun ish haqi" />
        </Field>
      </div>
      <Banner tone={balance > 0 ? "amber" : "green"}>
        Joriy qoldiq: {balance >= 0 ? `kompaniya xodimga ${fmtMoney(balance)} qarzdor` : `xodimga ${fmtMoney(-balance)} avans berilgan`}. To'lov eng eski
        hisoblashlarni navbat bilan yopadi.
      </Banner>
    </Modal>
  );
}

export function ManualAccrualModal({ userId, onClose }: { userId?: string; onClose: () => void }) {
  const { state, run, today } = useErp();
  const staff = state.users.filter((u) => u.role !== "admin" && u.active);
  const [uid, setUid] = useState(userId ?? staff[0]?.id ?? "");
  const [kind, setKind] = useState<"bonus" | "penalty" | "manual">("bonus");
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState("");
  const save = () => {
    if (run((c) => act.addManualAccrual(c, { userId: uid, kind, amount: Number(amount), projectId, date, title }), "Hisoblash qo'shildi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Bonus, jarima yoki qo'shimcha hisoblash"
      footer={<Footer onClose={onClose} onSave={save} label="Qo'shish" disabled={!Number(amount) || !title.trim()} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Xodim">
          <Select value={uid} onChange={(e) => setUid(e.target.value)} options={userOptions(staff)} />
        </Field>
        <Field label="Turi">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            options={[
              { value: "bonus", label: "Bonus (+)" },
              { value: "penalty", label: "Jarima / ushlab qolish (−)" },
              { value: "manual", label: "Boshqa hisoblash (+)" },
            ]}
          />
        </Field>
        <Field label="Summa (so'm)">
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Sana">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Loyiha (ixtiyoriy)" hint="Loyihaga bog'lansa, loyiha tannarxiga kiradi">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[{ value: "", label: "— umumiy —" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
        <Field label="Izoh (sabab)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: KPI bajarildi" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Ta'minotchi ----------

export function BillModal({ onClose }: { onClose: () => void }) {
  const { state, run, today } = useErp();
  const articles = state.articles.filter((a) => a.dir === "out" && (a.group === "direct" || a.group === "overhead"));
  const [vendorId, setVendorId] = useState(state.vendors[0]?.id ?? "");
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const save = () => {
    if (
      run(
        (c) => act.addBill(c, { vendorId, articleId, amount: Number(amount), date, dueDate, note, projectId: projectId || undefined }),
        "Xarajat hujjati qo'shildi",
      )
    )
      onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Ta'minotchidan xarajat hujjati"
      footer={<Footer onClose={onClose} onSave={save} label="Qo'shish" disabled={!Number(amount)} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ta'minotchi">
          <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} options={state.vendors.map((v) => ({ value: v.id, label: v.name }))} />
        </Field>
        <Field label="Modda">
          <Select value={articleId} onChange={(e) => setArticleId(e.target.value)} options={articles.map((a) => ({ value: a.id, label: a.name }))} />
        </Field>
        <Field label="Summa (so'm)">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Loyiha (ixtiyoriy)">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[{ value: "", label: "— umumiy —" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
        <Field label="Hujjat sanasi">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="To'lov muddati">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: noyabr ijarasi" />
        </Field>
      </div>
    </Modal>
  );
}

export function PayBillModal({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const { state, run } = useErp();
  const left = bill.amount - billPaid(state, bill);
  const m = useMoneyFields("acc_bank").withDefault(left);
  const save = () => {
    if (run((c) => act.payBill(c, bill.id, { amount: m.value, date: m.date, accountId: m.accountId, rate: m.rateNum }), "To'landi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`To'lov: ${state.vendors.find((v) => v.id === bill.vendorId)?.name}`}
      footer={<Footer onClose={onClose} onSave={save} label="To'lash" />}
    >
      <p className="mb-3 text-[14px] text-label2">
        {bill.note} · qolgan: <b className="text-label">{fmtMoney(left)}</b>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyFields m={m} />
      </div>
    </Modal>
  );
}

export { WORK_LABELS };
