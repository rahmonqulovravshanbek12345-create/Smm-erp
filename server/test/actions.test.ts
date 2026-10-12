// Amallar: huquq, argumentlar, ma'lumotni saralash, maxfiy kalitlar, ID'lar va sahifa sarlavhalari.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SECRET_MASK } from "../../src/lib/redact";
import type { ErpState } from "../../src/lib/types";
import { action, client, giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let boss: Client;
let mol: Client;
let mt: Client;
let smm: Client;
let admin: Client;
const state = async (c: Client) => (await c.req("GET", "/api/state")).json().state as ErpState;

beforeAll(async () => {
  t = await setup();
  await giveLogin(t.db, "u_boss", "boss");
  await giveLogin(t.db, "u_mol", "moliya");
  await giveLogin(t.db, "u_mt1", "rustam");
  await giveLogin(t.db, "u_smm1", "madina");
  await giveLogin(t.db, "u_admin", "admin");
  boss = await loginAs(t.app, "boss");
  mol = await loginAs(t.app, "moliya");
  mt = await loginAs(t.app, "rustam");
  smm = await loginAs(t.app, "madina");
  admin = await loginAs(t.app, "admin");
});
afterAll(() => t.close());

describe("Ma'lumotni saralash", () => {
  it("montajyor boshqalarning oyligini, kassani, xarajatlarni va boshqa loyihalarni ko'rmaydi", async () => {
    const s = await state(mt);
    const full = t.store.current().state;
    expect(s.currentUserId).toBe("u_mt1");
    expect(s.payProfiles.every((p) => p.userId === "u_mt1")).toBe(true);
    expect(s.accruals.every((a) => a.userId === "u_mt1")).toBe(true);
    expect(s.accruals.length).toBeGreaterThan(0);
    expect(s.bills).toEqual([]);
    expect(s.vendors).toEqual([]);
    expect(s.budget).toEqual([]);
    expect(s.leads).toEqual([]);
    expect(s.accounts.every((a) => a.opening === 0)).toBe(true);
    expect(s.notifications.every((n) => n.userId === "u_mt1")).toBe(true);
    expect(s.activity.every((a) => a.userId === "u_mt1")).toBe(true);
    expect(s.projects.length).toBeLessThan(full.projects.length);
    const pids = new Set(s.projects.map((p) => p.id));
    expect(s.tasks.every((x) => pids.has(x.projectId))).toBe(true);
    expect(s.invoices.every((x) => pids.has(x.projectId))).toBe(true);
    // Ish haqi to'lovlaridan faqat o'ziniki
    const payroll = s.transactions.filter((x) => x.userId);
    expect(payroll.every((x) => x.userId === "u_mt1")).toBe(true);
    const json = JSON.stringify(s);
    for (const p of full.payProfiles.filter((x) => x.userId !== "u_mt1")) expect(json).not.toContain(`"userId":"${p.userId}","fixed"`);
  });

  it("moliya va rahbar hammasini ko'radi (tokenlarsiz)", async () => {
    const s = await state(mol);
    const full = t.store.current().state;
    expect(s.payProfiles.length).toBe(full.payProfiles.length);
    expect(s.transactions.length).toBe(full.transactions.length);
    expect(s.notifications.every((n) => n.userId === "u_mol")).toBe(true);
  });
});

describe("Maxfiy kalitlar", () => {
  it("Telegram tokeni hech kimga yuborilmaydi; «••••» qaytib kelsa token o'zgarmaydi", async () => {
    const token = "987654:SECRET_value_for_tests_only_000000";
    expect((await action(admin, "setTelegramToken", [token])).statusCode).toBe(200);
    expect(t.store.current().state.settings.telegram.botToken).toBe(token);
    for (const c of [admin, boss, mol, mt, smm]) {
      const raw = (await c.req("GET", "/api/state")).body;
      expect(raw).not.toContain("SECRET_value");
    }
    const masked = (await state(admin)).settings.telegram.botToken;
    expect(masked.startsWith(SECRET_MASK)).toBe(true);
    expect((await action(admin, "setTelegramToken", [masked])).statusCode).toBe(200);
    expect(t.store.current().state.settings.telegram.botToken).toBe(token);
    // Eksportda ham yo'q
    expect((await admin.req("GET", "/api/admin/export")).body).not.toContain("SECRET_value");
  });
});

describe("Huquqlar", () => {
  it("montajyor pul to'lay olmaydi, oylik stavkasini o'zgartira olmaydi, xodim qo'sha olmaydi", async () => {
    const cases: [string, unknown[]][] = [
      ["payEmployee", [{ userId: "u_mt1", amount: 99_000_000, date: "2026-10-07", accountId: "acc_cash", note: "" }]],
      ["savePayProfile", [{ userId: "u_mt1", fixed: 50_000_000, perProject: 0, rates: {} }]],
      ["addUser", [{ name: "Xaker", role: "admin" }]],
      ["setUserRole", ["u_mt1", "admin"]],
      ["approveAccruals", [["acr_x"]]],
      ["deleteTransaction", ["tx_1"]],
      ["switchUser", ["u_boss"]],
      ["applyMetaSync", [[]]],
    ];
    const before = t.store.current().version;
    for (const [name, args] of cases) {
      const r = await action(mt, name, args);
      expect(r.statusCode, name).toBe(403);
    }
    expect(t.store.current().version).toBe(before);
  });

  it("montajyor faqat o'z vazifasini bajara oladi", async () => {
    const s = t.store.current().state;
    const prj = s.projects.find((p) => p.id === "p_mebel")!;
    const tz = (assigneeId: string) => ({ kind: "montaj", projectId: prj.id, assigneeId, title: `Sinov TZ ${assigneeId}`, brief: "", deadline: "2026-12-01" });
    expect((await action(boss, "createTask", [tz("u_mt1")])).statusCode).toBe(200);
    expect((await action(boss, "createTask", [tz("u_mt2")])).statusCode).toBe(200);
    const tasks = t.store.current().state.tasks;
    const other = tasks.find((x) => x.title === "Sinov TZ u_mt2");
    const mine = tasks.find((x) => x.title === "Sinov TZ u_mt1");
    expect(other && mine && s.tasks.length + 2 === tasks.length).toBeTruthy();
    expect((await action(mt, "startTask", [other!.id])).statusCode).toBe(403);
    expect((await action(mt, "acceptTask", [mine!.id])).statusCode).toBe(403);
    const r = await action(mt, "startTask", [mine!.id]);
    expect(r.statusCode).toBe(200);
    expect(t.store.current().state.tasks.find((x) => x.id === mine!.id)!.status).toBe("progress");
  });

  it("SMM boshqa SMM loyihasida post qo'sha olmaydi", async () => {
    const s = t.store.current().state;
    const foreign = s.projects.find((p) => p.smmId && p.smmId !== "u_smm1" && p.status === "active")!;
    const r = await action(smm, "savePost", [
      {
        projectId: foreign.id,
        date: "2026-10-10",
        platforms: ["instagram"],
        typeId: "ct_video",
        format: "video",
        topic: "X",
        script: "",
        assigneeId: "u_smm1",
        forTarget: false,
      },
    ]);
    expect(r.statusCode).toBe(403);
  });

  it("arxivlangan xodim darhol tizimdan chiqariladi", async () => {
    await giveLogin(t.db, "u_web", "jamshid");
    const web = await loginAs(t.app, "jamshid");
    expect((await web.req("GET", "/api/state")).statusCode).toBe(200);
    // Admin sahifasi faqat admin uchun — rahbar ham arxivlay olmaydi
    expect((await action(boss, "archiveUser", ["u_web"])).statusCode).toBe(403);
    expect((await action(admin, "archiveUser", ["u_web"])).statusCode).toBe(200);
    expect((await web.req("GET", "/api/state")).statusCode).toBe(401);
    expect((await client(t.app).req("POST", "/api/auth/login", { login: "jamshid", password: "Sinov-parol-2026" })).statusCode).toBe(401);
  });
});

describe("Argumentlarni tekshirish", () => {
  it("noto'g'ri tur, ortiqcha maydon, ulkan matn, noma'lum amal — rad etiladi, holat o'zgarmaydi", async () => {
    const before = t.store.current().version;
    const bad: [string, unknown][] = [
      ["addTransaction", [{ date: "2026-10-07", accountId: "acc_cash", dir: "in", amount: "1e99", articleId: "a_other_in", note: "" }]],
      ["addTransaction", [{ date: "2026-10-07", accountId: "acc_cash", dir: "in", amount: 1000, articleId: "a_other_in", note: "", invoiceId: "inv_1" }]],
      ["addTransaction", [{ date: "07.10.2026", accountId: "acc_cash", dir: "in", amount: 1000, articleId: "a_other_in", note: "" }]],
      ["addTransaction", [{ date: "2026-10-07", accountId: "acc_cash", dir: "in", amount: Number.MAX_VALUE, articleId: "a_other_in", note: "" }]],
      ["voidInvoice", ["inv_1", "x".repeat(10_000)]],
      ["setUsdRate", [13_000, "2026-10-07", "cbu"]],
      ["updateProject", ["p_mebel", { monthlyFee: 1 }]],
    ];
    for (const [name, args] of bad) expect((await action(mol, name, args as unknown[])).statusCode, name).toBe(400);
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", "eval"]) expect((await action(mol, name, [])).statusCode, name).toBe(400);
    expect((await mol.req("POST", "/api/action", { name: "markAllRead" })).statusCode).toBe(400);
    expect((await mol.req("POST", "/api/action", { name: "markAllRead", args: [], extra: 1 })).statusCode).toBe(400);
    expect(t.store.current().version).toBe(before);
  });

  it("juda katta so'rov (1 MB dan ortiq) qabul qilinmaydi", async () => {
    const r = await action(mol, "voidInvoice", ["inv_1", "x".repeat(1_200_000)]);
    expect(r.statusCode).toBe(413);
  });

  it("XSS: matn sifatida saqlanadi (bajarilmaydi) — sahifa CSP faqat o'z skriptiga ruxsat beradi", async () => {
    const r = await t.app.inject({ method: "GET", url: "/" });
    const csp = String(r.headers["content-security-policy"]);
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["strict-transport-security"]).toMatch(/max-age=31536000/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("Amallar va ID'lar", () => {
  it("brauzer yaratgan ID server tomonidan ishlatiladi; mavjud ID bilan «ustidan yozish» mumkin emas", async () => {
    const input = {
      name: "Sinov Mijoz",
      contactName: "Ali",
      phone: "+998 00 000 00 01",
      industry: "Savdo",
      links: "",
      contractNo: "SH-TEST/1",
      contractDate: "2026-10-07",
      prepayType: 100,
      prepayDueDate: "2026-10-08",
      remainderDueDate: "",
      marketologId: "u_mk",
      smmId: "u_smm1",
      services: [{ kind: "smm", title: "Start", price: 5_000_000 }],
    };
    const r = await action(boss, "createProject", [input], ["prj_abcd1234"]);
    expect(r.statusCode).toBe(200);
    expect(r.json().value).toBe("prj_abcd1234");
    expect(t.store.current().state.projects.some((p) => p.id === "prj_abcd1234")).toBe(true);
    // Xuddi shu ID ikkinchi marta — yangi tasodifiy ID beriladi (eski loyiha buzilmaydi)
    const again = await action(boss, "createProject", [{ ...input, contractNo: "SH-TEST/2" }], ["prj_abcd1234"]);
    expect(again.statusCode).toBe(200);
    expect(again.json().value).not.toBe("prj_abcd1234");
    expect(t.store.current().state.projects.filter((p) => p.id === "prj_abcd1234")).toHaveLength(1);
  });

  it("amal qoidasi buzilsa — tushunarli xato, holat o'zgarmaydi", async () => {
    const before = t.store.current().version;
    const r = await action(boss, "moveLead", [t.store.current().state.leads[0]!.id, "unfit", { reason: " " }]);
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe("Sabab majburiy");
    expect(t.store.current().version).toBe(before);
  });

  it("javobda yangilangan holat va versiya; ma'lumot bazaga yozilgan", async () => {
    const r = await action(boss, "setUsdMarkup", [3]);
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.state.settings.usdMarkupPct).toBe(3);
    const { rows } = await t.db.query("SELECT version, data->'settings'->>'usdMarkupPct' AS pct FROM app_state");
    expect(Number(rows[0].version)).toBe(body.version);
    expect(rows[0].pct).toBe("3");
    // O'zgarmagan holat — 204 (qayta yuklanmaydi)
    expect((await boss.req("GET", `/api/state?v=${body.version}`)).statusCode).toBe(204);
  });

  it("ketma-ket 30 ta parallel amal — hammasi saqlanadi, birortasi yo'qolmaydi", async () => {
    const before = t.store.current().version;
    const month = (i: number) => `${2027 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => action(mol, "setBudget", [month(i), "overhead", 1000 + i])));
    expect(rs.every((r) => r.statusCode === 200)).toBe(true);
    expect(t.store.current().version).toBe(before + 30);
    const b = t.store.current().state.budget.filter((x) => x.month >= "2027-01" && x.line === "overhead");
    expect(b.map((x) => x.amount).sort()).toEqual(Array.from({ length: 30 }, (_, i) => 1000 + i).sort());
  });
});

describe("Mustaqil tekshiruv topgan hujumlar (tuzatilgan)", () => {
  it("targetolog hisob davri boshini o'tmishga sura olmaydi (o'tgan oylar uchun fakturalar chiqmaydi)", async () => {
    await giveLogin(t.db, "u_tg", "bekzod");
    const tg = await loginAs(t.app, "bekzod");
    const s = t.store.current().state;
    const task = s.tasks.find((x) => x.kind === "target" && x.assigneeId === "u_tg")!;
    const invBefore = s.invoices.length;
    const r = await action(tg, "launchTarget", [task.id, "2015-01-01"]);
    expect(r.statusCode).toBe(422);
    expect((await action(tg, "launchTarget", [task.id, "2026-02-30"])).statusCode).toBe(400);
    expect(t.store.current().state.invoices.length).toBe(invBefore);
  });

  it("2FA kodini tanlash: qayta kirib (yoki IP almashtirib) blokni aylanib o'tib bo'lmaydi", async () => {
    const { totpAt } = await import("../src/crypto");
    await giveLogin(t.db, "u_op2", "jasur");
    const owner = await loginAs(t.app, "jasur");
    const { secret } = (await owner.req("POST", "/api/auth/2fa/setup")).json();
    expect((await owner.req("POST", "/api/auth/2fa/enable", { code: totpAt(secret, Math.floor(Date.now() / 30_000)) })).statusCode).toBe(200);
    let last = 0;
    for (let round = 0; round < 3; round++) {
      const thief = client(t.app); // har safar yangi IP
      expect((await thief.req("POST", "/api/auth/login", { login: "jasur", password: "Sinov-parol-2026" })).statusCode).toBeLessThan(500);
      for (let i = 0; i < 4; i++) last = (await thief.req("POST", "/api/auth/totp", { code: String(200000 + round * 10 + i) })).statusCode;
    }
    // 10 ta xatodan keyin login yopiladi — to'g'ri parol bilan ham, yangi IP'dan ham
    expect(last).toBe(429);
    expect((await client(t.app).req("POST", "/api/auth/login", { login: "jasur", password: "Sinov-parol-2026" })).statusCode).toBe(429);
  });

  it("operator lidga boshqa loyihani bog'lab, uning moliyasini ko'ra olmaydi", async () => {
    await giveLogin(t.db, "u_op1", "dilnoza");
    const op = await loginAs(t.app, "dilnoza");
    const s = t.store.current().state;
    const lead = s.leads.find((l) => l.operatorId === "u_op1")!;
    const before = (await state(op)).projects.length;
    const { id, name, phone, source, service, note, operatorId } = lead;
    const r = await action(op, "saveLead", [{ id, name, phone, source, service, note, operatorId, projectId: "p_mebel" }]);
    expect(r.statusCode).toBe(400);
    // Formadan kelgan maydon bo'lsa ham amal uni yozmaydi
    expect(t.store.current().state.leads.find((l) => l.id === lead.id)!.projectId).toBe(lead.projectId);
    expect((await state(op)).projects.length).toBe(before);
  });

  it("montajyor boshqa xodimning ijrochi haqini ko'rmaydi", async () => {
    const s = await state(mt);
    const fees = s.projects.flatMap((p) => p.services).filter((x) => x.assigneeFee !== undefined && x.assigneeId !== "u_mt1");
    expect(fees).toEqual([]);
  });

  it("tasdiqlanmagan postni joylab, tekshirilmagan ishni qabul qilib, boshqa loyiha postini TZ'ga bog'lab bo'lmaydi", async () => {
    const s = t.store.current().state;
    const mine = s.projects.find((p) => p.smmId === "u_smm1" && p.status === "active")!;
    const plan = s.posts.find((p) => p.projectId === mine.id && p.status === "plan");
    if (plan) expect((await action(smm, "publishPost", [plan.id])).statusCode).toBe(422);
    const notReview = s.tasks.find((x) => x.status === "new" && s.projects.find((p) => p.id === x.projectId)?.smmId === "u_smm1");
    if (notReview) expect((await action(smm, "acceptTask", [notReview.id])).statusCode).toBe(422);
    const foreignPost = s.posts.find((p) => p.projectId !== mine.id)!;
    const r = await action(smm, "createTask", [
      { kind: "montaj", projectId: mine.id, postId: foreignPost.id, assigneeId: "u_mt1", title: "X", brief: "", deadline: "2026-12-01" },
    ]);
    expect([403, 422]).toContain(r.statusCode);
  });

  it("ulkan matn (20 000 belgidan ortiq) qabul qilinmaydi; bir xodim minutiga 120 tadan ko'p amal yubora olmaydi", async () => {
    const s = t.store.current().state;
    const mine = s.projects.find((p) => p.smmId === "u_smm1" && p.status === "active")!;
    const big = await action(smm, "savePost", [
      {
        projectId: mine.id,
        date: "2026-10-10",
        platforms: ["instagram"],
        typeId: "ct_video",
        format: "video",
        topic: "X",
        script: "x".repeat(25_000),
        assigneeId: "u_smm1",
        forTarget: false,
      },
    ]);
    expect(big.statusCode).toBe(400);
    await giveLogin(t.db, "u_smm2", "sardor");
    const spam = await loginAs(t.app, "sardor");
    const codes: number[] = [];
    for (let i = 0; i < 125; i++) codes.push((await action(spam, "markAllRead", [])).statusCode);
    expect(codes.slice(0, 120).every((c) => c === 200)).toBe(true);
    expect(codes.slice(120).every((c) => c === 429)).toBe(true);
    // Boshqa xodim (xuddi shu IP'dan) ishlashda davom etadi
    expect((await action(mol, "markAllRead", [])).statusCode).toBe(200);
  });
});
