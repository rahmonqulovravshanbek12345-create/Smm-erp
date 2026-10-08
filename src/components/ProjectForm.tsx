import { useState } from "react";
import type { ProjectInput } from "../lib/actions";
import { fmtMoney } from "../lib/dates";
import { AD_CHANNELS, SERVICE_META, adPctAmount, isRecurring, serviceHasAds, serviceLabel, serviceMeta, type ServiceInput } from "../lib/services";
import { useErp, useLookup } from "../lib/store";
import { serviceFromTariff, tariffOf, tariffService } from "../lib/tariffs";
import type { Project, ServiceKind } from "../lib/types";
import { AmountInput, Button, Field, Input, Modal, Select, Textarea, userOptions } from "./ui";

/** Xizmat tanlanganda — shu xizmatning birinchi faol paketi yoki individual shartlar. */
export function defaultService(state: ReturnType<typeof useErp>["state"], kind: ServiceKind, users: { id: string; role: string }[]): ServiceInput {
  const t =
    state.tariffs.find((x) => x.active && tariffService(x) === kind && (kind !== "smm" || x.id === "t_biznes")) ??
    state.tariffs.find((x) => x.active && tariffService(x) === kind);
  const base: ServiceInput = t ? serviceFromTariff(t) : { kind, title: "", price: 0, prepayPct: isRecurring(kind) ? undefined : 50 };
  if (!isRecurring(kind)) base.assigneeId = users.find((u) => serviceMeta(kind).assigneeRoles.includes(u.role as never))?.id;
  if (kind === "performance") base.channels = ["meta", "google"];
  return base;
}

/** Bitta xizmat qatori: paket, narx va xizmat turiga xos maydonlar. */
export function ServiceFields({
  value,
  onChange,
  onRemove,
  usdRate,
  adBudgetUsd,
}: {
  value: ServiceInput;
  onChange: (v: ServiceInput) => void;
  onRemove?: () => void;
  usdRate: number;
  adBudgetUsd?: number;
}) {
  const { state } = useErp();
  const look = useLookup();
  const meta = serviceMeta(value.kind);
  const once = !isRecurring(value.kind);
  const packs = state.tariffs.filter((t) => tariffService(t) === value.kind && (t.active || t.id === value.tariffId));
  const set = <K extends keyof ServiceInput>(k: K, v: ServiceInput[K]) => onChange({ ...value, [k]: v });
  const assignees = state.users.filter((u) => u.active && meta.assigneeRoles.includes(u.role));
  const pct = adPctAmount({ ...value, id: "", status: "active", createdAt: "" }, { adBudgetUsd } as Project, usdRate);

  return (
    <div className="rounded-[16px] bg-fill p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-label">{meta.label}</span>
          <span className="ml-2 rounded-full bg-elevated px-2 py-0.5 text-[11px] font-semibold text-label2">{once ? "Bir martalik" : "Oylik"}</span>
        </div>
        {onRemove && (
          <Button size="sm" variant="ghost" className="!text-red" onClick={onRemove}>
            Olib tashlash
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Paket">
          <Select
            value={value.tariffId ?? ""}
            onChange={(e) => {
              const t = tariffOf(state, e.target.value);
              onChange(
                t
                  ? { ...value, ...serviceFromTariff(t), assigneeId: value.assigneeId, channels: value.channels }
                  : { ...value, tariffId: undefined, title: "" },
              );
            }}
            options={[
              ...packs.map((t) => ({ value: t.id, label: `${t.name} — ${fmtMoney(t.price)}${once ? "" : "/oy"}` })),
              { value: "", label: "Individual shartlar" },
            ]}
          />
        </Field>
        {!value.tariffId && (
          <Field label="Nomi / tavsif">
            <Input value={value.title} onChange={(e) => set("title", e.target.value)} placeholder={once ? "Masalan: Landing + logo" : "Masalan: Standart"} />
          </Field>
        )}
        <Field label={once ? "Umumiy narx (so'm)" : "Oylik narx (so'm)"}>
          <AmountInput value={value.price ? String(value.price) : ""} onValue={(v) => set("price", Number(v) || 0)} placeholder="0" />
        </Field>
        {value.kind === "performance" && (
          <>
            <Field
              label="Reklama byudjetidan foiz (%)"
              hint={pct ? `Hozirgi byudjetda: +${fmtMoney(pct)}/oy` : "Byudjet kiritilsa, oylik fakturaga qo'shiladi"}
            >
              <Input type="number" min={0} max={50} value={value.adPct ?? 0} onChange={(e) => set("adPct", Number(e.target.value))} />
            </Field>
            <Field label="KPI: oyiga lidlar">
              <Input type="number" min={0} value={value.kpiLeads ?? ""} onChange={(e) => set("kpiLeads", Number(e.target.value) || undefined)} />
            </Field>
            <Field label="KPI: lid narxi (USD)">
              <Input type="number" min={0} step={0.5} value={value.kpiCpl ?? ""} onChange={(e) => set("kpiCpl", Number(e.target.value) || undefined)} />
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-[13px] font-medium text-label2">Kanallar</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {AD_CHANNELS.map((ch) => (
                  <label key={ch.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={value.channels?.includes(ch.id) ?? false}
                      onChange={(e) =>
                        set("channels", e.target.checked ? [...(value.channels ?? []), ch.id] : (value.channels ?? []).filter((x) => x !== ch.id))
                      }
                    />
                    {ch.label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {once && (
          <>
            <Field label="Oldindan to'lov" hint={`${fmtMoney(Math.round((value.price * (value.prepayPct ?? 50)) / 100))} oldindan, qolgani topshirishda`}>
              <Select
                value={String(value.prepayPct ?? 50)}
                onChange={(e) => set("prepayPct", Number(e.target.value) as 50 | 100)}
                options={[
                  { value: "50", label: "50% oldindan, 50% topshirishda" },
                  { value: "100", label: "100% oldindan" },
                ]}
              />
            </Field>
            <Field label="Ijrochi">
              <Select
                value={value.assigneeId ?? ""}
                onChange={(e) => set("assigneeId", e.target.value || undefined)}
                options={userOptions(assignees.length ? assignees : look.usersByRole(meta.assigneeRoles[0]!), "Tanlang…")}
              />
            </Field>
            <Field label="Ijrochi haqi (so'm)" hint="Topshirilganda ish haqiga avtomatik hisoblanadi">
              <AmountInput
                value={value.assigneeFee ? String(value.assigneeFee) : ""}
                onValue={(v) => set("assigneeFee", Number(v) || undefined)}
                placeholder="0"
              />
            </Field>
            <Field label="Topshirish muddati">
              <Input type="date" value={value.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || undefined)} />
            </Field>
          </>
        )}
      </div>
      {once && <p className="mt-2 text-xs text-label2">Bosqichlar: {meta.stages.join(" → ")}</p>}
    </div>
  );
}

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
  const [f, setF] = useState<ProjectInput>(() => ({
    name: "",
    contactName: "",
    phone: "",
    industry: "",
    links: "",
    contractNo: "",
    contractDate: today,
    prepayType: 50,
    prepayDueDate: today,
    remainderDueDate: "",
    marketologId: look.usersByRole("marketolog")[0]?.id ?? "",
    smmId: look.usersByRole("smm")[0]?.id ?? "",
    targetologId: look.usersByRole("targetolog")[0]?.id ?? "",
    ...initial,
    services: initial.services?.length ? initial.services : [defaultService(state, "smm", state.users)],
  }));
  const [adding, setAdding] = useState(false);
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const kinds = new Set(f.services.map((x) => x.kind));
  const hasSmm = kinds.has("smm");
  const hasAds = f.services.some(serviceHasAds);
  const recurring = f.services.filter((x) => isRecurring(x.kind));
  const usdRate = state.settings.usdRate;
  const monthly = recurring.reduce(
    (a, x) => a + x.price + adPctAmount({ ...x, id: "", status: "active", createdAt: "" }, { adBudgetUsd: f.adBudgetUsd } as Project, usdRate),
    0,
  );
  const once = f.services.filter((x) => !isRecurring(x.kind));
  const prepay = Math.round((monthly * f.prepayType) / 100);
  const servicesValid =
    f.services.length > 0 && f.services.every((x) => x.price > 0 && (isRecurring(x.kind) || x.assigneeId) && (x.tariffId || x.title.trim()));
  const valid = f.name.trim() && f.contractNo.trim() && f.marketologId && servicesValid && (!hasSmm || f.smmId) && (!hasAds || f.targetologId);

  const submit = () =>
    onSubmit({
      ...f,
      smmId: hasSmm ? f.smmId : "",
      targetologId: hasAds ? f.targetologId || undefined : undefined,
      adBudgetUsd: hasAds ? f.adBudgetUsd : undefined,
    });

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
          <Button variant="primary" disabled={!valid} onClick={submit}>
            Loyiha kartasini yaratish
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mijoz (loyiha nomi)">
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
        <Field label="Ijtimoiy tarmoq va sayt havolalari" className="sm:col-span-2">
          <Textarea rows={2} value={f.links} onChange={(e) => set("links", e.target.value)} placeholder="instagram.com/…" />
        </Field>
        <Field label="Shartnoma raqami">
          <Input value={f.contractNo} onChange={(e) => set("contractNo", e.target.value)} placeholder="SH-2026/060" />
        </Field>
        <Field label="Shartnoma sanasi">
          <Input type="date" value={f.contractDate} onChange={(e) => set("contractDate", e.target.value)} />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-label">Xizmatlar</h3>
          <span className="text-xs text-label2">
            {monthly > 0 && `Oylik: ${fmtMoney(monthly)}`}
            {monthly > 0 && once.length > 0 && " · "}
            {once.length > 0 && `Bir martalik: ${fmtMoney(once.reduce((a, x) => a + x.price, 0))}`}
          </span>
        </div>
        <div className="space-y-3">
          {f.services.map((svc, i) => (
            <ServiceFields
              key={i}
              value={svc}
              usdRate={usdRate}
              adBudgetUsd={f.adBudgetUsd}
              onChange={(v) =>
                set(
                  "services",
                  f.services.map((x, j) => (j === i ? v : x)),
                )
              }
              onRemove={
                f.services.length > 1
                  ? () =>
                      set(
                        "services",
                        f.services.filter((_, j) => j !== i),
                      )
                  : undefined
              }
            />
          ))}
        </div>
        {adding ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {SERVICE_META.filter((m) => !(isRecurring(m.id) && kinds.has(m.id))).map((m) => (
              <Button
                key={m.id}
                size="sm"
                onClick={() => {
                  set("services", [...f.services, defaultService(state, m.id, state.users)]);
                  setAdding(false);
                }}
              >
                + {m.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Bekor
            </Button>
          </div>
        ) : (
          <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
            + Xizmat qo'shish
          </Button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mas'ul marketolog">
          <Select value={f.marketologId} onChange={(e) => set("marketologId", e.target.value)} options={userOptions(look.usersByRole("marketolog"))} />
        </Field>
        {hasSmm && (
          <Field label="SMM menejer">
            <Select value={f.smmId} onChange={(e) => set("smmId", e.target.value)} options={userOptions(look.usersByRole("smm"))} />
          </Field>
        )}
        {hasAds && (
          <>
            <Field label="Targetolog">
              <Select
                value={f.targetologId ?? ""}
                onChange={(e) => set("targetologId", e.target.value)}
                options={userOptions(look.usersByRole("targetolog"), "Tanlang…")}
              />
            </Field>
            <Field label="Mijozning oylik reklama byudjeti (USD)" hint="Tranzit: xizmat narxiga kirmaydi">
              <Input type="number" min={0} value={f.adBudgetUsd ?? ""} onChange={(e) => set("adBudgetUsd", Number(e.target.value) || undefined)} />
            </Field>
          </>
        )}
        {monthly > 0 && (
          <>
            <Field label="Oylik xizmatlar: oldindan to'lov" hint={`Oldindan: ${fmtMoney(prepay)}`}>
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
          </>
        )}
        {monthly === 0 && once.length > 0 && (
          <Field label="Oldindan to'lov sanasi" hint="Bir martalik xizmatlar uchun">
            <Input type="date" value={f.prepayDueDate} onChange={(e) => set("prepayDueDate", e.target.value)} />
          </Field>
        )}
      </div>
      {!valid && (
        <p className="mt-3 text-xs text-label2">
          To'ldiring: mijoz nomi, shartnoma raqami, har xizmatning narxi{once.length ? " va ijrochisi" : ""}
          {hasSmm ? ", SMM menejer" : ""}
          {hasAds ? ", targetolog" : ""}.
        </p>
      )}
      <p className="mt-2 text-xs text-label2">
        Faqat bir martalik xizmat olgan mijozda kontent reja va oylik abonent bo'lmaydi. {[...kinds].map((k) => serviceLabel(k)).join(", ")}.
      </p>
    </Modal>
  );
}
