// Operatsion tarix (demo): o'tgan davrlar postlari, butun davr target hisobotlari, oylik hisobotlar
// va 6 oylik lidlar oqimi. Deterministik — har safar bir xil natija.
import { addDays, diffDays } from "./dates";
import { periodAt } from "./period";
import type { ErpState, Lead, LeadStage, PostFormat, Project } from "./types";

/** Oddiy deterministik tasodifiy sonlar generatori. */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const TOPICS: Record<string, [PostFormat, string][]> = {
  p_mebel: [
    ["video", "Divan tanlashda 5 ta maslahat"],
    ["image", "Yangi rang palitrasi"],
    ["video", "Mijoz uyida o'rnatish"],
    ["ai", "AI post: zamonaviy oshxona g'oyalari"],
    ["video", "Sexdan reportaj"],
    ["image", "Aksiya: −10% yotoqxona to'plamlariga"],
    ["video", "Mijoz fikri"],
    ["image", "Karusel: materiallar taqqoslash"],
    ["video", "Dizayner bilan suhbat"],
    ["image", "Bo'lib to'lash shartlari"],
    ["video", "Showroom yangiliklari"],
    ["ai", "AI post: kichik kvartira uchun mebel"],
    ["image", "Hafta mahsuloti"],
    ["video", "Yetkazib berish kuni"],
  ],
  p_gym: [
    ["video", "Trener maslahati: to'g'ri nafas"],
    ["image", "Guruh mashg'ulotlari jadvali"],
    ["video", "Transformatsiya hikoyasi"],
    ["ai", "AI post: ovqatlanish mifi"],
    ["video", "Yangi trenajyorlar"],
    ["image", "Abonement aksiyasi"],
    ["video", "Challenge: 30 kunlik plank"],
    ["image", "Mijozlar fikri"],
    ["video", "Crossfit kuni"],
    ["image", "Ish vaqti va manzil"],
    ["video", "Trenerlar jamoasi"],
    ["ai", "AI post: uyda 10 daqiqalik mashq"],
  ],
  p_baraka: [
    ["video", "Haftalik aksiyalar"],
    ["image", "Karusel: tejamkor savat"],
    ["video", "Retsept: 20 daqiqada kechki ovqat"],
    ["ai", "AI post: bayram dasturxoni"],
    ["video", "Yangi mahsulotlar"],
    ["image", "Bonus karta afzalliklari"],
    ["video", "Filial sahna ortida"],
    ["image", "Dam olish kunlari chegirmasi"],
    ["video", "Fermer mahsulotlari"],
    ["image", "Mevalar haftaligi"],
    ["video", "Mijoz bilan intervyu"],
    ["ai", "AI post: maktab bozorligi"],
    ["image", "Yetkazib berish xizmati"],
  ],
  p_moda: [
    ["video", "Yangi kolleksiya obzori"],
    ["image", "Lookbook: kuz"],
    ["video", "Stilist maslahati"],
    ["ai", "AI post: rang uyg'unligi"],
    ["video", "Do'kondan tur"],
    ["image", "Aksiya: ikkinchisi −50%"],
    ["video", "Mijoz obrazi"],
    ["image", "O'lcham jadvali"],
    ["video", "Yangi kelgan mahsulotlar"],
    ["image", "Sovg'a sertifikati"],
    ["video", "Fotosessiya sahna ortida"],
    ["ai", "AI post: kapsula garderob"],
  ],
  p_burger: [
    ["video", "Burger qanday tayyorlanadi"],
    ["image", "Kombo menyu"],
    ["video", "Mijozlar reaksiyasi"],
    ["ai", "AI post: sous turlari"],
    ["video", "Yetkazib berish 30 daqiqada"],
    ["image", "Talaba chegirmasi"],
    ["video", "Oshpaz bilan tanishuv"],
    ["image", "Yangi filial"],
    ["video", "Challenge: katta burger"],
    ["image", "Oilaviy set"],
    ["video", "Kechki shahar va burger"],
    ["image", "Hafta taklifi"],
  ],
};

const isActive = (p: Project, date: string) => !(p.status === "closed" && p.closedAt && date >= p.closedAt);

export function addOperationsHistory(s: ErpState, today: string): void {
  const rand = rng(20261007);
  let seq = 0;
  const id = (p: string) => `${p}_o${(++seq).toString(36)}`;
  const histStart = `${s.settings.payrollStart}-01`;
  const yesterday = addDays(today, -1);

  for (const p of s.projects) {
    if (!p.periodStart) continue;
    const topics = TOPICS[p.id] ?? [];

    // ---------- O'tgan (yopilgan) davrlar postlari: hammasi joylangan ----------
    for (let i = 0; ; i++) {
      const per = periodAt(p, i)!;
      if (per.end > today || !isActive(p, per.start)) break;
      const days = diffDays(per.end, per.start);
      topics.forEach(([format, topic], k) => {
        const date = addDays(per.start, Math.round(((k + 0.5) * days) / topics.length));
        // Taxminan har 9-postdan biri 1 kun kechikib joylangan
        const lateBy = rand() < 0.11 ? 1 : 0;
        s.posts.push({
          id: id("post"),
          projectId: p.id,
          date,
          platform: k % 5 === 3 ? "telegram" : "instagram",
          format,
          topic,
          script: "",
          assigneeId: p.smmId,
          status: "published",
          forTarget: k % 4 === 0,
          publishedAt: addDays(date, lateBy),
          createdAt: `${addDays(per.start, -5)}T09:00:00.000Z`,
        });
      });
    }

    // ---------- Target kunlik hisobotlari (byudjetga mos) ----------
    if (p.targetologId && p.adBudgetUsd) {
      const daily = (p.adBudgetUsd * s.settings.usdRate * 0.95) / 30;
      const ctrBase = 0.016 + rand() * 0.006;
      const crBase = 0.035 + rand() * 0.02;
      for (let dte = p.periodStart > histStart ? p.periodStart : histStart; dte <= yesterday; dte = addDays(dte, 1)) {
        if (!isActive(p, dte)) break;
        // Sharq Mebel uchun kechagi hisobot ataylab kiritilmagan — marketolog belgini ko'radi
        if (p.id === "p_mebel" && dte === yesterday) continue;
        const k = 0.82 + rand() * 0.36;
        const spend = Math.round((daily * k) / 1000) * 1000;
        const views = Math.round(spend / (11 + rand() * 3));
        const clicks = Math.round(views * ctrBase * (0.8 + rand() * 0.4));
        s.targetReports.push({
          id: id("tr"),
          projectId: p.id,
          date: dte,
          spend,
          views,
          clicks,
          leads: Math.max(0, Math.round(clicks * crBase * (0.7 + rand() * 0.6))),
          note: rand() < 0.04 ? "Kreativ almashtirildi" : "",
          authorId: p.targetologId,
          source: rand() < 0.3 ? "meta" : "manual",
        });
      }
    }

    // ---------- Yopilgan davrlar uchun SMM oylik hisoboti ----------
    for (let i = 0; ; i++) {
      const per = periodAt(p, i)!;
      if (per.end > today || !isActive(p, per.start)) break;
      const tr = s.targetReports.filter((r) => r.projectId === p.id && r.date >= per.start && r.date < per.end);
      const paidViews = tr.reduce((a, r) => a + r.views, 0);
      const adLeads = tr.reduce((a, r) => a + r.leads, 0);
      const submitted = addDays(per.end, 2);
      if (submitted > today) continue;
      const followers = Math.round(220 + rand() * 520);
      const best = topics[Math.floor(rand() * topics.length)]?.[1] ?? "video kontent";
      s.reports.push({
        id: id("rep"),
        projectId: p.id,
        periodIndex: i,
        fileLink: `https://drive.google.com/file/d/${p.id}-hisobot-${i + 1}`,
        reach: Math.round(paidViews * 1.35 + 15_000 + rand() * 20_000),
        followers,
        leads: adLeads + Math.round(5 + rand() * 15),
        summary: `Reja: ${topics.length} post, hammasi joylandi. Eng yaxshi natija — «${best}». Obunachilar +${followers}. Keyingi oy: video ulushini oshirish va retarget kampaniyasi.`,
        authorId: p.smmId,
        submittedAt: `${submitted}T12:00:00.000Z`,
      });
    }
  }

  // ---------- 6 oylik lidlar oqimi (sotuv analitikasi uchun) ----------
  const prefixes = ["Nur", "Asl", "Grand", "Smart", "Bahor", "Lux", "Pro", "Zamon", "Oila", "City", "Gold", "Mega", "Sevimli", "Bek", "Tez", "Yangi", "Orzu", "Shams", "Ideal", "Navro'z"];
  const kinds = ["Optika", "Kafe", "Mebel", "Kids", "Market", "Go'zallik saloni", "Fitness", "Avto", "Restoran", "Dental", "Zargarlik", "Stroy", "Tort", "Tekstil", "Kuryer", "O'quv markazi", "Gullar", "Klinika", "Mehmonxona", "Do'kon"];
  const sources: [string, number, number][] = [
    // manba, ulush, "sifatli" bo'lish ehtimoli
    ["Instagram", 0.34, 0.55],
    ["Meta Ads", 0.3, 0.4],
    ["Telegram", 0.1, 0.5],
    ["Sayt", 0.1, 0.65],
    ["Tavsiya", 0.11, 0.85],
    ["Boshqa", 0.05, 0.45],
  ];
  const services = ["SMM to'liq paket", "Target reklama", "Kontent ishlab chiqarish", "Brending", "Konsultatsiya"];
  const unfitReasons = ["Byudjet to'g'ri kelmadi", "Boshqa agentlikni tanladi", "Hozircha kerak emas", "Narx qimmat deb hisobladi", "Natija kafolatini talab qildi"];
  const lowReasons = ["Raqam noto'g'ri", "3 marta javob bermadi", "Tasodifiy ariza", "Ish qidiruvchi, mijoz emas"];
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
  const span = diffDays(addDays(today, -8), histStart);
  const total = 96;
  for (let k = 0; k < total; k++) {
    const created = addDays(histStart, Math.round((k / total) * span + rand() * 4));
    let r = rand();
    let src = sources[0]!;
    for (const x of sources) {
      if (r < x[1]) {
        src = x;
        break;
      }
      r -= x[1];
    }
    const good = rand() < src[2];
    let stage: LeadStage;
    let maxStep: number;
    let reason: string | undefined;
    if (!good) {
      stage = "lowquality";
      maxStep = rand() < 0.5 ? 0 : 1;
      reason = pick(lowReasons);
    } else {
      // Sifatli lid: qanchalik uzoqqa borgan
      const q = rand();
      maxStep = q < 0.35 ? 1 : q < 0.7 ? 2 : 3;
      const old = diffDays(today, created) > 30;
      stage = old || rand() < 0.75 ? "unfit" : "waiting";
      reason = stage === "unfit" ? pick(unfitReasons) : undefined;
    }
    const name = `${prefixes[k % prefixes.length]} ${kinds[(k * 7) % kinds.length]}`;
    const lead: Lead = {
      id: id("lead"),
      name,
      phone: `+998 9${Math.floor(rand() * 10)} ${String(100 + Math.floor(rand() * 899))} ${String(10 + Math.floor(rand() * 89))} ${String(10 + Math.floor(rand() * 89))}`,
      source: src[0],
      service: pick(services),
      note: "",
      operatorId: k % 2 ? "u_op2" : "u_op1",
      stage,
      maxStep,
      rejectReason: reason,
      meeting: maxStep >= 2 ? { date: addDays(created, 2 + Math.floor(rand() * 4)), time: "15:00", marketologId: "u_mk" } : undefined,
      nextContactDate: stage === "waiting" ? addDays(today, 3 + Math.floor(rand() * 10)) : undefined,
      history: [],
      createdAt: `${created}T${String(9 + Math.floor(rand() * 8)).padStart(2, "0")}:00:00.000Z`,
    };
    s.leads.push(lead);
  }
  // Shartnoma tuzilgan lidlar voronkani to'liq bosib o'tgan; lid shartnomadan 1–4 hafta oldin kelgan
  s.leads
    .filter((l) => l.stage === "contract")
    .forEach((l, k) => {
      l.maxStep = 4;
      const p = s.projects.find((x) => x.id === l.projectId);
      if (p) {
        const created = addDays(p.contractDate, -(9 + ((k * 5) % 18)));
        l.createdAt = `${created}T10:00:00.000Z`;
        l.meeting = { date: addDays(created, 3), time: "11:00", marketologId: p.marketologId };
      }
    });
}
