import { useState } from "react";
import { Icon, IconChip } from "../components/icons";
import { A, Badge, Banner, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select } from "../components/ui";
import * as act from "../lib/actions";
import { fmtDate, fmtDateTime, fmtNum } from "../lib/dates";
import { LEAD_METRIC_LABELS, fetchCbuRate, isMetaDemo, metaAccountOf, syncMeta, testMetaToken } from "../lib/integrations";
import { canEdit, canView } from "../lib/permissions";
import { useErp } from "../lib/store";
import type { Integrations as Cfg } from "../lib/types";

/** Tashqi tizimlar: Meta Ads, Markaziy bank kursi, Telegram bot holati va jurnal. */
export function Integrations() {
  const { state, me, today, run, showToast } = useErp();
  const editable = canEdit(me.role, "integrations");
  const meta = state.settings.integrations.meta;
  const cbu = state.settings.integrations.cbu;
  const demo = isMetaDemo(state);
  const [busy, setBusy] = useState<"" | "test" | "sync" | "cbu">("");
  const [manualRate, setManualRate] = useState("");
  const projects = state.projects.filter((p) => p.status === "active" && p.targetologId);
  const tg = state.settings.telegram;
  const tgUsers = state.users.filter((u) => u.active && u.telegramChatId).length;

  const test = async () => {
    setBusy("test");
    try {
      const name = await testMetaToken(meta);
      showToast(`Meta: ulanish ishlayapti — ${name}`);
      run((c) => act.logIntegration(c, "meta", true, `Meta Ads: token tekshirildi (${name})`));
    } catch (e) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Xatolik"}`);
    } finally {
      setBusy("");
    }
  };
  const sync = async () => {
    setBusy("sync");
    const res = await syncMeta(state, today);
    setBusy("");
    let n = 0;
    run((c) => {
      n = act.applyMetaSync(c, res);
    });
    const err = res.filter((r) => r.error).length;
    showToast(err ? `⚠ ${err} ta loyihada xatolik — jurnalga qarang` : n ? `${n} ta kunlik hisobot olindi${demo ? " (demo)" : ""}` : "Hamma hisobotlar joyida — yangi ma'lumot yo'q");
  };
  const pullRate = async () => {
    setBusy("cbu");
    try {
      const r = await fetchCbuRate();
      run((c) => act.setUsdRate(c, r.rate, r.date, "cbu"), `1 USD = ${fmtNum(r.rate)} so'm`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Xatolik";
      run((c) => act.logIntegration(c, "cbu", false, `${msg} — kursni qo'lda kiriting`));
      showToast(`⚠ ${msg}. Kursni qo'lda kiriting`);
    } finally {
      setBusy("");
    }
  };
  const saveMeta = (patch: Partial<Omit<Cfg["meta"], "accounts">>, toast?: string) => run((c) => act.saveMetaSettings(c, patch), toast);

  return (
    <>
      <PageHeader title="Integratsiyalar" sub="Tashqi tizimlardan ma'lumot qo'lda kiritilmaydi — o'zi olinadi" />
      <Banner tone="amber">
        Demo: tokenlar faqat shu brauzerda saqlanadi va so'rovlar brauzerdan yuboriladi. Haqiqiy tizimda bu ishni server har kuni ertalab bajaradi, tokenlar hech kimga ko'rinmaydi.
      </Banner>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={{ name: "target", color: "blue" }}
            title="Meta Ads (Facebook / Instagram reklama)"
            sub="Har bir loyihaning kunlik sarfi, ko'rishlar, kliklar va lidlar target hisobotiga o'zi tushadi"
            right={demo ? <Badge tone="gray">Demo rejim</Badge> : <Badge tone="green">Token kiritilgan</Badge>}
          />
          <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2">
            <Field label="Kirish tokeni (Marketing API)" hint="Bo'sh — demo rejim: namunaviy raqamlar">
              <Input
                type="password"
                autoComplete="off"
                defaultValue={meta.token}
                disabled={!editable}
                placeholder="EAAB…"
                onBlur={(e) => e.target.value.trim() !== meta.token && saveMeta({ token: e.target.value.trim() }, "Token saqlandi")}
              />
            </Field>
            <Field label="Lid deb hisoblanadi">
              <Select
                value={meta.leadMetric}
                disabled={!editable}
                onChange={(e) => saveMeta({ leadMetric: e.target.value as Cfg["meta"]["leadMetric"] }, "Saqlandi")}
                options={(Object.keys(LEAD_METRIC_LABELS) as Cfg["meta"]["leadMetric"][]).map((k) => ({ value: k, label: LEAD_METRIC_LABELS[k] }))}
              />
            </Field>
            <Field label="Graph API versiyasi">
              <Input defaultValue={meta.apiVersion} disabled={!editable} onBlur={(e) => /^v\d+\.\d+$/.test(e.target.value.trim()) && saveMeta({ apiVersion: e.target.value.trim() }, "Saqlandi")} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-[14px] text-label">
              <input type="checkbox" checked={meta.autoSync} disabled={!editable} onChange={(e) => saveMeta({ autoSync: e.target.checked }, "Saqlandi")} />
              Har kuni avtomatik (sayt ochilganda o'tgan kunlar olinadi)
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="border-y border-sep text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-label3">
                  <th className="px-5 py-2">Loyiha</th>
                  <th className="px-3 py-2">Reklama kabineti ID</th>
                  <th className="px-3 py-2">Oxirgi hisobot</th>
                  <th className="px-5 py-2">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {projects.map((p) => {
                  const acc = metaAccountOf(state, p.id);
                  const last = state.targetReports.filter((r) => r.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
                  return (
                    <tr key={p.id}>
                      <td className="px-5 py-2 font-medium text-label">{p.name}</td>
                      <td className="px-3 py-2">
                        <Input
                          key={acc}
                          defaultValue={acc}
                          disabled={!editable}
                          placeholder="act_1234567890"
                          aria-label={`${p.name}: reklama kabineti ID`}
                          className="!w-48 !py-1.5 !text-[13px]"
                          onBlur={(e) => e.target.value.trim() !== acc && run((c) => act.setMetaAccount(c, p.id, e.target.value), "Saqlandi")}
                        />
                      </td>
                      <td className="px-3 py-2 text-label2">
                        {last ? (
                          <>
                            {fmtDate(last.date)} · {last.source === "meta" ? "Meta" : "qo'lda"}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-2">{acc ? <Badge tone="green">Ulangan</Badge> : <Badge tone="gray">Qo'lda kiritiladi</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            <Button variant="primary" onClick={sync} disabled={busy !== ""}>
              {busy === "sync" ? "Olinmoqda…" : "Hozir sinxronlash"}
            </Button>
            <Button onClick={test} disabled={busy !== "" || demo}>
              {busy === "test" ? "Tekshirilmoqda…" : "Ulanishni tekshirish"}
            </Button>
            <span className="text-[13px] text-label3">Oxirgi sinxron: {meta.lastSync ? fmtDateTime(meta.lastSync) : "—"}</span>
          </div>
          <details className="border-t border-sep px-5 py-3 text-[13px] text-label2">
            <summary className="cursor-pointer font-semibold text-label">Token va kabinet ID qayerdan olinadi?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Meta Business Suite → Biznes sozlamalari → Tizim foydalanuvchilari → yangi foydalanuvchi.</li>
              <li>«Token yaratish»: ilovani tanlang va <b>ads_read</b> ruxsatini belgilang. Tokenni yuqoriga kiriting.</li>
              <li>Tizim foydalanuvchisiga mijozning reklama kabinetini biriktiring.</li>
              <li>Kabinet ID — Ads Manager manzilidagi act= dan keyingi raqam.</li>
            </ol>
          </details>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader icon={{ name: "wallet", color: "green" }} title="Markaziy bank kursi" sub="USD tranzaksiyalar va reklama sarfi shu kurs bilan so'mga o'giriladi" />
            <div className="px-5 pb-4">
              <div className="tabular text-[30px] font-bold tracking-tight text-label">1 USD = {fmtNum(state.settings.usdRate)} so'm</div>
              <div className="mt-0.5 text-[13px] text-label2">{cbu.rateDate ? `${fmtDate(cbu.rateDate)} holatiga` : "Sana noma'lum"}</div>
              {editable && (
                <>
                  <Button className="mt-3 w-full" onClick={pullRate} disabled={busy !== ""}>
                    {busy === "cbu" ? "Olinmoqda…" : "Markaziy bankdan yangilash"}
                  </Button>
                  <div className="mt-3 flex gap-2">
                    <Input type="number" min={0} placeholder="Qo'lda: 12650" value={manualRate} onChange={(e) => setManualRate(e.target.value)} aria-label="Kursni qo'lda kiritish" className="!py-1.5" />
                    <Button
                      onClick={() => {
                        if (run((c) => act.setUsdRate(c, Number(manualRate), today, "manual"), "Kurs saqlandi")) setManualRate("");
                      }}
                      disabled={!(Number(manualRate) > 0)}
                    >
                      Saqlash
                    </Button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-[14px] text-label">
                    <input type="checkbox" checked={cbu.autoUpdate} onChange={(e) => run((c) => (c.s.settings.integrations.cbu.autoUpdate = e.target.checked), "Saqlandi")} />
                    Har kuni avtomatik yangilash
                  </label>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={{ name: "send", color: "teal" }} title="Telegram bot" sub="Bildirishnomalar va kunlik eslatmalar" />
            <div className="space-y-1 px-5 pb-4 text-[14px] text-label">
              <div className="flex items-center justify-between">
                <span className="text-label2">Holat</span>
                {tg.enabled && tg.botToken ? <Badge tone="green">Ishlayapti</Badge> : tg.enabled ? <Badge tone="gray">Demo (token yo'q)</Badge> : <Badge tone="red">O'chirilgan</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-label2">Ulangan xodimlar</span>
                <b>
                  {tgUsers} / {state.users.filter((u) => u.active).length}
                </b>
              </div>
              {canView(me.role, "admin") ? (
                <A href="/admin" className="mt-2 inline-block text-[13px] font-semibold text-accent">
                  Sozlash →
                </A>
              ) : (
                <p className="mt-2 text-[12px] text-label3">Sozlash — tizim administratorida</p>
              )}
            </div>
          </Card>
        </div>

        <Card className="xl:col-span-3">
          <CardHeader icon={{ name: "history", color: "indigo" }} title="Jurnal" sub="Avtomatik va qo'lda bajarilgan sinxronlar" />
          {state.integrationLog.length === 0 ? (
            <Empty>Hali yozuv yo'q</Empty>
          ) : (
            <ul className="divide-y divide-sep">
              {state.integrationLog.slice(0, 20).map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-5 py-2.5 text-[14px]">
                  <IconChip name={l.kind === "meta" ? "target" : "wallet"} color={l.ok ? (l.kind === "meta" ? "blue" : "green") : "red"} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className={l.ok ? "text-label" : "text-red"}>
                      {!l.ok && <Icon name="alert" size={14} className="mr-1 inline" />}
                      {l.text}
                    </div>
                    <div className="text-[12px] text-label3">{fmtDateTime(l.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
