// SMM xizmatlari shartnomasi (agentlik shabloni): sarlavha, asosiy shartlar paneli, 10 bo'lim.
// Barcha raqam va nomlar loyiha, tarif, oylik topshiriq va kompaniya rekvizitlaridan avtomatik to'ldiriladi.
import type { ReactNode } from "react";
import { quotaFor, SHOOT_KEY, typeName } from "../lib/content";
import { fmtDate, fmtMoney, monthKey } from "../lib/dates";
import { PLATFORM_LABELS } from "../lib/labels";
import { AD_CHANNELS, hasAds, hasContent, isRecurring, serviceLabel, serviceMeta, servicesOf } from "../lib/services";
import { tariffOf } from "../lib/tariffs";
import type { ErpState, Project } from "../lib/types";
import { moneyWords } from "../lib/words";

const GOAL: Record<string, string> = {
  ct_video: "Ko'rishlar, tanilish va organik qamrov",
  ct_design: "Profil lentasining yagona vizual uslubi",
  ct_text: "Ma'lumot berish, e'lonlar",
  ct_stories: "Faol auditoriya bilan kundalik aloqa",
  ct_target_video: "Reklama kampaniyalari uchun kreativ (organik joylanmaydi)",
  [SHOOT_KEY]: "Kontent uchun xom material",
};

const TEAM: [string, string][] = [
  ["Proekt-menejer", "Muloqot, deadline, hisobotlar"],
  ["SMM menejer", "Strategiya, kontent-reja, sahifalarni yuritish"],
  ["Targetolog", "Reklama kampaniyalari, optimizatsiya"],
  ["Operator", "Video suratga olish"],
  ["Mobilograf", "Mobil syomka va kundalik kontent"],
  ["Video montajor", "Video montaj"],
  ["Grafik dizayner", "Cover, grafik postlar, kreativlar"],
  ["Kopirayter", "Ssenariy va matnlar"],
];

const BLACK = "#111113";
const LIME = "#8fd14f";

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 flex items-center gap-2.5 text-[14px] font-bold uppercase tracking-[0.02em]">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[12px]" style={{ background: BLACK, color: LIME }}>
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className="space-y-1">
    {items.map((x, i) => (
      <li key={i} className="flex gap-2">
        <span className="mt-[7px] h-2 w-2 shrink-0 rounded-[2px]" style={{ background: LIME }} />
        <span>{x}</span>
      </li>
    ))}
  </ul>
);

function Table({ head, rows, wide, total }: { head: string[]; rows: ReactNode[][]; wide?: number; total?: ReactNode[] }) {
  return (
    <div className="overflow-x-auto break-inside-avoid">
      <table className="w-full min-w-[460px] border-collapse text-[13px]">
        <thead>
          <tr style={{ background: BLACK, color: "#fff" }}>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-1.5 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-black/10">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-1.5 ${j === 0 ? "font-semibold" : ""} ${j === wide ? "w-1/2" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {total && (
            <tr className="font-bold" style={{ background: "#eef8e3" }}>
              {total.map((c, j) => (
                <td key={j} className="px-3 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Nom allaqachon «…» ichida bo'lsa, qayta o'ramaydi. */
const q = (name: string) => (name.includes("«") ? name : `«${name}»`);

const Blank = ({ v }: { v?: string }) => (v ? <>{v}</> : <>______________________</>);

function Party({ title, name, rows }: { title: string; name: string; rows: [string, string | undefined][] }) {
  return (
    <div className="rounded-[10px] border border-black/15 p-3.5 text-[13px]">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-black/55">{title}</div>
      <div className="mb-1 text-[16px] font-bold">{q(name)}</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          {k}: <Blank v={v} />
        </div>
      ))}
    </div>
  );
}

export function Contract({ s, p, today }: { s: ErpState; p: Project; today: string }) {
  const r = s.settings.requisites;
  const co = s.settings.companyName;
  const client = p.legalName ?? p.name;
  const services = servicesOf(p);
  const once = services.filter((x) => !isRecurring(x.kind));
  const smm = hasContent(p) && services.some((x) => x.kind === "smm");
  const ads = hasAds(p);
  const recurring = p.monthlyFee > 0;
  const marketing = smm || ads;
  const sub = (() => {
    let i = 0;
    return (title: string) => `1.${++i}. ${title}`;
  })();
  const teamRows = marketing
    ? TEAM.filter(([name]) => name !== "Targetolog" || ads)
    : [
        TEAM[0]!,
        ...(once.some((x) => x.kind === "video") ? [TEAM[3]!, TEAM[5]!, TEAM[7]!] : []),
        ...(once.some((x) => x.kind === "branding") ? [TEAM[6]!] : []),
        ...(once.some((x) => x.kind === "web") ? [["Veb-dasturchi", "Sayt dizayni, dasturlash va ishga tushirish"] as [string, string]] : []),
      ];
  const fee = fmtMoney(p.monthlyFee);
  const prepay = p.prepayType;
  const smmSvc = services.find((x) => x.kind === "smm");
  const t = tariffOf(s, smmSvc?.tariffId ?? p.tariffId);
  const { counts } = quotaFor(s, p, monthKey(today));
  const contentRows = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => [typeName(s, k), `${n} ta`, GOAL[k] ?? "Brend uchun kontent"] as [string, string, string]);
  const units = Object.entries(counts)
    .filter(([k, n]) => k !== SHOOT_KEY && n > 0)
    .reduce((a, [, n]) => a + n, 0);
  const platforms = t?.platforms ?? ["instagram", "telegram"];
  const adChannels = services
    .filter((x) => x.kind === "performance")
    .flatMap((x) => (x.channels ?? []).map((c) => AD_CHANNELS.find((a) => a.id === c)?.label ?? c));
  const perf = services.find((x) => x.kind === "performance");
  const onceTotal = once.reduce((a, x) => a + x.price, 0);
  const tags = [client, ...(smm ? ["SMM", "Kontent marketing"] : []), ...(ads ? ["Target reklama"] : []), ...once.map((x) => serviceLabel(x.kind))];
  const no = p.contractNo;
  const dueText = "Shartnoma imzolangan kundan 3 kun ichida";

  return (
    <div className="print-area mx-auto max-w-[820px] overflow-hidden rounded-[18px] bg-white text-[14px] leading-relaxed text-black shadow-float">
      <div className="p-5 sm:p-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 pb-3">
          <div className="text-[20px] font-extrabold tracking-tight">{co}</div>
          <div className="text-[12px] text-black/65">Toshkent shahri | Sana: {fmtDate(p.contractDate)}</div>
        </div>

        <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#4d8f1f" }}>
          {smm ? "SMM xizmatlari shartnomasi" : "Xizmatlar shartnomasi"} № {no}
        </div>
        <h1 className="mt-1 text-[34px] font-extrabold uppercase leading-[1.05] tracking-tight sm:text-[40px]">
          {marketing ? "Digital marketing" : "Xizmat ko'rsatish"}
          <br />
          <span className="inline-block rounded-lg px-2" style={{ background: BLACK, color: LIME }}>
            {smm ? "(SMM) xizmatlari" : marketing ? "xizmatlari" : once.map((x) => serviceMeta(x.kind).short).join(" · ")}
          </span>
        </h1>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((x, i) => (
            <span
              key={i}
              className="rounded border border-black/15 px-2.5 py-0.5 text-[12px] font-semibold"
              style={i === 0 ? { background: BLACK, color: "#fff" } : undefined}
            >
              {x}
            </span>
          ))}
        </div>

        <p className="mt-4 text-justify">
          Ushbu shartnoma {q(co)} ({r.director ? `rahbar: ${r.director}` : "______________________"}; keyingi o'rinlarda — <b>Ijrochi</b>) va {q(client)}
          kompaniyasi (keyingi o'rinlarda — <b>Buyurtmachi</b>) o'rtasida, Buyurtmachi brendining taniqliligini va sotuvlar sonini oshirishga qaratilgan digital
          marketing xizmatlarini ko'rsatish bo'yicha tuzildi.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Party
            title="Ijrochi"
            name={co}
            rows={[
              ["Rahbar", r.director],
              ["Manzil", r.address],
              ["Telefon", r.phone],
            ]}
          />
          <Party
            title="Buyurtmachi"
            name={client}
            rows={[
              ["Rahbar", p.contactName],
              ["Manzil", p.address],
              ["Telefon", p.phone],
            ]}
          />
        </div>

        <div className="mt-5 break-inside-avoid rounded-[10px] p-4 text-white" style={{ background: BLACK }}>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: LIME }}>
            Asosiy shartlar
          </div>
          <div className={`grid gap-4 ${marketing ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <Tile
              big={recurring ? "1 oy" : "Bosqichma-bosqich"}
              text={recurring ? "Shartnoma muddati — har oy uzaytirish sharti bilan" : "Ish bosqichlar bo'yicha topshiriladi"}
            />
            <Tile
              big={recurring ? fee : fmtMoney(onceTotal)}
              unit={recurring ? "/ oy" : ""}
              text={recurring ? `Oylik xizmat haqi (${moneyWords(p.monthlyFee)})` : `Jami xizmat haqi (${moneyWords(onceTotal)})`}
            />
            {smm ? (
              <Tile
                big={`${units} ta`}
                unit="/ oy"
                text={`Kontent birligi: ${
                  contentRows
                    .filter((x) => x[0] !== "Syomka kuni")
                    .map((x) => `${x[1].replace(" ta", "")} ${x[0].split(" (")[0]!.toLowerCase()}`)
                    .join(", ") || "kelishiladi"
                }`}
              />
            ) : (
              <Tile big={`${services.length} ta`} text={`Xizmatlar: ${services.map((x) => serviceLabel(x.kind)).join(", ")}`} />
            )}
            {marketing && <Tile big={`${platforms.length} platforma`} text={platforms.map((x) => PLATFORM_LABELS[x]).join(" · ")} />}
          </div>
          <div className="mt-4 border-t border-white/15 pt-3 text-[12.5px] text-white/85">
            To'lov tartibi: <b className="text-white">{prepay}% oldindan to'lov</b> — ish to'lov tushgan kundan boshlanadi
            {ads && (
              <>
                {" "}
                | Reklama byudjeti: <b style={{ color: LIME }}>alohida ajratiladi</b>
              </>
            )}
          </div>
        </div>

        <Sec n={1} title="Ijrochi majburiyatlari">
          {marketing && (
            <>
              <h3 className="font-bold">{sub("Ish bosqichlari")}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                {[
                  ["01", "Brifing", "Kompaniya faoliyati va maqsadlarini aniqlash uchun uchrashuv"],
                  ["02", "Tayyorgarlik", "Sahifalar tahlili va 1 oylik media-reja"],
                  ["03", "Amaliy ish", "Kontent suratga olinadi, reja asosida ish yo'lga qo'yiladi"],
                  ["04", "Hisobot", "Lidlar — kunlik, umumiy ishlar — oylik"],
                ].map(([num, ttl, txt]) => (
                  <div key={num} className="rounded-lg border border-black/10 border-l-[3px] p-2.5 text-[12.5px]" style={{ borderLeftColor: LIME }}>
                    <div className="font-bold">{num}</div>
                    <div className="font-bold">{ttl}</div>
                    <div className="text-black/70">{txt}</div>
                  </div>
                ))}
              </div>

              <h3 className="mt-3 font-bold">{sub("Media-reja va strategiya")}</h3>
              <Bullets
                items={[
                  "Bozor tahlili, maqsadli auditoriyani o'rganish va segmentlash, trendlarni kuzatish",
                  "Hududning o'ziga xos xususiyatlariga asoslangan media-reja; samarali aloqa kanallarini aniqlash va byudjetni taqsimlash",
                  `Platformalar bo'yicha strategiya: ${platforms.map((x) => PLATFORM_LABELS[x]).join(", ")}`,
                ]}
              />
            </>
          )}

          {smm && (
            <>
              <h3 className="mt-3 font-bold">{sub("Kontent marketing (oylik hajm)")}</h3>
              <Table head={["Kontent turi", "Soni", "Maqsad"]} rows={contentRows} wide={2} />
              <Bullets
                items={[
                  <>
                    <b>Muhim:</b> videolar puxta o'ylangan ssenariy asosida tayyorlanadi; suratga olish va montaj jarayonlari oldindan rejalashtiriladi.
                  </>,
                  "Hajm har oy boshida tomonlar kelishuvi bilan oylik topshiriq sifatida belgilanadi.",
                ]}
              />
            </>
          )}

          {ads && (
            <>
              <h3 className="mt-3 font-bold">{sub("Target reklama")}</h3>
              <Bullets
                items={[
                  perf
                    ? `Reklama kanallari: ${adChannels.join(", ") || "Meta, Google"} — natija uchun ishlash`
                    : "Meta Ads (Instagram / Facebook) — Ads Manager orqali brend tanilishi yoki sotuvni oshirishga yo'naltirilgan kampaniyalar",
                  "Yosh, hudud, qiziqish va xatti-harakatlar bo'yicha auditoriyani sozlash",
                  "Eng samarali natijani topish uchun bir nechta test kreativlar (plakatlar, reklama videolari) ishlab chiqish",
                  <>
                    <b>Muhim:</b> reklama uchun byudjet xizmat haqiga kirmaydi va Buyurtmachi tomonidan alohida ajratiladi.
                  </>,
                ]}
              />
            </>
          )}

          {marketing && (
            <>
              <h3 className="mt-3 font-bold">{sub("Influencer marketing")}</h3>
              <Bullets
                items={[
                  "Auditoriyasi mos blogerlarni tanlash va hamkorlikni tashkil qilish; agentlik orqali chegirmali tariflar",
                  "Ayrim blogerlar bilan barter asosida reklama tashkil qilish imkoniyati",
                ]}
              />
            </>
          )}

          {once.length > 0 && (
            <>
              <h3 className={marketing ? "mt-3 font-bold" : "font-bold"}>{sub(marketing ? "Bir martalik ishlar" : "Ish bosqichlari va muddatlar")}</h3>
              <Table
                head={["Xizmat", "Bosqichlar", "Muddat"]}
                rows={once.map((x) => [
                  serviceLabel(x.kind) + (x.title ? ` — ${x.title}` : ""),
                  (x.stages ?? []).map((st) => st.name).join(" → ") || "—",
                  x.deadline ? fmtDate(x.deadline) : "kelishiladi",
                ])}
                wide={1}
              />
            </>
          )}

          {marketing ? (
            <>
              <h3 className="mt-3 font-bold">{sub("Hisobot va KPI")}</h3>
              <Table
                head={["Metrika", "Ta'rifi", "O'lchash davri"]}
                rows={[
                  ["Lidlar soni va CPL", "Murojaatlar soni va bir murojaat narxi", "Har kuni"],
                  ["Qamrov (Reach)", "Kontent va reklama ko'rgan auditoriya", "Oylik"],
                  ["Engagement Rate", "Kontent bilan o'zaro aloqa foizi", "Oylik"],
                  ["Obunachilar o'sishi", "Sahifalardagi yangi obunachilar", "Oylik"],
                  ["ROI", "Marketing sarmoyasining qaytimi", "Oylik"],
                  ...(perf?.kpiLeads
                    ? [["Oylik maqsad", `${perf.kpiLeads} ta lid${perf.kpiCpl ? `, lid narxi ${perf.kpiCpl} USD dan oshmasligi` : ""}`, "Oylik"]]
                    : []),
                ]}
                wide={1}
              />
              <Bullets
                items={[
                  "Reklama bo'yicha ma'lumotlar kundalik raqamlarda, ish jarayonlari va natijalar bo'yicha hisobot oyma-oy taqdim etiladi",
                  "Oy oxirida «Bajarilgan ishlar akti» va natijalar taqdimoti",
                ]}
              />
            </>
          ) : (
            <Bullets
              items={[
                "Har bosqich natijasi Buyurtmachiga ko'rsatiladi va tasdig'i olinadi; tasdiqlangandan keyingina keyingi bosqichga o'tiladi",
                "Ish to'liq topshirilganda tomonlar «Bajarilgan ishlar akti»ni imzolaydi",
              ]}
            />
          )}
        </Sec>

        <Sec n={2} title="Ijrochi huquqlari">
          <Bullets
            items={[
              "Shartnomada ko'rsatilmagan xizmat turlari bo'yicha qo'shimcha taklif berish va shartnomani yangilash",
              `${prepay}% oldindan to'lov amalga oshirilmagan taqdirda ishni boshlamaslik yoki to'xtatib qo'yish`,
              "Kontent va kreativlarning ishchi (manba) fayllari Ijrochining mulki hisoblanadi va alohida kelishuvsiz topshirilmaydi",
              ...(ads ? ["Reklama byudjeti ajratilmasa yoki kelishilgan miqdordan kam bo'lsa, rejadagi natija ko'rsatkichlarini qayta ko'rib chiqish"] : []),
            ]}
          />
        </Sec>

        <Sec n={3} title="Buyurtmachi majburiyatlari">
          <Bullets
            items={[
              recurring ? `Oylik xizmat haqini (${fee}) ${prepay}% oldindan to'lash` : "Xizmat haqini shartnoma shartlariga muvofiq to'lash",
              ...(ads ? ["Reklama byudjetini kelishilgan miqdorda o'z vaqtida ajratish"] : []),
              "Brifingda ishtirok etish, kompaniya haqida kerakli ma'lumotlarni berish",
              ...(marketing
                ? [
                    "Suratga olish uchun joy, mahsulotlar va mas'ul xodim vaqtini ajratish",
                    "Kontent-reja, narxlar va aksiya shartlarini o'z vaqtida tasdiqlash",
                    "Murojaatlar bilan ishlaydigan mas'ul xodimni belgilash va sotuv statistikasini ulashish",
                  ]
                : [
                    "Materiallarni (logotip, matn, rasm, namunalar) o'z vaqtida berish va har bosqich natijasini 2 ish kuni ichida tasdiqlash yoki izoh berish",
                  ]),
            ]}
          />
        </Sec>

        <Sec n={4} title="Buyurtmachi huquqlari">
          <Bullets
            items={[
              marketing ? "Oy oxirida «Bajarilgan ishlar akti» va natijalar hisobotini olish" : "Ish topshirilganda «Bajarilgan ishlar akti»ni olish",
              ...(ads ? ["Barcha raqamlar va reklama byudjeti sarfini shaffof kuzatib borish"] : []),
              "Har bir tayyorlangan material bo'yicha feedback berish va bir marta tahrirlash talabini qo'yish",
            ]}
          />
        </Sec>

        <Sec n={5} title="Jamoa tarkibi">
          <p>Quyidagi mutaxassislar {q(p.name)} loyihasida ishtirok etadi:</p>
          <Table head={["Lavozim", "Asosiy vazifasi"]} rows={teamRows} wide={1} />
        </Sec>

        <Sec n={6} title="Shartnoma muddati va bekor qilish">
          <Bullets
            items={[
              recurring
                ? "Shartnoma 1 oy muddatga tuziladi; tomonlardan birortasi e'tiroz bildirmasa, har oy shu shartlarda uzaytiriladi"
                : "Shartnoma barcha ishlar topshirilgunga qadar amal qiladi",
              "Shartnomani bekor qilmoqchi bo'lgan tomon bu haqda kamida 10 kun oldin yozma xabar beradi",
              "Oldindan to'langan xizmat haqi ish boshlangandan so'ng qaytarilmaydi",
              "Quyidagi holatlarda jarimasiz bekor qilinishi mumkin: og'ir kasallik, vafot, epidemiya, urush yoki kompaniya bankrotligi",
            ]}
          />
        </Sec>

        <Sec n={7} title="Maxfiylik siyosati">
          <p>
            {q(co)} Buyurtmachi tomonidan berilgan barcha ma'lumotlarning, shu jumladan mijozlar bazasi, narxlar va moliyaviy ko'rsatkichlarning maxfiyligini
            ta'minlaydi.
          </p>
        </Sec>

        <Sec n={8} title="Narx va to'lov shartlari">
          <Table
            head={["To'lov turi", "Summa", "Muddat"]}
            rows={[
              ...(recurring ? [[`Oylik xizmat haqi — 1-oy (${prepay}% oldindan)`, fee, dueText]] : []),
              ...once.map((x) => [
                `${serviceLabel(x.kind)} (${x.prepayPct ?? 50}% oldindan${(x.prepayPct ?? 50) < 100 ? ", qolgani topshirilganda" : ""})`,
                fmtMoney(x.price),
                dueText,
              ]),
              ...(ads ? [["Reklama byudjeti", "Alohida", "Reklama platformalariga, Buyurtmachi tomonidan"]] : []),
              ["Blogerlar reklamasi (agar kelishilsa)", "Alohida", "Har bir reklama bo'yicha kelishiladi"],
            ]}
            wide={2}
            total={[
              recurring ? "Ja'mi oylik xizmat haqi (Ijrochiga):" : "Ja'mi xizmat haqi (Ijrochiga):",
              recurring ? fee : fmtMoney(onceTotal),
              recurring ? `Har oy boshida, ${prepay}% oldindan` : "Shartnoma shartlariga muvofiq",
            ]}
          />
          <p className="pt-1">
            <b>8.1.</b> Agar to'lov pul o'tkazish sharti bilan amalga oshirilsa, umumiy to'lov summasi O'zbekiston Respublikasi Markaziy bankining o'sha kundagi
            AQSH dollari kursida so'mga o'giriladi va umumiy to'lov summasiga 2% ustama qo'yiladi.
          </p>
          <p>
            <b>8.2.</b> Ijrochi ishni {prepay}% oldindan to'lov tushgan kundan boshlaydi
            {recurring ? "; keyingi oylar uchun to'lov ham har oy boshida oldindan amalga oshiriladi" : ""}.
          </p>
          <p>
            <b>8.3.</b> {ads ? "Reklama byudjeti va blogerlar reklamasi xarajatlari" : "Blogerlar reklamasi xarajatlari"} xizmat haqiga kirmaydi.
          </p>
        </Sec>

        <Sec n={9} title="Tomonlarning rekvizitlari">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Party
              title="Ijrochi"
              name={co}
              rows={[
                ["Nomi", co],
                ["Manzil", r.address],
                ["Telefon", r.phone],
                ["STIR (INN)", r.inn],
                ["H/R", r.bankAccount],
                ["Bank", r.bankName],
                ["MFO", r.mfo],
              ]}
            />
            <Party
              title="Buyurtmachi"
              name={client}
              rows={[
                ["Nomi", client],
                ["Manzil", p.address],
                ["Telefon", p.phone],
                ["STIR (INN)", p.inn],
                ["H/R", undefined],
                ["Bank", undefined],
                ["MFO", undefined],
              ]}
            />
          </div>
        </Sec>

        <Sec n={10} title="Imzolar">
          <div className="grid grid-cols-1 gap-6 pt-1 text-[13px] sm:grid-cols-2">
            {[
              { role: "Ijrochi", name: co, who: r.director },
              { role: "Buyurtmachi", name: client, who: p.contactName },
            ].map(({ role, name, who }) => (
              <div key={role} className="space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/55">{role}</div>
                <div className="font-bold">{q(name)}</div>
                <div>Rahbar: {who}</div>
                <div className="flex items-end gap-2">
                  <span>Imzo:</span>
                  <span className="flex-1 border-b border-black/40" />
                </div>
                <div className="flex items-end gap-2">
                  <span>Sana:</span>
                  <span className="flex-1 border-b border-black/40" />
                </div>
                <div className="text-black/55">M.O'.</div>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3 text-[13px]">
            {["Guvoh 1", "Guvoh 2"].map((g) => (
              <div key={g} className="flex items-end gap-2">
                <span>{g}:</span>
                <span className="flex-1 border-b border-black/40" />
              </div>
            ))}
          </div>
        </Sec>
      </div>
      <div className="flex items-center justify-between px-5 py-2.5 text-[11.5px] text-white/80 sm:px-12" style={{ background: BLACK }}>
        <span>
          {co} · № {no}
        </span>
        <span style={{ color: LIME }}>{p.name}</span>
      </div>
    </div>
  );
}

function Tile({ big, unit, text }: { big: string; unit?: string; text: string }) {
  return (
    <div>
      <div className="text-[24px] font-extrabold leading-none" style={{ color: LIME }}>
        {big}
        {unit && <span className="ml-1 text-[13px] font-semibold text-white/70">{unit}</span>}
      </div>
      <div className="mt-1.5 text-[12px] leading-snug text-white/80">{text}</div>
    </div>
  );
}
