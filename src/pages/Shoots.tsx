import { useState } from "react";
import { ShootModal } from "../components/forms";
import { Badge, Button, Card, Empty, Input, LinkOut, PageHeader } from "../components/ui";
import * as act from "../lib/actions";
import { fmtDate, fmtDateTime, relDays } from "../lib/dates";
import { access, canEdit } from "../lib/permissions";
import { useErp, useLookup } from "../lib/store";

export function Shoots() {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const [creating, setCreating] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const own = access(me.role, "shoots") === "own";
  const editable = canEdit(me.role, "shoots");

  const shoots = state.shoots
    .filter((s) => !own || s.operatorId === me.id)
    .filter((s) => me.role !== "smm" || look.project(s.projectId)?.smmId === me.id)
    .sort((a, b) => (a.status === b.status ? a.date.localeCompare(b.date) : a.status === "planned" ? -1 : 1));

  return (
    <>
      <PageHeader
        title={own ? "Syomka operatori oynasi" : "Syomkalar"}
        sub="Sana, vaqt, joy, video soni va bog'langan postlar. Syomkadan so'ng kadrlar havolasini kiriting."
        actions={
          editable && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Syomka belgilash
            </Button>
          )
        }
      />
      {shoots.length === 0 && (
        <Card>
          <Empty>Syomka yo'q</Empty>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {shoots.map((s) => {
          const posts = state.posts.filter((p) => s.postIds.includes(p.id));
          const overdue = s.status === "planned" && s.date < today;
          return (
            <Card key={s.id} className={`p-4 ${overdue ? "border-red/40" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-label">{look.projectName(s.projectId)}</div>
                  <div className="mt-0.5 text-sm text-label2">
                    {fmtDate(s.date)}, {s.time} · {s.location}
                  </div>
                </div>
                {s.status === "handed" ? (
                  <Badge tone="green">Montajyorga topshirildi</Badge>
                ) : overdue ? (
                  <Badge tone="red">Kechikdi — kadrlar topshirilmagan</Badge>
                ) : (
                  <Badge tone="amber">Rejada · {relDays(s.date, today)}</Badge>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-label2">Olinadigan video</div>
                  <div className="text-label">{s.videoCount} ta</div>
                </div>
                <div>
                  <div className="text-xs text-label2">Operator</div>
                  <div className="text-label">{look.userName(s.operatorId)}</div>
                </div>
              </div>
              {s.note && <p className="mt-2 text-xs text-orange">Izoh: {s.note}</p>}
              <div className="mt-3">
                <div className="text-xs text-label2">Bog'langan postlar</div>
                <ul className="mt-1 space-y-0.5 text-sm text-label/80">
                  {posts.map((p) => (
                    <li key={p.id}>
                      · {fmtDate(p.date)} — {p.topic}
                    </li>
                  ))}
                  {posts.length === 0 && <li className="text-label2">—</li>}
                </ul>
              </div>
              {s.status === "handed" ? (
                <div className="mt-3 text-sm">
                  Kadrlar: <LinkOut href={s.footageLink} /> <span className="text-xs text-label2">· {s.handedAt && fmtDateTime(s.handedAt)}</span>
                </div>
              ) : (
                (s.operatorId === me.id || me.role === "admin" || me.role === "rahbar") && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Input
                      placeholder="Kadrlar havolasi (Google Drive)"
                      value={links[s.id] ?? ""}
                      onChange={(e) => setLinks({ ...links, [s.id]: e.target.value })}
                      className="min-w-[200px] flex-1"
                    />
                    <Button variant="primary" onClick={() => run((c) => act.handFootage(c, s.id, links[s.id] ?? ""), "Montajyorga topshirildi")}>
                      Montajyorga topshirildi
                    </Button>
                  </div>
                )
              )}
            </Card>
          );
        })}
      </div>
      {creating && <ShootModal onClose={() => setCreating(false)} />}
    </>
  );
}
