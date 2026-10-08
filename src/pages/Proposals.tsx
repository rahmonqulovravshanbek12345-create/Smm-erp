import { useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { ProjectFormModal } from "../components/ProjectForm";
import { A, Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Select, Stat, Tabs, Textarea, navigate } from "../components/ui";
import { ExportButton } from "../components/ExportButton";
import * as act from "../lib/actions";
import { addDays, fmtDate, fmtMoney, fmtNum } from "../lib/dates";
import { PLATFORM_LABELS } from "../lib/labels";
import { canEdit } from "../lib/permissions";
import { useErp, useLookup } from "../lib/store";
import {
  PROPOSAL_STATUS,
  agencyStats,
  allFeatures,
  caseStudies,
  defaultProposalNote,
  discounted,
  proposalPrice,
  proposalStats,
  proposalView,
  acceptedIds,
  defaultPicks,
  proposalGroups,
  proposalValue,
  servicesFromProposal,
  tariffOf,
  tariffService,
  tariffUsage,
  type ProposalView as PView,
} from "../lib/tariffs";
import { SERVICE_META, isRecurring, serviceKindOf, serviceLabel, serviceMeta } from "../lib/services";
import type { Platform, Role, ServiceKind, Tariff } from "../lib/types";
import { TableWrap, td, tdr, th, thr } from "./finance/common";

const fmtShortMoney = (n: number) => (n >= 1_000_000 ? `${fmtNum(Math.round(n / 100_000) / 10)} mln` : `${fmtNum(Math.round(n / 1000))} ming`);
export const canEditTariffs = (role: Role) => role === "admin" || role === "rahbar" || role === "marketolog";

// ---------- Ro'yxat sahifasi ----------

export function Proposals() {
  const { state, me, today } = useErp();
  const look = useLookup();
  const editable = canEdit(me.role, "crm");
  const [tab, setTab] = useState<"list" | "tariffs">(() => (window.location.hash.includes("t=tariflar") ? "tariffs" : "list"));
  const [filter, setFilter] = useState<"all" | PView>("all");
  const [creating, setCreating] = useState(false);
  const [editTariff, setEditTariff] = useState<Tariff | "new" | null>(null);
  const [kind, setKind] = useState<ServiceKind>("smm");
  const stats = useMemo(() => proposalStats(state, today, addDays(today, -182)), [state, today]);
  const usage = useMemo(() => tariffUsage(state), [state]);

  const rows = state.proposals
    .map((p) => ({
      p,
      view: proposalView(p, today),
      lead: state.leads.find((l) => l.id === p.leadId),
      names: (p.status === "accepted" ? acceptedIds(p) : defaultPicks(state, p)).map((id) => tariffOf(state, id)?.name ?? "").join(" + "),
      value: proposalValue(state, p),
    }))
    .filter((r) => filter === "all" || r.view === filter)
    .sort((a, b) => b.p.date.localeCompare(a.p.date) || b.p.number.localeCompare(a.p.number));

  return (
    <>
      <PageHeader
        title="Tariflar va takliflar"
        sub="Paketlar katalogi va mijozlarga yuborilgan tijorat takliflari"
        actions={
          <>
            <ExportButton
              filename={`takliflar-${today}`}
              sheets={() => [
                {
                  name: "Takliflar",
                  columns: ["Raqam", "Sana", "Mijoz", "Paketlar", "Chegirma %", "Summa", "Holat", "Amal qiladi", "Rad sababi"],
                  rows: rows.map((r) => [
                    r.p.number,
                    r.p.date,
                    r.lead?.name ?? "",
                    r.names,
                    r.p.discountPct,
                    r.value,
                    PROPOSAL_STATUS[r.view].label,
                    r.p.validUntil,
                    r.p.rejectReason ?? "",
                  ]),
                },
              ]}
            />
            {editable && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                + Tijorat taklifi
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="send" color="blue" label="Yuborilgan takliflar (6 oy)" value={fmtNum(stats.sent)} />
        <Stat icon="checkSeal" color="green" label={`Qabul qilindi · ${stats.accepted} ta`} value={`${(stats.winRate * 100).toFixed(0)}%`} tone="green" />
        <Stat icon="wallet" color="purple" label="O'rtacha shartnoma qiymati" value={fmtShortMoney(stats.avgAccepted)} />
        <Stat icon="clock" color="orange" label={`Javob kutilmoqda · ${stats.open} ta`} value={fmtShortMoney(stats.openValue)} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "list", label: `Takliflar (${state.proposals.length})` },
          { id: "tariffs", label: `Tariflar va paketlar (${state.tariffs.filter((t) => t.active).length})` },
        ]}
      />

      {tab === "list" ? (
        <Card>
          <CardHeader
            title="Tijorat takliflari"
            sub="Qatorni bosing — mijozga ko'rsatiladigan taklif ochiladi"
            right={
              <Select
                aria-label="Holat bo'yicha filtr"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="!w-44 !py-1.5 !text-[13px]"
                options={[
                  { value: "all", label: "Hammasi" },
                  ...(Object.keys(PROPOSAL_STATUS) as PView[]).map((k) => ({ value: k, label: PROPOSAL_STATUS[k].label })),
                ]}
              />
            }
          />
          {rows.length === 0 ? (
            <Empty>Taklif yo'q</Empty>
          ) : (
            <TableWrap min={820}>
              <thead>
                <tr className="border-y border-sep">
                  <th className={th}>Raqam</th>
                  <th className={th}>Mijoz</th>
                  <th className={th}>Sana</th>
                  <th className={th}>Paketlar</th>
                  <th className={thr}>Summa</th>
                  <th className={th}>Holat</th>
                  <th className={th}>Tayyorladi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {rows.map(({ p, view, lead, names, value }) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-fill" onClick={() => navigate(`/taklif/${p.id}`)}>
                    <td className={`${td} font-semibold text-accent`}>{p.number}</td>
                    <td className={`${td} font-medium text-label`}>{lead?.name ?? "—"}</td>
                    <td className={`${td} text-label2`}>
                      {fmtDate(p.date)}
                      {view === "sent" && <div className="text-[12px] text-label3">{fmtDate(p.validUntil)} gacha</div>}
                    </td>
                    <td className={td}>
                      {names || "—"}
                      {p.discountPct > 0 && <span className="ml-1.5 text-[12px] text-green">−{p.discountPct}%</span>}
                    </td>
                    <td className={`${tdr} font-semibold`}>{value ? fmtMoney(value) : "—"}</td>
                    <td className={td}>
                      <Badge tone={PROPOSAL_STATUS[view].tone}>{PROPOSAL_STATUS[view].label}</Badge>
                      {p.rejectReason && <div className="mt-0.5 max-w-[220px] truncate text-[12px] text-label3">{p.rejectReason}</div>}
                    </td>
                    <td className={`${td} text-label2`}>{look.userName(p.createdBy)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      ) : (
        <>
          <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-[14px] bg-fill p-1" role="tablist" aria-label="Xizmatlar">
            {SERVICE_META.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={kind === m.id}
                onClick={() => setKind(m.id)}
                className={`shrink-0 rounded-[11px] px-3.5 py-1.5 text-[13px] font-semibold transition ${kind === m.id ? "bg-elevated text-label shadow-sm" : "text-label2"}`}
              >
                {m.label} <span className="text-label3">{state.tariffs.filter((t) => tariffService(t) === m.id && t.active).length}</span>
              </button>
            ))}
          </div>
          <p className="mb-3 px-1 text-[13px] text-label2">
            {serviceMeta(kind).hint}. {isRecurring(kind) ? "Oylik to'lov, oldindan." : "Bir martalik: bosqichlar bilan, odatda 50% oldindan, 50% topshirishda."}{" "}
            Narxlar — namuna, «Tahrirlash» orqali o'zgartiriladi.
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {state.tariffs
              .filter((t) => tariffService(t) === kind)
              .map((t) => {
                const u = usage.get(t.id);
                return (
                  <Card key={t.id} className={`flex flex-col p-5 ${t.active ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[20px] font-bold tracking-tight text-label">{t.name}</div>
                        <div className="mt-0.5 text-[13px] text-label2">{t.tagline}</div>
                      </div>
                      {!t.active && <Badge>arxivda</Badge>}
                    </div>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="tabular text-[30px] font-bold tracking-tight text-label">{fmtShortMoney(t.price)}</span>
                      <span className="text-[14px] text-label2">{isRecurring(kind) ? "so'm / oy" : "so'm"}</span>
                    </div>
                    <TariffScope t={t} />
                    <ul className="mt-3 space-y-1.5 text-[13px]">
                      {t.features.map((f) => (
                        <li key={f} className="flex gap-2 text-label">
                          <Icon name="check" size={15} className="mt-0.5 shrink-0 text-green" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-4">
                      <div className="rounded-[12px] bg-fill px-3 py-2 text-[13px] text-label2">
                        {u ? (
                          <>
                            <b className="text-label">{u.projects.length}</b> ta faol loyiha · {fmtMoney(u.mrr)}
                            {isRecurring(kind) ? "/oy" : ""}
                          </>
                        ) : (
                          "Hali loyiha yo'q"
                        )}
                      </div>
                      {canEditTariffs(me.role) && (
                        <Button className="mt-3 w-full" onClick={() => setEditTariff(t)}>
                          Tahrirlash
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-fill px-4 py-3 text-[13px] text-label2">
            <span>
              Individual shartlardagi loyihalar:{" "}
              <b className="text-label">
                {usage
                  .get(`custom:${kind}`)
                  ?.projects.map((p) => p.name)
                  .join(", ") || "yo'q"}
              </b>
            </span>
            {canEditTariffs(me.role) && <Button onClick={() => setEditTariff("new")}>+ Yangi paket</Button>}
          </div>
        </>
      )}
      {creating && <ProposalModal onClose={() => setCreating(false)} />}
      {editTariff && <TariffModal tariff={editTariff === "new" ? undefined : editTariff} service={kind} onClose={() => setEditTariff(null)} />}
    </>
  );
}

function TariffScope({ t }: { t: Tariff }) {
  const kind = tariffService(t);
  const items =
    kind === "smm"
      ? [
          `${t.posts} ta post oyiga (${t.videos} video, ${t.designs} dizayn${t.texts ? `, ${t.texts} matn` : ""})`,
          `${t.stories} ta stories`,
          `${t.shoots} ta syomka kuni`,
          t.platforms.map((p) => PLATFORM_LABELS[p]).join(" + "),
          t.target ? `Target reklama · byudjet tavsiyasi $${fmtNum(t.adBudgetUsd)}/oy` : "Target reklamasiz",
          ...(t.target && t.targetVideos ? [`${t.targetVideos} ta alohida reklama videosi oyiga`] : []),
        ]
      : kind === "target" || kind === "performance"
        ? [
            `Reklama byudjeti tavsiyasi $${fmtNum(t.adBudgetUsd)}/oy (alohida, tranzit)`,
            ...(t.adPct ? [`+ reklama byudjetidan ${t.adPct}%`] : []),
            `Oldindan to'lov ${t.prepayType}%`,
          ]
        : [`${t.prepayType}% oldindan, ${100 - t.prepayType}% topshirishda`, `Bosqichlar: ${serviceMeta(kind).stages.length} ta`];
  return (
    <div className="mt-3 space-y-1 border-y border-sep py-3 text-[13px] text-label">
      {items.map((x) => (
        <div key={x}>{x}</div>
      ))}
    </div>
  );
}

// ---------- Taklif yaratish ----------

export function ProposalModal({ leadId, onClose }: { leadId?: string; onClose: () => void }) {
  const { state, run } = useErp();
  const open = state.leads.filter((l) => !["contract", "unfit", "lowquality"].includes(l.stage)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = state.tariffs.filter((t) => t.active);
  const [lid, setLid] = useState(leadId ?? open[0]?.id ?? "");
  const lead = state.leads.find((l) => l.id === lid);
  /** Lid qiziqqan xizmat paketlari oldindan belgilanadi. */
  const preset = (l?: typeof lead) => {
    const kind = serviceKindOf(l?.service);
    const list = active.filter((t) => tariffService(t) === kind);
    const rec = list.find((t) => t.id === "t_biznes") ?? list[Math.floor((list.length - 1) / 2)] ?? active[0];
    return { ids: list.map((t) => t.id), rec: rec?.id ?? "" };
  };
  const [ids, setIds] = useState<string[]>(() => preset(lead).ids);
  const [rec, setRec] = useState(() => preset(lead).rec);
  const [discount, setDiscount] = useState(0);
  const [days, setDays] = useState("7");
  const [note, setNote] = useState(() => (lead ? defaultProposalNote(lead, state.settings.companyName) : ""));

  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const submit = () => {
    let id = "";
    const ok = run((c) => {
      id = act.createProposal(c, {
        leadId: lid,
        tariffIds: active.filter((t) => ids.includes(t.id)).map((t) => t.id),
        recommendedId: rec,
        discountPct: discount,
        validDays: Number(days),
        note,
      });
    }, "Tijorat taklifi tayyor");
    if (ok) {
      onClose();
      navigate(`/taklif/${id}`);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Tijorat taklifi"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={submit} disabled={!lid || ids.length === 0 || !ids.includes(rec)}>
            Taklifni tayyorlash
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mijoz (lid)">
          <Select
            value={lid}
            disabled={Boolean(leadId)}
            onChange={(e) => {
              setLid(e.target.value);
              const l = state.leads.find((x) => x.id === e.target.value);
              if (l) {
                setNote(defaultProposalNote(l, state.settings.companyName));
                setIds(preset(l).ids);
                setRec(preset(l).rec);
              }
            }}
            options={(leadId && lead ? [lead] : open).map((l) => ({ value: l.id, label: l.name }))}
          />
        </Field>
        <Field label="Amal qilish muddati">
          <Select value={days} onChange={(e) => setDays(e.target.value)} options={["3", "7", "14", "30"].map((d) => ({ value: d, label: `${d} kun` }))} />
        </Field>
      </div>
      <div className="mt-4 mb-1.5 px-1 text-[13px] font-medium text-label2">
        Taklifdagi paketlar va tavsiya (bir nechta xizmatni birga taklif qilish mumkin)
      </div>
      <div className="space-y-3">
        {SERVICE_META.map((m) => {
          const list = active.filter((t) => tariffService(t) === m.id);
          if (!list.length) return null;
          return (
            <div key={m.id}>
              <div className="mb-1 px-1 text-[12px] font-semibold uppercase tracking-wider text-label3">{m.label}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {list.map((t) => {
                  const on = ids.includes(t.id);
                  return (
                    <div key={t.id} className={`rounded-[14px] border p-3 transition ${on ? "border-accent bg-accent/5" : "border-sep"}`}>
                      <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-label">
                        <input type="checkbox" checked={on} onChange={() => toggle(t.id)} />
                        {t.name}
                      </label>
                      <div className="mt-1 text-[13px] text-label2">
                        {discount > 0 && <s className="mr-1 text-label3">{fmtShortMoney(t.price)}</s>}
                        {fmtShortMoney(discounted(t.price, discount))} so'm{isRecurring(m.id) ? "/oy" : ""}
                      </div>
                      <label className={`mt-2 flex items-center gap-2 text-[12px] ${on ? "text-label" : "text-label3"}`}>
                        <input type="radio" name="rec" disabled={!on} checked={rec === t.id} onChange={() => setRec(t.id)} />
                        Tavsiya etamiz
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Chegirma, %" hint="0–50">
          <Input type="number" min={0} max={50} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
        </Field>
        <Field label="Mijozga murojaat">
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Tarif tahriri ----------

function TariffModal({ tariff, service, onClose }: { tariff?: Tariff; service: ServiceKind; onClose: () => void }) {
  const { run } = useErp();
  const [f, setF] = useState<Tariff>(
    () =>
      tariff ?? {
        id: "",
        service,
        name: "",
        tagline: "",
        price: 10_000_000,
        posts: service === "smm" ? 12 : 0,
        videos: service === "smm" ? 4 : 0,
        designs: service === "smm" ? 8 : 0,
        stories: service === "smm" ? 15 : 0,
        shoots: service === "smm" ? 1 : 0,
        platforms: service === "smm" ? ["instagram"] : [],
        target: service === "target" || service === "performance",
        adBudgetUsd: 0,
        prepayType: isRecurring(service) ? 100 : 50,
        features: [],
        active: true,
      },
  );
  const kind = tariffService(f);
  const smm = kind === "smm";
  const [features, setFeatures] = useState(f.features.join("\n"));
  const set = <K extends keyof Tariff>(k: K, v: Tariff[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: "price" | "posts" | "videos" | "designs" | "texts" | "stories" | "shoots" | "targetVideos" | "adBudgetUsd" | "adPct", label: string) => (
    <Field label={label}>
      <Input type="number" min={0} value={f[k] ?? 0} onChange={(e) => set(k, Number(e.target.value) || 0)} />
    </Field>
  );
  const togglePlatform = (p: Platform) => set("platforms", f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p]);
  const save = () => {
    const ok = run(
      (c) =>
        act.saveTariff(c, {
          ...f,
          features: features
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      "Tarif saqlandi",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={tariff ? `${serviceLabel(kind)}: ${tariff.name}` : `Yangi paket — ${serviceLabel(kind)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.name.trim() || !f.price || (smm && f.platforms.length === 0)}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nomi">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Qisqa tavsif" className="sm:col-span-2">
          <Input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        {num("price", isRecurring(kind) ? "Oylik narx (so'm)" : "Narx (so'm)")}
        {smm && (
          <>
            {num("videos", "Video oyiga")}
            {num("designs", "Dizayn oyiga")}
            {num("texts", "Matnli post oyiga")}
            {num("stories", "Stories")}
            {num("shoots", "Syomka kunlari")}
            {f.target && num("targetVideos", "Target uchun reklama videosi oyiga")}
          </>
        )}
        {kind === "performance" && num("adPct", "Reklama byudjetidan foiz (%)")}
        <Field label="Oldindan to'lov">
          <Select
            value={String(f.prepayType)}
            onChange={(e) => set("prepayType", Number(e.target.value) as 50 | 100)}
            options={[
              { value: "50", label: "50% oldindan" },
              { value: "100", label: "100% oldindan" },
            ]}
          />
        </Field>
        {(smm || f.target) && num("adBudgetUsd", "Reklama byudjeti tavsiyasi ($/oy)")}
        <div className="flex flex-col justify-end gap-1.5 pb-1 text-[14px] text-label">
          {smm && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.target} onChange={(e) => set("target", e.target.checked)} /> Target reklama
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Faol (takliflarda chiqadi)
          </label>
        </div>
      </div>
      <div className={`mt-3 flex flex-wrap gap-4 px-1 text-[14px] text-label ${smm ? "" : "hidden"}`}>
        {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
          <label key={p} className="flex items-center gap-2">
            <input type="checkbox" checked={f.platforms.includes(p)} onChange={() => togglePlatform(p)} /> {PLATFORM_LABELS[p]}
          </label>
        ))}
      </div>
      <Field label="Tarkibi (har qatorga bittadan)" className="mt-3">
        <Textarea rows={6} value={features} onChange={(e) => setFeatures(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ---------- Mijozga ko'rsatiladigan taklif ----------

const STEPS = [
  ["Brif va strategiya", "Biznesingiz, mijozlaringiz va raqobatchilarni o'rganamiz, kontent strategiyasini tuzamiz"],
  ["Kontent reja", "Oylik reja: mavzu, format, sana. Siz tasdiqlaysiz — keyin ishlab chiqarishga o'tadi"],
  ["Syomka, montaj, dizayn", "O'z jamoamiz: operator, montajyor, dizayner. Har bir ish ichki tekshiruvdan o'tadi"],
  ["Sizning tasdig'ingiz", "Har bir post joylanishidan oldin sizga yuboriladi"],
  ["Joylash va reklama", "Belgilangan kunda joylaymiz, target reklamani har kuni nazorat qilamiz"],
  ["Oylik hisobot", "Postlar, qamrov, lidlar, bitta lid narxi va keyingi oy rejasi"],
];

export function ProposalPage({ id }: { id: string }) {
  const { state, me, today, run, showToast } = useErp();
  const p = state.proposals.find((x) => x.id === id);
  const lead = p ? state.leads.find((l) => l.id === p.leadId) : undefined;
  const editable = canEdit(me.role, "crm");
  const [picks, setPicks] = useState<string[]>(() => (p ? defaultPicks(state, p) : []));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [contract, setContract] = useState(false);
  const stats = useMemo(() => agencyStats(state, today), [state, today]);
  const cases = useMemo(() => caseStudies(state, today), [state, today]);

  if (!p || !lead) return <Empty>Taklif topilmadi</Empty>;
  const tariffs = p.tariffIds.map((tid) => tariffOf(state, tid)).filter((t): t is Tariff => Boolean(t));
  const groups = proposalGroups(state, p);
  const view = proposalView(p, today);
  const accepted = tariffOf(state, p.acceptedTariffId);
  const chosen = new Set(acceptedIds(p));
  const hasSmm = groups.some((g) => g.kind === "smm");
  const firstOnce = groups.find((g) => !isRecurring(g.kind));
  const r = state.settings.requisites;
  const author = state.users.find((u) => u.id === p.createdBy);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Havola nusxalandi");
    } catch {
      showToast("⚠ Nusxalab bo'lmadi — manzil satridan oling");
    }
  };
  const decide = (status: "sent" | "accepted" | "rejected") => {
    const ok = run(
      (c) => act.setProposalStatus(c, p.id, status, { tariffIds: picks.filter(Boolean), reason }),
      status === "sent" ? "Yuborildi deb belgilandi" : status === "accepted" ? "Qabul qilindi — operator, marketolog va rahbarga xabar ketdi" : "Rad etildi",
    );
    if (ok) setRejecting(false);
  };

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <A href="/takliflar" className="text-[13px] font-semibold text-accent">
          ← Takliflar
        </A>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PROPOSAL_STATUS[view].tone}>{PROPOSAL_STATUS[view].label}</Badge>
          {editable && p.status === "draft" && (
            <Button variant="primary" onClick={() => decide("sent")}>
              <Icon name="send" size={15} /> Yuborildi deb belgilash
            </Button>
          )}
          {editable && p.status === "sent" && (
            <>
              {groups.map((g, gi) => (
                <Select
                  key={g.kind}
                  aria-label={`Qabul qilingan paket: ${g.label}`}
                  value={picks[gi] ?? ""}
                  onChange={(e) => setPicks(picks.map((x, j) => (j === gi ? e.target.value : x)))}
                  className="!w-auto !py-1.5 !text-[13px]"
                  options={[
                    ...g.tariffs.map((t) => ({ value: t.id, label: `${g.label.split(" ")[0]}: ${t.name}` })),
                    { value: "", label: `${g.label.split(" ")[0]}: olmadi` },
                  ]}
                />
              ))}
              <Button variant="primary" onClick={() => decide("accepted")}>
                ✓ Qabul qildi
              </Button>
              <Button onClick={() => setRejecting(true)}>Rad etdi</Button>
            </>
          )}
          {editable && p.status === "accepted" && !lead.projectId && (
            <Button variant="primary" onClick={() => setContract(true)}>
              Shartnoma → loyiha kartasi
            </Button>
          )}
          {lead.projectId && (
            <A href={`/loyiha/${lead.projectId}`} className="text-[13px] font-semibold text-accent">
              Loyihani ochish →
            </A>
          )}
          <Button onClick={copyLink}>
            <Icon name="link" size={15} /> Havola
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Icon name="upload" size={15} /> PDF / chop etish
          </Button>
        </div>
      </div>

      <div className="print-area mx-auto max-w-[1000px] space-y-4">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#5856D6] via-[#AF52DE] to-[#FF2D55] p-6 text-white shadow-float sm:p-8">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75">
                {state.settings.companyName} · tijorat taklifi № {p.number}
              </div>
              <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">«{lead.name}» uchun</h1>
              <div className="mt-1 text-[15px] text-white/85">{groups.map((g) => g.label).join(" · ")}</div>
            </div>
            <div className="text-[13px] text-white/85 sm:text-right">
              <div>Sana: {fmtDate(p.date)}</div>
              <div>Amal qiladi: {fmtDate(p.validUntil)} gacha</div>
              {author && <div className="mt-1">Tayyorladi: {author.name}</div>}
            </div>
          </div>
        </div>

        {p.note && (
          <Card className="p-5">
            <p className="text-[15px] leading-relaxed text-label">{p.note}</p>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { v: fmtNum(stats.clients), l: "faol mijoz" },
            { v: fmtNum(stats.posts), l: "post joylandi (6 oy)" },
            { v: fmtNum(stats.leads), l: "lid reklamadan (6 oy)" },
            { v: fmtShortMoney(stats.cpl), l: "o'rtacha lid narxi, so'm" },
          ].map((k) => (
            <Card key={k.l} className="p-4">
              <div className="tabular text-[26px] font-bold tracking-tight text-label">{k.v}</div>
              <div className="text-[13px] text-label2">{k.l}</div>
            </Card>
          ))}
        </div>

        {groups.map((g) => {
          const features = allFeatures(g.tariffs);
          const once = !isRecurring(g.kind);
          const rows: [string, (t: Tariff) => string][] =
            g.kind === "smm"
              ? [
                  ["Postlar oyiga", (t) => `${t.posts} ta`],
                  ["  shundan video (Reels)", (t) => `${t.videos} ta`],
                  ["  shundan dizayn / karusel", (t) => `${t.designs} ta`],
                  ...(g.tariffs.some((t) => t.texts)
                    ? ([["  shundan matnli post", (t: Tariff) => `${t.texts ?? 0} ta`]] as [string, (t: Tariff) => string][])
                    : []),
                  ["Stories", (t) => `${t.stories} ta`],
                  ["Syomka kunlari", (t) => `${t.shoots} ta`],
                  ["Platformalar", (t) => t.platforms.map((x) => PLATFORM_LABELS[x]).join(" + ")],
                  ["Target reklama", (t) => (t.target ? "✓" : "—")],
                  ["  reklama videolari oyiga", (t) => (t.target && t.targetVideos ? `${t.targetVideos} ta` : "—")],
                  ["Reklama byudjeti tavsiyasi", (t) => (t.target ? `$${fmtNum(t.adBudgetUsd)}/oy` : "—")],
                  ["Oldindan to'lov", (t) => `${t.prepayType}%`],
                ]
              : g.kind === "target" || g.kind === "performance"
                ? [
                    ["Reklama byudjeti tavsiyasi", (t) => `$${fmtNum(t.adBudgetUsd)}/oy`],
                    ...(g.kind === "performance"
                      ? ([["Byudjetdan foiz", (t: Tariff) => (t.adPct ? `${t.adPct}%` : "—")]] as [string, (t: Tariff) => string][])
                      : []),
                    ["Oldindan to'lov", (t) => `${t.prepayType}%`],
                  ]
                : [["To'lov", (t) => `${t.prepayType}% oldindan, ${100 - t.prepayType}% topshirishda`]];
          return (
            <Card key={g.kind} className="p-5">
              <h2 className="text-[19px] font-bold tracking-tight text-label">{groups.length > 1 ? `${g.label}: paketlar` : "Paketlar"}</h2>
              <p className="mt-0.5 text-[13px] text-label2">
                {once
                  ? `Narx bir martalik, so'mda. Ish bosqichlari: ${serviceMeta(g.kind).stages.join(" → ")}.`
                  : `Narxlar oyiga, so'mda.${g.kind !== "smm" || g.tariffs.some((t) => t.target) ? " Reklama byudjeti alohida, to'g'ridan-to'g'ri reklama tizimiga sarflanadi." : ""}`}
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[14px]">
                  <thead>
                    <tr>
                      <th className="w-[34%]" />
                      {g.tariffs.map((t) => {
                        const recommended = t.id === p.recommendedId;
                        return (
                          <th key={t.id} className={`rounded-t-[16px] px-3 pb-3 pt-4 text-left align-top font-normal ${recommended ? "bg-accent/10" : ""}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[18px] font-bold text-label">{t.name}</span>
                              {recommended && <Badge tone="blue">Tavsiya etamiz</Badge>}
                              {chosen.has(t.id) && <Badge tone="green">Tanlandi</Badge>}
                            </div>
                            <div className="mt-1 text-[12px] leading-snug text-label2">{t.tagline}</div>
                            <div className="mt-2">
                              {p.discountPct > 0 && <s className="mr-1.5 text-[13px] text-label3">{fmtMoney(t.price)}</s>}
                              <div className="tabular whitespace-nowrap text-[22px] font-bold tracking-tight text-label">
                                {fmtMoney(proposalPrice(p, t))}
                                {!once && <span className="text-[13px] font-semibold text-label2"> /oy</span>}
                              </div>
                              {p.discountPct > 0 && <div className="text-[12px] font-semibold text-green">−{p.discountPct}% chegirma</div>}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, fn]) => (
                      <tr key={label}>
                        <td className={`border-t border-sep py-2 pr-3 text-label2 ${label.startsWith("  ") ? "pl-4 text-[13px]" : ""}`}>{label.trim()}</td>
                        {g.tariffs.map((t) => (
                          <td key={t.id} className={`border-t border-sep px-3 py-2 font-medium text-label ${t.id === p.recommendedId ? "bg-accent/10" : ""}`}>
                            {fn(t)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {features.map((f, i) => (
                      <tr key={f}>
                        <td className="border-t border-sep py-2 pr-3 text-label2">{f}</td>
                        {g.tariffs.map((t) => (
                          <td
                            key={t.id}
                            className={`border-t border-sep px-3 py-2 ${t.id === p.recommendedId ? "bg-accent/10" : ""} ${i === features.length - 1 ? "rounded-b-[16px]" : ""}`}
                          >
                            {t.features.includes(f) ? <Icon name="check" size={17} className="text-green" /> : <span className="text-label3">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}

        <Card className="p-5">
          <h2 className="text-[19px] font-bold tracking-tight text-label">Qanday ishlaymiz</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(hasSmm || !firstOnce
              ? STEPS
              : serviceMeta(firstOnce.kind).stages.map((st) => [st, "Har bosqich tugagach sizga ko'rsatamiz va tasdig'ingizni olamiz"])
            ).map(([t, d], i) => (
              <div key={t} className="flex gap-3 rounded-[16px] bg-fill p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-white">{i + 1}</span>
                <div>
                  <div className="text-[14px] font-semibold text-label">{t}</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-label2">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {cases.length > 0 && (
          <Card className="p-5">
            <h2 className="text-[19px] font-bold tracking-tight text-label">Mijozlarimiz natijalari</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {cases.map((c) => {
                const drop = c.cplFrom ? ((c.cplTo - c.cplFrom) / c.cplFrom) * 100 : 0;
                return (
                  <div key={c.project.id} className="rounded-[16px] border border-sep p-4">
                    <div className="text-[15px] font-semibold text-label">{c.project.name}</div>
                    <div className="text-[12px] text-label3">
                      {c.project.industry} · {c.months} oy birga
                    </div>
                    <div className="mt-3 tabular text-[24px] font-bold tracking-tight text-label">{fmtNum(c.leadsPerMonth)}</div>
                    <div className="text-[13px] text-label2">lid oxirgi oyda</div>
                    <div className="mt-2 text-[13px] text-label">
                      Lid narxi: {fmtShortMoney(c.cplFrom)} → <b>{fmtShortMoney(c.cplTo)}</b>
                      {Math.abs(drop) >= 1 && (
                        <span className={`ml-1 font-semibold ${drop < 0 ? "text-green" : "text-orange"}`}>
                          ({drop > 0 ? "+" : "−"}
                          {Math.abs(drop).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-[19px] font-bold tracking-tight text-label">Shartlar</h2>
          <ul className="mt-3 space-y-1.5 text-[14px] text-label">
            <li>• Ish oldindan to'lovdan keyin boshlanadi ({[...new Set(tariffs.map((t) => `${t.name} — ${t.prepayType}%`))].join(", ")}).</li>
            {groups.some((g) => isRecurring(g.kind)) && (
              <li>• Xizmat davri birinchi reklama (post) joylangan kundan hisoblanadi; har oy oxirida bajarilgan ishlar dalolatnomasi va hisobot beriladi.</li>
            )}
            {groups.some((g) => !isRecurring(g.kind)) && (
              <li>• Bir martalik ishlar bosqichma-bosqich bajariladi; qoldiq to'lov ish topshirilganda, dalolatnoma bilan amalga oshiriladi.</li>
            )}
            {groups.some((g) => g.kind !== "smm" && isRecurring(g.kind)) || tariffs.some((t) => t.target) ? (
              <li>• Reklama byudjeti xizmat narxiga kirmaydi va reklama tizimiga to'g'ridan-to'g'ri sarflanadi; sarf har kuni hisobotda ko'rinadi.</li>
            ) : null}
            {hasSmm && <li>• Har bir post joylanishidan oldin sizning tasdig'ingizga yuboriladi.</li>}
            <li>
              • Taklif <b>{fmtDate(p.validUntil)}</b> gacha amal qiladi.
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-sep pt-4 text-[13px] text-label2">
            <div>
              <div className="font-semibold text-label">{state.settings.companyName}</div>
              <div>{r.address}</div>
              <div>Tel: {r.phone}</div>
            </div>
            <div className="text-right">
              <div>Hurmat bilan,</div>
              <div className="font-semibold text-label">{r.director}, direktor</div>
            </div>
          </div>
        </Card>
      </div>

      {rejecting && (
        <Modal
          open
          onClose={() => setRejecting(false)}
          title={`${lead.name}: taklif rad etildi`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Bekor qilish
              </Button>
              <Button variant="primary" onClick={() => decide("rejected")} disabled={!reason.trim()}>
                Saqlash
              </Button>
            </>
          }
        >
          <Field label="Sabab (majburiy)">
            <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: narx qimmat deb hisobladi" />
          </Field>
        </Modal>
      )}
      {contract && accepted && (
        <ProjectFormModal
          title={`Shartnoma: ${lead.name} → Loyiha kartasi`}
          initial={{
            name: lead.name,
            phone: lead.phone,
            contactName: lead.name,
            services: servicesFromProposal(state, p),
            prepayType: accepted.prepayType,
            ...(lead.meeting ? { marketologId: lead.meeting.marketologId } : {}),
          }}
          onClose={() => setContract(false)}
          onSubmit={(input) => {
            let pid = "";
            const ok = run((c) => {
              pid = act.createProject(c, input, lead.id);
            }, "Loyiha kartasi yaratildi, moliyaga oldindan to'lov uchun xabar ketdi");
            if (ok) {
              setContract(false);
              navigate(`/loyiha/${pid}`);
            }
          }}
        />
      )}
    </>
  );
}
