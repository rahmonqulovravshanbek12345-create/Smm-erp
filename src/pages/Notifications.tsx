import { useState } from "react";
import { AnnounceModal, AnnouncementsCard } from "../components/Announcements";
import { A, Badge, Button, Card, CardHeader, Empty, PageHeader, Select, userOptions } from "../components/ui";
import { SERVER_MODE } from "../lib/api";
import { fmtDateTime } from "../lib/dates";
import { canAnnounce } from "../lib/permissions";
import { alertsFor } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";

const TG = {
  sent: { label: "Telegram ✓", tone: "blue" as const },
  demo: { label: SERVER_MODE ? "Telegram ulanmagan" : "Telegram (demo)", tone: "gray" as const },
  failed: { label: "Telegram ✕", tone: "red" as const },
  off: { label: "faqat tizimda", tone: "gray" as const },
};

export function Notifications() {
  const { state, me, run, today, now } = useErp();
  const mine = state.notifications.filter((n) => n.userId === me.id);
  const alerts = alertsFor(state, me, today, now);
  const unread = mine.filter((n) => !n.read).length;
  const announcer = canAnnounce(me.role);
  const [announce, setAnnounce] = useState(false);

  return (
    <>
      <PageHeader
        title="Bildirishnomalar"
        sub="Tizim ichida va Telegram bot orqali"
        actions={
          <>
            {announcer && (
              <Button variant="primary" onClick={() => setAnnounce(true)}>
                📣 E'lon yuborish
              </Button>
            )}
            {unread > 0 && <Button onClick={() => run("markAllRead", [], "Hammasi o'qildi")}>Hammasini o'qilgan qilish</Button>}
          </>
        }
      />
      {announce && <AnnounceModal onClose={() => setAnnounce(false)} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Eslatmalar va ogohlantirishlar" sub="Muddatlar bo'yicha avtomatik hisoblanadi" />
          <ul className="divide-y divide-sep">
            {alerts.map((a) => (
              <li key={a.id}>
                <A href={a.href} className={`block px-4 py-2.5 text-sm hover:bg-fill ${a.tone === "red" ? "text-red" : "text-orange"}`}>
                  {a.tone === "red" ? "●" : "⚠"} {a.text}
                </A>
              </li>
            ))}
            {alerts.length === 0 && <Empty>Hozircha ogohlantirish yo'q</Empty>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Xabarlar" sub={`${unread} ta o'qilmagan`} />
          <ul className="divide-y divide-sep">
            {mine.map((n) => (
              <li key={n.id} className={`px-4 py-2.5 text-sm ${n.read ? "opacity-60" : ""}`}>
                {n.ann ? (
                  // E'lon: bosilganda o'qilgan hisoblanadi (yuboruvchi kim o'qiganini ko'radi)
                  <button type="button" onClick={() => !n.read && run("markRead", [n.id])} className="block w-full whitespace-pre-line text-left text-label">
                    {!n.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green" />}
                    {n.text}
                  </button>
                ) : (
                  <A href={n.href ?? "/bildirishnomalar"} className="block text-label hover:underline">
                    {!n.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green" />}
                    {n.text}
                  </A>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-label2">
                  {fmtDateTime(n.at)} <Badge tone={TG[n.telegram].tone}>{TG[n.telegram].label}</Badge>
                  {!n.read && (
                    <button type="button" className="text-label2 hover:text-label" onClick={() => run("markRead", [n.id])}>
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
      {announcer && (
        <div className="mt-4">
          <AnnouncementsCard />
        </div>
      )}
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
        <Select
          aria-label="Xodim bo'yicha filtr"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="!w-64"
          options={userOptions(state.users, "Barcha xodimlar")}
        />
      </div>
      <Card>
        <ul className="divide-y divide-sep">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium text-label">{look.userName(a.userId)}</span>{" "}
                {a.href ? (
                  <A href={a.href} className="text-label/80 hover:underline">
                    {a.text}
                  </A>
                ) : (
                  <span className="text-label/80">{a.text}</span>
                )}
              </span>
              <span className="text-xs text-label2">{fmtDateTime(a.at)}</span>
            </li>
          ))}
          {rows.length === 0 && <Empty>Yozuv yo'q</Empty>}
        </ul>
      </Card>
    </>
  );
}
