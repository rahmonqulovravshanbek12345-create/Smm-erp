import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select } from "../components/ui";
import { SERVER_MODE, api } from "../lib/api";
import { fmtDateTime, fmtMoney } from "../lib/dates";
import { ROLE_DUTIES, ROLE_LABELS } from "../lib/labels";
import { ACCESS_LABELS, MATRIX_VIEW, access } from "../lib/permissions";
import { alertsFor } from "../lib/rules";
import { userLoad } from "../lib/staff";
import { useErp } from "../lib/store";
import { sendTelegram, telegramText } from "../lib/telegram";
import type { Role, User } from "../lib/types";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function Admin() {
  const { state, me, today, now, run, reset, showToast } = useErp();
  const [nu, setNu] = useState({ name: "", role: "smm" as Role });
  const [testing, setTesting] = useState(false);
  const [sharedChat, setSharedChat] = useState(() => me.telegramChatId ?? "");
  const [confirmReset, setConfirmReset] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const tg = state.settings.telegram;
  const logins = useLogins();
  const [creds, setCreds] = useState<string | null>(null);

  const testTelegram = async () => {
    if (SERVER_MODE) {
      setTesting(true);
      await api("/api/integrations/telegram/test", {})
        .then(() => showToast("Test xabar yuborildi"))
        .catch((e: Error) => showToast(`⚠ ${e.message}`));
      return setTesting(false);
    }
    const chatId = me.telegramChatId?.trim();
    if (!tg.botToken.trim() || !chatId) {
      showToast("⚠ Bot tokeni va o'zingizning chat ID'ingizni kiriting");
      return;
    }
    setTesting(true);
    const ok = await sendTelegram(tg.botToken.trim(), chatId, telegramText(me, "✅ Telegram bildirishnomalari ishlayapti"));
    setTesting(false);
    showToast(ok ? "Test xabar yuborildi" : "⚠ Xabar ketmadi — token, chat ID va botga /start bosilganini tekshiring");
  };

  const setChatForAll = () => {
    const id = sharedChat.trim();
    if (!id) return showToast("⚠ Chat ID kiriting");
    run("setChatIdForAll", [id], `Chat ID ${state.users.length} ta xodimga qo'yildi`);
  };

  // Haqiqiy tizimda server har kuni ertalab yuboradi; demo'da tugma bilan ko'rsatiladi.
  const sendDigest = async () => {
    if (SERVER_MODE) {
      return api<{ sent: number }>("/api/integrations/telegram/digest", {})
        .then((r) => showToast(r.sent ? `${r.sent} ta xodimga eslatma yuborilmoqda` : "Chat ID kiritilgan xodimlarda eslatma yo'q"))
        .catch((e: Error) => showToast(`⚠ ${e.message}`));
    }
    const token = tg.botToken.trim();
    if (!tg.enabled || !token) return showToast("⚠ Avval Telegram'ni yoqing va bot tokenini kiriting");
    let sent = 0;
    for (const u of state.users) {
      const chatId = u.telegramChatId?.trim();
      if (!u.active || !chatId) continue;
      const alerts = alertsFor(state, u, today, now);
      if (alerts.length === 0) continue;
      const lines = alerts.slice(0, 12).map((a) => `${a.tone === "red" ? "🔴" : "🟡"} ${a.text}`);
      if (alerts.length > 12) lines.push(`… yana ${alerts.length - 12} ta`);
      void sendTelegram(token, chatId, telegramText(u, `📋 Bugungi eslatmalar (${alerts.length}):\n${lines.join("\n")}`));
      sent++;
    }
    showToast(sent ? `${sent} ta xodimga eslatma navbatga qo'yildi (har ~1 soniyada bittadan)` : "Chat ID kiritilgan xodimlarda eslatma yo'q");
  };

  return (
    <>
      <PageHeader title="Admin" sub="Foydalanuvchilar, huquqlar va tizim sozlamalari" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader title="Foydalanuvchilar" sub="Telegram chat ID — xodim botga /start bosgandan keyin @userinfobot orqali olinadi" />
          <div className="overflow-x-auto">
            <table className={`w-full ${SERVER_MODE ? "min-w-[920px]" : "min-w-[720px]"} text-sm`}>
              <thead className="text-left text-xs text-label2">
                <tr>
                  <th className="px-4 py-2 font-medium">Ism</th>
                  {SERVER_MODE && <th className="px-4 py-2 font-medium">Kirish</th>}
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 font-medium">Telegram chat ID</th>
                  <th className="px-4 py-2 font-medium">Holat</th>
                  <th className="px-4 py-2 font-medium">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {state.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 text-label">{u.name}</td>
                    {SERVER_MODE && (
                      <td className="px-4 py-2">
                        <LoginCell info={logins.list?.find((l) => l.userId === u.id)} active={u.active} isMe={u.id === me.id} onGive={() => setCreds(u.id)} />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <Select
                        aria-label={`${u.name}: rol`}
                        value={u.role}
                        disabled={u.id === me.id}
                        onChange={(e) => run("setUserRole", [u.id, e.target.value as Role], "Rol o'zgartirildi")}
                        options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                        className="!w-44 !py-1 !text-xs"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        key={u.telegramChatId ?? ""}
                        defaultValue={u.telegramChatId ?? ""}
                        aria-label={`${u.name}: Telegram chat ID`}
                        placeholder="masalan 123456789"
                        onBlur={(e) => e.target.value !== (u.telegramChatId ?? "") && run("setUserChatId", [u.id, e.target.value], "Chat ID saqlandi")}
                        className="!w-44 !py-1 !text-xs"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Faol" : "Arxivda"}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {u.active ? (
                        <Button
                          size="sm"
                          className="whitespace-nowrap"
                          disabled={u.id === me.id}
                          onClick={() => setArchiveId(u.id)}
                          aria-label={`${u.name}: arxivlash`}
                        >
                          Arxivlash
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => run("restoreUser", [u.id], `${u.name} arxivdan qaytarildi`)} aria-label={`${u.name}: qaytarish`}>
                          Qaytarish
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-sep p-4">
            <Field label="Yangi xodim">
              <Input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="Ism Familiya" className="!w-56" />
            </Field>
            <Field label="Rol">
              <Select
                value={nu.role}
                onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                className="!w-48"
              />
            </Field>
            <Button
              variant="primary"
              disabled={!nu.name.trim()}
              onClick={() => {
                const r = run("addUser", [{ name: nu.name, role: nu.role }], "Xodim qo'shildi");
                if (!r) return;
                setNu({ ...nu, name: "" });
                // Serverli tizimda — darhol login va vaqtinchalik parol berish
                if (SERVER_MODE) setCreds(r.value);
              }}
            >
              Qo'shish
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Telegram bot" sub="Bildirishnomalar tizim ichida va Telegram orqali" />
          <div className="space-y-3 p-4">
            <label className="flex items-center gap-2 text-sm text-label">
              <input type="checkbox" checked={tg.enabled} onChange={(e) => run("setTelegramEnabled", [e.target.checked], "Saqlandi")} />
              Telegram bildirishnomalarini yoqish
            </label>
            <Field
              label="Bot tokeni (@BotFather'dan)"
              hint={
                SERVER_MODE
                  ? "Token serverda saqlanadi, hech kimga ko'rsatilmaydi (faqat oxirgi 4 belgisi)"
                  : "Bo'sh qoldirilsa, xabarlar «demo» rejimida faqat tizimda ko'rsatiladi"
              }
            >
              <Input
                type="password"
                defaultValue={tg.botToken}
                placeholder="123456:ABC-DEF…"
                onBlur={(e) => e.target.value.trim() !== tg.botToken && run("setTelegramToken", [e.target.value], "Token saqlandi")}
              />
            </Field>
            {!SERVER_MODE && (
              <Banner tone="amber">
                Demo versiyada token faqat shu brauzerda saqlanadi. Haqiqiy tizimda bot serverda ishlaydi va token hech kimga ko'rinmaydi.
              </Banner>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-xs text-label2">
              <li>@BotFather'da /newbot buyrug'i bilan bot yarating va tokenni yuqoriga kiriting.</li>
              <li>Botingizni topib /start bosing (bot faqat /start bosgan odamga yoza oladi).</li>
              <li>Chat ID'ingizni @userinfobot'dan oling va jadvalga yoki pastdagi maydonga yozing.</li>
            </ol>
            {!SERVER_MODE && (
              <div className="rounded-[14px] bg-fill p-3">
                <div className="text-[13px] font-semibold text-label">Demo uchun: hamma xabar bitta Telegram'ga</div>
                <p className="mt-0.5 text-xs text-label2">
                  Barcha xodimlarga bitta chat ID qo'yiladi. Har xabarda kimga ekanligi yoziladi (👤 Ism · Rol). Guruh ID'si (-100… bilan boshlanadi) ham
                  bo'ladi — botni guruhga qo'shing.
                </p>
                <div className="mt-2 flex gap-2">
                  <Input value={sharedChat} onChange={(e) => setSharedChat(e.target.value)} placeholder="masalan 123456789" className="!py-1.5 !text-[13px]" />
                  <Button onClick={setChatForAll}>Hammaga qo'yish</Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={testTelegram} disabled={testing}>
                {testing ? "Yuborilmoqda…" : "Menga test xabar yuborish"}
              </Button>
              <Button onClick={sendDigest}>Bugungi eslatmalarni yuborish</Button>
            </div>
            <p className="text-xs text-label3">
              Eslatmalar: deadline, kechikkan ishlar, ertangi syomka, qarzlar, to'lov muddati, qayta aloqa.{" "}
              {SERVER_MODE ? "Har kuni ertalab 8:45 da (dushanba–shanba) avtomatik yuboriladi." : "Haqiqiy tizimda har kuni ertalab avtomatik yuboriladi."}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sozlamalar" />
          <div className="space-y-4 p-4">
            <Field label="Kompaniya nomi (akt-sverka va vedomostlar uchun)">
              <Input
                defaultValue={state.settings.companyName}
                onBlur={(e) =>
                  e.target.value.trim() && e.target.value.trim() !== state.settings.companyName && run("setCompanyName", [e.target.value], "Saqlandi")
                }
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["address", "Yuridik manzil"],
                  ["inn", "STIR (INN)"],
                  ["bankName", "Bank"],
                  ["bankAccount", "Hisob raqam"],
                  ["mfo", "MFO"],
                  ["director", "Direktor"],
                  ["phone", "Telefon"],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label} className={k === "address" ? "sm:col-span-2" : ""}>
                  <Input
                    defaultValue={state.settings.requisites[k]}
                    onBlur={(e) => e.target.value !== state.settings.requisites[k] && run("setRequisite", [k, e.target.value], "Rekvizit saqlandi")}
                  />
                </Field>
              ))}
            </div>
            <p className="text-[12px] text-label3">Rekvizitlar shartnoma, hisob-faktura, dalolatnoma va akt-sverkaga avtomatik tushadi.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="USD kursi (so'm)" hint="Yangi tranzaksiyalar uchun taklif">
                <Input
                  type="number"
                  defaultValue={state.settings.usdRate}
                  onBlur={(e) =>
                    Number(e.target.value) !== state.settings.usdRate && run("setUsdRate", [Number(e.target.value), today, "manual"], "Kurs saqlandi")
                  }
                />
              </Field>
              <Field label="Ish haqi kuni" hint="Oyning nechanchi kuni">
                <Input
                  type="number"
                  min={1}
                  max={28}
                  defaultValue={state.settings.payday}
                  onBlur={(e) => Number(e.target.value) !== state.settings.payday && run("setPayday", [Number(e.target.value)], "Saqlandi")}
                />
              </Field>
              <Field label="Kechikish jarimasi, %" hint="0 — o'chirilgan">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={state.settings.latePenaltyPct}
                  onBlur={(e) => Number(e.target.value) !== state.settings.latePenaltyPct && run("setLatePenalty", [Number(e.target.value)], "Saqlandi")}
                />
              </Field>
            </div>
            <p className="text-[12px] text-label3">Xodimlar stavkalari: Moliya → Ish haqi → Stavkalar.</p>
            {SERVER_MODE ? (
              <div className="border-t border-sep pt-4">
                <div className="mb-1 text-sm text-label">Zaxira nusxa</div>
                <p className="mb-2 text-xs text-label2">
                  Server har kecha o'zi zaxira oladi. Qo'shimcha ishonch uchun barcha ma'lumotni faylga yuklab, xavfsiz joyda saqlab qo'yishingiz mumkin
                  (tokenlarsiz). Bu faylni begona odamga bermang — unda moliya va oyliklar bor.
                </p>
                <a href="/api/admin/export" download className="inline-flex h-10 items-center rounded-full bg-fill px-4 text-[15px] font-semibold text-label">
                  Zaxira nusxani yuklab olish
                </a>
              </div>
            ) : (
              <div className="border-t border-sep pt-4">
                <div className="mb-1 text-sm text-label">Demo ma'lumotlarni tiklash</div>
                <p className="mb-2 text-xs text-label2">
                  Mijozga ko'rsatishdan oldin barcha o'zgarishlarni o'chirib, boshlang'ich holatga qaytaradi. Telegram sozlamalari saqlanib qoladi.
                </p>
                {confirmReset ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-red">Barcha o'zgarishlar o'chiriladi.</span>
                    <Button
                      variant="danger"
                      onClick={() => {
                        reset();
                        setConfirmReset(false);
                      }}
                    >
                      Ha, tiklash
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                      Bekor qilish
                    </Button>
                  </div>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmReset(true)}>
                    Demo'ni qayta tiklash
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Huquqlar matritsasi" sub="Har xodim faqat o'z vazifalari va loyihalarini ko'radi. Marketolog va admin hammasini ko'radi." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="text-left text-label2">
                <tr>
                  <th className="px-3 py-2 font-medium">Modul</th>
                  {ROLES.filter((r) => r !== "admin").map((r) => (
                    <th key={r} className="px-3 py-2 font-medium" title={ROLE_DUTIES[r]}>
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {MATRIX_VIEW.map((m) => (
                  <tr key={m.module}>
                    <td className="px-3 py-2 text-label">{m.label}</td>
                    {ROLES.filter((r) => r !== "admin").map((r) => {
                      const a = access(r, m.module);
                      return (
                        <td key={r} className={`px-3 py-2 ${a === "none" ? "text-label3" : a === "full" ? "text-green" : "text-label/80"}`}>
                          {r === "moliya" && m.module === "projects" ? "ko'rish + moliya qismi" : ACCESS_LABELS[a]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {SERVER_MODE && <SecurityLog />}
      <ArchiveModal userId={archiveId} onClose={() => setArchiveId(null)} />
      {creds && <CredentialsModal userId={creds} onClose={() => setCreds(null)} onSaved={logins.reload} />}
    </>
  );
}

/** Arxivlashdan oldin: xodimga nima bog'langanini ko'rsatadi va tasdiq so'raydi. */
function ArchiveModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { state } = useErp();
  const u = state.users.find((x) => x.id === userId);
  return u ? <ArchiveBody u={u} onClose={onClose} /> : null;
}

function ArchiveBody({ u, onClose }: { u: User; onClose: () => void }) {
  const { state, today, run } = useErp();
  const load = userLoad(state, u.id, today);
  const warn = load.balance > 0.5 || load.projects.length > 0 || load.openTasks.length > 0;
  const peers = state.users.filter((x) => x.active && x.role === u.role && x.id !== u.id);
  const [rep, setRep] = useState(peers[0]?.id ?? "");
  const hasWork = load.projects.length > 0 || load.openTasks.length > 0;
  const save = () => {
    const to = peers.find((x) => x.id === rep);
    if (run("archiveUser", [u.id, rep || undefined], to ? `${u.name} arxivlandi — ishlari ${to.name}ga o'tdi` : `${u.name} arxivlandi`)) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Arxivlash: ${u.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Bekor qilish</Button>
          <Button variant="danger" onClick={save}>
            Arxivlash
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-label2">
        <p>
          Arxivlangan xodim akkaunt menyusida chiqmaydi, unga yangi ish tayinlanmaydi va Telegram eslatma ketmaydi. Eski ishlari, hisob-kitoblari va tarixi
          saqlanadi. Xohlagan payt «Qaytarish» mumkin.
        </p>
        {load.balance > 0.5 && (
          <Banner tone="red">
            Xodimga {fmtMoney(load.balance)} to'lanmagan ish haqi bor. Qarz «Ish haqi» bo'limida ko'rinib turadi, avval to'lab qo'ygan ma'qul.
          </Banner>
        )}
        {load.balance < -0.5 && <Banner tone="amber">Xodimga {fmtMoney(-load.balance)} avans berilgan, hisobga olinmagan.</Banner>}
        {load.projects.length > 0 && <Banner tone="amber">Hali mas'ul bo'lgan loyihalar: {load.projects.map((p) => p.name).join(", ")}.</Banner>}
        {load.openTasks.length > 0 && <Banner tone="amber">Qabul qilinmagan vazifalar: {load.openTasks.length} ta.</Banner>}
        {hasWork && (
          <Field label="Loyiha va ochiq ishlarni kimga o'tkazish">
            <Select
              value={rep}
              onChange={(e) => setRep(e.target.value)}
              options={[
                ...peers.map((x) => ({ value: x.id, label: `${x.name} (${ROLE_LABELS[x.role]})` })),
                { value: "", label: "Hech kimga — keyin qo'lda tayinlayman" },
              ]}
            />
          </Field>
        )}
        {!warn && <Banner tone="green">Bog'langan ish, qarz yoki loyiha yo'q.</Banner>}
      </div>
    </Modal>
  );
}

// ---------- Serverli tizim: kirish ma'lumotlari va xavfsizlik jurnali ----------

interface LoginInfo {
  userId: string;
  login: string;
  mustChange: boolean;
  has2fa: boolean;
  lastLoginAt: string | null;
  sessions: number;
  locked: boolean;
}

function useLogins() {
  const [list, setList] = useState<LoginInfo[] | null>(null);
  const reload = useCallback(() => {
    if (!SERVER_MODE) return;
    void api<{ logins: LoginInfo[] }>("/api/admin/logins")
      .then((r) => setList(r.logins))
      .catch(() => setList([]));
  }, []);
  useEffect(reload, [reload]);
  return { list, reload };
}

function LoginCell({ info, active, isMe, onGive }: { info?: LoginInfo; active: boolean; isMe: boolean; onGive: () => void }) {
  return (
    <div className="flex min-w-[180px] flex-col items-start gap-1">
      {info ? (
        <>
          <span className="font-mono text-[13px] text-label">{info.login}</span>
          <span className="flex flex-wrap gap-1">
            {info.has2fa && <Badge tone="green">2FA</Badge>}
            {info.mustChange && <Badge tone="amber">parol almashtirilmagan</Badge>}
            {info.locked && <Badge tone="red">bloklangan</Badge>}
            {info.lastLoginAt && <span className="text-[11px] text-label3">{fmtDateTime(info.lastLoginAt)}</span>}
          </span>
        </>
      ) : (
        <span className="text-[12px] text-label3">login berilmagan</span>
      )}
      {active && !isMe && (
        <Button size="sm" onClick={onGive}>
          {info ? "Yangi parol" : "Login berish"}
        </Button>
      )}
    </div>
  );
}

/** Lotin harflariga o'tkazib, login taklif qiladi: «Aziza Karimova» → «aziza.karimova». */
const suggestLogin = (name: string) =>
  name
    .toLowerCase()
    .replace(/[ʻʼ'`‘’]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32);

function CredentialsModal({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void }) {
  const { state, showToast } = useErp();
  const u = state.users.find((x) => x.id === userId);
  const [login, setLogin] = useState(() => suggestLogin(u?.name ?? ""));
  const [result, setResult] = useState<{ login: string; tempPassword: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState(false);
  if (!u) return null;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await api<{ login: string; tempPassword: string }>("/api/admin/credentials", { userId, login }));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };
  const adminAct = async (path: string, ok: string) => {
    await api(path, { userId })
      .then(() => {
        showToast(ok);
        onSaved();
      })
      .catch((e: Error) => showToast(`⚠ ${e.message}`));
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${u.name}: kirish`}
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Tayyor
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button variant="primary" onClick={save} disabled={busy || login.length < 3}>
              {busy ? "Saqlanmoqda…" : "Vaqtinchalik parol yaratish"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-[14px] text-label2">
          <Banner tone="green">Tayyor. Bu ma'lumotni xodimga shaxsan (yoki telefon orqali) ayting — parol faqat hozir ko'rinadi.</Banner>
          <div className="rounded-[14px] bg-fill p-3 font-mono text-[15px] text-label">
            <div>
              Login: <b>{result.login}</b>
            </div>
            <div>
              Parol: <b>{result.tempPassword}</b>
            </div>
          </div>
          <p>Xodim birinchi kirishda o'zining yangi parolini o'rnatadi. Agar u ilgari kirgan bo'lsa — barcha qurilmalaridan chiqarildi.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <Banner tone="red">{error}</Banner>}
          <Field label="Login" hint="3–32 belgi: lotin harflari, raqam, nuqta, chiziqcha">
            <Input value={login} onChange={(e) => setLogin(e.target.value.toLowerCase().trim())} autoCapitalize="none" spellCheck={false} />
          </Field>
          <p className="text-[13px] text-label2">
            Tizim xavfsiz vaqtinchalik parol yaratadi. Eski paroli bo'lsa — u ishlamay qoladi va xodim barcha qurilmalardan chiqariladi.
          </p>
          <button type="button" className="text-[13px] text-accent" onClick={() => setExtra((v) => !v)}>
            {extra ? "Yashirish" : "Boshqa amallar…"}
          </button>
          {extra && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => adminAct("/api/admin/logout-user", "Barcha qurilmalardan chiqarildi")}>
                Barcha qurilmalardan chiqarish
              </Button>
              <Button size="sm" onClick={() => adminAct("/api/admin/reset-2fa", "2FA o'chirildi — keyingi kirishda qayta sozlanadi")}>
                Telefon yo'qolgan: 2FA ni tiklash
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

interface AuditRow {
  id: string;
  at: string;
  user_id: string | null;
  ip: string | null;
  kind: string;
  action: string | null;
  ok: boolean;
  detail: { login?: string; reason?: string; error?: string; newDevice?: boolean } | null;
}

const AUDIT_LABELS: Record<string, string> = {
  login: "Kirish",
  "login-2fa": "2FA kodi",
  logout: "Chiqish",
  "password-change": "Parol almashtirildi",
  "2fa-enable": "2FA yoqildi",
  "2fa-disable": "2FA o'chirildi",
  "admin-credentials": "Admin: login/parol berdi",
  "admin-reset-2fa": "Admin: 2FA tiklandi",
  "admin-logout-user": "Admin: qurilmalardan chiqardi",
  "admin-export": "Zaxira yuklab olindi",
  action: "Amal",
};

/** Xavfsizlik jurnali: kirishlar, xato urinishlar va rad etilgan amallar (o'chirib bo'lmaydi). */
function SecurityLog() {
  const look = useErp();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [onlyBad, setOnlyBad] = useState(true);
  useEffect(() => {
    void api<{ rows: AuditRow[] }>("/api/admin/audit")
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, []);
  const name = (id: string | null) => (id ? (look.state.users.find((u) => u.id === id)?.name ?? id) : "—");
  const list = (rows ?? []).filter((r) =>
    onlyBad ? !r.ok || (r.kind !== "action" && r.kind !== "login") || r.detail?.newDevice : r.kind !== "action" || !r.ok,
  );
  return (
    <Card className="mt-4">
      <CardHeader
        title="Xavfsizlik jurnali"
        sub="Kim, qachon, qayerdan kirdi; noto'g'ri urinishlar va rad etilgan amallar. Bu jurnalni o'zgartirib yoki o'chirib bo'lmaydi."
        right={
          <label className="flex items-center gap-2 text-[13px] text-label2">
            <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />
            Faqat muhimlari
          </label>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="text-left text-xs text-label2">
            <tr>
              <th className="px-4 py-2 font-medium">Vaqt</th>
              <th className="px-4 py-2 font-medium">Xodim</th>
              <th className="px-4 py-2 font-medium">Hodisa</th>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">Natija</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sep">
            {rows === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-label2">
                  Yuklanmoqda…
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-label2">
                  Hech narsa yo'q
                </td>
              </tr>
            ) : (
              list.slice(0, 100).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-label2">{fmtDateTime(r.at)}</td>
                  <td className="px-4 py-2 text-label">{r.user_id ? name(r.user_id) : r.detail?.login ? `«${r.detail.login}»` : "—"}</td>
                  <td className="px-4 py-2 text-label">
                    {AUDIT_LABELS[r.kind] ?? r.kind}
                    {r.action ? `: ${r.action}` : ""}
                    {r.detail?.newDevice ? " (yangi qurilma)" : ""}
                  </td>
                  <td className="px-4 py-2 font-mono text-label2">{r.ip ?? "—"}</td>
                  <td className="px-4 py-2">
                    {r.ok ? (
                      <Badge tone="green">ok</Badge>
                    ) : (
                      <Badge tone="red">{r.detail?.reason === "locked" ? "bloklangan" : (r.detail?.error ?? "rad etildi")}</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
