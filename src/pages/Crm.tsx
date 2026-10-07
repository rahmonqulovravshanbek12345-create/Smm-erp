import { useMemo, useState } from "react";
import { ProjectFormModal } from "../components/ProjectForm";
import { A, Badge, Banner, Button, Field, Input, Modal, PageHeader, Select, Textarea, navigate, userOptions } from "../components/ui";
import * as act from "../lib/actions";
import { fmtDate, fmtDateShort, fmtDateTime, relDays } from "../lib/dates";
import { LEAD_SOURCES, LEAD_STAGES, SERVICES, leadStageMeta } from "../lib/labels";
import { canEdit } from "../lib/permissions";
import { useErp, useLookup } from "../lib/store";
import type { Lead, LeadStage } from "../lib/types";

type Pending = { leadId: string; stage: LeadStage } | null;

export function Crm() {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const [q, setQ] = useState("");
  const [op, setOp] = useState(me.role === "operator" ? me.id : "");
  const [openLead, setOpenLead] = useState<string | "new" | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const editable = canEdit(me.role, "crm");

  const leads = useMemo(
    () =>
      state.leads.filter(
        (l) => (!op || l.operatorId === op) && (!q || `${l.name} ${l.phone} ${l.service}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [state.leads, op, q],
  );

  /** Bosqich o'zgarishi: qo'shimcha ma'lumot kerak bo'lsa dialog ochiladi. */
  const requestStage = (leadId: string, stage: LeadStage) => {
    const l = state.leads.find((x) => x.id === leadId);
    if (!l || l.stage === stage || !editable) return;
    if (l.stage === "contract") return;
    if (["meeting", "unfit", "lowquality", "contract"].includes(stage)) setPending({ leadId, stage });
    else run((c) => act.moveLead(c, leadId, stage), `Bosqich: ${leadStageMeta(stage).label}`);
  };

  return (
    <>
      <PageHeader
        title="CRM — lidlar varonkasi"
        sub="Lid → qo'ng'iroq → uchrashuv → shartnoma. Kartani ustunlar orasida sudrab o'tkazing."
        actions={
          editable && (
            <Button variant="primary" onClick={() => setOpenLead("new")}>
              + Yangi lid
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Qidirish: ism, telefon…" value={q} onChange={(e) => setQ(e.target.value)} className="!w-64" />
        <Select
          value={op}
          onChange={(e) => setOp(e.target.value)}
          className="!w-56"
          options={userOptions(look.usersByRole("operator"), "Barcha operatorlar")}
        />
      </div>

      <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {LEAD_STAGES.map((st) => {
          const col = leads.filter((l) => l.stage === st.id);
          return (
            <div
              key={st.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(st.id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                requestStage(e.dataTransfer.getData("text/plain"), st.id);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-xl border bg-ink-900/60 transition ${
                dragOver === st.id ? "border-signal-500/50" : "border-white/[0.07]"
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
                <Badge tone={st.tone}>{st.label}</Badge>
                <span className="text-xs text-mist-400">{col.length}</span>
              </div>
              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {col.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    draggable={editable && l.stage !== "contract"}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                    onClick={() => setOpenLead(l.id)}
                    className="rounded-lg border border-white/[0.07] bg-ink-800/80 p-2.5 text-left transition hover:border-white/20"
                  >
                    <div className="text-sm font-medium text-white">{l.name}</div>
                    <div className="mt-0.5 text-xs text-mist-400">{l.phone}</div>
                    <div className="mt-1.5 text-xs text-mist-300">{l.service}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge>{l.source}</Badge>
                      {l.meeting && l.stage === "meeting" && (
                        <Badge tone="violet">
                          {fmtDateShort(l.meeting.date)} {l.meeting.time}
                        </Badge>
                      )}
                      {l.nextContactDate && !["contract", "unfit", "lowquality"].includes(l.stage) && (
                        <Badge tone={l.nextContactDate <= today ? "amber" : "gray"}>☎ {relDays(l.nextContactDate, today)}</Badge>
                      )}
                    </div>
                    {l.rejectReason && <div className="mt-1.5 text-[11px] text-red-300">Sabab: {l.rejectReason}</div>}
                    <div className="mt-1.5 text-[11px] text-mist-400">{look.userName(l.operatorId)}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openLead && (
        <LeadModal
          lead={openLead === "new" ? undefined : state.leads.find((l) => l.id === openLead)}
          onClose={() => setOpenLead(null)}
          onStage={(id, stage) => requestStage(id, stage)}
        />
      )}
      {pending && <StageDialog pending={pending} onClose={() => setPending(null)} />}
    </>
  );
}

function LeadModal({ lead, onClose, onStage }: { lead?: Lead; onClose: () => void; onStage: (id: string, s: LeadStage) => void }) {
  const { me, run, today } = useErp();
  const look = useLookup();
  const editable = canEdit(me.role, "crm");
  const [f, setF] = useState(() => ({
    name: lead?.name ?? "",
    phone: lead?.phone ?? "+998 ",
    source: lead?.source ?? LEAD_SOURCES[0]!,
    service: lead?.service ?? SERVICES[0]!,
    note: lead?.note ?? "",
    operatorId: lead?.operatorId ?? (me.role === "operator" ? me.id : look.usersByRole("operator")[0]?.id ?? ""),
    nextContactDate: lead?.nextContactDate ?? "",
  }));
  const [contact, setContact] = useState("");
  const [nextDate, setNextDate] = useState(lead?.nextContactDate ?? "");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    const ok = run(
      (c) => act.saveLead(c, { ...f, id: lead?.id, nextContactDate: f.nextContactDate || undefined, meeting: lead?.meeting, rejectReason: lead?.rejectReason, projectId: lead?.projectId }),
      lead ? "Saqlandi" : "Lid qo'shildi",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={lead ? `Lid: ${lead.name}` : "Yangi lid"}
      footer={
        editable ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Yopish
            </Button>
            <Button variant="primary" onClick={save} disabled={!f.name.trim() || f.phone.trim().length < 7}>
              Saqlash
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Yopish</Button>
        )
      }
    >
      {lead?.projectId && (
        <Banner tone="green">
          Shartnoma bo'ldi — ma'lumotlar loyiha kartasiga ko'chirilgan.{" "}
          <A href={`/loyiha/${lead.projectId}`} className="underline">
            Loyihani ochish →
          </A>
        </Banner>
      )}
      {lead?.meeting && (
        <Banner tone="amber">
          Uchrashuv: {fmtDate(lead.meeting.date)} {lead.meeting.time} · {look.userName(lead.meeting.marketologId)}
        </Banner>
      )}
      {lead?.rejectReason && <Banner tone="red">Sabab: {lead.rejectReason}</Banner>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ism / kompaniya">
          <Input value={f.name} disabled={!editable} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Telefon">
          <Input value={f.phone} disabled={!editable} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Manba">
          <Select value={f.source} disabled={!editable} onChange={(e) => set("source", e.target.value)} options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Qiziqqan xizmat">
          <Select value={f.service} disabled={!editable} onChange={(e) => set("service", e.target.value)} options={SERVICES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Mas'ul operator">
          <Select value={f.operatorId} disabled={!editable} onChange={(e) => set("operatorId", e.target.value)} options={userOptions(look.usersByRole("operator"))} />
        </Field>
        <Field label="Keyingi aloqa sanasi">
          <Input type="date" value={f.nextContactDate} disabled={!editable} onChange={(e) => set("nextContactDate", e.target.value)} />
        </Field>
        <Field label="Izoh" className="sm:col-span-2">
          <Textarea rows={2} value={f.note} disabled={!editable} onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>

      {lead && (
        <>
          {editable && lead.stage !== "contract" && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium text-mist-300">Bosqichni o'zgartirish</div>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_STAGES.filter((s) => s.id !== lead.stage).map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant={s.id === "contract" ? "primary" : "secondary"}
                    onClick={() => {
                      onClose();
                      onStage(lead.id, s.id);
                    }}
                  >
                    → {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="mb-1.5 text-xs font-medium text-mist-300">Aloqa tarixi</div>
            {editable && (
              <div className="mb-3 flex flex-wrap gap-2">
                <Input placeholder="Qo'ng'iroq natijasi…" value={contact} onChange={(e) => setContact(e.target.value)} className="min-w-[200px] flex-1" />
                <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="!w-40" title="Keyingi aloqa sanasi" />
                <Button
                  onClick={() => {
                    if (run((c) => act.addContact(c, lead.id, contact, nextDate), "Aloqa yozildi")) {
                      setContact("");
                      set("nextContactDate", nextDate);
                    }
                  }}
                  disabled={!contact.trim()}
                >
                  Yozish
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {lead.history.length === 0 && <li className="text-sm text-mist-400">Hali yozuv yo'q</li>}
              {lead.history.map((h) => (
                <li key={h.id} className="rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
                  <div className="text-mist-100">{h.text}</div>
                  <div className="mt-0.5 text-[11px] text-mist-400">
                    {fmtDateTime(h.at)} · {look.userName(h.userId)}
                  </div>
                </li>
              ))}
            </ul>
            {nextDate && nextDate < today && <p className="mt-2 text-xs text-amber-300">Keyingi aloqa sanasi o'tib ketgan</p>}
          </div>
        </>
      )}
    </Modal>
  );
}

function StageDialog({ pending, onClose }: { pending: NonNullable<Pending>; onClose: () => void }) {
  const { state, run, today } = useErp();
  const look = useLookup();
  const lead = state.leads.find((l) => l.id === pending.leadId)!;
  const [meeting, setMeeting] = useState({ date: today, time: "15:00", marketologId: look.usersByRole("marketolog")[0]?.id ?? "" });
  const [reason, setReason] = useState("");

  if (pending.stage === "contract") {
    return (
      <ProjectFormModal
        title={`Shartnoma bo'ldi: ${lead.name} → Loyiha kartasi`}
        initial={{ name: lead.name, phone: lead.phone, contactName: lead.name, tariff: lead.service, marketologId: lead.meeting?.marketologId }}
        onClose={onClose}
        onSubmit={(input) => {
          let id = "";
          const ok = run((c) => {
            id = act.createProject(c, input, lead.id);
          }, "Loyiha kartasi yaratildi, moliyaga oldindan to'lov uchun xabar ketdi");
          if (ok) {
            onClose();
            navigate(`/loyiha/${id}`);
          }
        }}
      />
    );
  }

  const isMeeting = pending.stage === "meeting";
  const submit = () => {
    const ok = run(
      (c) => act.moveLead(c, lead.id, pending.stage, isMeeting ? { meeting } : { reason }),
      isMeeting ? "Uchrashuv belgilandi — marketologga bildirishnoma ketdi" : "Bosqich o'zgartirildi",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${lead.name} → ${leadStageMeta(pending.stage).label}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={submit} disabled={isMeeting ? !meeting.marketologId : !reason.trim()}>
            Tasdiqlash
          </Button>
        </>
      }
    >
      {isMeeting ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Sana">
            <Input type="date" value={meeting.date} onChange={(e) => setMeeting({ ...meeting, date: e.target.value })} />
          </Field>
          <Field label="Vaqt">
            <Input type="time" value={meeting.time} onChange={(e) => setMeeting({ ...meeting, time: e.target.value })} />
          </Field>
          <Field label="Marketolog">
            <Select value={meeting.marketologId} onChange={(e) => setMeeting({ ...meeting, marketologId: e.target.value })} options={userOptions(look.usersByRole("marketolog"))} />
          </Field>
        </div>
      ) : (
        <Field label="Sabab (majburiy)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: byudjet to'g'ri kelmadi" autoFocus />
        </Field>
      )}
    </Modal>
  );
}
