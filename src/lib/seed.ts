// Mijozga ko'rsatish uchun namunaviy ma'lumotlar. Barcha sanalar bugungi kunga nisbatan
// hisoblanadi, shuning uchun demo istalgan kuni ochilganda ham "jonli" ko'rinadi.
import { addDays, addMonths, monthKey, shiftMonthKey } from "./dates";
import type {
  DocBlock,
  DocState,
  ErpState,
  Lead,
  Payment,
  Platform,
  Post,
  PostFormat,
  PostStatus,
  Project,
  Shoot,
  Task,
  TaskStatus,
  TargetReport,
  User,
} from "./types";

export const SEED_VERSION = 3;

export function buildSeed(today: string): ErpState {
  const d = (n: number) => addDays(today, n);
  const at = (n: number, hh = 10) => `${d(n)}T${String(hh).padStart(2, "0")}:15:00.000Z`;
  let seq = 0;
  const id = (p: string) => `${p}_${(++seq).toString(36)}`;

  const users: User[] = [
    { id: "u_admin", name: "Ravshanbek (admin)", role: "admin", active: true },
    { id: "u_op1", name: "Dilnoza Yusupova", role: "operator", phone: "+998 90 111 22 33", active: true },
    { id: "u_op2", name: "Jasur Aliyev", role: "operator", phone: "+998 93 222 33 44", active: true },
    { id: "u_mk", name: "Aziza Karimova", role: "marketolog", phone: "+998 97 333 44 55", active: true },
    { id: "u_smm1", name: "Madina Rashidova", role: "smm", active: true },
    { id: "u_smm2", name: "Sardor Nazarov", role: "smm", active: true },
    { id: "u_tg", name: "Bekzod Tursunov", role: "targetolog", active: true },
    { id: "u_sy", name: "Otabek Hamidov", role: "syomka", active: true },
    { id: "u_mt1", name: "Rustam Ergashev", role: "montajyor", active: true },
    { id: "u_mt2", name: "Shoxrux Qodirov", role: "montajyor", active: true },
    { id: "u_dz", name: "Nilufar Saidova", role: "dizayner", active: true },
    { id: "u_mol", name: "Gulnora Mirzayeva", role: "moliya", active: true },
  ];

  const docs = (done: DocBlock[], texts: Partial<Record<DocBlock, string>>): Record<DocBlock, DocState> => {
    const blocks: DocBlock[] = ["brief", "strategy", "competitors", "swot", "audience"];
    return Object.fromEntries(
      blocks.map((b) => [b, { content: texts[b] ?? "", status: done.includes(b) ? "done" : "progress", updatedAt: at(-2) }]),
    ) as Record<DocBlock, DocState>;
  };

  const mebelDocs = {
    brief:
      "Sharq Mebel — Toshkentdagi yumshoq va korpus mebel ishlab chiqaruvchisi, 2 ta showroom (Chilonzor, Yunusobod).\nMaqsad: oyiga 120+ sifatli lid, Instagram'da brend tanilishini oshirish.\nAsosiy mahsulot: divanlar, oshxona va yotoqxona to'plamlari. O'rtacha chek: 9–14 mln so'm.",
    strategy:
      "Kontent ustunlari: 1) mahsulot obzorlari, 2) ishlab chiqarish (ishonch), 3) mijoz fikrlari, 4) foydali maslahatlar, 5) aksiyalar.\nKPI: ER 4%+, lid narxi 35 000 so'mdan past, oyiga 12–15 post.",
    competitors:
      "Mebel City — narx past, kontent sifati o'rta.\nLoft Home — dizayn kuchli, yetkazib berish sekin.\nComfort UZ — target faol, mijoz fikrlari kam.",
    swot:
      "S: o'z ishlab chiqarishi, 2 yil kafolat.\nW: Instagram'da video kontent kam.\nO: bo'lib to'lash bo'yicha hamkorlik.\nT: raqobatchilarning narx urushi.",
    audience: "25–45 yosh, Toshkent, yangi uy olgan yoki ta'mir qilayotgan oilalar. Og'riq: sifat va kafolat, yetkazish muddati.",
  };
  const gymDocs = {
    brief: "FitLife Gym — 2 filialli fitnes klub. Maqsad: yillik abonement sotuvini oshirish, yangi filialni tanitish.",
    strategy: "Ustunlar: trener maslahatlari, transformatsiya hikoyalari, guruh mashg'ulotlari, aksiyalar. KPI: oyiga 80+ sinov mashg'ulotiga yozilish.",
    competitors: "Olympic Fitness — narx yuqori. Sport Life — joylashuv qulay, kontent kam.",
    swot: "S: zamonaviy jihozlar. W: parking yo'q. O: korporativ abonementlar. T: yozgi mavsumda talab pasayishi.",
    audience: "18–35 yosh, Yunusobod va Mirzo Ulug'bek, sog'lom turmush tarziga qiziquvchilar.",
  };

  const P1 = "p_mebel";
  const P2 = "p_gym";
  const P3 = "p_dent";
  const p1Start = d(-20);
  const p2Start = d(-35);
  const p2Cur = addMonths(p2Start, 1);

  const projects: Project[] = [
    {
      id: P1,
      name: "Sharq Mebel",
      leadId: "l_mebel",
      contactName: "Akmal Rahimov",
      phone: "+998 90 555 12 12",
      industry: "Mebel ishlab chiqarish",
      links: "instagram.com/sharq.mebel\nt.me/sharqmebel",
      contractNo: "SH-2026/041",
      contractDate: d(-27),
      tariff: "Standart (Instagram + Telegram + target)",
      monthlyFee: 6_000_000,
      prepayType: 100,
      marketologId: "u_mk",
      smmId: "u_smm1",
      targetologId: "u_tg",
      periodStart: p1Start,
      pauseWork: false,
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], mebelDocs),
      handedOffAt: at(-23),
      createdAt: at(-27),
    },
    {
      id: P2,
      name: "FitLife Gym",
      leadId: "l_gym",
      contactName: "Nodir Islomov",
      phone: "+998 91 777 45 45",
      industry: "Fitnes",
      links: "instagram.com/fitlife.uz",
      contractNo: "SH-2026/033",
      contractDate: d(-42),
      tariff: "Biznes (Instagram + target)",
      monthlyFee: 5_000_000,
      prepayType: 50,
      marketologId: "u_mk",
      smmId: "u_smm2",
      targetologId: "u_tg",
      periodStart: p2Start,
      pauseWork: false,
      docs: docs(["brief", "strategy", "competitors", "swot", "audience"], gymDocs),
      handedOffAt: at(-38),
      createdAt: at(-42),
    },
    {
      id: P3,
      name: "Dent Plus klinikasi",
      leadId: "l_dent",
      contactName: "Dr. Feruza Valiyeva",
      phone: "+998 99 404 40 40",
      industry: "Stomatologiya",
      links: "instagram.com/dentplus.tashkent",
      contractNo: "SH-2026/052",
      contractDate: d(-3),
      tariff: "Start (Instagram)",
      monthlyFee: 4_000_000,
      prepayType: 50,
      marketologId: "u_mk",
      smmId: "u_smm1",
      pauseWork: false,
      docs: docs(["brief"], {
        brief: "Dent Plus — oilaviy stomatologiya. Maqsad: implant va breket xizmatlariga yozilishni oshirish.",
        strategy: "Ustunlar: shifokor bilan tanishuv, oldin/keyin, narxlar shaffofligi…",
      }),
      createdAt: at(-3),
    },
  ];

  // ---------- Postlar ----------
  const posts: Post[] = [];
  const addPost = (
    projectId: string,
    date: string,
    format: PostFormat,
    topic: string,
    status: PostStatus,
    extra: Partial<Post> = {},
  ) => {
    const p: Post = {
      id: id("post"),
      projectId,
      date,
      platform: (extra.platform ?? "instagram") as Platform,
      format,
      topic,
      script: extra.script ?? "",
      assigneeId: projectId === P2 ? "u_smm2" : "u_smm1",
      status,
      forTarget: extra.forTarget ?? false,
      publishedAt: status === "published" ? date : undefined,
      createdAt: at(-22),
      ...extra,
    };
    posts.push(p);
    return p;
  };

  const m1 = addPost(P1, d(-18), "video", "Yangi yumshoq mebel kolleksiyasi", "published", { forTarget: true });
  addPost(P1, d(-16), "image", "Oshxona mebeli tanlashda 3 ta xato", "published");
  addPost(P1, d(-13), "video", "Ishlab chiqarish jarayoni (backstage)", "published", { forTarget: true });
  addPost(P1, d(-11), "ai", "AI post: kichik xonaga mebel tanlash", "published", { platform: "telegram" });
  addPost(P1, d(-8), "image", "Chegirma −15%: kuzgi aksiya", "published", { platform: "telegram", forTarget: true });
  addPost(P1, d(-5), "video", "Mijoz fikri: Chilonzordagi oila", "published");
  const late1 = addPost(P1, d(-2), "image", "Materiallar sifati: MDF va LDSP", "design");
  const todayA = addPost(P1, d(0), "video", "Yotoqxona to'plami obzori", "approved", {
    script: "0–3 s: xona umumiy ko'rinishi\n3–15 s: karavot mexanizmi\n15–25 s: shkaf ichki tuzilishi\nCTA: showroomga taklif",
  });
  addPost(P1, d(0), "image", "Telegram: haftalik aksiyalar", "client", { platform: "telegram" });
  const p1Int = addPost(P1, d(2), "video", "Showroom bo'ylab tur", "internal", { forTarget: true });
  const p1Edit = addPost(P1, d(4), "video", "Yetkazib berish va o'rnatish jarayoni", "editing");
  const p1Shoot1 = addPost(P1, d(6), "video", "Savol-javob: 2 yillik kafolat", "shoot");
  const p1Shoot2 = addPost(P1, d(8), "video", "Bolalar xonasi g'oyalari", "shoot");
  addPost(P1, d(9), "ai", "AI post: 2026 interyer trendlari", "plan");

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
  addPost(P2, d(23), "ai", "AI post: ish stoli yonida 5 daqiqalik mashq", "plan", { platform: "telegram" });

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
      footageLink: "https://drive.google.com/drive/folders/sharq-mebel-kadrlar-1",
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
      footageLink: "https://drive.google.com/drive/folders/fitlife-kadrlar-oktyabr",
      status: "handed",
      handedAt: at(-6, 15),
      createdAt: at(-10),
    },
  ];

  // ---------- Vazifalar ----------
  const tasks: Task[] = [];
  const addTask = (t: Omit<Task, "id" | "createdAt" | "createdBy"> & { createdBy?: string }) =>
    tasks.push({ id: id("task"), createdAt: at(-10), createdBy: "u_smm1", ...t });

  const montaj = (
    projectId: string,
    postId: string,
    assigneeId: string,
    title: string,
    deadline: string,
    status: TaskStatus,
    acceptedAt?: string,
  ) =>
    addTask({
      projectId,
      postId,
      kind: "montaj",
      assigneeId,
      title,
      brief: "Reels formati 9:16, 30–45 soniya. Brend shriftlari, subtitr majburiy. Musiqa — trenddagi, mualliflik huquqisiz.",
      script: "Hook birinchi 2 soniyada. Oxirida CTA: «Direct'ga yozing».",
      footageLink: "https://drive.google.com/drive/folders/kadrlar",
      deadline,
      status,
      acceptedAt,
      resultLink: status === "review" || status === "accepted" ? "https://drive.google.com/file/d/tayyor-video" : undefined,
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
    files: "https://drive.google.com/drive/folders/sharq-brendbuk",
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
    resultLink: "https://drive.google.com/file/d/fitlife-oblojka",
    createdBy: "u_smm2",
  });

  addTask({
    projectId: P1,
    kind: "target",
    assigneeId: "u_tg",
    title: "Kolleksiya + backstage videolari bilan lid kampaniyasi",
    brief: "Maqsad: lid forma. Geo: Toshkent. Yosh 25–45. Kunlik byudjet 150 000 so'm.",
    files: "https://drive.google.com/drive/folders/sharq-target-materiallar",
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
    files: "https://drive.google.com/drive/folders/sharq-aksiya",
    deadline: d(1),
    status: "new",
  });
  addTask({
    projectId: P2,
    kind: "target",
    assigneeId: "u_tg",
    title: "Yangi filial + abonement aksiyasi",
    brief: "Maqsad: sinov mashg'ulotiga yozilish. Geo: 5 km radius.",
    files: "https://drive.google.com/drive/folders/fitlife-target",
    deadline: d(-36),
    status: "progress",
    launchedAt: p2Start,
    createdBy: "u_smm2",
  });

  // ---------- Target hisobotlari (P1 da kechagi hisobot ataylab yo'q — belgi ko'rinadi) ----------
  const targetReports: TargetReport[] = [];
  for (let i = 14; i >= 1; i--) {
    for (const [pid, base] of [
      [P1, 150_000],
      [P2, 120_000],
    ] as const) {
      if (pid === P1 && i === 1) continue;
      const k = 0.85 + ((i * 7 + base / 10_000) % 30) / 100;
      targetReports.push({
        id: id("tr"),
        projectId: pid,
        date: d(-i),
        spend: Math.round((base * k) / 1000) * 1000,
        views: Math.round(9_000 * k + i * 130),
        clicks: Math.round(210 * k + i * 3),
        leads: Math.round(5 * k + (i % 3)),
        note: i === 7 ? "Kreativ almashtirildi, CTR oshdi" : "",
        authorId: "u_tg",
        source: i % 4 === 0 ? "meta" : "manual",
      });
    }
  }

  // ---------- To'lovlar ----------
  const payments: Payment[] = [
    {
      id: "pay_p1_pre",
      projectId: P1,
      kind: "prepay",
      periodIndex: 0,
      amount: 6_000_000,
      dueDate: d(-27),
      transactions: [{ id: id("tx"), date: d(-26), amount: 6_000_000, note: "Bank o'tkazmasi" }],
    },
    {
      id: "pay_p2_pre",
      projectId: P2,
      kind: "prepay",
      periodIndex: 0,
      amount: 2_500_000,
      dueDate: d(-42),
      transactions: [{ id: id("tx"), date: d(-41), amount: 2_500_000, note: "Naqd" }],
    },
    {
      id: "pay_p2_rem",
      projectId: P2,
      kind: "remainder",
      periodIndex: 0,
      amount: 2_500_000,
      dueDate: d(-20),
      transactions: [{ id: id("tx"), date: d(-19), amount: 2_500_000, note: "Naqd" }],
    },
    {
      id: "pay_p2_m1",
      projectId: P2,
      kind: "monthly",
      periodIndex: 1,
      amount: 5_000_000,
      dueDate: p2Cur,
      transactions: [{ id: id("tx"), date: addDays(p2Cur, 1), amount: 2_000_000, note: "Qisman, qolgani keyinroq" }],
    },
    {
      id: "pay_p3_pre",
      projectId: P3,
      kind: "prepay",
      periodIndex: 0,
      amount: 2_000_000,
      dueDate: d(2),
      transactions: [],
    },
    {
      id: "pay_p3_rem",
      projectId: P3,
      kind: "remainder",
      periodIndex: 0,
      amount: 2_000_000,
      dueDate: "",
      transactions: [],
    },
  ];

  // ---------- CRM ----------
  const lead = (l: Partial<Lead> & Pick<Lead, "id" | "name" | "phone" | "stage">): Lead => ({
    source: "Instagram",
    service: "SMM to'liq paket",
    note: "",
    operatorId: "u_op1",
    history: [],
    createdAt: at(-5),
    ...l,
  });
  const leads: Lead[] = [
    lead({ id: "l_1", name: "Lazzat Burger", phone: "+998 90 123 45 67", stage: "new", source: "Meta Ads", createdAt: at(0, 8) }),
    lead({ id: "l_2", name: "Oila Market", phone: "+998 93 765 43 21", stage: "new", operatorId: "u_op2", source: "Sayt", service: "Target reklama", createdAt: at(0, 9) }),
    lead({
      id: "l_3",
      name: "Grand Tour turagentligi",
      phone: "+998 97 888 00 11",
      stage: "meeting",
      meeting: { date: d(1), time: "15:00", marketologId: "u_mk" },
      history: [{ id: id("c"), at: at(-1), userId: "u_op1", text: "Qo'ng'iroq qilindi, ertaga ofisga kelishga kelishildi." }],
    }),
    lead({
      id: "l_4",
      name: "Kids Academy",
      phone: "+998 99 321 21 21",
      stage: "visited",
      operatorId: "u_op2",
      meeting: { date: d(-1), time: "11:00", marketologId: "u_mk" },
      note: "Narx taklifini kutyapti",
      history: [{ id: id("c"), at: at(-1, 12), userId: "u_mk", text: "Uchrashuv bo'ldi, tijorat taklifi yuborildi." }],
    }),
    lead({
      id: "l_5",
      name: "Avto Detailing Pro",
      phone: "+998 90 909 09 09",
      stage: "waiting",
      nextContactDate: d(0),
      history: [{ id: id("c"), at: at(-6), userId: "u_op1", text: "Rahbar safarda, keyingi hafta qayta qo'ng'iroq." }],
    }),
    lead({ id: "l_mebel", name: "Sharq Mebel", phone: "+998 90 555 12 12", stage: "contract", projectId: P1, createdAt: at(-35) }),
    lead({ id: "l_gym", name: "FitLife Gym", phone: "+998 91 777 45 45", stage: "contract", projectId: P2, operatorId: "u_op2", createdAt: at(-50) }),
    lead({ id: "l_dent", name: "Dent Plus klinikasi", phone: "+998 99 404 40 40", stage: "contract", projectId: P3, createdAt: at(-9) }),
    lead({ id: "l_6", name: "Shirin Tort", phone: "+998 94 100 20 30", stage: "unfit", rejectReason: "Byudjet to'g'ri kelmadi (1 mln so'mgacha)", createdAt: at(-12) }),
    lead({ id: "l_7", name: "Noma'lum", phone: "+998 00 000 00 00", stage: "lowquality", operatorId: "u_op2", rejectReason: "Raqam noto'g'ri, javob bermadi", createdAt: at(-4) }),
  ];

  const prevMonth = shiftMonthKey(monthKey(today), -1);

  return {
    version: SEED_VERSION,
    currentUserId: "u_mk",
    users,
    leads,
    projects,
    posts,
    shoots,
    tasks,
    targetReports,
    payments,
    reports: [
      {
        id: "rep_1",
        projectId: P2,
        periodIndex: 0,
        fileLink: "https://drive.google.com/file/d/fitlife-1-oy-hisobot",
        reach: 184_000,
        followers: 640,
        leads: 92,
        summary: "Reja: 12 post, joylandi: 12. Eng yaxshi natija — transformatsiya videolari (ER 6,1%).",
        authorId: "u_smm2",
        submittedAt: at(-5),
      },
    ],
    salaries: [
      { id: "sal_1", userId: "u_smm1", month: prevMonth, amount: 6_000_000, note: "Oylik" },
      { id: "sal_2", userId: "u_smm2", month: prevMonth, amount: 5_500_000, note: "Oylik" },
      { id: "sal_3", userId: "u_dz", month: prevMonth, amount: 4_500_000, note: "Oylik + bonus" },
    ],
    notifications: [
      { id: "n_1", userId: "u_mk", text: "Yangi uchrashuv belgilandi: Grand Tour turagentligi, ertaga 15:00", href: "/crm", at: at(-1), read: false, telegram: "demo" },
      { id: "n_2", userId: "u_mk", text: "Tasdiqlash so'rovi: Showroom bo'ylab tur (Sharq Mebel)", href: "/tasdiqlash", at: at(0, 7), read: false, telegram: "demo" },
      { id: "n_3", userId: "u_sy", text: "Syomka belgilandi: Sharq Mebel, ertaga 11:00, Chilonzor", href: "/syomka", at: at(-3), read: false, telegram: "demo" },
      { id: "n_4", userId: "u_mt2", text: "Yangi TZ: Trener maslahati: isinish (FitLife Gym)", href: "/montaj", at: at(-6), read: false, telegram: "demo" },
      { id: "n_5", userId: "u_dz", text: "Ish qaytarildi: Karusel: MDF va LDSP — 3-slayddagi matn juda mayda", href: "/dizayn", at: at(-2), read: false, telegram: "demo" },
      { id: "n_6", userId: "u_mol", text: "FitLife Gym: oylik to'lov muddati o'tdi", href: "/moliya", at: at(-3), read: false, telegram: "demo" },
    ],
    activity: [
      { id: "a_1", at: at(-1, 11), userId: "u_op1", text: "Grand Tour turagentligi: bosqich → Uchrashuv belgilandi", href: "/crm" },
      { id: "a_2", at: at(-2, 9), userId: "u_smm1", text: "Showroom bo'ylab tur: ichki tasdiqqa yuborildi", href: "/kontent" },
      { id: "a_3", at: at(-3, 16), userId: "u_mk", text: "Dent Plus klinikasi: loyiha kartasi yaratildi (lid → loyiha)", href: `/loyiha/${P3}` },
    ],
    settings: {
      montajPrice: 250_000,
      telegram: { enabled: true, botToken: "" },
    },
  };
}
