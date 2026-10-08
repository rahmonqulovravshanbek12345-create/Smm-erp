import { useState } from "react";
import { Badge, Button, Card, Empty, Input, LinkOut, PageHeader } from "../components/ui";
import * as act from "../lib/actions";
import { fmtDate, relDays } from "../lib/dates";
import { FORMAT_LABELS, TASK_KIND_LABELS, platformsText } from "../lib/labels";
import { useErp, useLookup } from "../lib/store";

/** Marketolog: SMM menejer yuborgan video, post va oblojkalarni tasdiqlaydi yoki izoh bilan qaytaradi. */
export function Approvals() {
  const { state, run, today } = useErp();
  const look = useLookup();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queue = state.posts.filter((p) => p.status === "internal").sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader title="Tasdiqlash ro'yxati" sub="Ichki tasdiq: tasdiqlangan post «Mijoz tasdig'ida» bosqichiga o'tadi" />
      {queue.length === 0 ? (
        <Card>
          <Empty>Tasdiq kutayotgan material yo'q</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {queue.map((p) => {
            const tasks = state.tasks.filter((t) => t.postId === p.id && t.resultLink);
            const soon = relDays(p.date, today);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-label">{p.topic}</div>
                    <div className="mt-0.5 text-xs text-label2">
                      {look.projectName(p.projectId)} · {platformsText(p.platforms)} · {FORMAT_LABELS[p.format]} · SMM: {look.userName(p.assigneeId)}
                    </div>
                  </div>
                  <Badge tone={p.date <= today ? "red" : "amber"}>
                    {fmtDate(p.date)} · {soon}
                  </Badge>
                </div>
                {p.script && <p className="mt-3 whitespace-pre-line rounded-[14px] bg-fill p-2.5 text-xs text-label2">{p.script}</p>}
                <div className="mt-3 space-y-1 text-sm">
                  {tasks.length === 0 && <div className="text-xs text-label2">Biriktirilgan fayl yo'q</div>}
                  {tasks.map((t) => (
                    <div key={t.id}>
                      <span className="text-label2">
                        {TASK_KIND_LABELS[t.kind]}
                        {t.designType === "cover" ? " (oblojka)" : ""}:
                      </span>{" "}
                      <LinkOut href={t.resultLink}>{t.title}</LinkOut>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Input
                    placeholder="Izoh (qaytarish uchun majburiy)"
                    value={notes[p.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                    className="min-w-[180px] flex-1"
                  />
                  <Button variant="danger" onClick={() => run((c) => act.returnPost(c, p.id, notes[p.id] ?? ""), "Izoh bilan qaytarildi")}>
                    Qaytarish
                  </Button>
                  <Button variant="primary" onClick={() => run((c) => act.approveInternal(c, p.id), "Tasdiqlandi — SMM menejerga xabar ketdi")}>
                    ✓ Tasdiqlash
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
