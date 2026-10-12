import { useState } from "react";
import { AmountInput, Banner, Button, Field, Input, Modal, Select, userOptions } from "../../components/ui";
import { fmtMoney, fmtUsd } from "../../lib/dates";
import { WORK_LABELS, accountOf, billPaid, employeeBalance, invoiceOutstanding, invoiceOutstandingUsd, payrollStaff } from "../../lib/finance";
import { useErp, useLookup } from "../../lib/store";
import type { Account, Bill, Invoice } from "../../lib/types";
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
  const [amount, setAmountRaw] = useState("");
  // Foydalanuvchi summani o'zgartirgach (hatto o'chirib tashlasa ham) taklif etilgan summa qaytib kelmaydi
  const [touched, setTouched] = useState(false);
  const setAmount = (v: string) => {
    setTouched(true);
    setAmountRaw(v);
  };
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
      if (touched || amount !== "") return base;
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
        <AmountInput value={m.amount} onValue={m.setAmount} placeholder="0" />
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
      "addTransaction",
      [
        {
          date: m.date,
          accountId: m.accountId,
          dir,
          amount: m.value,
          rate: m.rateNum,
          articleId,
          projectId: projectId || undefined,
          note,
        },
      ],
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    if (run("addTransfer", [{ from, to, amountFrom: a, amountTo, rate: cf !== ct ? r : undefined, date, note }], "O'tkazma bajarildi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Hisoblar o'rtasida o'tkazma"
      footer={<Footer onClose={onClose} onSave={save} label="O'tkazish" disabled={!a || from === to} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Qayerdan">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} options={accounts} />
        </Field>
        <Field label="Qayerga">
          <Select value={to} onChange={(e) => setTo(e.target.value)} options={accounts} />
        </Field>
        <Field label={`Summa (${cf})`} hint={cf !== ct ? `Tushadi: ${amountTo} ${ct}` : undefined}>
          <AmountInput value={amountFrom} onValue={setAmountFrom} />
        </Field>
        {cf !== ct && (
          <Field label="Kurs (1 USD = so'm)">
            <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
        <Field label="Sana">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: kassaga naqd yechish" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Mijoz to'lovi ----------

export function InvoicePayModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  if (invoice.usd) return <UsdInvoicePayModal invoice={invoice} onClose={onClose} />;
  return <UzsInvoicePayModal invoice={invoice} onClose={onClose} />;
}

/**
 * Dollardagi shartnoma fakturasi: dollar hisobga — dollarda; so'm hisobga — to'lov kunidagi kurs bo'yicha,
 * bank/karta orqali bo'lsa ustama bilan (naqdda ustama yo'q).
 */
function UsdInvoicePayModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { state, run, today } = useErp();
  const look = useLookup();
  const accounts = useAccountOptions();
  const leftUsd = invoiceOutstandingUsd(state, invoice);
  const [accountId, setAccountId] = useState(state.accounts.some((a) => a.id === "acc_bank") ? "acc_bank" : (state.accounts[0]?.id ?? ""));
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState(String(state.settings.usdRate));
  const [markup, setMarkup] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const acc = accountOf(state, accountId);
  const usdAcc = acc?.currency === "USD";
  const fx = Number(rate) || 0;
  const defMarkup = acc?.kind === "cash" ? 0 : (state.settings.usdMarkupPct ?? 2);
  const mk = markup === null ? defMarkup : Number(markup) || 0;
  const k = fx * (1 + mk / 100);
  const suggested = usdAcc ? String(leftUsd) : String(Math.round(leftUsd * k));
  const amt = amount ?? suggested;
  const value = Number(amt) || 0;
  const closesUsd = usdAcc ? value : k > 0 ? Math.round((value / k) * 100) / 100 : 0;
  const changeAccount = (id: string) => {
    setAccountId(id);
    // Valyuta yoki hisob turi o'zgarsa — summa va ustama qayta taklif qilinadi
    setAmount(null);
    setMarkup(null);
  };
  const save = () => {
    if (
      run(
        "recordClientPayment",
        [
          invoice.id,
          {
            amount: value,
            date,
            accountId,
            rate: usdAcc ? fx : undefined,
            fxRate: usdAcc ? undefined : fx,
            markupPct: usdAcc ? undefined : mk,
            note,
          },
        ],
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
      footer={<Footer onClose={onClose} onSave={save} label="Qabul qilish" disabled={!(value > 0) || !(fx > 0) || markup === ""} />}
    >
      <p className="mb-3 text-[14px] text-label2">
        Shartnoma dollarda. Faktura: <b className="text-label">${fmtUsd(invoice.usd!)}</b> · qolgan: <b className="text-label">${fmtUsd(leftUsd)}</b>. Qisman
        to'lov ham qayd etiladi.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Hisob (kassa)">
          <Select value={accountId} onChange={(e) => changeAccount(e.target.value)} options={accounts} />
        </Field>
        <Field label="Sana">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={usdAcc ? "Kurs (1 USD = so'm)" : "To'lov kunidagi kurs (1 $ = so'm)"} hint="Markaziy bank kursi; kerak bo'lsa o'zgartiring">
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        {!usdAcc && (
          <Field label="Ustama (%)" hint={acc?.kind === "cash" ? "Naqd to'lovda ustama yo'q" : "Bank/karta orqali so'mda to'lovda"}>
            <Input type="number" min={0} max={20} step={0.5} value={markup ?? String(defMarkup)} onChange={(e) => setMarkup(e.target.value)} />
          </Field>
        )}
        <Field
          label={usdAcc ? "Kelgan summa (USD)" : "Kelgan summa (so'm)"}
          className="sm:col-span-2"
          hint={usdAcc ? `≈ ${fmtMoney(value * fx)}` : `Fakturadan yopiladi: $${fmtUsd(closesUsd)}${mk ? ` (kurs ${fmtMoney(fx)} + ${mk}% ustama)` : ""}`}
        >
          <AmountInput value={amt} onValue={setAmount} placeholder="0" />
        </Field>
        <Field label="Izoh" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank o'tkazmasi / naqd / karta" />
        </Field>
      </div>
    </Modal>
  );
}

function UzsInvoicePayModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { state, run } = useErp();
  const look = useLookup();
  const left = invoiceOutstanding(state, invoice);
  const m = useMoneyFields("acc_bank").withDefault(left);
  const [note, setNote] = useState("");
  const save = () => {
    if (run("recordClientPayment", [invoice.id, { amount: m.value, date: m.date, accountId: m.accountId, rate: m.rateNum, note }], "To'lov qabul qilindi"))
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    if (run("createExtraInvoice", [{ projectId, amount: Number(amount), issueDate, dueDate, note }], "Faktura chiqarildi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Qo'shimcha xizmat uchun faktura"
      footer={<Footer onClose={onClose} onSave={save} label="Chiqarish" disabled={!Number(amount)} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Loyiha" className="sm:col-span-2">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} options={state.projects.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label="Xizmat" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Summa (so'm)">
          <AmountInput value={amount} onValue={setAmount} />
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
        "payEmployee",
        [{ userId: uid, amount: value, date: m.date, accountId: m.accountId, rate: m.rateNum, note: n, advance: kind === "advance" }],
        "To'lov qayd etildi — xodimga xabar ketdi",
      )
    )
      onClose();
  };
  return (
    <Modal open onClose={onClose} title="Xodimga to'lov" footer={<Footer onClose={onClose} onSave={save} label="To'lash" disabled={!value} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    if (run("addManualAccrual", [{ userId: uid, kind, amount: Number(amount), projectId, date, title }], "Hisoblash qo'shildi")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Bonus, jarima yoki qo'shimcha hisoblash"
      footer={<Footer onClose={onClose} onSave={save} label="Qo'shish" disabled={!Number(amount) || !title.trim()} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <AmountInput value={amount} onValue={setAmount} />
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

const NEW_VENDOR = "__new";

export function BillModal({ onClose }: { onClose: () => void }) {
  const { state, run, today } = useErp();
  const articles = state.articles.filter((a) => a.dir === "out" && (a.group === "direct" || a.group === "overhead"));
  const [vendorId, setVendorId] = useState(state.vendors[0]?.id ?? NEW_VENDOR);
  const [vendor, setVendor] = useState({ name: "", kind: "" });
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const save = () => {
    let vid = vendorId;
    if (vid === NEW_VENDOR) {
      // Yangi ta'minotchi avval ro'yxatga qo'shiladi
      const r = run("saveVendor", [{ name: vendor.name, kind: vendor.kind }]);
      if (!r) return;
      vid = r.value;
      setVendorId(vid);
    }
    if (
      run(
        "addBill",
        [{ vendorId: vid, articleId, amount: Number(amount), date, dueDate, note, projectId: projectId || undefined }],
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
      footer={<Footer onClose={onClose} onSave={save} label="Qo'shish" disabled={!Number(amount) || (vendorId === NEW_VENDOR && !vendor.name.trim())} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ta'minotchi">
          <Select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            options={[...state.vendors.map((v) => ({ value: v.id, label: v.name })), { value: NEW_VENDOR, label: "+ Yangi ta'minotchi…" }]}
          />
        </Field>
        {vendorId === NEW_VENDOR && (
          <>
            <Field label="Yangi ta'minotchi nomi">
              <Input value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} placeholder="Masalan: «Poytaxt» biznes markazi" />
            </Field>
            <Field label="Turi (ixtiyoriy)">
              <Input value={vendor.kind} onChange={(e) => setVendor({ ...vendor, kind: e.target.value })} placeholder="Ijara, internet, dastur…" />
            </Field>
          </>
        )}
        <Field label="Modda">
          <Select value={articleId} onChange={(e) => setArticleId(e.target.value)} options={articles.map((a) => ({ value: a.id, label: a.name }))} />
        </Field>
        <Field label="Summa (so'm)">
          <AmountInput value={amount} onValue={setAmount} />
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
    if (run("payBill", [bill.id, { amount: m.value, date: m.date, accountId: m.accountId, rate: m.rateNum }], "To'landi")) onClose();
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MoneyFields m={m} />
      </div>
    </Modal>
  );
}

export { WORK_LABELS };

// ---------- Hisoblar (kassa, bank, karta) ----------

/** Hisoblar ro'yxati: nomi, turi, valyutasi va tizim yuritila boshlagan kundagi qoldiq. Yangi hisob qo'shish. */
export function AccountsModal({ onClose }: { onClose: () => void }) {
  const { state, run } = useErp();
  const used = new Set(state.transactions.map((t) => t.accountId));
  const blank = { name: "", kind: "bank" as Account["kind"], currency: "UZS" as Account["currency"], opening: "" };
  const [rows, setRows] = useState(() => state.accounts.map((a) => ({ ...a, opening: String(a.opening) })));
  const [fresh, setFresh] = useState(blank);
  const kinds = [
    { value: "bank", label: "Bank hisob" },
    { value: "cash", label: "Naqd kassa" },
    { value: "card", label: "Karta" },
  ];
  const currencies = [
    { value: "UZS", label: "so'm" },
    { value: "USD", label: "USD" },
  ];
  const saveRow = (i: number) => {
    const r = rows[i]!;
    run("saveAccount", [{ id: r.id, name: r.name, kind: r.kind, currency: r.currency, opening: Number(r.opening) || 0 }], `${r.name.trim()}: saqlandi`);
  };
  const add = () => {
    const r = run("saveAccount", [{ name: fresh.name, kind: fresh.kind, currency: fresh.currency, opening: Number(fresh.opening) || 0 }], "Hisob qo'shildi");
    if (r) {
      setRows((x) => [...x, { id: r.value, name: fresh.name.trim(), kind: fresh.kind, currency: fresh.currency, opening: fresh.opening || "0" }]);
      setFresh(blank);
    }
  };
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Modal open wide onClose={onClose} title="Hisoblar: kassa, bank, karta" footer={<Button onClick={onClose}>Yopish</Button>}>
      <p className="mb-3 text-[13px] text-label2">
        «Boshlang'ich qoldiq» — tizimda ish boshlangan kundagi haqiqiy pul (bank ko'chirmasi yoki kassadagi naqd). Undan keyingi har bir kirim-chiqim tizimga
        kiritiladi.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-2 items-end gap-2 rounded-[14px] bg-fill p-2.5 sm:grid-cols-[1fr_130px_90px_160px_auto]">
            <Field label="Nomi" className="col-span-2 sm:col-span-1">
              <Input value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
            </Field>
            <Field label="Turi">
              <Select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Account["kind"] })} options={kinds} />
            </Field>
            <Field label="Valyuta">
              <Select
                value={r.currency}
                disabled={used.has(r.id)}
                onChange={(e) => set(i, { currency: e.target.value as Account["currency"] })}
                options={currencies}
              />
            </Field>
            <Field label="Boshlang'ich qoldiq">
              <AmountInput value={r.opening} onValue={(v) => set(i, { opening: v })} />
            </Field>
            <Button size="sm" onClick={() => saveRow(i)} disabled={!r.name.trim()}>
              Saqlash
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-2 items-end gap-2 rounded-[14px] border border-dashed border-sep p-2.5 sm:grid-cols-[1fr_130px_90px_160px_auto]">
          <Field label="Yangi hisob" className="col-span-2 sm:col-span-1">
            <Input value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} placeholder="Masalan: Kapitalbank hisob" />
          </Field>
          <Field label="Turi">
            <Select value={fresh.kind} onChange={(e) => setFresh({ ...fresh, kind: e.target.value as Account["kind"] })} options={kinds} />
          </Field>
          <Field label="Valyuta">
            <Select value={fresh.currency} onChange={(e) => setFresh({ ...fresh, currency: e.target.value as Account["currency"] })} options={currencies} />
          </Field>
          <Field label="Boshlang'ich qoldiq">
            <AmountInput value={fresh.opening} onValue={(v) => setFresh({ ...fresh, opening: v })} />
          </Field>
          <Button size="sm" variant="primary" onClick={add} disabled={!fresh.name.trim()}>
            Qo'shish
          </Button>
        </div>
      </div>
    </Modal>
  );
}
