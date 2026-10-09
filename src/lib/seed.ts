// Mijozga ko'rsatish uchun namunaviy ma'lumotlar. Barcha sanalar bugungi kunga nisbatan
// hisoblanadi, shuning uchun demo istalgan kuni ochilganda ham "jonli" ko'rinadi.
import { addDays, addMonths, diffDays, monthKey } from "./dates";
import { addFinanceHistory } from "./seed-finance";
import { addOperationsHistory } from "./seed-history";
import { addSalesHistory } from "./seed-sales";
import { AD_VIDEO, DEFAULT_CONTENT_TYPES } from "./content";
import { recurringFee, servicesSummary, stagesFor } from "./services";
import { DEFAULT_TARIFFS, SERVICE_TARIFFS } from "./tariffs";
import type {
  DocBlock,
  DocState,
  ErpState,
  Lead,
  Platform,
  Post,
  PostFormat,
  PostStatus,
  Project,
  ProjectService,
  Quota,
  ServiceKind,
  Shoot,
  Task,
  TaskStatus,
  TargetReport,
  User,
} from "./types";

export const SEED_VERSION = 9;

export function buildSeed(today: string): ErpState {
  const d = (n: number) => addDays(today, n);
  const at = (n: number, hh = 10) => `${d(n)}T${String(hh).padStart(2, "0")}:15:00.000Z`;
  let seq = 0;
  const id = (p: string) => `${p}_${(++seq).toString(36)}`;

  const users: User[] = [
    { id: "u_boss", name: "Sherzod Alimov", role: "rahbar", phone: "+998 00 000 11 22", active: true },
    { id: "u_admin", name: "Tizim administratori", role: "admin", active: true },
    { id: "u_op1", name: "Dilnoza Yusupova", role: "operator", phone: "+998 00 111 22 33", active: true },
    { id: "u_op2", name: "Jasur Aliyev", role: "operator", phone: "+998 00 222 33 44", active: true },
    { id: "u_mk", name: "Aziza Karimova", role: "marketolog", phone: "+998 00 333 44 55", active: true },
    { id: "u_smm1", name: "Madina Rashidova", role: "smm", active: true },
    { id: "u_smm2", name: "Sardor Nazarov", role: "smm", active: true },
    { id: "u_tg", name: "Bekzod Tursunov", role: "targetolog", active: true },
    { id: "u_sy", name: "Otabek Hamidov", role: "syomka", active: true },
    { id: "u_mt1", name: "Rustam Ergashev", role: "montajyor", active: true },
    { id: "u_mt2", name: "Shoxrux Qodirov", role: "montajyor", active: true },
    { id: "u_dz", name: "Nilufar Saidova", role: "dizayner", active: true },
    { id: "u_web", name: "Jamshid Rahmonov", role: "webdev", active: true },
    { id: "u_mol", name: "Gulnora Mirzayeva", role: "moliya", active: true },
  ];

  const docs = (done: DocBlock[], texts: Partial<Record<DocBlock, string>>): Record<DocBlock, DocState> => {
    const blocks: DocBlock[] = ["brief", "strategy", "competitors", "swot", "audience"];
    return Object.fromEntries(blocks.map((b) => [b, { content: texts[b] ?? "", status: done.includes(b) ? "done" : "progress", updatedAt: at(-2) }])) as Record<
      DocBlock,
      DocState
    >;
  };

  const mebelDocs = {
    brief:
      "Sharq Mebel — Toshkentdagi yumshoq va korpus mebel ishlab chiqaruvchisi, 2 ta showroom (Chilonzor, Yunusobod).\nMaqsad: oyiga 120+ sifatli lid, Instagram'da brend tanilishini oshirish.\nAsosiy mahsulot: divanlar, oshxona va yotoqxona to'plamlari. O'rtacha chek: 9–14 mln so'm.",
    strategy:
      "Kontent ustunlari: 1) mahsulot obzorlari, 2) ishlab chiqarish (ishonch), 3) mijoz fikrlari, 4) foydali maslahatlar, 5) aksiyalar.\nKPI: ER 4%+, lid narxi 35 000 so'mdan past, oyiga 12–15 post.",
    competitors:
      "Mebel City — narx past, kontent sifati o'rta.\nLoft Home — dizayn kuchli, yetkazib berish sekin.\nComfort UZ — target faol, mijoz fikrlari kam.",
    swot: "S: o'z ishlab chiqarishi, 2 yil kafolat.\nW: Instagram'da video kontent kam.\nO: bo'lib to'lash bo'yicha hamkorlik.\nT: raqobatchilarning narx urushi.",
    audience: "25–45 yosh, Toshkent, yangi uy olgan yoki ta'mir qilayotgan oilalar. Og'riq: sifat va kafolat, yetkazish muddati.",
  };
  const gymDocs = {
    brief: "FitLife Gym — 2 filialli fitnes klub. Maqsad: yillik abonement sotuvini oshirish, yangi filialni tanitish.",
    strategy: "Ustunlar: trener maslahatlari, transformatsiya hikoyalari, guruh mashg'ulotlari, aksiyalar. KPI: oyiga 80+ sinov mashg'ulotiga yozilish.",
    competitors: "Olympic Fitness — narx yuqori. Sport Life — joylashuv qulay, kontent kam.",
    swot: "S: zamonaviy jihozlar. W: parking yo'q. O: korporativ abonementlar. T: yozgi mavsumda talab pasayishi.",
    audience: "18–35 yosh, Yunusobod va Mirzo Ulug'bek, sog'lom turmush tarziga qiziquvchilar.",
  };

  const svc = (kind: ServiceKind, title: string, price: number, extra: Partial<ProjectService> = {}): ProjectService => ({
    id: id("svc"),
    kind,
    title,
    price,
    status: "active",
    createdAt: at(-60),
    ...extra,
  });
  /** Bir martalik xizmat: birinchi `done` ta bosqich berilgan sanalarda bajarilgan. */
  const once = (kind: ServiceKind, title: string, price: number, doneDates: string[], extra: Partial<ProjectService>): ProjectService =>
    svc(kind, title, price, {
      prepayPct: 50,
      stages: stagesFor(kind).map((st, i) => (doneDates[i] ? { ...st, doneAt: doneDates[i] } : st)),
      ...extra,
    });

  const P1 = "p_mebel";
  const P2 = "p_gym";
  const P3 = "p_dent";
  const P4 = "p_baraka";
  const P5 = "p_moda";
  const P6 = "p_burger";
  const P7 = "p_optika";
  const P8 = "p_avtolux";
  // Joriy davr boshlanishlari bugunga nisbatan; birinchi reklama sanasi shundan oylar oldin.
  const p1Start = addMonths(d(-20), -5);
  const p2Start = addMonths(d(-5), -3);
  const p4Start = addMonths(d(-12), -4);
  const p5Start = addMonths(d(-3), -5);
  const p6Start = addMonths(d(-15), -1);
  const p8Start = d(-22);

  const projects: Project[] = [
    {
      id: P1,
      name: "Sharq Mebel",
      leadId: "l_mebel",
      legalName: "«Sharq Mebel Group» MChJ",
      inn: "305 112 908",
      address: "Toshkent sh., Chilonzor t., 9-mavze, 12-uy",
      contactName: "Akmal Rahimov",
      phone: "+998 00 555 12 12",
      industry: "Mebel ishlab chiqarish",
      links: "instagram.com/demo_sharq.mebel\nt.me/demo_sharqmebel",
      contractNo: "SH-2026/018",
      contractDate: addDays(p1Start, -7),
      tariff: "Standart (Instagram + Telegram + target)",
      services: [
        svc("smm", "Standart (individual)", 11_000_000),
        svc("target", "Target", 4_000_000, { tariffId: "t_target" }),
        once("web", "Korporativ sayt", 15_000_000, [d(-11), d(-5)], {
          tariffId: "t_web_corp",
          assigneeId: "u_web",
          assigneeFee: 4_000_000,
          startDate: d(-12),
          deadline: d(14),
          createdAt: at(-12),
        }),
      ],
      monthlyFee: 15_000_000,
      prepayType: 100,
      marketologId: "u_mk",
      smmId: "u_smm1",
      targetologId: "u_tg",
      periodStart: p1Start,
      pauseWork: false,
      status: "active",
      adBudgetUsd: 600,
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], mebelDocs),
      handedOffAt: `${addDays(p1Start, -3)}T10:00:00.000Z`,
      createdAt: `${addDays(p1Start, -7)}T10:00:00.000Z`,
    },
    {
      id: P2,
      name: "FitLife Gym",
      leadId: "l_gym",
      legalName: "«FitLife Sport» MChJ",
      inn: "307 554 120",
      address: "Toshkent sh., Yunusobod t., 19-mavze, 4-uy",
      contactName: "Nodir Islomov",
      phone: "+998 00 777 45 45",
      industry: "Fitnes",
      links: "instagram.com/demo_fitlife.uz",
      contractNo: "SH-2026/027",
      contractDate: addDays(p2Start, -7),
      tariff: "Biznes (Instagram + target)",
      services: [svc("smm", "Biznes", 12_000_000, { tariffId: "t_biznes", withTarget: true })],
      tariffId: "t_biznes",
      monthlyFee: 12_000_000,
      prepayType: 50,
      marketologId: "u_mk",
      smmId: "u_smm2",
      targetologId: "u_tg",
      periodStart: p2Start,
      pauseWork: false,
      status: "active",
      adBudgetUsd: 400,
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], gymDocs),
      handedOffAt: `${addDays(p2Start, -3)}T10:00:00.000Z`,
      createdAt: `${addDays(p2Start, -7)}T10:00:00.000Z`,
    },
    {
      id: P3,
      name: "Dent Plus klinikasi",
      leadId: "l_dent",
      legalName: "«Dent Plus Medical» MChJ",
      inn: "310 221 774",
      address: "Toshkent sh., Mirzo Ulug'bek t., Buyuk Ipak Yo'li ko'ch., 45",
      contactName: "Dr. Feruza Valiyeva",
      phone: "+998 00 404 40 40",
      industry: "Stomatologiya",
      links: "instagram.com/demo_dentplus.tashkent",
      contractNo: "SH-2026/041",
      contractDate: d(-3),
      tariff: "Start (Instagram)",
      services: [svc("smm", "Start", 8_000_000, { tariffId: "t_start" })],
      tariffId: "t_start",
      monthlyFee: 8_000_000,
      prepayType: 50,
      marketologId: "u_mk",
      smmId: "u_smm1",
      pauseWork: false,
      status: "active",
      docs: docs(["brief"], {
        brief: "Dent Plus — oilaviy stomatologiya. Maqsad: implant va breket xizmatlariga yozilishni oshirish.",
        strategy: "Ustunlar: shifokor bilan tanishuv, oldin/keyin, narxlar shaffofligi…",
      }),
      createdAt: at(-3),
    },
    {
      id: P4,
      name: "Baraka Market",
      leadId: "l_baraka",
      legalName: "«Baraka Savdo» MChJ",
      inn: "302 998 431",
      address: "Toshkent sh., Sergeli t., Yangi Sergeli ko'ch., 7",
      contactName: "Ulug'bek Sobirov",
      phone: "+998 00 300 70 70",
      industry: "Supermarketlar tarmog'i",
      links: "instagram.com/demo_barakamarket.uz\nt.me/demo_barakamarket",
      contractNo: "SH-2026/022",
      contractDate: addDays(p4Start, -6),
      tariff: "Premium (Instagram + Telegram + target)",
      services: [svc("smm", "Premium", 18_000_000, { tariffId: "t_premium", withTarget: true })],
      tariffId: "t_premium",
      monthlyFee: 18_000_000,
      prepayType: 100,
      marketologId: "u_mk",
      smmId: "u_smm2",
      targetologId: "u_tg",
      periodStart: p4Start,
      pauseWork: false,
      status: "active",
      adBudgetUsd: 1000,
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], {
        brief: "Baraka Market — 7 filialli supermarketlar tarmog'i. Maqsad: haftalik aksiyalarni tanitish, ilovaga yuklab olishni oshirish.",
        strategy: "Ustunlar: haftalik aksiyalar, retseptlar, yangi mahsulotlar, filial hayoti.",
        competitors: "Korzinka, Makro, Havas — kontent ko'p, lekin bir xil.",
        swot: "S: narxlar raqobatbardosh. W: brend tanilishi past. O: yetkazib berish xizmati. T: yirik tarmoqlar.",
        audience: "25–50 yosh, oila boshlari, Toshkent shahri.",
      }),
      handedOffAt: `${addDays(p4Start, -2)}T10:00:00.000Z`,
      createdAt: `${addDays(p4Start, -6)}T10:00:00.000Z`,
    },
    {
      id: P5,
      name: "Moda House",
      leadId: "l_moda",
      legalName: "YaTT Usmonova Kamola",
      inn: "—",
      address: "Toshkent sh., Shayxontohur t., Navoiy ko'ch., 30",
      contactName: "Kamola Usmonova",
      phone: "+998 00 121 21 21",
      industry: "Kiyim do'koni",
      links: "instagram.com/demo_modahouse.uz",
      contractNo: "SH-2026/015",
      contractDate: addDays(p5Start, -5),
      tariff: "Standart (Instagram + target)",
      services: [svc("smm", "Standart (individual)", 6_000_000), svc("target", "Target", 3_000_000)],
      monthlyFee: 9_000_000,
      prepayType: 100,
      marketologId: "u_mk",
      smmId: "u_smm1",
      targetologId: "u_tg",
      periodStart: p5Start,
      pauseWork: true,
      status: "closed",
      closedAt: addMonths(p5Start, 3),
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], {
        brief: "Moda House — ayollar kiyimi do'koni. Shartnoma 3 oydan keyin to'xtatildi (mijoz byudjetni qisqartirdi).",
      }),
      handedOffAt: `${addDays(p5Start, -2)}T10:00:00.000Z`,
      createdAt: `${addDays(p5Start, -5)}T10:00:00.000Z`,
    },
    {
      id: P6,
      name: "Burger House",
      leadId: "l_burger",
      legalName: "«Burger House Food» MChJ",
      inn: "308 445 216",
      address: "Toshkent sh., Chilonzor t., Bunyodkor shoh ko'ch., 21",
      contactName: "Davron Qosimov",
      phone: "+998 00 555 66 77",
      industry: "Fast-food",
      links: "instagram.com/demo_burgerhouse.tash",
      contractNo: "SH-2026/036",
      contractDate: addDays(p6Start, -6),
      tariff: "Biznes (Instagram + target)",
      services: [
        svc("smm", "Biznes", 12_000_000, { tariffId: "t_biznes", withTarget: true }),
        once("video", "Syomka kuni", 3_000_000, [d(-24), d(-22), d(-18), d(-14), d(-11), d(-9)], {
          tariffId: "t_video_day",
          assigneeId: "u_mt1",
          assigneeFee: 800_000,
          startDate: d(-25),
          deadline: d(-8),
          deliveredAt: d(-9),
          status: "done",
          createdAt: at(-25),
        }),
      ],
      tariffId: "t_biznes",
      monthlyFee: 12_000_000,
      prepayType: 50,
      marketologId: "u_mk",
      smmId: "u_smm1",
      targetologId: "u_tg",
      periodStart: p6Start,
      pauseWork: false,
      status: "active",
      adBudgetUsd: 500,
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], {
        brief: "Burger House — 3 filialli fast-food. Maqsad: yetkazib berish buyurtmalarini oshirish.",
      }),
      handedOffAt: `${addDays(p6Start, -3)}T10:00:00.000Z`,
      createdAt: `${addDays(p6Start, -6)}T10:00:00.000Z`,
    },
    {
      id: P7,
      name: "Nur Optika",
      leadId: "l_optika",
      legalName: "«Nur Optika» MChJ",
      inn: "311 406 582",
      address: "Toshkent sh., Yakkasaroy t., Shota Rustaveli ko'ch., 14",
      contactName: "Sevara Nurmatova",
      phone: "+998 00 640 64 64",
      industry: "Optika do'konlari",
      links: "instagram.com/demo_nuroptika",
      contractNo: "SH-2026/043",
      contractDate: d(-10),
      tariff: "",
      monthlyFee: 0,
      prepayType: 100,
      services: [
        once("branding", "Firma uslubi", 10_000_000, [d(-6)], {
          tariffId: "t_brand_style",
          assigneeId: "u_dz",
          assigneeFee: 3_000_000,
          startDate: d(-9),
          deadline: d(20),
          createdAt: at(-10),
        }),
      ],
      marketologId: "u_mk",
      smmId: "",
      pauseWork: false,
      status: "active",
      docs: docs(["brief"], {
        brief: "Nur Optika — 3 ta optika do'koni. Faqat branding: yangi logo va firma uslubi (vitrina, vizitka, ijtimoiy tarmoq shablonlari).",
      }),
      createdAt: at(-10),
    },
    {
      id: P8,
      name: "Avto Lux",
      leadId: "l_avtolux",
      legalName: "«Avto Lux Motors» MChJ",
      inn: "306 771 349",
      address: "Toshkent sh., Sergeli t., Qo'yliq bozori yonida, 2",
      contactName: "Behruz Karimov",
      phone: "+998 00 715 15 15",
      industry: "Avtosalon",
      links: "instagram.com/demo_avtolux.uz\navtolux-demo.uz",
      contractNo: "SH-2026/039",
      contractDate: addDays(p8Start, -5),
      tariff: "",
      monthlyFee: 0,
      prepayType: 100,
      services: [
        svc("performance", "Performance", 6_000_000, {
          tariffId: "t_performance",
          adPct: 10,
          kpiLeads: 150,
          kpiCpl: 8,
          channels: ["meta", "google"],
          createdAt: `${addDays(p8Start, -5)}T10:00:00.000Z`,
        }),
      ],
      marketologId: "u_mk",
      smmId: "",
      targetologId: "u_tg",
      periodStart: p8Start,
      pauseWork: false,
      status: "active",
      adBudgetUsd: 1500,
      docs: docs(["brief", "strategy", "audience"], {
        brief: "Avto Lux — avtosalon. Faqat performance: test-drayvga yozilish va kredit arizalari. Kanallar: Meta va Google Ads.",
        strategy: "KPI: oyiga 150 ta lid, lid narxi 8$ dan past. Google — qidiruv (brend va model nomlari), Meta — lid forma va retarget.",
        audience: "28–50 yosh, Toshkent va viloyat markazlari, avtomobil almashtirmoqchi bo'lganlar.",
      }),
      handedOffAt: `${addDays(p8Start, -2)}T10:00:00.000Z`,
      createdAt: `${addDays(p8Start, -5)}T10:00:00.000Z`,
    },
  ];
  // Hisoblanadigan maydonlar: oylik summa (performance foizi bilan), qisqa tavsif, SMM paketi
  for (const p of projects) {
    p.monthlyFee = recurringFee(p, 12_650);
    p.tariff = servicesSummary(p.services);
    p.tariffId = p.services.find((x) => x.kind === "smm")?.tariffId;
  }

  // ---------- Postlar ----------
  const posts: Post[] = [];
  const TYPE_OF: Record<PostFormat, string> = { video: "ct_video", image: "ct_design", text: "ct_text", ai: "ct_design" };
  const addPost = (projectId: string, date: string, format0: PostFormat, topic0: string, status: PostStatus, extra: Partial<Post> = {}) => {
    // Namunadagi «AI post» lar — faqat matnli postlar (asosan Telegram uchun)
    const format: PostFormat = format0 === "ai" ? "text" : format0;
    const topic = topic0.replace(/^AI post: /, "");
    const platforms: Platform[] = extra.platforms ?? (format === "text" ? ["telegram"] : ["instagram"]);
    const p: Post = {
      id: id("post"),
      projectId,
      date,
      platforms,
      typeId: TYPE_OF[format],
      format,
      topic,
      script: extra.script ?? "",
      assigneeId: projects.find((x) => x.id === projectId)?.smmId ?? "u_smm1",
      status,
      forTarget: extra.forTarget ?? false,
      publishedAt: status === "published" ? date : undefined,
      publishedOn: status === "published" ? Object.fromEntries(platforms.map((x) => [x, date])) : undefined,
      createdAt: at(-22),
      ...extra,
    };
    posts.push(p);
    return p;
  };

  const m1 = addPost(P1, d(-18), "video", "Yangi yumshoq mebel kolleksiyasi", "published", { forTarget: true, platforms: ["instagram", "telegram", "tiktok"] });
  addPost(P1, d(-16), "image", "Oshxona mebeli tanlashda 3 ta xato", "published");
  addPost(P1, d(-13), "video", "Ishlab chiqarish jarayoni (backstage)", "published", { forTarget: true, platforms: ["instagram", "tiktok", "youtube"] });
  addPost(P1, d(-11), "ai", "AI post: kichik xonaga mebel tanlash", "published");
  addPost(P1, d(-8), "image", "Chegirma −15%: kuzgi aksiya", "published", { platforms: ["instagram", "telegram", "facebook"], forTarget: true });
  addPost(P1, d(-5), "video", "Mijoz fikri: Chilonzordagi oila", "published", { platforms: ["instagram", "facebook"] });
  const late1 = addPost(P1, d(-2), "image", "Materiallar sifati: MDF va LDSP", "design");
  const todayA = addPost(P1, d(0), "video", "Yotoqxona to'plami obzori", "approved", {
    platforms: ["instagram", "telegram", "tiktok"],
    publishedOn: { instagram: d(0) },
    platformNotes: { tiktok: "TikTok uchun 15 soniyalik qisqa versiya, trend musiqa bilan" },
    script: "0–3 s: xona umumiy ko'rinishi\n3–15 s: karavot mexanizmi\n15–25 s: shkaf ichki tuzilishi\nCTA: showroomga taklif",
  });
  addPost(P1, d(0), "image", "Telegram: haftalik aksiyalar", "client", { platforms: ["telegram"] });
  const p1Int = addPost(P1, d(2), "video", "Showroom bo'ylab tur", "internal", { forTarget: true, platforms: ["instagram", "youtube"] });
  const p1Edit = addPost(P1, d(4), "video", "Yetkazib berish va o'rnatish jarayoni", "editing");
  const p1Shoot1 = addPost(P1, d(6), "video", "Savol-javob: 2 yillik kafolat", "shoot");
  const p1Shoot2 = addPost(P1, d(8), "video", "Bolalar xonasi g'oyalari", "shoot");
  addPost(P1, d(9), "ai", "AI post: 2026 interyer trendlari", "plan");
  addPost(P1, d(11), "ai", "Mebel parvarishi: 5 ta oddiy qoida", "plan");
  // Stories — oylik topshiriqda alohida sanaladi
  for (const [n, topic] of [
    [-17, "Stories: kolleksiyadan lavhalar"],
    [-12, "Stories: so'rovnoma — qaysi rang?"],
    [-9, "Stories: sexdan jonli lavha"],
    [-6, "Stories: mijoz fikri"],
    [-3, "Stories: aksiya eslatmasi"],
    [-1, "Stories: showroom bugun"],
    [3, "Stories: showroom tur anonsi"],
    [7, "Stories: savol-javob"],
  ] as [number, string][]) {
    if (monthKey(d(n)) !== monthKey(today)) continue;
    addPost(P1, d(n), "image", topic, n < 0 ? "published" : "plan", { typeId: "ct_stories" });
  }

  addPost(P2, d(-4), "video", "Yangi filial ochilishi", "published", { forTarget: true });
  addPost(P2, d(-3), "image", "Kuzgi abonement aksiyasi", "published", { forTarget: true });
  const gLate = addPost(P2, d(-1), "video", "Trener maslahati: to'g'ri isinish", "editing");
  addPost(P2, d(1), "image", "Guruh mashg'ulotlari jadvali", "design");
  const gInt = addPost(P2, d(1), "video", "Transformatsiya: Aziz 3 oyda −12 kg", "internal");
  addPost(P2, d(3), "ai", "AI post: protein mifi va haqiqat", "plan");
  addPost(P2, d(6), "video", "Crossfit zonasi obzori", "plan");
  addPost(P2, d(9), "image", "Mijozlar fikri karuseli", "plan");
  addPost(P2, d(12), "video", "Yoga darsi: tanishuv", "plan");
  addPost(P2, d(15), "image", "Korporativ abonement taklifi", "plan");
  addPost(P2, d(19), "video", "Hovuz zonasi", "plan");
  addPost(P2, d(23), "ai", "AI post: ish stoli yonida 5 daqiqalik mashq", "plan");

  // Baraka Market va Burger House — joriy davr rejasi avtomatik to'ldiriladi
  const genPlan = (pid: string, start: string, items: [PostFormat, string][], lateIdx = -1) =>
    items.forEach(([format, topic], i) => {
      const date = addDays(start, Math.round((i * 29) / items.length) + 1);
      const rel = diffDays(date, today);
      const status: PostStatus =
        i === lateIdx
          ? "design"
          : rel < 0
            ? "published"
            : rel === 0
              ? "approved"
              : rel <= 2
                ? "client"
                : rel <= 4
                  ? "internal"
                  : rel <= 7
                    ? format === "video"
                      ? "editing"
                      : "design"
                    : "plan";
      addPost(pid, date, format, topic, status, {
        forTarget: i % 4 === 0,
        platforms: format === "ai" ? ["telegram"] : i % 3 === 0 ? ["instagram", "telegram"] : i % 5 === 3 ? ["instagram", "facebook"] : ["instagram"],
      });
    });
  genPlan(P4, d(-12), [
    ["video", "Haftalik aksiya: -30% sut mahsulotlari"],
    ["image", "Karusel: 5 ta tejamkor xarid maslahati"],
    ["video", "Yangi filial — Sergeli"],
    ["ai", "AI post: haftalik menyu g'oyalari"],
    ["video", "Retsept: 15 daqiqada palov"],
    ["image", "Mobil ilova — bonus ballar"],
    ["video", "Mijoz bilan intervyu"],
    ["image", "Dam olish kunlari aksiyasi"],
    ["video", "Yetkazib berish qanday ishlaydi"],
    ["image", "Mevalar — fermadan to'g'ridan-to'g'ri"],
    ["video", "Xodimlar kuni — sahna ortida"],
    ["ai", "AI post: maktab uchun xarid ro'yxati"],
    ["image", "Kuzgi narxlar pasayishi"],
  ]);
  genPlan(
    P6,
    d(-15),
    [
      ["video", "Yangi burger: Double Cheese"],
      ["image", "Kombo menyu −20%"],
      ["video", "Oshxona — qanday tayyorlanadi"],
      ["image", "Mijozlar fikri karuseli"],
      ["video", "Kuryer bilan bir kun"],
      ["ai", "AI post: burger tarixi"],
      ["video", "Talabalar uchun aksiya"],
      ["image", "Yangi filial — Chilonzor"],
      ["video", "Challenge: 1 daqiqada burger"],
      ["image", "Kechki menyu"],
      ["video", "Sous retsepti siri"],
      ["image", "Dam olish kunlari oilaviy set"],
    ],
    3,
  );

  // ---------- Syomka ----------
  const shoots: Shoot[] = [
    {
      id: "sh_1",
      projectId: P1,
      date: d(-9),
      time: "11:00",
      location: "Sharq Mebel ishlab chiqarish sexi, Sergeli",
      videoCount: 3,
      postIds: [p1Edit.id],
      operatorId: "u_sy",
      note: "Sex ichida yorug'lik kam — chiroq olib boring.",
      footageLink: "https://drive.google.com/drive/folders/demo-sharq-mebel-kadrlar-1",
      status: "handed",
      handedAt: at(-9, 17),
      createdAt: at(-14),
    },
    {
      id: "sh_2",
      projectId: P1,
      date: d(1),
      time: "11:00",
      location: "Showroom, Chilonzor 9-kvartal",
      videoCount: 4,
      postIds: [p1Shoot1.id, p1Shoot2.id],
      operatorId: "u_sy",
      note: "Bolalar xonasi namunasini oldindan tayyorlab qo'yishlarini so'radik.",
      status: "planned",
      createdAt: at(-3),
    },
    {
      id: "sh_3",
      projectId: P2,
      date: d(-6),
      time: "09:00",
      location: "FitLife Yunusobod filiali",
      videoCount: 5,
      postIds: [gLate.id, gInt.id],
      operatorId: "u_sy",
      note: "",
      footageLink: "https://drive.google.com/drive/folders/demo-fitlife-kadrlar-oktyabr",
      status: "handed",
      handedAt: at(-6, 15),
      createdAt: at(-10),
    },
  ];

  // Target uchun alohida reklama videolari (organik joylanmaydi)
  const adPost = (projectId: string, date: string, topic: string, status: PostStatus) =>
    addPost(projectId, date, "video", topic, status, { platforms: [], typeId: AD_VIDEO, forTarget: true, publishedOn: undefined });
  const adM1 = adPost(P1, d(-6), "Reklama: kuzgi aksiya −15% (15 soniya)", "published");
  adPost(P1, d(3), "Reklama: yotoqxona to'plami — narx va bo'lib to'lash", "editing");
  const adG1 = adPost(P2, d(-3), "Reklama: birinchi mashg'ulot bepul", "published");
  adPost(P2, d(6), "Reklama: yangi filial ochildi", "plan");

  // ---------- Vazifalar ----------
  const tasks: Task[] = [];
  const addTask = (t: Omit<Task, "id" | "createdAt" | "createdBy"> & { createdBy?: string }) =>
    tasks.push({ id: id("task"), createdAt: at(-10), createdBy: "u_smm1", ...t });

  const montaj = (projectId: string, postId: string, assigneeId: string, title: string, deadline: string, status: TaskStatus, acceptedAt?: string) =>
    addTask({
      projectId,
      postId,
      kind: "montaj",
      assigneeId,
      title,
      brief: "Reels formati 9:16, 30–45 soniya. Brend shriftlari, subtitr majburiy. Musiqa — trenddagi, mualliflik huquqisiz.",
      script: "Hook birinchi 2 soniyada. Oxirida CTA: «Direct'ga yozing».",
      footageLink: "https://drive.google.com/drive/folders/demo-kadrlar",
      deadline,
      status,
      acceptedAt,
      resultLink: status === "review" || status === "accepted" ? "https://drive.google.com/file/d/demo-tayyor-video" : undefined,
      createdBy: projectId === P2 ? "u_smm2" : "u_smm1",
    });

  // Joriy oyda qabul qilingan montajlar — montajyor oyligi avtomatik hisoblanadi.
  const thisMonthDay = (n: number) => (monthKey(d(-n)) === monthKey(today) ? at(-n) : at(0));
  montaj(P1, m1.id, "u_mt1", "Yangi kolleksiya — Reels", d(-19), "accepted", thisMonthDay(1));
  montaj(P1, posts[2]!.id, "u_mt1", "Backstage — ishlab chiqarish", d(-14), "accepted", thisMonthDay(2));
  montaj(P1, posts[5]!.id, "u_mt2", "Mijoz fikri — intervyu", d(-6), "accepted", thisMonthDay(3));
  montaj(P1, todayA.id, "u_mt1", "Yotoqxona to'plami obzori", d(-2), "accepted", thisMonthDay(0));
  montaj(P1, p1Int.id, "u_mt2", "Showroom tur", d(0), "review");
  montaj(P1, p1Edit.id, "u_mt1", "Yetkazib berish va o'rnatish", d(-1), "progress");
  montaj(P2, gLate.id, "u_mt2", "Trener maslahati: isinish", d(-2), "new");
  montaj(P2, gInt.id, "u_mt2", "Transformatsiya hikoyasi", d(0), "accepted", thisMonthDay(0));
  montaj(P2, posts[14]!.id, "u_mt1", "Yangi filial ochilishi", d(-5), "accepted", thisMonthDay(4));

  addTask({
    projectId: P1,
    postId: late1.id,
    kind: "dizayn",
    assigneeId: "u_dz",
    title: "Karusel: MDF va LDSP",
    brief: "5 slaydli karusel. Har slaydda bitta taqqoslash. Brend ranglari: to'q yashil + bej.",
    files: "https://drive.google.com/drive/folders/demo-sharq-brendbuk",
    designType: "post",
    deadline: d(-3),
    status: "returned",
    returnNote: "3-slayddagi matn juda mayda, logotipni pastki o'ng burchakka o'tkazing.",
  });
  addTask({
    projectId: P1,
    postId: p1Int.id,
    kind: "dizayn",
    assigneeId: "u_dz",
    title: "Showroom tur — oblojka",
    brief: "Reels oblojkasi 1080×1920, sarlavha: «Showroom bo'ylab 60 soniyada».",
    designType: "cover",
    deadline: d(1),
    status: "progress",
  });
  addTask({
    projectId: P2,
    postId: posts[17]!.id,
    kind: "dizayn",
    assigneeId: "u_dz",
    title: "Guruh mashg'ulotlari jadvali",
    brief: "Haftalik jadval posti, 1080×1350. Har kun alohida rang.",
    designType: "post",
    deadline: d(0),
    status: "new",
    createdBy: "u_smm2",
  });
  addTask({
    projectId: P2,
    postId: gInt.id,
    kind: "dizayn",
    assigneeId: "u_dz",
    title: "Transformatsiya — oblojka",
    brief: "Oldin/keyin kollaj, sarlavha: «3 oyda −12 kg».",
    designType: "cover",
    deadline: d(-1),
    status: "review",
    resultLink: "https://drive.google.com/file/d/demo-fitlife-oblojka",
    createdBy: "u_smm2",
  });

  addTask({
    projectId: P1,
    kind: "target",
    assigneeId: "u_tg",
    title: "Kolleksiya + backstage videolari bilan lid kampaniyasi",
    brief: "Maqsad: lid forma. Geo: Toshkent. Yosh 25–45. Kunlik byudjet 150 000 so'm.",
    files: "https://drive.google.com/drive/folders/demo-sharq-target-materiallar",
    deadline: d(-21),
    status: "progress",
    launchedAt: p1Start,
  });
  addTask({
    projectId: P1,
    kind: "target",
    assigneeId: "u_tg",
    title: "Kuzgi aksiya (−15%) — retarget",
    brief: "Saytga kirgan va profilga yozganlarga retarget. Byudjet 80 000 so'm/kun.",
    files: "https://drive.google.com/drive/folders/demo-sharq-aksiya",
    deadline: d(1),
    status: "new",
  });
  addTask({
    projectId: P2,
    kind: "target",
    assigneeId: "u_tg",
    title: "Yangi filial + abonement aksiyasi",
    brief: "Maqsad: sinov mashg'ulotiga yozilish. Geo: 5 km radius.",
    files: "https://drive.google.com/drive/folders/demo-fitlife-target",
    deadline: d(-36),
    status: "progress",
    launchedAt: p2Start,
    createdBy: "u_smm2",
  });
  addTask({
    projectId: P1,
    postId: adM1.id,
    kind: "target",
    assigneeId: "u_tg",
    title: `Reklama videosi: ${adM1.topic}`,
    brief: "Tayyor reklama videosi — kampaniyaga qo'ying va natijani hisobotda belgilang",
    deadline: d(-5),
    deadlineTime: "18:00",
    status: "progress",
    launchedAt: d(-5),
  });
  addTask({
    projectId: P2,
    postId: adG1.id,
    kind: "target",
    assigneeId: "u_tg",
    title: `Reklama videosi: ${adG1.topic}`,
    brief: "Tayyor reklama videosi — kampaniyaga qo'ying va natijani hisobotda belgilang",
    deadline: d(-2),
    deadlineTime: "18:00",
    status: "new",
    createdBy: "u_smm2",
  });

  addTask({
    projectId: P8,
    kind: "target",
    assigneeId: "u_tg",
    title: "Test-drayv: Meta lid forma + Google qidiruv",
    brief: "Meta: lid forma, Toshkent + viloyat markazlari, 28–50 yosh. Google: brend va model nomlari bo'yicha qidiruv.",
    files: "https://drive.google.com/drive/folders/demo-avtolux-kreativlar",
    deadline: addDays(p8Start, -1),
    status: "progress",
    launchedAt: p8Start,
    createdBy: "u_mk",
  });

  // Target kunlik hisobotlari, o'tgan davrlar postlari va oylik hisobotlar — seed-history.ts da.
  const targetReports: TargetReport[] = [];

  // ---------- CRM ----------
  const lead = (l: Partial<Lead> & Pick<Lead, "id" | "name" | "phone" | "stage">): Lead => ({
    maxStep: { new: 0, waiting: 1, meeting: 2, visited: 3, contract: 4, unfit: 2, lowquality: 0 }[l.stage],
    source: "Instagram",
    service: "SMM xizmati",
    note: "",
    operatorId: "u_op1",
    history: [],
    createdAt: at(-5),
    ...l,
  });
  const leads: Lead[] = [
    lead({ id: "l_1", name: "Lazzat Burger", phone: "+998 00 123 45 67", stage: "new", source: "Meta Ads", createdAt: at(0, 8) }),
    lead({
      id: "l_2",
      name: "Oila Market",
      phone: "+998 00 765 43 21",
      stage: "new",
      operatorId: "u_op2",
      source: "Sayt",
      service: "Target xizmati",
      createdAt: at(0, 9),
    }),
    lead({
      id: "l_3",
      name: "Grand Tour turagentligi",
      phone: "+998 00 888 00 11",
      stage: "meeting",
      meeting: { date: d(1), time: "15:00", marketologId: "u_mk" },
      service: "Sayt qilish",
      note: "Turlar katalogi va onlayn bron qilish bilan sayt kerak",
      history: [{ id: id("c"), at: at(-1), userId: "u_op1", text: "Qo'ng'iroq qilindi, ertaga ofisga kelishga kelishildi." }],
    }),
    lead({
      id: "l_4",
      name: "Kids Academy",
      phone: "+998 00 321 21 21",
      stage: "visited",
      operatorId: "u_op2",
      meeting: { date: d(-1), time: "11:00", marketologId: "u_mk" },
      note: "Narx taklifini kutyapti",
      history: [{ id: id("c"), at: at(-1, 12), userId: "u_mk", text: "Uchrashuv bo'ldi, tijorat taklifi yuborildi." }],
    }),
    lead({
      id: "l_5",
      name: "Avto Detailing Pro",
      phone: "+998 00 909 09 09",
      stage: "waiting",
      nextContactDate: d(0),
      service: "Video production",
      history: [{ id: id("c"), at: at(-6), userId: "u_op1", text: "Rahbar safarda, keyingi hafta qayta qo'ng'iroq." }],
    }),
    lead({ id: "l_mebel", name: "Sharq Mebel", phone: "+998 00 555 12 12", stage: "contract", projectId: P1, createdAt: at(-35) }),
    lead({ id: "l_gym", name: "FitLife Gym", phone: "+998 00 777 45 45", stage: "contract", projectId: P2, operatorId: "u_op2", createdAt: at(-50) }),
    lead({ id: "l_dent", name: "Dent Plus klinikasi", phone: "+998 00 404 40 40", stage: "contract", projectId: P3, createdAt: at(-9) }),
    lead({
      id: "l_baraka",
      name: "Baraka Market",
      phone: "+998 00 300 70 70",
      stage: "contract",
      projectId: P4,
      operatorId: "u_op2",
      source: "Tavsiya",
      createdAt: `${addDays(p4Start, -20)}T09:00:00.000Z`,
    }),
    lead({
      id: "l_moda",
      name: "Moda House",
      phone: "+998 00 121 21 21",
      stage: "contract",
      projectId: P5,
      source: "Instagram",
      createdAt: `${addDays(p5Start, -18)}T09:00:00.000Z`,
    }),
    lead({
      id: "l_burger",
      name: "Burger House",
      phone: "+998 00 555 66 77",
      stage: "contract",
      projectId: P6,
      operatorId: "u_op2",
      source: "Meta Ads",
      createdAt: `${addDays(p6Start, -15)}T09:00:00.000Z`,
    }),
    lead({
      id: "l_optika",
      name: "Nur Optika",
      phone: "+998 00 640 64 64",
      stage: "contract",
      projectId: P7,
      source: "Tavsiya",
      service: "Branding",
      meeting: { date: d(-13), time: "11:00", marketologId: "u_mk" },
      createdAt: at(-18),
    }),
    lead({
      id: "l_avtolux",
      name: "Avto Lux",
      phone: "+998 00 715 15 15",
      stage: "contract",
      projectId: P8,
      operatorId: "u_op2",
      source: "Sayt",
      service: "Performance marketing",
      meeting: { date: addDays(p8Start, -8), time: "16:00", marketologId: "u_mk" },
      createdAt: `${addDays(p8Start, -14)}T09:00:00.000Z`,
    }),
    lead({ id: "l_6", name: "Shirin Tort", phone: "+998 00 100 20 30", stage: "unfit", rejectReason: "Byudjet to'g'ri kelmadi", createdAt: at(-12) }),
    lead({
      id: "l_7",
      name: "Noma'lum",
      phone: "+998 00 000 00 00",
      stage: "lowquality",
      operatorId: "u_op2",
      rejectReason: "Raqam noto'g'ri",
      createdAt: at(-4),
    }),
  ];

  const state: ErpState = {
    version: SEED_VERSION,
    currentUserId: "u_boss",
    users,
    leads,
    projects,
    posts,
    shoots,
    tasks,
    targetReports,
    reports: [],
    notifications: [
      {
        id: "n_1",
        userId: "u_mk",
        text: "Yangi uchrashuv belgilandi: Grand Tour turagentligi, ertaga 15:00",
        href: "/crm",
        at: at(-1),
        read: false,
        telegram: "demo",
      },
      {
        id: "n_2",
        userId: "u_mk",
        text: "Tasdiqlash so'rovi: Showroom bo'ylab tur (Sharq Mebel)",
        href: "/tasdiqlash",
        at: at(0, 7),
        read: false,
        telegram: "demo",
      },
      {
        id: "n_3",
        userId: "u_sy",
        text: "Syomka belgilandi: Sharq Mebel, ertaga 11:00, Chilonzor",
        href: "/syomka",
        at: at(-3),
        read: false,
        telegram: "demo",
      },
      { id: "n_4", userId: "u_mt2", text: "Yangi TZ: Trener maslahati: isinish (FitLife Gym)", href: "/montaj", at: at(-6), read: false, telegram: "demo" },
      {
        id: "n_5",
        userId: "u_dz",
        text: "Ish qaytarildi: Karusel: MDF va LDSP — 3-slayddagi matn juda mayda",
        href: "/dizayn",
        at: at(-2),
        read: false,
        telegram: "demo",
      },
      { id: "n_6", userId: "u_mol", text: "FitLife Gym: oylik to'lov muddati o'tdi", href: "/moliya", at: at(-3), read: false, telegram: "demo" },
    ],
    activity: [
      { id: "a_1", at: at(-1, 11), userId: "u_op1", text: "Grand Tour turagentligi: bosqich → Uchrashuv belgilandi", href: "/crm" },
      { id: "a_2", at: at(-2, 9), userId: "u_smm1", text: "Showroom bo'ylab tur: ichki tasdiqqa yuborildi", href: "/kontent" },
      { id: "a_3", at: at(-3, 16), userId: "u_mk", text: "Dent Plus klinikasi: loyiha kartasi yaratildi (lid → loyiha)", href: `/loyiha/${P3}` },
    ],
    accounts: [],
    articles: [],
    transactions: [],
    invoices: [],
    vendors: [],
    bills: [],
    payProfiles: [],
    accruals: [],
    budget: [],
    tariffs: [...DEFAULT_TARIFFS, ...SERVICE_TARIFFS].map((t) => ({ ...t, features: [...t.features], platforms: [...t.platforms] })),
    proposals: [],
    quotas: [],
    integrationLog: [],
    settings: {
      companyName: "SMM Studio MChJ",
      requisites: {
        address: "Toshkent sh., Yunusobod t., Amir Temur ko'ch., 108-uy, «Poytaxt» biznes markazi, 4-qavat",
        inn: "309 876 543",
        bankName: "ATB «Kapitalbank» Yunusobod filiali",
        bankAccount: "2020 8000 7051 2345 6001",
        mfo: "01018",
        director: "Sherzod Alimov",
        phone: "+998 00 200 11 22",
      },
      usdRate: 12_650,
      payday: 10,
      latePenaltyPct: 0,
      payrollStart: monthKey(addMonths(today, -5)),
      contentTypes: DEFAULT_CONTENT_TYPES.map((t) => ({ ...t })),
      telegram: { enabled: true, botToken: "" },
      integrations: {
        meta: {
          token: "",
          apiVersion: "v23.0",
          autoSync: true,
          leadMetric: "all",
          // Sharq Mebel ulanmagan — targetolog hisobotni qo'lda kiritadi
          accounts: { p_gym: "act_1029384756", p_baraka: "act_5647382910", p_burger: "act_8392017465" },
          lastSync: `${today}T04:05:10.000Z`,
        },
        cbu: { autoUpdate: true, lastUpdate: `${today}T04:05:00.000Z`, rateDate: today },
      },
    },
  };

  // ---------- Oylik topshiriqlar (marketolog → SMM) ----------
  const month = monthKey(today);
  const quotas: Quota[] = [
    {
      id: "q_mebel",
      projectId: P1,
      month,
      counts: { ct_video: 8, ct_design: 6, ct_text: 4, ct_stories: 10, ct_target_video: 4, shoot: 2 },
      note: "Kuzgi aksiya oyi — video ko'proq",
      updatedAt: at(-4),
      updatedBy: "u_mk",
      history: [
        { at: at(-4), userId: "u_mk", text: "O'zgardi: Video 6 → 8 (Kuzgi aksiya oyi — video ko'proq)" },
        { at: at(-20), userId: "u_mk", text: "Topshiriq berildi: 6 video, 6 dizayn, 4 matn, 10 stories, 4 target video, 2 syomka kuni" },
      ],
    },
    {
      id: "q_gym",
      projectId: P2,
      month,
      counts: { ct_video: 6, ct_design: 4, ct_text: 2, ct_stories: 20, ct_target_video: 4, shoot: 2 },
      note: "",
      updatedAt: at(-20),
      updatedBy: "u_mk",
      history: [{ at: at(-20), userId: "u_mk", text: "Topshiriq berildi: 6 video, 4 dizayn, 2 matn, 20 stories, 4 target video, 2 syomka kuni" }],
    },
  ];
  state.quotas = quotas;
  state.notifications.push({
    id: "n_7",
    userId: "u_smm1",
    text: "📋 Sharq Mebel · topshiriq o'zgardi: Video 6 → 8",
    href: "/kontent",
    at: at(-4),
    read: false,
    telegram: "demo",
  });

  addOperationsHistory(state, today);
  addFinanceHistory(state, today);
  addSalesHistory(state, today);
  return state;
}
