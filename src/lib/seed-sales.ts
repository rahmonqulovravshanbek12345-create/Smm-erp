// Namunaviy tijorat takliflari tarixi va integratsiya jurnali. Deterministik.
import { addDays, fmtDate, fmtNum } from "./dates";
import { defaultProposalNote } from "./tariffs";
import type { ErpState, Proposal } from "./types";

const ALL = ["t_start", "t_biznes", "t_premium"];

export function addSalesHistory(s: ErpState, today: string) {
  const items: Omit<Proposal, "number">[] = [];
  const note = (leadId: string) => {
    const l = s.leads.find((x) => x.id === leadId)!;
    return defaultProposalNote(l, s.settings.companyName);
  };

  // Katalog tarifi bilan shartnoma tuzilgan loyihalar — qabul qilingan taklif bilan boshlangan.
  for (const p of s.projects) {
    const lead = s.leads.find((l) => l.projectId === p.id);
    if (!lead || !p.tariffId) continue;
    const date = addDays(p.contractDate, -4);
    items.push({
      id: `tk_${p.id}`,
      leadId: lead.id,
      date,
      validUntil: addDays(date, 7),
      tariffIds: ALL,
      recommendedId: p.tariffId,
      discountPct: 0,
      note: note(lead.id),
      status: "accepted",
      acceptedTariffId: p.tariffId,
      decidedAt: p.contractDate,
      createdBy: lead.meeting?.marketologId ?? "u_mk",
    });
  }

  // Ofisga kelgan, lekin shartnoma bo'lmagan lidlar: taklif yuborilgan, ko'pi rad etilgan.
  let k = 0;
  for (const l of s.leads) {
    if (l.projectId || (l.maxStep ?? 0) < 3 || !l.meeting) continue;
    k++;
    const date = addDays(l.meeting.date, 1);
    if (date > today) continue;
    const recommended = ALL[k % 3 === 0 ? 2 : k % 3 === 1 ? 1 : 0]!;
    const rejected = l.stage === "unfit";
    items.push({
      id: `tk_${l.id}`,
      leadId: l.id,
      date,
      validUntil: addDays(date, 7),
      tariffIds: ALL,
      recommendedId: recommended,
      discountPct: k % 4 === 0 ? 10 : 0,
      note: note(l.id),
      status: rejected ? "rejected" : "sent",
      rejectReason: rejected ? l.rejectReason : undefined,
      decidedAt: rejected ? addDays(date, 3) : undefined,
      createdBy: l.meeting.marketologId,
    });
  }

  // Kids Academy: kecha uchrashuvdan keyin taklif yuborilgan, javob kutilmoqda.
  const kids = s.leads.find((l) => l.id === "l_4");
  if (kids) {
    items.push({
      id: "tk_kids",
      leadId: kids.id,
      date: addDays(today, -1),
      validUntil: addDays(today, 6),
      tariffIds: ALL,
      recommendedId: "t_biznes",
      discountPct: 10,
      note: note(kids.id),
      status: "sent",
      createdBy: "u_mk",
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  const perYear = new Map<string, number>();
  s.proposals = items.map((p) => {
    const y = p.date.slice(0, 4);
    const n = (perYear.get(y) ?? 0) + 1;
    perYear.set(y, n);
    return { ...p, number: `TK-${y}/${String(n).padStart(3, "0")}` };
  });

  // Integratsiya jurnali: so'nggi avtomatik sinxronlar.
  const yesterday = addDays(today, -1);
  s.integrationLog = [
    { id: "il_1", at: `${today}T04:05:00.000Z`, kind: "cbu", ok: true, text: `Markaziy bank kursi: 1 USD = ${fmtNum(s.settings.usdRate)} so'm` },
    { id: "il_2", at: `${today}T04:05:10.000Z`, kind: "meta", ok: true, text: `Meta Ads: FitLife Gym, Baraka Market, Burger House — ${fmtDate(yesterday)} kunlik hisobotlari olindi (demo)` },
  ];
}
