import { useState } from "react";
import { TaskBadge } from "../components/bits";
import { TaskModal } from "../components/forms";
import { Badge, Banner, Button, Card, Input, LinkOut, PageHeader, Stat } from "../components/ui";
import * as act from "../lib/actions";
import { fmtDeadline, fmtMoney, fmtMonth, monthKey, relDays } from "../lib/dates";
import { TASK_STATUSES } from "../lib/labels";
import { access, canEdit } from "../lib/permissions";
import { employeeBalance } from "../lib/finance";
import { isTaskLate } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { Task } from "../lib/types";

export function TaskBoard({ kind }: { kind: "montaj" | "dizayn" }) {
  const { state, me, today, now } = useErp();
  const look = useLookup();
  const [creating, setCreating] = useState(false);
  const own = access(me.role, kind) === "own";
  const editable = canEdit(me.role, kind);

  const tasks = state.tasks
    .filter((t) => t.kind === kind)
    .filter((t) => !own || t.assigneeId === me.id)
    .filter((t) => me.role !== "smm" || look.project(t.projectId)?.smmId === me.id)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const month = monthKey(today);
  const myMonth = state.accruals.filter((a) => a.userId === me.id && monthKey(a.date) === month);
  const accepted = myMonth.filter((a) => a.workType === "montaj" || a.workType === "dizayn_post" || a.workType === "dizayn_cover").length;
  const earned = myMonth.reduce((x, a) => x + a.amount, 0);
  const late = tasks.filter((t) => isTaskLate(t, today, now)).length;

  return (
    <>
      <PageHeader
        title={own ? (kind === "montaj" ? "Montajyor oynasi" : "Dizayner oynasi") : kind === "montaj" ? "Montaj vazifalari" : "Dizayn vazifalari"}
        sub={own ? "Faqat sizga berilgan vazifalar: TZ, ssenariy, kadrlar havolasi, deadline" : "SMM menejer tayyor ishni qabul qiladi yoki qaytaradi"}
        actions={
          editable && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + {kind === "montaj" ? "Montaj" : "Dizayn"} TZ
            </Button>
          )
        }
      />

      {own && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon="list" color="blue" label="Ochiq vazifalar" value={tasks.filter((t) => t.status !== "accepted").length} />
          <Stat icon="clock" color="red" label="Kechikkan" value={late} tone={late ? "red" : "green"} />
          <Stat icon="check" color="green" label={`Qabul qilingan ishlar (${fmtMonth(month)})`} value={accepted} tone="green" href="/hisobim" />
          <Stat
            icon="wallet"
            color="teal"
            label={`Shu oy hisoblandi · qoldiq ${fmtMoney(employeeBalance(state, me.id))}`}
            value={fmtMoney(earned)}
            tone="green"
            href="/hisobim"
          />
        </div>
      )}

      <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {TASK_STATUSES.map((st) => {
          const col = tasks.filter((t) => t.status === st.id);
          return (
            <div key={st.id} className="flex w-72 shrink-0 flex-col rounded-[24px] glass xl:w-auto xl:min-w-0 xl:flex-1">
              <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
                <Badge tone={st.tone}>{st.label}</Badge>
                <span className="text-xs text-label2">{col.length}</span>
              </div>
              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {col.map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {creating && <TaskModal kind={kind} onClose={() => setCreating(false)} />}
    </>
  );
}

function TaskCard({ task: t }: { task: Task }) {
  const { me, run, today, now } = useErp();
  const look = useLookup();
  const [link, setLink] = useState(t.resultLink ?? "");
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  const isAssignee = t.assigneeId === me.id || me.role === "admin";
  // Tekshiruvchi: loyiha SMM menejeri; u bo'lmasa yoki arxivlansa ham ish to'xtamasin — marketolog va rahbar ham qabul qila oladi
  const isReviewer = ["admin", "rahbar", "marketolog"].includes(me.role) || (me.role === "smm" && look.project(t.projectId)?.smmId === me.id);
  const late = isTaskLate(t, today, now);

  return (
    <Card className={`p-3 ${late ? "border-red/40" : ""}`}>
      <button type="button" className="w-full text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="text-sm font-medium text-label">{t.title}</div>
        <div className="mt-0.5 text-xs text-label2">
          {look.projectName(t.projectId)} · {look.userName(t.assigneeId)}
          {t.designType && ` · ${t.designType === "cover" ? "oblojka" : "post"}`}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TaskBadge task={t} today={today} />
          <span className={`text-xs ${late ? "text-red" : "text-label2"}`}>
            ⏱ {fmtDeadline(t)} ({relDays(t.deadline, today)})
          </span>
        </div>
      </button>

      {t.returnNote && t.status === "returned" && <div className="mt-2 rounded-md bg-red/10 px-2 py-1.5 text-xs text-red">Qaytarildi: {t.returnNote}</div>}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-sep pt-3 text-xs">
          {t.brief && (
            <div>
              <div className="text-label2">TZ</div>
              <p className="whitespace-pre-line text-label">{t.brief}</p>
            </div>
          )}
          {t.script && (
            <div>
              <div className="text-label2">Ssenariy</div>
              <p className="whitespace-pre-line text-label">{t.script}</p>
            </div>
          )}
          {t.kind === "montaj" && (
            <div>
              <span className="text-label2">Kadrlar: </span>
              {t.footageLink ? <LinkOut href={t.footageLink} /> : <span className="text-orange">syomka operatoridan kutilmoqda</span>}
            </div>
          )}
          {t.files && (
            <div>
              <span className="text-label2">Fayllar: </span>
              <LinkOut href={t.files} />
            </div>
          )}
          {t.resultLink && (
            <div>
              <span className="text-label2">Natija: </span>
              <LinkOut href={t.resultLink} />
            </div>
          )}
        </div>
      )}

      {isAssignee && (t.status === "new" || t.status === "returned") && (
        <Button size="sm" className="mt-3 w-full" onClick={() => run((c) => act.startTask(c, t.id), "Jarayonda")}>
          ▶ Boshlash
        </Button>
      )}
      {isAssignee && t.status === "progress" && (
        <div className="mt-3 space-y-1.5">
          <Input placeholder="Tayyor ish havolasi (Google Drive)" value={link} onChange={(e) => setLink(e.target.value)} className="!py-1.5 !text-xs" />
          <Button size="sm" variant="primary" className="w-full" onClick={() => run((c) => act.submitTask(c, t.id, link), "Tekshiruvga topshirildi")}>
            Tayyor — tekshiruvga
          </Button>
        </div>
      )}
      {isReviewer && t.status === "review" && (
        <div className="mt-3 space-y-1.5">
          <Input placeholder="Qaytarish sababi" value={note} onChange={(e) => setNote(e.target.value)} className="!py-1.5 !text-xs" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="danger" className="flex-1" onClick={() => run((c) => act.returnTask(c, t.id, note), "Qaytarildi")}>
              Qaytarish
            </Button>
            <Button size="sm" variant="primary" className="flex-1" onClick={() => run((c) => act.acceptTask(c, t.id), "Qabul qilindi")}>
              ✓ Qabul
            </Button>
          </div>
        </div>
      )}
      {t.status === "review" && !isReviewer && isAssignee && <Banner tone="amber">SMM menejer tekshiryapti</Banner>}
    </Card>
  );
}
