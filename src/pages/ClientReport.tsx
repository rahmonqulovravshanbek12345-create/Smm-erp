import { useMemo } from "react";
import { BarList, ColumnsChart, VIZ, fmtShort } from "../components/charts";
import { Icon } from "../components/icons";
import { A, Badge, Button, Card, Empty, Ring, Select, navigate } from "../components/ui";
import { fmtDate, fmtDateShort, fmtMoney, fmtNum } from "../lib/dates";
import { FORMAT_LABELS, PLATFORM_LABELS } from "../lib/labels";
import { clientReport, delta, periodProgress, reportPeriods } from "../lib/report";
import { useErp, useLookup } from "../lib/store";

function Delta({ cur, prev, goodUp = true }: { cur: number; prev?: number; goodUp?: boolean }) {
  const d = delta(cur, prev);
  if (d === null || !Number.isFinite(d)) return null;
  const up = d >= 0;
  const good = up === goodUp;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${good ? "text-green" : "text-red"}`}>
      {up ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%
    </span>
  );
}

/** Mijozga yuboriladigan oylik hisobot — ERP ma'lumotlaridan avtomatik tuziladi. */
export function ClientReport({ projectId, periodIndex }: { projectId: string; periodIndex?: number }) {
  const { state, today, showToast } = useErp();
  const look = useLookup();
  const project = look.project(projectId);
  const periods = project ? reportPeriods(project, today) : [];
  const idx = periodIndex ?? periods.find((p) => p.end <= today)?.index ?? periods[0]?.index ?? 0;
  const r = useMemo(() => clientReport(state, projectId, idx, today), [state, projectId, idx, today]);

  if (!project || !r) return <Empty>Hisobot uchun ma'lumot yo'q</Empty>;
  if (!project.periodStart) return <Empty>Loyiha hisob davri hali boshlanmagan — birinchi reklamadan keyin hisobot tuziladi</Empty>;

  const prog = periodProgress(r.period, today);
  const planned = r.posts.length;
  const pubN = r.published.length;
  const onTimePct = pubN ? (r.onTime / pubN) * 100 : 0;
  const usd = (n: number) => `$${fmtNum(n / state.settings.usdRate)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Havola nusxalandi");
    } catch {
      showToast("⚠ Nusxalab bo'lmadi — manzil satridan oling");
    }
  };

  const kpis = [
    { l: "Joylangan postlar", v: `${pubN} / ${planned}`, d: null as null | JSX.Element },
    { l: "Reklama sarfi", v: fmtShort(r.ads.spend), sub: usd(r.ads.spend), d: <Delta cur={r.ads.spend} prev={r.prevAds?.spend} goodUp={false} /> },
    { l: "Reklamadan lidlar", v: fmtNum(r.ads.leads), d: <Delta cur={r.ads.leads} prev={r.prevAds?.leads} /> },
    { l: "Bitta lid narxi", v: fmtShort(r.ads.cpl), sub: usd(r.ads.cpl), d: <Delta cur={r.ads.cpl} prev={r.prevAds?.cpl} goodUp={false} /> },
    {
      l: "Qamrov",
      v: r.organic ? fmtShort(r.organic.reach).replace(" mln", "M").replace(" ming", "K") : fmtShort(r.ads.views).replace(" mln", "M").replace(" ming", "K"),
      sub: r.organic ? "organik + reklama" : "reklama ko'rishlari",
      d: r.organic ? <Delta cur={r.organic.reach} prev={r.prevOrganic?.reach} /> : null,
    },
    {
      l: "Yangi obunachilar",
      v: r.organic ? `+${fmtNum(r.organic.followers)}` : "—",
      d: r.organic ? <Delta cur={r.organic.followers} prev={r.prevOrganic?.followers} /> : null,
    },
  ];

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <A href={`/loyiha/${projectId}`} className="text-[13px] font-semibold text-accent">
          ← {project.name}
        </A>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Hisobot davri"
            value={String(idx)}
            onChange={(e) => navigate(`/hisobot/${projectId}/${e.target.value}`)}
            className="!w-64 !py-1.5 !text-[13px]"
            options={periods.map((p) => ({
              value: String(p.index),
              label: `${p.index + 1}-davr: ${fmtDate(p.start)} – ${fmtDate(p.end)}${p.end > today ? " (joriy)" : ""}`,
            }))}
          />
          <Button onClick={copyLink}>
            <Icon name="link" size={15} /> Havola
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Icon name="upload" size={15} /> PDF / chop etish
          </Button>
        </div>
      </div>

      <div className="print-area mx-auto max-w-[1000px] space-y-4">
        {/* Muqova */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#5856D6] via-[#007AFF] to-[#30B0C7] p-6 text-white shadow-float sm:p-8">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75">{state.settings.companyName} · oylik hisobot</div>
              <h1 className="mt-2 text-[34px] font-bold leading-tight tracking-tight sm:text-[40px]">{project.name}</h1>
              <div className="mt-1 text-[15px] text-white/85">
                {r.period.index + 1}-davr · {fmtDate(r.period.start)} – {fmtDate(r.period.end)}
                {r.partial && ` · ${prog.done}/${prog.total} kun o'tdi`}
              </div>
            </div>
            <div className="text-[13px] sm:text-right text-white/80">
              <div>SMM menejer: {look.userName(project.smmId)}</div>
              <div>Marketolog: {look.userName(project.marketologId)}</div>
              {project.targetologId && <div>Targetolog: {look.userName(project.targetologId)}</div>}
              <div className="mt-1">Tayyorlandi: {fmtDate(today)}</div>
            </div>
          </div>
          {r.partial && (
            <div className="relative mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
              Oraliq hisobot — davr hali yakunlanmagan
            </div>
          )}
        </div>

        {/* Asosiy ko'rsatkichlar */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {kpis.map((k) => (
            <Card key={k.l} className="p-4">
              <div className="text-[12px] font-medium text-label2">{k.l}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[26px] font-bold tracking-tight text-label">{k.v}</span>
                {k.d}
              </div>
              {"sub" in k && k.sub && <div className="text-[12px] text-label3">{k.sub}</div>}
            </Card>
          ))}
        </div>

        {/* Kontent */}
        <Card className="p-5">
          <h2 className="text-[19px] font-bold tracking-tight text-label">Kontent rejasi bajarilishi</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-[auto_1fr_1fr]">
            <div className="flex items-center gap-4">
              <Ring value={pubN} max={Math.max(1, planned)} size={104} stroke={11}>
                <div className="text-center">
                  <div className="text-[22px] font-bold text-label">{planned ? Math.round((pubN / planned) * 100) : 0}%</div>
                  <div className="text-[11px] text-label3">bajarildi</div>
                </div>
              </Ring>
              <div className="text-[14px]">
                <div className="text-label">
                  <b>{planned}</b> ta rejadan <b>{pubN}</b> tasi joylandi
                </div>
                <div className="mt-1 text-label2">O'z vaqtida: {onTimePct.toFixed(0)}%</div>
              </div>
            </div>
            <div>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-label3">Format</div>
              <BarList
                color={VIZ.c1}
                format={(n) => `${n} ta`}
                rows={Object.entries(r.byFormat).map(([k, v]) => ({ label: FORMAT_LABELS[k as keyof typeof FORMAT_LABELS], value: v }))}
              />
            </div>
            <div>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-label3">Platforma</div>
              <BarList
                color={VIZ.c3}
                format={(n) => `${n} ta`}
                rows={Object.entries(r.byPlatform).map(([k, v]) => ({ label: PLATFORM_LABELS[k as keyof typeof PLATFORM_LABELS], value: v }))}
              />
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-sep text-left text-[11px] uppercase tracking-[0.05em] text-label3">
                  <th className="py-2 pr-2">Sana</th>
                  <th className="py-2 pr-2">Mavzu</th>
                  <th className="py-2 pr-2">Format</th>
                  <th className="py-2 pr-2">Platforma</th>
                  <th className="py-2">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep">
                {r.posts.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-label2">{fmtDateShort(p.date)}</td>
                    <td className="py-1.5 pr-2 text-label">{p.topic}</td>
                    <td className="py-1.5 pr-2 text-label2">{FORMAT_LABELS[p.format]}</td>
                    <td className="py-1.5 pr-2 text-label2">{PLATFORM_LABELS[p.platform]}</td>
                    <td className="py-1.5">
                      {p.status === "published" ? (
                        <Badge tone="green">Joylandi {p.publishedAt && p.publishedAt > p.date ? "(+1 kun)" : ""}</Badge>
                      ) : (
                        <Badge tone={p.date < today ? "red" : "gray"}>{p.date < today ? "Kechikdi" : "Rejada"}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Target */}
        {r.daily.length > 0 && (
          <Card className="p-5">
            <h2 className="text-[19px] font-bold tracking-tight text-label">Target reklama natijalari</h2>
            <p className="text-[13px] text-label2">Meta Ads · kunlik lidlar soni</p>
            <div className="mt-3">
              <ColumnsChart
                height={200}
                labels={r.daily.map((d) => d.date.slice(8, 10))}
                bars={[{ label: "Lidlar", color: VIZ.c1, values: r.daily.map((d) => d.leads) }]}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { l: "Sarf", v: fmtMoney(r.ads.spend), d: <Delta cur={r.ads.spend} prev={r.prevAds?.spend} goodUp={false} /> },
                { l: "Ko'rishlar", v: fmtNum(r.ads.views), d: <Delta cur={r.ads.views} prev={r.prevAds?.views} /> },
                { l: "Kliklar", v: fmtNum(r.ads.clicks), d: <Delta cur={r.ads.clicks} prev={r.prevAds?.clicks} /> },
                { l: "CTR", v: `${r.ads.ctr.toFixed(2)}%`, d: <Delta cur={r.ads.ctr} prev={r.prevAds?.ctr} /> },
                { l: "CPM (1000 ko'rish)", v: fmtMoney(r.ads.cpm), d: <Delta cur={r.ads.cpm} prev={r.prevAds?.cpm} goodUp={false} /> },
                { l: "Lid narxi (CPL)", v: fmtMoney(r.ads.cpl), d: <Delta cur={r.ads.cpl} prev={r.prevAds?.cpl} goodUp={false} /> },
              ].map((x) => (
                <div key={x.l} className="tile rounded-[16px] p-3">
                  <div className="text-[11px] text-label2">{x.l}</div>
                  <div className="mt-0.5 text-[15px] font-bold text-label">{x.v}</div>
                  {x.d}
                </div>
              ))}
            </div>
            {r.prevAds && <p className="mt-2 text-[12px] text-label3">▲▼ — oldingi davrga nisbatan o'zgarish.</p>}
          </Card>
        )}

        {/* Xulosa va keyingi oy */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-[19px] font-bold tracking-tight text-label">SMM menejer xulosasi</h2>
            {r.organic ? (
              <>
                <p className="mt-2 text-[14px] leading-relaxed text-label">{r.organic.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                  <Badge tone="blue">Qamrov {fmtNum(r.organic.reach)}</Badge>
                  <Badge tone="green">Obunachi +{fmtNum(r.organic.followers)}</Badge>
                  <Badge tone="violet">Jami lid {fmtNum(r.organic.leads)}</Badge>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[14px] text-label2">
                {r.partial ? "Xulosa davr yakunida qo'shiladi." : "SMM menejer xulosasi hali kiritilmagan (loyiha kartasi → Oylik hisobot)."}
              </p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-[19px] font-bold tracking-tight text-label">{r.partial ? "Davr oxirigacha rejada" : "Keyingi oy rejasidan"}</h2>
            {r.nextPosts.length === 0 ? (
              <p className="mt-2 text-[14px] text-label2">Reja tuzilmoqda.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[14px]">
                {r.nextPosts.map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <span className="w-14 shrink-0 text-label3">{fmtDateShort(p.date)}</span>
                    <span className="text-label">{p.topic}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <p className="pb-2 text-center text-[12px] text-label3">
          {state.settings.companyName} · {state.settings.requisites.phone} · Hisobot ERP ma'lumotlaridan avtomatik tuzildi
        </p>
      </div>
    </>
  );
}
