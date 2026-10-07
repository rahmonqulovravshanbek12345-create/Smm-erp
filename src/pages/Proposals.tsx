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
  tariffLabel,
  tariffOf,
  tariffUsage,
  type ProposalView as PView,
} from "../lib/tariffs";
import type { Platform, Role, Tariff } from "../lib/types";
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
  const stats = useMemo(() => proposalStats(state, today, addDays(today, -182)), [state, today]);
  const usage = useMemo(() => tariffUsage(state), [state]);

  const rows = state.proposals
    .map((p) => ({
      p,
      view: proposalView(p, today),
      lead: state.leads.find((l) => l.id === p.leadId),
      t: tariffOf(state, p.acceptedTariffId ?? p.recommendedId),
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
                  columns: ["Raqam", "Sana", "Mijoz", "Tarif", "Chegirma %", "Oylik summa", "Holat", "Amal qiladi", "Rad sababi"],
                  rows: rows.map((r) => [
                    r.p.number,
                    r.p.date,
                    r.lead?.name ?? "",
                    r.t?.name ?? "",
                    r.p.discountPct,
                    r.t ? proposalPrice(r.p, r.t) : 0,
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
        <Stat icon="wallet" color="purple" label="O'rtacha shartnoma (oyiga)" value={fmtShortMoney(stats.avgAccepted)} />
        <Stat icon="clock" color="orange" label={`Javob kutilmoqda · ${stats.open} ta`} value={fmtShortMoney(stats.openValue)} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "list", label: `Takliflar (${state.proposals.length})` },
          { id: "tariffs", label: `Tariflar (${state.tariffs.filter((t) => t.active).length})` },
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
                  <th className={th}>Tarif</th>
                  <th className={thr}>Oylik summa</th>
                  <th className={th}>Holat</th>
                  <th className={th}>Tayyorladi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {rows.map(({ p, view, lead, t }) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-fill" onClick={() => navigate(`/taklif/${p.id}`)}>
                    <td className={`${td} font-semibold text-accent`}>{p.number}</td>
                    <td className={`${td} font-medium text-label`}>{lead?.name ?? "—"}</td>
                    <td className={`${td} text-label2`}>
                      {fmtDate(p.date)}
                      {view === "sent" && <div className="text-[12px] text-label3">{fmtDate(p.validUntil)} gacha</div>}
                    </td>
                    <td className={td}>
                      {t?.name ?? "—"}
                      {p.discountPct > 0 && <span className="ml-1.5 text-[12px] text-green">−{p.discountPct}%</span>}
                    </td>
                    <td className={`${tdr} font-semibold`}>{t ? fmtMoney(proposalPrice(p, t)) : "—"}</td>
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
          <div className="grid gap-4 lg:grid-cols-3">
            {state.tariffs.map((t) => {
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
                    <span className="text-[14px] text-label2">so'm / oy</span>
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
                          <b className="text-label">{u.projects.length}</b> ta faol loyiha · {fmtMoney(u.mrr)}/oy
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
                  .get("custom")
                  ?.projects.map((p) => p.name)
                  .join(", ") || "yo'q"}
              </b>
            </span>
            {canEditTariffs(me.role) && <Button onClick={() => setEditTariff("new")}>+ Yangi tarif</Button>}
          </div>
        </>
      )}
      {creating && <ProposalModal onClose={() => setCreating(false)} />}
      {editTariff && <TariffModal tariff={editTariff === "new" ? undefined : editTariff} onClose={() => setEditTariff(null)} />}
    </>
  );
}

function TariffScope({ t }: { t: Tariff }) {
  const items = [
    `${t.posts} ta post oyiga (${t.videos} video, ${t.designs} dizayn)`,
    `${t.stories} ta stories`,
    `${t.shoots} ta syomka kuni`,
    t.platforms.map((p) => PLATFORM_LABELS[p]).join(" + "),
    t.target ? `Target reklama · byudjet tavsiyasi $${fmtNum(t.adBudgetUsd)}/oy` : "Target reklamasiz",
  ];
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
  const [ids, setIds] = useState<string[]>(active.map((t) => t.id));
  const [rec, setRec] = useState(active.find((t) => t.id === "t_biznes")?.id ?? active[0]?.id ?? "");
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
              if (l) setNote(defaultProposalNote(l, state.settings.companyName));
            }}
            options={(leadId && lead ? [lead] : open).map((l) => ({ value: l.id, label: l.name }))}
          />
        </Field>
        <Field label="Amal qilish muddati">
          <Select value={days} onChange={(e) => setDays(e.target.value)} options={["3", "7", "14", "30"].map((d) => ({ value: d, label: `${d} kun` }))} />
        </Field>
      </div>
      <div className="mt-4 mb-1.5 px-1 text-[13px] font-medium text-label2">Taklifdagi paketlar va tavsiya</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {active.map((t) => {
          const on = ids.includes(t.id);
          return (
            <div key={t.id} className={`rounded-[14px] border p-3 transition ${on ? "border-accent bg-accent/5" : "border-sep"}`}>
              <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-label">
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} />
                {t.name}
              </label>
              <div className="mt-1 text-[13px] text-label2">
                {discount > 0 && <s className="mr-1 text-label3">{fmtShortMoney(t.price)}</s>}
                {fmtShortMoney(discounted(t.price, discount))} so'm/oy
              </div>
              <label className={`mt-2 flex items-center gap-2 text-[12px] ${on ? "text-label" : "text-label3"}`}>
                <input type="radio" name="rec" disabled={!on} checked={rec === t.id} onChange={() => setRec(t.id)} />
                Tavsiya etamiz
              </label>
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

function TariffModal({ tariff, onClose }: { tariff?: Tariff; onClose: () => void }) {
  const { run } = useErp();
  const [f, setF] = useState<Tariff>(
    () =>
      tariff ?? {
        id: "",
        name: "",
        tagline: "",
        price: 10_000_000,
        posts: 12,
        videos: 4,
        designs: 8,
        stories: 15,
        shoots: 1,
        platforms: ["instagram"],
        target: false,
        adBudgetUsd: 0,
        prepayType: 50,
        features: [],
        active: true,
      },
  );
  const [features, setFeatures] = useState(f.features.join("\n"));
  const set = <K extends keyof Tariff>(k: K, v: Tariff[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: "price" | "posts" | "videos" | "designs" | "stories" | "shoots" | "adBudgetUsd", label: string) => (
    <Field label={label}>
      <Input type="number" min={0} value={f[k]} onChange={(e) => set(k, Number(e.target.value) || 0)} />
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
      title={tariff ? `Tarif: ${tariff.name}` : "Yangi tarif"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.name.trim() || !f.price || f.platforms.length === 0}>
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
        {num("price", "Oylik narx (so'm)")}
        {num("posts", "Postlar oyiga")}
        {num("videos", "Shundan video")}
        {num("designs", "Shundan dizayn")}
        {num("stories", "Stories")}
        {num("shoots", "Syomka kunlari")}
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
        {num("adBudgetUsd", "Reklama byudjeti tavsiyasi ($/oy)")}
        <div className="flex flex-col justify-end gap-1.5 pb-1 text-[14px] text-label">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.target} onChange={(e) => set("target", e.target.checked)} /> Target reklama
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Faol (takliflarda chiqadi)
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 px-1 text-[14px] text-label">
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
  const [acceptId, setAcceptId] = useState(p?.recommendedId ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [contract, setContract] = useState(false);
  const stats = useMemo(() => agencyStats(state, today), [state, today]);
  const cases = useMemo(() => caseStudies(state, today), [state, today]);

  if (!p || !lead) return <Empty>Taklif topilmadi</Empty>;
  const tariffs = p.tariffIds.map((tid) => tariffOf(state, tid)).filter((t): t is Tariff => Boolean(t));
  const features = allFeatures(tariffs);
  const view = proposalView(p, today);
  const accepted = tariffOf(state, p.acceptedTariffId);
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
      (c) => act.setProposalStatus(c, p.id, status, { tariffId: acceptId, reason }),
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
              <Select
                aria-label="Qabul qilingan tarif"
                value={acceptId}
                onChange={(e) => setAcceptId(e.target.value)}
                className="!w-36 !py-1.5 !text-[13px]"
                options={tariffs.map((t) => ({ value: t.id, label: t.name }))}
              />
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
              <div className="mt-1 text-[15px] text-white/85">Ijtimoiy tarmoqlar va target reklama</div>
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

        <Card className="p-5">
          <h2 className="text-[19px] font-bold tracking-tight text-label">Paketlar</h2>
          <p className="mt-0.5 text-[13px] text-label2">Narxlar oyiga, so'mda. Reklama byudjeti alohida, to'g'ridan-to'g'ri Meta'ga sarflanadi.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr>
                  <th className="w-[34%]" />
                  {tariffs.map((t) => {
                    const recommended = t.id === p.recommendedId;
                    const chosen = accepted?.id === t.id;
                    return (
                      <th key={t.id} className={`rounded-t-[16px] px-3 pb-3 pt-4 text-left align-top font-normal ${recommended ? "bg-accent/10" : ""}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[18px] font-bold text-label">{t.name}</span>
                          {recommended && <Badge tone="blue">Tavsiya etamiz</Badge>}
                          {chosen && <Badge tone="green">Tanlandi</Badge>}
                        </div>
                        <div className="mt-1 text-[12px] leading-snug text-label2">{t.tagline}</div>
                        <div className="mt-2">
                          {p.discountPct > 0 && <s className="mr-1.5 text-[13px] text-label3">{fmtMoney(t.price)}</s>}
                          <div className="tabular whitespace-nowrap text-[22px] font-bold tracking-tight text-label">{fmtMoney(proposalPrice(p, t))}</div>
                          {p.discountPct > 0 && <div className="text-[12px] font-semibold text-green">−{p.discountPct}% chegirma</div>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Postlar oyiga", (t: Tariff) => `${t.posts} ta`],
                  ["  shundan video (Reels)", (t: Tariff) => `${t.videos} ta`],
                  ["  shundan dizayn / karusel", (t: Tariff) => `${t.designs} ta`],
                  ["Stories", (t: Tariff) => `${t.stories} ta`],
                  ["Syomka kunlari", (t: Tariff) => `${t.shoots} ta`],
                  ["Platformalar", (t: Tariff) => t.platforms.map((x) => PLATFORM_LABELS[x]).join(" + ")],
                  ["Target reklama", (t: Tariff) => (t.target ? "✓" : "—")],
                  ["Reklama byudjeti tavsiyasi", (t: Tariff) => (t.target ? `$${fmtNum(t.adBudgetUsd)}/oy` : "—")],
                  ["Oldindan to'lov", (t: Tariff) => `${t.prepayType}%`],
                ].map(([label, fn]) => (
                  <tr key={label as string}>
                    <td className={`border-t border-sep py-2 pr-3 text-label2 ${(label as string).startsWith("  ") ? "pl-4 text-[13px]" : ""}`}>
                      {(label as string).trim()}
                    </td>
                    {tariffs.map((t) => (
                      <td key={t.id} className={`border-t border-sep px-3 py-2 font-medium text-label ${t.id === p.recommendedId ? "bg-accent/10" : ""}`}>
                        {(fn as (t: Tariff) => string)(t)}
                      </td>
                    ))}
                  </tr>
                ))}
                {features.map((f, i) => (
                  <tr key={f}>
                    <td className="border-t border-sep py-2 pr-3 text-label2">{f}</td>
                    {tariffs.map((t) => (
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

        <Card className="p-5">
          <h2 className="text-[19px] font-bold tracking-tight text-label">Qanday ishlaymiz</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([t, d], i) => (
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
            <li>• Xizmat davri birinchi reklama (post) joylangan kundan hisoblanadi; har oy oxirida bajarilgan ishlar dalolatnomasi va hisobot beriladi.</li>
            <li>• Reklama byudjeti xizmat narxiga kirmaydi va Meta'ga to'g'ridan-to'g'ri sarflanadi; sarf har kuni hisobotda ko'rinadi.</li>
            <li>• Har bir post joylanishidan oldin sizning tasdig'ingizga yuboriladi.</li>
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
            tariff: tariffLabel(accepted),
            tariffId: accepted.id,
            monthlyFee: proposalPrice(p, accepted),
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
