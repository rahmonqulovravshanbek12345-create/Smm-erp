import { useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "./ui";
import { api } from "../lib/api";
import { fmtDateTime } from "../lib/dates";
import { useErp } from "../lib/store";

const randomWord = () => {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
};

/** Facebook Lead Ads: targetdan tushgan lidlar CRM'ga o'zi tushadi. Faqat serverli tizimda, faqat admin uchun. */
export function LeadAdsCard() {
  const { state, run, showToast, session } = useErp();
  const cfg = state.settings.integrations.leads;
  const [pageId, setPageId] = useState(cfg.pageId);
  const [pageToken, setPageToken] = useState(cfg.pageToken);
  const [appSecret, setAppSecret] = useState(cfg.appSecret);
  const [verifyToken, setVerifyToken] = useState(cfg.verifyToken);
  const [assignTo, setAssignTo] = useState(cfg.assignTo);
  const [busy, setBusy] = useState<"" | "test" | "poll">("");
  const url = `${location.origin}/api/webhooks/meta-leads`;
  const owners = state.users.filter((u) => u.active && (u.role === "operator" || u.role === "rahbar"));
  const complete = Boolean(cfg.pageId && cfg.pageToken && cfg.appSecret && cfg.verifyToken);

  const save = () =>
    run(
      "saveLeadAdsSettings",
      [{ pageId: pageId.trim(), pageToken: pageToken.trim(), appSecret: appSecret.trim(), verifyToken: verifyToken.trim(), assignTo }],
      "Saqlandi",
    );
  const call = async (what: "test" | "poll") => {
    setBusy(what);
    try {
      await session?.flush();
      if (what === "test") {
        const r = await api<{ name: string }>("/api/integrations/leads/test", {});
        showToast(`Facebook sahifasi ulangan: ${r.name}`);
      } else {
        const r = await api<{ found: number; created: number }>("/api/integrations/leads/poll", {});
        showToast(r.created ? `${r.created} ta yangi lid CRM'ga tushdi` : `Yangi lid yo'q (${r.found} ta ko'rib chiqildi)`);
      }
    } catch (e) {
      showToast(`⚠ ${e instanceof Error ? e.message : "Xatolik"}`);
    } finally {
      await session?.refresh();
      setBusy("");
    }
  };

  return (
    <Card className="xl:col-span-3">
      <CardHeader
        icon={{ name: "target", color: "indigo" }}
        title="Facebook Lead Ads → CRM"
        sub="Targetdagi lid formasini to'ldirgan odam CRM'da o'zi yangi lid bo'lib paydo bo'ladi"
        right={cfg.enabled ? <Badge tone="green">Yoqilgan</Badge> : <Badge tone="gray">O'chirilgan</Badge>}
      />
      <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2">
        <Field label="Webhook manzili (Meta'ga kiritiladi)" hint="Meta ilovasida «Callback URL» qatoriga qo'yiladi">
          <Input value={url} readOnly onFocus={(e) => e.target.select()} />
        </Field>
        <Field label="Tasdiqlash so'zi (Verify token)" hint="Meta'ga ham aynan shu so'z kiritiladi. «Yaratish» — o'zi tasodifiy so'z yozadi">
          <div className="flex gap-2">
            <Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} autoComplete="off" />
            <Button onClick={() => setVerifyToken(randomWord())}>Yaratish</Button>
          </div>
        </Field>
        <Field label="Facebook sahifa ID'si" hint="Sahifa → Haqida → Sahifa ID (raqamlar)">
          <Input value={pageId} onChange={(e) => setPageId(e.target.value)} inputMode="numeric" placeholder="1234567890" />
        </Field>
        <Field label="Sahifa kirish tokeni" hint="Ruxsat: leads_retrieval, pages_show_list. Faqat shu yerga kiriting, chatga yozmang">
          <Input type="password" autoComplete="off" value={pageToken} onChange={(e) => setPageToken(e.target.value)} placeholder="EAAB…" />
        </Field>
        <Field label="Meta ilovasi App Secret" hint="Ilova sozlamalari → Basic → App secret. Webhook haqiqiyligini tekshirish uchun">
          <Input type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
        </Field>
        <Field label="Yangi lid kimga tushadi">
          <Select
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            options={[{ value: "rotate", label: "Operatorlarga navbat bilan" }, ...owners.map((u) => ({ value: u.id, label: `Faqat ${u.name}` }))]}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        <Button variant="primary" onClick={save}>
          Saqlash
        </Button>
        <Button onClick={() => call("test")} disabled={busy !== "" || !cfg.pageToken || !cfg.pageId}>
          {busy === "test" ? "Tekshirilmoqda…" : "Sahifani tekshirish"}
        </Button>
        <Button onClick={() => call("poll")} disabled={busy !== "" || !cfg.enabled}>
          {busy === "poll" ? "Tekshirilmoqda…" : "Hozir lidlarni olish"}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-[14px] text-label">
          <input
            type="checkbox"
            checked={cfg.enabled}
            disabled={!cfg.enabled && !complete}
            onChange={(e) => run("saveLeadAdsSettings", [{ enabled: e.target.checked }], e.target.checked ? "Facebook lidlari yoqildi" : "O'chirildi")}
          />
          Yoqilgan
        </label>
      </div>
      <div className="space-y-1 border-t border-sep px-5 py-3 text-[13px] text-label2">
        <div>
          Qabul qilingan lidlar: <b className="text-label">{cfg.received}</b>
          {cfg.lastLeadAt ? <> · oxirgisi {fmtDateTime(cfg.lastLeadAt)}</> : null}
        </div>
        <div>
          Zaxira tekshiruvi (har 10 daqiqada): {cfg.lastPollAt ? fmtDateTime(cfg.lastPollAt) : "hali bo'lmagan"}
          {cfg.lastError ? <span className="text-red"> · ⚠ {cfg.lastError}</span> : null}
        </div>
        <details className="pt-1">
          <summary className="cursor-pointer font-semibold text-accent">Meta tomonida nima qilish kerak?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>developers.facebook.com'da «Business» turidagi ilova yarating. Reklama akkaunti va sahifa egasi shu ilovada administrator bo'lsin.</li>
            <li>Ilovaga «Webhooks» mahsulotini qo'shing → «Page» → «Subscribe to this object». Callback URL va tasdiqlash so'zini shu yerdagidek kiriting.</li>
            <li>«leadgen» maydoniga obuna bo'ling (Subscribe). Sahifani ilovaga ulang (sahifa uchun ham «leadgen» obunasi kerak).</li>
            <li>
              Sahifa tokenini oling (Graph API Explorer → sahifani tanlang → leads_retrieval, pages_show_list, pages_manage_metadata). Uzoq muddatli token
              tavsiya etiladi.
            </li>
            <li>Bu yerga sahifa ID, token va App Secret'ni kiriting → «Saqlash» → «Sahifani tekshirish» → «Yoqilgan».</li>
            <li>Sinash: Meta «Lead Ads Testing Tool» bilan test lid yuboring — CRM'da paydo bo'lishi kerak.</li>
          </ol>
          <p className="mt-2">
            Ilova ishlab chiqish (Development) rejimida faqat ilova va sahifa administratorlarining lidlari keladi. Hammaning lidlari uchun Meta «App Review» va
            «Business Verification» talab qilishi mumkin.
          </p>
        </details>
      </div>
    </Card>
  );
}
