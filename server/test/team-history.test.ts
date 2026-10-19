// Loyiha jamoasi: lavozimga xodim qaysi sanadan biriktiriladi. Kelajak sana — o'sha kuni o'zi almashadi; o'tmish — darhol.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayISO } from "../../src/lib/dates";
import type { ErpState } from "../../src/lib/types";
import { action, giveLogin, loginAs, setup, type Client, type Ctx } from "./helpers";

let t: Ctx;
let admin: Client;
let rahbar: Client;
let mk: Client;
let smm: Client;
const PID = "p_gym";

const st = () => t.store.current().state as ErpState;
const project = () => st().projects.find((p) => p.id === PID)!;
const team = (role: "marketolog" | "smm" | "targetolog", userId: string, from: string) => action(admin, "setProjectTeam", [PID, role, userId, from]);

beforeAll(async () => {
  t = await setup();
  for (const [id, login] of [
    ["u_admin", "admin"],
    ["u_boss", "rahbar"],
    ["u_mk", "aziza"],
    ["u_smm1", "madina"],
  ] as const)
    await giveLogin(t.db, id, login);
  admin = await loginAs(t.app, "admin");
  rahbar = await loginAs(t.app, "rahbar");
  mk = await loginAs(t.app, "aziza");
  smm = await loginAs(t.app, "madina");
  // Ikkinchi targetolog (jamoa almashuvi uchun)
  await t.store.system((s) => {
    s.users.push({ id: "u_tg2", name: "Kamoliddin Yunusov", role: "targetolog", active: true });
    s.users.push({ id: "u_smm_old", name: "Arxiv SMM", role: "smm", active: false });
  });
});
afterAll(() => t.close());

describe("Jamoa almashuvi (kelajak va o'tmish sana)", () => {
  it("kelajak sana: yozuv saqlanadi, lekin joriy xodim hali o'zgarmaydi", async () => {
    const before = project().smmId;
    const r = await team("smm", "u_smm2", addDays(todayISO(), 5));
    expect(r.statusCode).toBe(200);
    expect(project().smmId).toBe(before);
    expect(project().teamHistory!.some((x) => x.role === "smm" && x.userId === "u_smm2")).toBe(true);
  });

  it("sana kelganda (bugun) — darhol almashadi, tarix saqlanadi", async () => {
    const r = await team("smm", "u_smm2", todayISO());
    expect(r.statusCode).toBe(200);
    expect(project().smmId).toBe("u_smm2");
    expect(project().teamHistory!.find((x) => x.role === "smm" && x.from === todayISO())!.by).toBe("u_admin");
  });

  it("o'tmish sana: darhol kuchga kiradi (boshlang'ich yozuv saqlanadi)", async () => {
    const r = await team("marketolog", "u_mk", addDays(todayISO(), -30));
    expect(r.statusCode).toBe(200);
    expect(project().marketologId).toBe("u_mk");
    expect(project().teamHistory!.some((x) => x.role === "marketolog" && x.from === "2020-01-01")).toBe(true);
  });

  it("boshqa sana bilan ikkinchi o'zgarish ham tarixga yoziladi", async () => {
    await team("smm", "u_smm1", addDays(todayISO(), -60));
    const smmRows = project().teamHistory!.filter((x) => x.role === "smm");
    expect(smmRows.length).toBeGreaterThanOrEqual(3);
  });

  it("targetolog almashsa — ochiq target vazifalari yangi xodimga o'tadi", async () => {
    const pid = PID;
    const tk = {
      id: "tk_teamtest",
      projectId: pid,
      kind: "target",
      assigneeId: "u_tg",
      title: "Sinov target",
      brief: "",
      deadline: addDays(todayISO(), 3),
      createdAt: todayISO(),
    };
    await t.store.system((s) => {
      s.tasks.push(tk as unknown as ErpState["tasks"][number]);
    });
    expect(project().targetologId).toBe("u_tg");
    const r = await team("targetolog", "u_tg2", todayISO());
    expect(r.statusCode).toBe(200);
    expect(project().targetologId).toBe("u_tg2");
    const after = st().tasks.find((x) => x.id === "tk_teamtest")!;
    expect(after.assigneeId).toBe("u_tg2");
  });
});

describe("Ruxsat va tekshiruv", () => {
  it("faqat admin, rahbar va marketolog o'zgartiradi; SMM — yo'q", async () => {
    expect((await smm.req("POST", "/api/action", { name: "setProjectTeam", args: [PID, "smm", "u_smm2", todayISO()] })).statusCode).toBe(403);
    expect((await rahbar.req("POST", "/api/action", { name: "setProjectTeam", args: [PID, "smm", "u_smm2", todayISO()] })).statusCode).toBe(200);
    expect((await mk.req("POST", "/api/action", { name: "setProjectTeam", args: [PID, "smm", "u_smm1", todayISO()] })).statusCode).toBe(200);
  });

  it("lavozimga mos bo'lmagan xodim rad etiladi (masalan, operatorni SMM qilib bo'lmaydi)", async () => {
    expect((await team("smm", "u_op1", todayISO())).statusCode).toBe(422);
    expect((await team("targetolog", "u_mk", todayISO())).statusCode).toBe(422);
  });

  it("arxivdagi xodim tayinlanmaydi", async () => {
    expect((await team("smm", "u_smm_old", todayISO())).statusCode).toBe(422);
  });

  it("noto'g'ri yoki mavjud bo'lmagan sana qabul qilinmaydi", async () => {
    expect((await team("smm", "u_smm2", "2026-02-30")).statusCode).toBe(400);
    expect((await team("smm", "u_smm2", "bugun")).statusCode).toBe(400);
  });

  it("noto'g'ri lavozim nomi rad etiladi", async () => {
    expect((await admin.req("POST", "/api/action", { name: "setProjectTeam", args: [PID, "admin", "u_smm2", todayISO()] })).statusCode).toBe(400);
  });
});
