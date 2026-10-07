import { useState } from "react";
import { Badge, Banner, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "../components/ui";
import { ROLE_DUTIES, ROLE_LABELS } from "../lib/labels";
import { ACCESS_LABELS, MATRIX_VIEW, access } from "../lib/permissions";
import { alertsFor } from "../lib/rules";
import { newId, useErp } from "../lib/store";
import { sendTelegram, telegramText } from "../lib/telegram";
import type { Role } from "../lib/types";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function Admin() {
  const { state, me, today, run, reset, showToast } = useErp();
  const [nu, setNu] = useState({ name: "", role: "smm" as Role });
  const [testing, setTesting] = useState(false);
  const [sharedChat, setSharedChat] = useState(() => me.telegramChatId ?? "");
  const [confirmReset, setConfirmReset] = useState(false);
  const tg = state.settings.telegram;

  const testTelegram = async () => {
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
    run((c) => {
      for (const u of c.s.users) u.telegramChatId = id;
      c.log("Barcha xodimlarga bitta Telegram chat ID qo'yildi (demo)", "/admin");
    }, `Chat ID ${state.users.length} ta xodimga qo'yildi`);
  };

  // Haqiqiy tizimda server har kuni ertalab yuboradi; demo'da tugma bilan ko'rsatiladi.
  const sendDigest = () => {
    const token = tg.botToken.trim();
    if (!tg.enabled || !token) return showToast("⚠ Avval Telegram'ni yoqing va bot tokenini kiriting");
    let sent = 0;
    for (const u of state.users) {
      const chatId = u.telegramChatId?.trim();
      if (!u.active || !chatId) continue;
      const alerts = alertsFor(state, u, today);
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
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader title="Foydalanuvchilar" sub="Telegram chat ID — xodim botga /start bosgandan keyin @userinfobot orqali olinadi" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-label2">
                <tr>
                  <th className="px-4 py-2 font-medium">Ism</th>
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 font-medium">Telegram chat ID</th>
                  <th className="px-4 py-2 font-medium">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {state.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 text-label">{u.name}</td>
                    <td className="px-4 py-2">
                      <Select
                        value={u.role}
                        disabled={u.id === me.id}
                        onChange={(e) =>
                          run((c) => {
                            const x = c.s.users.find((y) => y.id === u.id);
                            if (x) x.role = e.target.value as Role;
                            c.log(`${u.name}: rol → ${ROLE_LABELS[e.target.value as Role]}`, "/admin");
                          }, "Rol o'zgartirildi")
                        }
                        options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                        className="!w-44 !py-1 !text-xs"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        key={u.telegramChatId ?? ""}
                        defaultValue={u.telegramChatId ?? ""}
                        placeholder="masalan 123456789"
                        onBlur={(e) =>
                          e.target.value !== (u.telegramChatId ?? "") &&
                          run((c) => {
                            const x = c.s.users.find((y) => y.id === u.id);
                            if (x) x.telegramChatId = e.target.value.trim() || undefined;
                          }, "Chat ID saqlandi")
                        }
                        className="!w-44 !py-1 !text-xs"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        disabled={u.id === me.id}
                        onClick={() =>
                          run((c) => {
                            const x = c.s.users.find((y) => y.id === u.id);
                            if (x) x.active = !x.active;
                          })
                        }
                      >
                        <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Faol" : "O'chirilgan"}</Badge>
                      </button>
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
              <Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} className="!w-48" />
            </Field>
            <Button
              variant="primary"
              disabled={!nu.name.trim()}
              onClick={() =>
                run((c) => {
                  c.s.users.push({ id: newId("u"), name: nu.name.trim(), role: nu.role, active: true });
                  c.log(`Yangi xodim: ${nu.name.trim()} (${ROLE_LABELS[nu.role]})`, "/admin");
                }, "Xodim qo'shildi") && setNu({ ...nu, name: "" })
              }
            >
              Qo'shish
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Telegram bot" sub="Bildirishnomalar tizim ichida va Telegram orqali" />
          <div className="space-y-3 p-4">
            <label className="flex items-center gap-2 text-sm text-label">
              <input
                type="checkbox"
                checked={tg.enabled}
                onChange={(e) =>
                  run((c) => {
                    c.s.settings.telegram.enabled = e.target.checked;
                  }, "Saqlandi")
                }
              />
              Telegram bildirishnomalarini yoqish
            </label>
            <Field label="Bot tokeni (@BotFather'dan)" hint="Bo'sh qoldirilsa, xabarlar «demo» rejimida faqat tizimda ko'rsatiladi">
              <Input
                type="password"
                defaultValue={tg.botToken}
                placeholder="123456:ABC-DEF…"
                onBlur={(e) =>
                  run((c) => {
                    c.s.settings.telegram.botToken = e.target.value.trim();
                  }, "Token saqlandi")
                }
              />
            </Field>
            <Banner tone="amber">
              Demo versiyada token faqat shu brauzerda saqlanadi. Haqiqiy tizimda bot serverda ishlaydi va token hech kimga ko'rinmaydi.
            </Banner>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-label2">
              <li>@BotFather'da /newbot buyrug'i bilan bot yarating va tokenni yuqoriga kiriting.</li>
              <li>Botingizni topib /start bosing (bot faqat /start bosgan odamga yoza oladi).</li>
              <li>Chat ID'ingizni @userinfobot'dan oling va jadvalga yoki pastdagi maydonga yozing.</li>
            </ol>
            <div className="rounded-[14px] bg-fill p-3">
              <div className="text-[13px] font-semibold text-label">Demo uchun: hamma xabar bitta Telegram'ga</div>
              <p className="mt-0.5 text-xs text-label2">
                Barcha xodimlarga bitta chat ID qo'yiladi. Har xabarda kimga ekanligi yoziladi (👤 Ism · Rol). Guruh ID'si (-100… bilan boshlanadi) ham bo'ladi — botni guruhga qo'shing.
              </p>
              <div className="mt-2 flex gap-2">
                <Input value={sharedChat} onChange={(e) => setSharedChat(e.target.value)} placeholder="masalan 123456789" className="!py-1.5 !text-[13px]" />
                <Button onClick={setChatForAll}>Hammaga qo'yish</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={testTelegram} disabled={testing}>
                {testing ? "Yuborilmoqda…" : "Menga test xabar yuborish"}
              </Button>
              <Button onClick={sendDigest}>Bugungi eslatmalarni yuborish</Button>
            </div>
            <p className="text-xs text-label3">
              Eslatmalar: deadline, kechikkan ishlar, ertangi syomka, qarzlar, to'lov muddati, qayta aloqa. Haqiqiy tizimda har kuni ertalab avtomatik yuboriladi.
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
                  run((c) => {
                    c.s.settings.companyName = e.target.value.trim() || c.s.settings.companyName;
                  }, "Saqlandi")
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
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
                    onBlur={(e) =>
                      e.target.value !== state.settings.requisites[k] &&
                      run((c) => {
                        c.s.settings.requisites[k] = e.target.value.trim();
                      }, "Rekvizit saqlandi")
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="text-[12px] text-label3">Rekvizitlar shartnoma, hisob-faktura, dalolatnoma va akt-sverkaga avtomatik tushadi.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="USD kursi (so'm)" hint="Yangi tranzaksiyalar uchun taklif">
                <Input
                  type="number"
                  defaultValue={state.settings.usdRate}
                  onBlur={(e) =>
                    run((c) => {
                      c.s.settings.usdRate = Math.max(1, Number(e.target.value) || c.s.settings.usdRate);
                    }, "Kurs saqlandi")
                  }
                />
              </Field>
              <Field label="Ish haqi kuni" hint="Oyning nechanchi kuni">
                <Input
                  type="number"
                  min={1}
                  max={28}
                  defaultValue={state.settings.payday}
                  onBlur={(e) =>
                    run((c) => {
                      c.s.settings.payday = Math.min(28, Math.max(1, Number(e.target.value) || 10));
                    }, "Saqlandi")
                  }
                />
              </Field>
              <Field label="Kechikish jarimasi, %" hint="0 — o'chirilgan">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={state.settings.latePenaltyPct}
                  onBlur={(e) =>
                    run((c) => {
                      c.s.settings.latePenaltyPct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    }, "Saqlandi")
                  }
                />
              </Field>
            </div>
            <p className="text-[12px] text-label3">Xodimlar stavkalari: Moliya → Ish haqi → Stavkalar.</p>
            <div className="border-t border-sep pt-4">
              <div className="mb-1 text-sm text-label">Demo ma'lumotlarni tiklash</div>
              <p className="mb-2 text-xs text-label2">Mijozga ko'rsatishdan oldin barcha o'zgarishlarni o'chirib, boshlang'ich holatga qaytaradi. Telegram sozlamalari saqlanib qoladi.</p>
              {confirmReset ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-red">Barcha o'zgarishlar o'chiriladi.</span>
                  <Button variant="danger" onClick={() => { reset(); setConfirmReset(false); }}>
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
    </>
  );
}
