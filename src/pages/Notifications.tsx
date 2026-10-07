import { useState } from "react";
import { A, Badge, Button, Card, CardHeader, Empty, PageHeader, Select, userOptions } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { alertsFor } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";

const TG = {
  sent: { label: "Telegram ✓", tone: "blue" as const },
  demo: { label: "Telegram (demo)", tone: "gray" as const },
  failed: { label: "Telegram ✕", tone: "red" as const },
  off: { label: "faqat tizimda", tone: "gray" as const },
};

export function Notifications() {
  const { state, me, run, today } = useErp();
  const mine = state.notifications.filter((n) => n.userId === me.id);
  const alerts = alertsFor(state, me, today);
  const unread = mine.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title="Bildirishnomalar"
        sub="Tizim ichida va Telegram bot orqali"
        actions={
          unread > 0 && (
            <Button
              onClick={() =>
                run((c) => {
                  for (const n of c.s.notifications) if (n.userId === c.me.id) n.read = true;
                }, "Hammasi o'qildi")
              }
            >
              Hammasini o'qilgan qilish
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Eslatmalar va ogohlantirishlar" sub="Muddatlar bo'yicha avtomatik hisoblanadi" />
          <ul className="divide-y divide-white/[0.05]">
            {alerts.map((a) => (
              <li key={a.id}>
                <A href={a.href} className={`block px-4 py-2.5 text-sm hover:bg-white/[0.02] ${a.tone === "red" ? "text-red-300" : "text-amber-300"}`}>
                  {a.tone === "red" ? "●" : "⚠"} {a.text}
                </A>
              </li>
            ))}
            {alerts.length === 0 && <Empty>Hozircha ogohlantirish yo'q</Empty>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Xabarlar" sub={`${unread} ta o'qilmagan`} />
          <ul className="divide-y divide-white/[0.05]">
            {mine.map((n) => (
              <li key={n.id} className={`px-4 py-2.5 text-sm ${n.read ? "opacity-60" : ""}`}>
                <A
                  href={n.href ?? "/bildirishnomalar"}
                  className="block text-mist-100 hover:underline"
                >
                  {!n.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-signal-400" />}
                  {n.text}
                </A>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-mist-400">
                  {fmtDateTime(n.at)} <Badge tone={TG[n.telegram].tone}>{TG[n.telegram].label}</Badge>
                  {!n.read && (
                    <button
                      type="button"
                      className="text-mist-300 hover:text-white"
                      onClick={() =>
                        run((c) => {
                          const x = c.s.notifications.find((y) => y.id === n.id);
                          if (x) x.read = true;
                        })
                      }
                    >
                      o'qildi
                    </button>
                  )}
                </div>
              </li>
            ))}
            {mine.length === 0 && <Empty>Xabar yo'q</Empty>}
          </ul>
        </Card>
      </div>
    </>
  );
}

export function Activity() {
  const { state } = useErp();
  const look = useLookup();
  const [userId, setUserId] = useState("");
  const rows = state.activity.filter((a) => !userId || a.userId === userId);
  return (
    <>
      <PageHeader title="Faoliyat tarixi" sub="Kim, qachon, nimani o'zgartirdi" />
      <div className="mb-4">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="!w-64" options={userOptions(state.users, "Barcha xodimlar")} />
      </div>
      <Card>
        <ul className="divide-y divide-white/[0.05]">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium text-white">{look.userName(a.userId)}</span>{" "}
                {a.href ? (
                  <A href={a.href} className="text-mist-200 hover:underline">
                    {a.text}
                  </A>
                ) : (
                  <span className="text-mist-200">{a.text}</span>
                )}
              </span>
              <span className="text-xs text-mist-400">{fmtDateTime(a.at)}</span>
            </li>
          ))}
          {rows.length === 0 && <Empty>Yozuv yo'q</Empty>}
        </ul>
      </Card>
    </>
  );
}
