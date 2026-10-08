import { Icon, IconChip, type ChipColor, type IconName } from "../components/icons";
import { A, Card, CardHeader, PageHeader } from "../components/ui";
import { ROLE_LABELS } from "../lib/labels";
import { SERVICE_META } from "../lib/services";

interface Stage {
  n: number;
  title: string;
  who: string;
  icon: IconName;
  color: ChipColor;
  does: string;
  auto: string[];
  href: string;
}

const STAGES: Stage[] = [
  {
    n: 1,
    title: "Lid",
    who: "Call operator",
    icon: "phone",
    color: "green",
    does: "Lidga qo'ng'iroq qiladi, aloqa tarixini yozadi, marketolog bilan uchrashuv belgilaydi.",
    auto: ["Uchrashuv belgilansa — marketologga xabar", "Rad etishda sabab majburiy"],
    href: "/crm",
  },
  {
    n: 2,
    title: "Shartnoma",
    who: "Marketolog",
    icon: "checkSeal",
    color: "purple",
    does: "«Shartnoma bo'ldi» — lid ma'lumotlari Loyiha kartasiga ko'chadi, tarif va oylik summa kiritiladi.",
    auto: ["Oldindan to'lov fakturasi chiqadi", "Operatorga shartnoma bonusi hisoblanadi"],
    href: "/loyihalar",
  },
  {
    n: 3,
    title: "Oldindan to'lov",
    who: "Moliya",
    icon: "wallet",
    color: "green",
    does: "Mijoz to'lovini fakturaga bog'lab qabul qiladi (100% yoki 50%).",
    auto: ["To'lov kelmaguncha yangi vazifa ochilmaydi", "To'lov kelsa — marketolog va SMM'ga xabar"],
    href: "/moliya/fakturalar",
  },
  {
    n: 4,
    title: "Strategiya",
    who: "Marketolog",
    icon: "sparkle",
    color: "indigo",
    does: "Brif, strategiya, konkurent analiz, SWOT, maqsadli auditoriya. Hammasi tayyor bo'lgach SMM va targetologga uzatadi.",
    auto: ["5 blok «Tayyor» bo'lmaguncha uzatib bo'lmaydi"],
    href: "/loyihalar",
  },
  {
    n: 5,
    title: "Kontent reja",
    who: "SMM menejer",
    icon: "calendar",
    color: "red",
    does: "Marketolog bergan oylik topshiriq bo'yicha (nechta video, dizayn, matn, stories): sana, platformalar, tur, mavzu, ssenariy. Bitta post bir nechta platformaga qo'yilsa ham 1 ta sanaladi.",
    auto: [
      "Topshiriq va reja solishtiriladi — yetishmasa ogohlantirish",
      "Post sanasi o'tsa — avtomatik «Kechikdi»",
      "2 kun qolib mijozga yetmagan bo'lsa — ogohlantirish",
    ],
    href: "/kontent",
  },
  {
    n: 6,
    title: "Ishlab chiqarish",
    who: "Syomka · montaj · dizayn",
    icon: "film",
    color: "pink",
    does: "SMM syomka belgilaydi va TZ beradi; operator kadrlarni Drive'ga yuklaydi; montajyor va dizayner topshiradi, SMM qabul qiladi yoki qaytaradi.",
    auto: ["Syomkadan 1 kun oldin eslatma", "Ish qabul qilinganda — ishbay ish haqi avtomatik hisoblanadi", "Deadline o'tsa — «Kechikdi»"],
    href: "/montaj",
  },
  {
    n: 7,
    title: "Tasdiq va joylash",
    who: "Marketolog → mijoz → SMM",
    icon: "checkSeal",
    color: "purple",
    does: "Marketolog ichki tasdiqlaydi yoki izoh bilan qaytaradi; mijoz guruhda tasdiqlaydi; SMM «Joylandi» deb belgilaydi.",
    auto: ["Tasdiq so'rovi — marketologga xabar"],
    href: "/tasdiqlash",
  },
  {
    n: 8,
    title: "Target va davr",
    who: "Targetolog",
    icon: "target",
    color: "orange",
    does: "Reklamani yoqadi, har kuni hisobot kiritadi (qo'lda yoki Meta'dan).",
    auto: ["Birinchi reklama sanasi — hisob davrining boshi", "Kechagi hisobot bo'lmasa — marketologga belgi"],
    href: "/target",
  },
  {
    n: 9,
    title: "Hisobot va keyingi oy",
    who: "SMM · Moliya",
    icon: "send",
    color: "blue",
    does: "SMM oylik hisobotni topshiradi; davr yopilishidan 3 kun oldin keyingi oy fakturasi chiqadi, moliya to'lovni kuzatadi.",
    auto: ["Davr yopilganda — loyiha oyligi hisoblanadi", "To'lov kechiksa — qizil belgi, qarz va kunlar"],
    href: "/moliya",
  },
];

const MONEY: { title: string; icon: IconName; color: ChipColor; steps: string[] }[] = [
  {
    title: "Mijoz puli",
    icon: "arrowUpRight",
    color: "green",
    steps: ["Faktura (davr uchun)", "To'lov → bank/kassa", "Daromad davr kunlariga taqsimlanadi", "Qarz bo'lsa — debitorlik va akt-sverka"],
  },
  {
    title: "Xodim puli",
    icon: "wallet",
    color: "indigo",
    steps: [
      "Ish qabul qilindi / davr yopildi / oy tugadi",
      "Hisoblash (xodim «Mening hisobim»da ko'radi)",
      "Moliya tasdiqlaydi",
      "10-sanada to'lov — qarz yopiladi",
    ],
  },
  {
    title: "Reklama byudjeti",
    icon: "target",
    color: "pink",
    steps: ["Mijoz USD to'laydi (tranzit)", "Meta Ads kartaga sarflanadi", "Daromad ham, xarajat ham emas", "Qoldiq — mijoz puli (kreditorlik)"],
  },
];

export function Process() {
  return (
    <>
      <PageHeader title="Qanday ishlaydi" sub="Lid kelganidan to'lov va hisobotgacha — har bosqichda kim nima qiladi va tizim nimani o'zi bajaradi" />
      <div className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {STAGES.map((s) => (
          <A key={s.n} href={s.href} className="block">
            <Card className="h-full p-5 transition duration-300 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <IconChip name={s.icon} color={s.color} size={38} />
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-label3">{s.n}-bosqich</div>
                    <div className="text-[17px] font-bold tracking-tight text-label">{s.title}</div>
                  </div>
                </div>
                <span className="rounded-full bg-fill px-2.5 py-1 text-[11px] font-semibold text-label2">{s.who}</span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-label">{s.does}</p>
              <ul className="mt-3 space-y-1.5">
                {s.auto.map((a) => (
                  <li key={a} className="flex gap-2 text-[13px] text-label2">
                    <Icon name="sparkle" size={14} className="mt-0.5 shrink-0 text-accent" />
                    {a}
                  </li>
                ))}
              </ul>
            </Card>
          </A>
        ))}
      </div>

      <h2 className="mb-1 mt-8 text-[22px] font-bold tracking-tight text-label">Boshqa xizmatlar</h2>
      <p className="mb-3 text-[14px] text-label2">
        Mijoz bitta yoki bir nechta xizmatni olishi mumkin. Oylik xizmatlar (SMM, target, performance) bitta oylik fakturaga qatorlar bo'lib tushadi; bir
        martalik ishlar bosqichma-bosqich yuritiladi — ijrochi «Mening kunim»da bosqichni belgilaydi, oxirgi bosqichda qoldiq faktura chiqadi va ijrochiga haq
        hisoblanadi.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SERVICE_META.map((m) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-label">{m.label}</span>
              <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-label2">
                {m.billing === "monthly" ? "Oylik" : "Bir martalik"}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-label2">{m.hint}</p>
            {m.stages.length > 0 && <p className="mt-2 text-[12px] text-label">{m.stages.join(" → ")}</p>}
            <p className="mt-2 text-[12px] text-label3">Ijrochi: {m.assigneeRoles.map((r) => ROLE_LABELS[r]).join(" yoki ")}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-[22px] font-bold tracking-tight text-label">Pul qanday aylanadi</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        {MONEY.map((m) => (
          <Card key={m.title}>
            <CardHeader icon={{ name: m.icon, color: m.color }} title={m.title} />
            <ol className="px-5 pb-5">
              {m.steps.map((x, i) => (
                <li key={x} className="relative flex gap-3 pb-3 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/12 text-[12px] font-bold text-accent">{i + 1}</span>
                    {i < m.steps.length - 1 && <span className="mt-1 w-[2px] flex-1 rounded-full bg-fill2" />}
                  </div>
                  <span className="pt-0.5 text-[14px] text-label">{x}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 px-1 text-[13px] text-label2">
        <Icon name="sparkle" size={14} className="text-accent" /> — tizim o'zi bajaradigan amal (xabar, hisoblash, belgi).
      </p>
    </>
  );
}
