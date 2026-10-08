import type { ReactNode } from "react";
import { Icon } from "../components/icons";
import { A, Badge, Button, Card, CardHeader, Empty, PageHeader } from "../components/ui";
import { fmtDate, fmtMoney } from "../lib/dates";
import { invoicePeriod, invoiceStatus } from "../lib/finance";
import { FORMAT_LABELS, PAYMENT_KIND_LABELS, PAYMENT_STATUS, PLATFORM_LABELS } from "../lib/labels";
import { canView, visibleProjects } from "../lib/permissions";
import { reportPeriods } from "../lib/report";
import { AD_CHANNELS, hasAds, invoiceLines, isRecurring, serviceLabel, servicesOf } from "../lib/services";
import { useErp } from "../lib/store";
import { tariffOf } from "../lib/tariffs";
import type { ErpState, Project } from "../lib/types";
import { moneyWords } from "../lib/words";

// ---------- Hujjatlar markazi ----------

export function Documents() {
  const { state, me, today } = useErp();
  const projects = visibleProjects(state, me);
  const finance = canView(me.role, "finance");
  return (
    <>
      <PageHeader
        title="Hujjatlar"
        sub="Shartnoma, hisob-faktura, bajarilgan ishlar dalolatnomasi va mijoz hisobotlari — ma'lumotlardan avtomatik to'ldiriladi"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => {
          const invoices = state.invoices.filter((i) => i.projectId === p.id).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
          const periods = reportPeriods(p, today).filter((x) => x.end <= today);
          return (
            <Card key={p.id}>
              <CardHeader
                icon={{ name: "folder", color: "teal" }}
                title={p.name}
                sub={`${p.legalName ?? p.contactName} · shartnoma ${p.contractNo}`}
                right={p.status === "closed" ? <Badge>yopilgan</Badge> : undefined}
              />
              <div className="space-y-3 px-5 pb-5 text-[14px]">
                <DocRow label="Shartnoma" icon="checkSeal">
                  <DocLink href={`/hujjat/shartnoma/${p.id}`}>
                    № {p.contractNo} · {fmtDate(p.contractDate)}
                  </DocLink>
                </DocRow>
                {finance && (
                  <DocRow label="Hisob-fakturalar" icon="send">
                    {invoices.length === 0 && <span className="text-label3">—</span>}
                    {invoices.map((i) => (
                      <DocLink key={i.id} href={`/hujjat/faktura/${i.id}`} tone={invoiceStatus(state, i, today) === "overdue" ? "red" : undefined}>
                        {i.number}
                      </DocLink>
                    ))}
                  </DocRow>
                )}
                <DocRow label="Dalolatnomalar" icon="list">
                  {periods.length === 0 && <span className="text-label3">Birinchi davr yakunlangach</span>}
                  {[...periods].reverse().map((x) => (
                    <DocLink key={x.index} href={`/hujjat/dalolatnoma/${p.id}/${x.index}`}>
                      {x.index + 1}-davr
                    </DocLink>
                  ))}
                </DocRow>
                <DocRow label="Mijoz hisobotlari" icon="sparkle">
                  {reportPeriods(p, today).length === 0 && <span className="text-label3">Davr boshlanmagan</span>}
                  {[...reportPeriods(p, today)].reverse().map((x) => (
                    <DocLink key={x.index} href={`/hisobot/${p.id}/${x.index}`}>
                      {x.index + 1}-davr{x.end > today ? " (joriy)" : ""}
                    </DocLink>
                  ))}
                </DocRow>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function DocRow({ label, icon, children }: { label: string; icon: "checkSeal" | "send" | "list" | "sparkle"; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[150px_1fr]">
      <span className="flex items-center gap-1.5 text-label2">
        <Icon name={icon} size={15} /> {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function DocLink({ href, children, tone }: { href: string; children: ReactNode; tone?: "red" }) {
  return (
    <A
      href={href}
      className={`rounded-full px-2.5 py-1 text-[13px] font-semibold transition hover:brightness-95 ${tone === "red" ? "bg-red/12 text-red" : "bg-accent/12 text-accent"}`}
    >
      {children}
    </A>
  );
}

// ---------- Hujjat ko'rinishi (chop etishga tayyor) ----------

export function DocumentView({ kind, id, index }: { kind: string; id: string; index?: number }) {
  const { state, today } = useErp();
  let title = "";
  let body: ReactNode = null;
  let back = "/hujjatlar";
  if (kind === "shartnoma") {
    const p = state.projects.find((x) => x.id === id);
    if (p) {
      title = `Shartnoma № ${p.contractNo}`;
      body = <Contract s={state} p={p} />;
      back = `/loyiha/${p.id}`;
    }
  } else if (kind === "faktura") {
    const inv = state.invoices.find((x) => x.id === id);
    const p = inv && state.projects.find((x) => x.id === inv.projectId);
    if (inv && p) {
      title = `Hisob-faktura ${inv.number}`;
      const per = invoicePeriod(state, inv);
      const when = inv.serviceId
        ? inv.kind === "prepay"
          ? "oldindan to'lov"
          : "topshirildi — qoldiq to'lov"
        : `${per ? `${fmtDate(per.start)} – ${fmtDate(per.end)}` : "birinchi xizmat davri"} · ${PAYMENT_KIND_LABELS[inv.kind].toLowerCase()}`;
      const rows =
        inv.kind === "extra"
          ? [{ name: inv.note, unit: "xizmat", qty: 1, price: inv.amount }]
          : invoiceLines(state, inv).map((l) => ({ name: `${l.title} — ${when}`, unit: "xizmat", qty: 1, price: l.amount }));
      body = (
        <Paper>
          <DocHead title={`HISOB-FAKTURA № ${inv.number}`} sub={`${fmtDate(inv.issueDate)} · shartnoma № ${p.contractNo} (${fmtDate(p.contractDate)})`} />
          <Parties s={state} p={p} left="Xizmat ko'rsatuvchi" right="Buyurtmachi" />
          <ServiceTable rows={rows} />
          <p className="mt-3 text-[13px]">
            To'lov muddati: <b>{inv.dueDate ? fmtDate(inv.dueDate) : "kelishiladi"}</b> · Holat:{" "}
            {PAYMENT_STATUS[invoiceStatus(state, inv, today)].label.toLowerCase()}
          </p>
          <p className="text-[13px] text-black/60">QQS: hisoblanmaydi (aylanma soliq to'lovchisi).</p>
          <Signs left={["Rahbar", state.settings.requisites.director]} right={["Qabul qildi", p.contactName]} />
        </Paper>
      );
      back = "/moliya/fakturalar";
    }
  } else if (kind === "dalolatnoma" && index !== undefined) {
    const p = state.projects.find((x) => x.id === id);
    if (p) {
      const per = reportPeriods(p, today).find((x) => x.index === index);
      if (per) {
        title = `Dalolatnoma — ${p.name}, ${index + 1}-davr`;
        const posts = state.posts.filter((x) => x.projectId === p.id && x.date >= per.start && x.date < per.end && x.status === "published");
        const byFmt = Object.entries(posts.reduce<Record<string, number>>((a, x) => ((a[x.format] = (a[x.format] ?? 0) + 1), a), {}))
          .map(([k, v]) => `${FORMAT_LABELS[k as keyof typeof FORMAT_LABELS].toLowerCase()} — ${v} ta`)
          .join(", ");
        const amount = state.invoices.filter((i) => i.projectId === p.id && i.periodIndex === index && i.kind !== "extra").reduce((a, i) => a + i.amount, 0);
        const ad = state.targetReports.filter((r) => r.projectId === p.id && r.date >= per.start && r.date < per.end);
        const rows = [
          {
            name: `Ijtimoiy tarmoqlarni yuritish: kontent reja, ${posts.length} ta post joylandi (${byFmt || "—"})`,
            unit: "oy",
            qty: 1,
            price: amount,
          },
          ...(p.targetologId && ad.length
            ? [
                {
                  name: `Target reklamani sozlash va boshqarish (${ad.reduce((a, r) => a + r.leads, 0)} ta lid; reklama byudjeti mijoz hisobidan)`,
                  unit: "oy",
                  qty: 1,
                  price: 0,
                },
              ]
            : []),
          { name: "Oylik natijalar hisoboti", unit: "dona", qty: 1, price: 0 },
        ];
        body = (
          <Paper>
            <DocHead
              title={`BAJARILGAN ISHLAR DALOLATNOMASI № DL-${p.contractNo.split("/").pop()}-${index + 1}`}
              sub={`${fmtDate(per.end)} · shartnoma № ${p.contractNo} · xizmat davri ${fmtDate(per.start)} – ${fmtDate(per.end)}`}
            />
            <Parties s={state} p={p} left="Ijrochi" right="Buyurtmachi" />
            <ServiceTable rows={rows} />
            <p className="mt-4 text-[14px]">
              Yuqorida ko'rsatilgan xizmatlar to'liq hajmda va belgilangan muddatlarda ko'rsatildi. Buyurtmachining xizmatlar hajmi, sifati va muddatlari
              bo'yicha e'tirozlari yo'q.
            </p>
            <Signs left={["Ijrochi", state.settings.requisites.director]} right={["Buyurtmachi", p.contactName]} />
          </Paper>
        );
        back = "/hujjatlar";
      }
    }
  }

  if (!body) return <Empty>Hujjat topilmadi</Empty>;
  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <A href={back} className="text-[13px] font-semibold text-accent">
          ← Orqaga
        </A>
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-label">{title}</span>
          <Button variant="primary" onClick={() => window.print()}>
            <Icon name="upload" size={15} /> PDF / chop etish
          </Button>
        </div>
      </div>
      {body}
    </>
  );
}

function Paper({ children }: { children: ReactNode }) {
  return (
    <div className="print-area mx-auto max-w-[820px] rounded-[18px] bg-white p-5 text-[14px] leading-relaxed text-black shadow-float sm:p-12">{children}</div>
  );
}

function DocHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-[18px] font-bold uppercase tracking-[0.02em]">{title}</h1>
      <p className="mt-1 text-[13px] text-black/60">{sub}</p>
    </div>
  );
}

function Parties({ s, p, left, right }: { s: ErpState; p: Project; left: string; right: string }) {
  const r = s.settings.requisites;
  return (
    <div className="grid gap-4 text-[13px] sm:grid-cols-2">
      <div className="rounded-[12px] border border-black/10 p-3">
        <div className="text-[11px] uppercase tracking-[0.06em] text-black/50">{left}</div>
        <div className="font-semibold">{s.settings.companyName}</div>
        <div>{r.address}</div>
        <div>
          STIR: {r.inn} · MFO: {r.mfo}
        </div>
        <div>
          H/r: {r.bankAccount}, {r.bankName}
        </div>
        <div>Tel: {r.phone}</div>
      </div>
      <div className="rounded-[12px] border border-black/10 p-3">
        <div className="text-[11px] uppercase tracking-[0.06em] text-black/50">{right}</div>
        <div className="font-semibold">{p.legalName ?? p.name}</div>
        <div>{p.address ?? "—"}</div>
        <div>STIR: {p.inn ?? "—"}</div>
        <div>
          Mas'ul: {p.contactName}, {p.phone}
        </div>
      </div>
    </div>
  );
}

function ServiceTable({ rows }: { rows: { name: string; unit: string; qty: number; price: number }[] }) {
  const total = rows.reduce((a, r) => a + r.qty * r.price, 0);
  return (
    <>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-black/[0.04] text-left">
              <th className="border border-black/15 px-2 py-1.5">№</th>
              <th className="border border-black/15 px-2 py-1.5">Xizmat nomi</th>
              <th className="border border-black/15 px-2 py-1.5">O'lchov</th>
              <th className="border border-black/15 px-2 py-1.5 text-right">Miqdor</th>
              <th className="border border-black/15 px-2 py-1.5 text-right">Narx</th>
              <th className="border border-black/15 px-2 py-1.5 text-right">Summa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border border-black/15 px-2 py-1.5">{i + 1}</td>
                <td className="border border-black/15 px-2 py-1.5">{r.name}</td>
                <td className="border border-black/15 px-2 py-1.5">{r.unit}</td>
                <td className="border border-black/15 px-2 py-1.5 text-right">{r.qty}</td>
                <td className="whitespace-nowrap border border-black/15 px-2 py-1.5 text-right">{r.price ? fmtMoney(r.price) : "narxga kiritilgan"}</td>
                <td className="whitespace-nowrap border border-black/15 px-2 py-1.5 text-right">{r.price ? fmtMoney(r.qty * r.price) : "—"}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border border-black/15 px-2 py-1.5" colSpan={5}>
                Jami
              </td>
              <td className="whitespace-nowrap border border-black/15 px-2 py-1.5 text-right">{fmtMoney(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px]">
        Jami summa: <b>{moneyWords(total)}</b>
      </p>
    </>
  );
}

function Signs({ left, right }: { left: [string, string]; right: [string, string] }) {
  return (
    <div className="mt-10 grid gap-10 text-[13px] sm:grid-cols-2">
      {[left, right].map(([role, name], i) => (
        <div key={i}>
          <div className="text-black/60">{role}</div>
          <div className="mt-8 flex items-end gap-2">
            <span className="flex-1 border-b border-black/40" />
            <span className="font-semibold">{name}</span>
          </div>
          <div className="mt-1 text-[11px] text-black/45">imzo{i === 0 ? ", muhr" : ""}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Shartnoma ----------

function Contract({ s, p }: { s: ErpState; p: Project }) {
  const r = s.settings.requisites;
  const fee = fmtMoney(p.monthlyFee);
  const words = moneyWords(p.monthlyFee);
  const services = servicesOf(p);
  const recurring = p.monthlyFee > 0;
  const once = services.filter((x) => !isRecurring(x.kind));
  const hasTarget = hasAds(p);
  const t = tariffOf(s, p.tariffId);
  const scope = t
    ? `har oy ${t.posts} ta post (${t.videos} ta video, ${t.designs} ta dizayn), ${t.stories} ta stories va ${t.shoots} ta syomka kuni bilan kontent reja (${t.platforms.map((x) => PLATFORM_LABELS[x]).join(", ")})`
    : "marketolog bilan kelishilgan oylik topshiriq bo'yicha kontent reja (video, dizayn, matn, stories)";
  const Section = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
    <section className="mt-5">
      <h2 className="mb-1.5 text-[14px] font-bold uppercase">
        {n}. {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
  return (
    <Paper>
      <DocHead title={`XIZMAT KO'RSATISH SHARTNOMASI № ${p.contractNo}`} sub={`Toshkent sh. · ${fmtDate(p.contractDate)}`} />
      <p>
        <b>{s.settings.companyName}</b> (keyingi o'rinlarda «Ijrochi») nomidan direktor <b>{r.director}</b> bir tomondan, va <b>{p.legalName ?? p.name}</b>{" "}
        (keyingi o'rinlarda «Buyurtmachi») nomidan <b>{p.contactName}</b> ikkinchi tomondan, quyidagilar haqida ushbu shartnomani tuzdilar:
      </p>
      <Section n={1} title="Shartnoma predmeti">
        <p>1.1. Ijrochi Buyurtmachiga quyidagi xizmatlarni ko'rsatadi, Buyurtmachi esa ularni qabul qiladi va haqini to'laydi:</p>
        {services.map((x, i) => (
          <p key={x.id}>
            1.{i + 2}. <b>{serviceLabel(x.kind)}</b>
            {x.title ? ` («${x.title}»)` : ""}:{" "}
            {x.kind === "smm"
              ? `ijtimoiy tarmoqlardagi sahifalarni (${p.links.split("\n").filter(Boolean).join(", ") || "Instagram, Telegram"}) yuritish — marketing strategiyasi va brif; ${scope}; syomka, montaj va dizayn; oylik natijalar hisoboti`
              : x.kind === "target"
                ? "Meta Ads (Instagram, Facebook) reklamasini sozlash, kunlik nazorat va hisobot"
                : x.kind === "performance"
                  ? `reklama kanallarida (${(x.channels ?? []).map((c) => AD_CHANNELS.find((a) => a.id === c)?.label ?? c).join(", ") || "Meta, Google"}) natija uchun ishlash${x.kpiLeads ? `; oylik maqsad — ${x.kpiLeads} ta lid${x.kpiCpl ? `, lid narxi ${x.kpiCpl} USD dan oshmasligi` : ""}` : ""}`
                  : `ish bosqichlari: ${(x.stages ?? []).map((st) => st.name).join(" → ")}${x.deadline ? `; topshirish muddati — ${fmtDate(x.deadline)}` : ""}`}
            .
          </p>
        ))}
      </Section>
      {recurring && (
        <Section n={2} title="Xizmat davri">
          <p>
            2.1. Oylik xizmatlar davri birinchi reklama (post) joylangan kundan boshlanadi va keyingi oyning shu sanasida yakunlanadi. Keyingi davrlar ketma-ket
            davom etadi.
          </p>
          <p>2.2. Har bir davr yakunida tomonlar bajarilgan ishlar dalolatnomasini imzolaydi.</p>
          {once.length > 0 && <p>2.3. Bir martalik ishlar bosqichma-bosqich bajariladi va topshirilganda alohida dalolatnoma imzolanadi.</p>}
        </Section>
      )}
      {!recurring && (
        <Section n={2} title="Ish muddati va topshirish">
          <p>2.1. Ish bosqichma-bosqich bajariladi; har bosqich natijasi Buyurtmachiga ko'rsatiladi va tasdig'i olinadi.</p>
          <p>2.2. Ish to'liq topshirilganda tomonlar bajarilgan ishlar dalolatnomasini imzolaydi.</p>
        </Section>
      )}
      <Section n={3} title="Narx va to'lov tartibi">
        {recurring && (
          <>
            <p>
              3.1. Oylik xizmatlarning bir oylik narxi: <b>{fee}</b> ({words}). QQS hisoblanmaydi.
            </p>
            <p>
              3.2. Buyurtmachi shartnoma imzolangandan keyin 3 (uch) bank kuni ichida oylik narxning {p.prepayType}% miqdorida oldindan to'lov qiladi. Ish
              oldindan to'lov kelib tushgandan keyin boshlanadi.
              {p.prepayType === 50 && " Qolgan 50% birinchi xizmat davri boshlanganidan keyin tomonlar kelishgan sanada to'lanadi."}
            </p>
            <p>
              3.3. Keyingi davrlar uchun to'lov har bir davr boshlanish kunigacha amalga oshiriladi. Ijrochi davr boshlanishidan 3 kun oldin hisob-faktura
              taqdim etadi.
            </p>
          </>
        )}
        {once.map((x, i) => (
          <p key={x.id}>
            3.{(recurring ? 4 : 1) + i}. {serviceLabel(x.kind)} narxi: <b>{fmtMoney(x.price)}</b> ({moneyWords(x.price)}). {x.prepayPct ?? 50}% oldindan
            to'lanadi
            {(x.prepayPct ?? 50) < 100 ? ", qolgan qismi ish topshirilganda" : ""}. Ish oldindan to'lov kelib tushgandan keyin boshlanadi.
          </p>
        ))}
        {hasTarget && (
          <p>
            3.{(recurring ? 4 : 1) + once.length}. Reklama byudjeti xizmat narxiga kirmaydi va Buyurtmachi tomonidan alohida to'lanadi; sarf hisoboti har oy
            taqdim etiladi.
          </p>
        )}
      </Section>
      <Section n={4} title="Tomonlarning majburiyatlari">
        <p>4.1. Ijrochi: ishlarni kelishilgan muddatlarda bajarish; materiallarni Buyurtmachi tasdig'iga yuborish; natijalar bo'yicha hisobot taqdim etish.</p>
        <p>
          4.2. Buyurtmachi: zarur ma'lumot va kirish huquqlarini berish; materiallarni 2 (ikki) ish kuni ichida tasdiqlash yoki izoh berish; to'lovlarni o'z
          vaqtida amalga oshirish.
        </p>
      </Section>
      <Section n={5} title="Javobgarlik">
        <p>5.1. To'lov kechiktirilganda Ijrochi yozma ogohlantirish bilan yangi ishlarni to'xtatib turishga haqli.</p>
        <p>5.2. Buyurtmachi materiallarni kechiktirib tasdiqlagan hollarda joylash muddatlari tegishli kunlarga suriladi.</p>
      </Section>
      <Section n={6} title="Amal qilish muddati">
        <p>6.1. Shartnoma imzolangan kundan kuchga kiradi va 12 oy amal qiladi. Tomonlar 30 kun oldin yozma ogohlantirib shartnomani bekor qilishi mumkin.</p>
      </Section>
      <Section n={7} title="Tomonlarning rekvizitlari va imzolari">
        <Parties s={s} p={p} left="Ijrochi" right="Buyurtmachi" />
      </Section>
      <Signs left={["Ijrochi, direktor", r.director]} right={["Buyurtmachi", p.contactName]} />
    </Paper>
  );
}
