// Rahbariyat e'lonlari: hammaga, rol bo'yicha yoki tanlangan xodimlarga — tizimda va Telegram'da; kim o'qigani hisoboti.
import { useMemo, useState } from "react";
import { ANNOUNCE_MAX } from "../lib/actions-system";
import { fmtDateTime } from "../lib/dates";
import { ROLE_LABELS } from "../lib/labels";
import { useErp, useLookup } from "../lib/store";
import type { Announcement, Role } from "../lib/types";
import { Badge, Button, Card, CardHeader, Empty, Field, Modal, Textarea } from "./ui";

type Audience = "all" | "roles" | "users";
const AUDIENCE: { value: Audience; label: string }[] = [
  { value: "all", label: "Hammaga" },
  { value: "roles", label: "Rol bo'yicha" },
  { value: "users", label: "Tanlab" },
];

export function AnnounceModal({ onClose }: { onClose: () => void }) {
  const { state, me, run } = useErp();
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [roles, setRoles] = useState<Role[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const others = useMemo(() => state.users.filter((u) => u.active && u.id !== me.id), [state.users, me.id]);
  const roleList = useMemo(() => [...new Set(others.map((u) => u.role))], [others]);
  const to = audience === "all" ? others : audience === "roles" ? others.filter((u) => roles.includes(u.role)) : others.filter((u) => userIds.includes(u.id));
  const withTg = to.filter((u) => u.telegramChatId?.trim()).length;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const send = () => {
    const d = { text, ...(audience === "roles" ? { roles } : audience === "users" ? { userIds } : {}) };
    if (run("sendAnnouncement", [d], "E'lon yuborildi")) onClose();
  };

  const chip = "flex cursor-pointer items-center gap-2 rounded-[12px] bg-fill px-3 py-2 text-[14px] text-label";
  return (
    <Modal
      open
      onClose={onClose}
      title="📣 E'lon yuborish"
      footer={
        <Button variant="primary" className="w-full" onClick={send} disabled={!text.trim() || !to.length || text.length > ANNOUNCE_MAX}>
          {to.length ? `${to.length} kishiga yuborish` : "Kimga yuborilishini tanlang"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Matn" hint={`${text.length} / ${ANNOUNCE_MAX}`}>
          <Textarea
            rows={5}
            value={text}
            maxLength={ANNOUNCE_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder="Masalan: Ertaga soat 10:00 da umumiy yig'ilish"
          />
        </Field>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-label2">Kimga</div>
          <div role="radiogroup" aria-label="Kimga" className="flex gap-1 rounded-[12px] bg-fill p-1">
            {AUDIENCE.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={audience === a.value}
                onClick={() => setAudience(a.value)}
                className={`flex-1 rounded-[9px] py-1.5 text-[13px] font-semibold transition ${audience === a.value ? "bg-bg text-label shadow-sm" : "text-label2"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        {audience === "roles" && (
          <div className="grid grid-cols-2 gap-2">
            {roleList.map((r) => (
              <label key={r} className={chip}>
                <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles((x) => toggle(x, r))} />
                {ROLE_LABELS[r]} <span className="text-label3">({others.filter((u) => u.role === r).length})</span>
              </label>
            ))}
          </div>
        )}
        {audience === "users" && (
          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
            {others.map((u) => (
              <label key={u.id} className={chip}>
                <input type="checkbox" checked={userIds.includes(u.id)} onChange={() => setUserIds((x) => toggle(x, u.id))} />
                <span className="flex-1">{u.name}</span>
                <span className="text-[12px] text-label2">{ROLE_LABELS[u.role]}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-[13px] text-label2">
          {to.length} kishiga boradi: hammasiga tizimda, {withTg} tasiga Telegram'da ham (chat ID kiritilganlar). Arxivdagi xodimlarga va sizga bormaydi.
        </p>
      </div>
    </Modal>
  );
}

const audienceText = (a: Announcement) =>
  a.audience === "all" ? "Hammaga" : a.audience === "roles" ? (a.roles ?? []).map((r) => ROLE_LABELS[r]).join(", ") : "Tanlangan xodimlarga";

/** Yuborilgan e'lonlar: kimga, nechtasi o'qidi, Telegram'ga nechtasi yetdi; o'qimaganlar ro'yxati. */
export function AnnouncementsCard() {
  const { state } = useErp();
  const look = useLookup();
  const list = state.announcements.slice(0, 30);
  return (
    <Card>
      <CardHeader
        title="Yuborilgan e'lonlar"
        sub="«O'qidi» — xodim e'lonni tizimda bosgan yoki o'qilgan deb belgilagan (Telegram'da o'qiganini bilib bo'lmaydi)"
      />
      <ul className="divide-y divide-sep">
        {list.map((a) => {
          const unread = a.to.filter((id) => !a.readBy.includes(id));
          const tgOk = a.tg - (a.tgFailed ?? 0);
          return (
            <li key={a.id} className="px-4 py-3 text-sm">
              <p className="whitespace-pre-line text-label">{a.text}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-label2">
                <span>
                  {fmtDateTime(a.at)} · {look.userName(a.by)} · {audienceText(a)}
                </span>
                <Badge tone="blue">{a.to.length} kishiga</Badge>
                <Badge tone={unread.length ? "amber" : "green"}>
                  {a.readBy.length} / {a.to.length} o'qidi
                </Badge>
                <Badge tone={a.tgFailed ? "red" : "gray"}>Telegram: {tgOk}</Badge>
              </div>
              {unread.length > 0 && (
                <details className="mt-1 text-[12px] text-label2">
                  <summary className="cursor-pointer">O'qimaganlar ({unread.length})</summary>
                  <p className="mt-1">{unread.map((id) => look.userName(id)).join(", ")}</p>
                </details>
              )}
            </li>
          );
        })}
        {list.length === 0 && <Empty>Hali e'lon yuborilmagan</Empty>}
      </ul>
    </Card>
  );
}
