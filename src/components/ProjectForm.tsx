import { useState } from "react";
import type { ProjectInput } from "../lib/actions";
import { fmtMoney } from "../lib/dates";
import { useErp, useLookup } from "../lib/store";
import { tariffLabel, tariffOf } from "../lib/tariffs";
import { Button, Field, Input, Modal, Select, Textarea, userOptions } from "./ui";

/** Shartnoma ma'lumotlari: lid → loyiha yoki qo'lda yangi loyiha. */
export function ProjectFormModal({
  initial,
  title,
  onSubmit,
  onClose,
}: {
  initial: Partial<ProjectInput>;
  title: string;
  onSubmit: (input: ProjectInput) => void;
  onClose: () => void;
}) {
  const { state, today } = useErp();
  const look = useLookup();
  const defaultTariff = () => {
    const t = state.tariffs.find((x) => x.id === "t_biznes" && x.active) ?? state.tariffs.find((x) => x.active);
    return t
      ? { tariff: tariffLabel(t), tariffId: t.id as string | undefined, monthlyFee: t.price, prepayType: t.prepayType }
      : { tariff: "Individual", tariffId: undefined, monthlyFee: 5_000_000, prepayType: 100 as const };
  };
  const [f, setF] = useState<ProjectInput>(() => ({
    name: "",
    contactName: "",
    phone: "",
    industry: "",
    links: "",
    contractNo: "",
    contractDate: today,
    ...defaultTariff(),
    prepayDueDate: today,
    remainderDueDate: "",
    marketologId: look.usersByRole("marketolog")[0]?.id ?? "",
    smmId: look.usersByRole("smm")[0]?.id ?? "",
    targetologId: look.usersByRole("targetolog")[0]?.id ?? "",
    ...initial,
  }));
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const valid = f.name.trim() && f.contractNo.trim() && f.monthlyFee > 0 && f.marketologId && f.smmId;
  const prepay = Math.round((f.monthlyFee * f.prepayType) / 100);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSubmit({ ...f, targetologId: f.targetologId || undefined })}>
            Loyiha kartasini yaratish
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loyiha nomi">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Soha">
          <Input value={f.industry} onChange={(e) => set("industry", e.target.value)} />
        </Field>
        <Field label="Kontakt shaxs">
          <Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Telefon">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Ijtimoiy tarmoq havolalari" className="sm:col-span-2">
          <Textarea rows={2} value={f.links} onChange={(e) => set("links", e.target.value)} placeholder="instagram.com/…" />
        </Field>
        <Field label="Shartnoma raqami">
          <Input value={f.contractNo} onChange={(e) => set("contractNo", e.target.value)} placeholder="SH-2026/060" />
        </Field>
        <Field label="Shartnoma sanasi">
          <Input type="date" value={f.contractDate} onChange={(e) => set("contractDate", e.target.value)} />
        </Field>
        <Field label="Tarif" hint={f.tariffId ? "Narx va oldindan to'lov tarifdan olindi — o'zgartirish mumkin" : undefined}>
          <Select
            value={f.tariffId ?? ""}
            onChange={(e) => {
              const t = tariffOf(state, e.target.value);
              setF((x) =>
                t
                  ? { ...x, tariffId: t.id, tariff: tariffLabel(t), monthlyFee: t.price, prepayType: t.prepayType }
                  : { ...x, tariffId: undefined, tariff: x.tariffId ? "Individual" : x.tariff },
              );
            }}
            options={[
              ...state.tariffs.filter((t) => t.active || t.id === f.tariffId).map((t) => ({ value: t.id, label: `${t.name} — ${fmtMoney(t.price)}` })),
              { value: "", label: "Individual shartlar" },
            ]}
          />
        </Field>
        {!f.tariffId && (
          <Field label="Tarif nomi (individual)">
            <Input value={f.tariff} onChange={(e) => set("tariff", e.target.value)} />
          </Field>
        )}
        <Field label="Oylik summa (so'm)">
          <Input type="number" min={0} step={100000} value={f.monthlyFee} onChange={(e) => set("monthlyFee", Number(e.target.value))} />
        </Field>
        <Field label="Oldindan to'lov turi" hint={`Oldindan to'lov: ${fmtMoney(prepay)}`}>
          <Select
            value={String(f.prepayType)}
            onChange={(e) => set("prepayType", Number(e.target.value) as 100 | 50)}
            options={[
              { value: "100", label: "100% oldindan" },
              { value: "50", label: "50% oldindan" },
            ]}
          />
        </Field>
        <Field label="Oldindan to'lov sanasi">
          <Input type="date" value={f.prepayDueDate} onChange={(e) => set("prepayDueDate", e.target.value)} />
        </Field>
        {f.prepayType === 50 && (
          <Field label="Qoldiq 50% to'lov sanasi" hint="Kelishilgan sana yoziladi, keyin Moliyada o'zgartirish mumkin">
            <Input type="date" value={f.remainderDueDate} onChange={(e) => set("remainderDueDate", e.target.value)} />
          </Field>
        )}
        <Field label="Mas'ul marketolog">
          <Select value={f.marketologId} onChange={(e) => set("marketologId", e.target.value)} options={userOptions(look.usersByRole("marketolog"))} />
        </Field>
        <Field label="SMM menejer">
          <Select value={f.smmId} onChange={(e) => set("smmId", e.target.value)} options={userOptions(look.usersByRole("smm"))} />
        </Field>
        <Field label="Targetolog">
          <Select
            value={f.targetologId ?? ""}
            onChange={(e) => set("targetologId", e.target.value)}
            options={userOptions(look.usersByRole("targetolog"), "— yo'q —")}
          />
        </Field>
      </div>
    </Modal>
  );
}
