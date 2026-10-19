import { useState } from "react";
import { Button, Field, Input, Modal, Select } from "./ui";
import { fmtDate } from "../lib/dates";
import { ROLE_LABELS } from "../lib/labels";
import { TEAM_ROLES } from "../lib/team";
import { useErp } from "../lib/store";
import { hasAds, hasContent } from "../lib/services";
import type { Project, TeamRole } from "../lib/types";

/** Jamoani o'zgartirish tugmasi va oynasi: lavozim, yangi xodim, qaysi sanadan. O'tmish sana ham mumkin. */
export function TeamChangeButton({ project }: { project: Project }) {
  const { state, run, today } = useErp();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<TeamRole>("marketolog");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(today);
  // Faqat loyihada bor lavozimlar (SMM — kontent xizmati, targetolog — reklama xizmati bo'lsa)
  const roles = TEAM_ROLES.filter((r) => (r === "smm" ? hasContent(project) : r === "targetolog" ? hasAds(project) : true));
  const people = state.users.filter((u) => u.active && u.role === role);

  const save = () => {
    if (!userId) return;
    if (run("setProjectTeam", [project.id, role, userId, from], `${ROLE_LABELS[role]} o'zgartirildi (${fmtDate(from)} dan)`)) setOpen(false);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Jamoani o'zgartirish
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Jamoani o'zgartirish"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Bekor</Button>
            <Button variant="primary" onClick={save} disabled={!userId || !from}>
              Saqlash
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Lavozim">
            <Select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as TeamRole);
                setUserId("");
              }}
              options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
          </Field>
          <Field label="Yangi xodim">
            <Select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              options={[{ value: "", label: "— tanlang —" }, ...people.map((u) => ({ value: u.id, label: u.name }))]}
            />
          </Field>
          <Field label="Qaysi sanadan" hint="Sana kelajakda bo'lsa, o'sha kuni o'zi almashadi. O'tmish sana ham mumkin">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <p className="mt-3 text-[12px] text-label3">
          Oldingi xodim {from} dan oldin qilgan ishi (yozilgan ish, hisoblangan ish haqi) o'zida qoladi. Ochiq target vazifalari yangi xodimga o'tadi.
        </p>
      </Modal>
    </>
  );
}

/** Loyiha bo'yicha jamoa almashuvi tarixi. */
export function TeamHistory({ project }: { project: Project }) {
  const { state } = useErp();
  const rows = [...(project.teamHistory ?? [])].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.at < b.at ? -1 : 1));
  if (!rows.length) return null;
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? "—";
  return (
    <div className="mt-3 border-t border-sep pt-2">
      <div className="mb-1 text-[12px] font-semibold text-label2">Jamoa tarixi</div>
      <ul className="space-y-0.5 text-[12px] text-label2">
        {rows.map((r) => (
          <li key={r.id}>
            {fmtDate(r.from)} dan · {ROLE_LABELS[r.role]}: <span className="text-label">{name(r.userId)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
