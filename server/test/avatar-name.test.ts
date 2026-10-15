// Profil rasmi (hamma ko'radi, o'zi yoki admin yuklaydi) va xodim ismini o'zgartirish (faqat admin).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkJpeg } from "../src/avatar";
import type { ErpState } from "../../src/lib/types";
import { action, giveLogin, loginAs, ORIGIN, setup, type Client, type Ctx } from "./helpers";

/** Haqiqiy JPEG tuzilmasi (SOI, SOF0 o'lcham bilan, skan, EOI) — faqat tekshiruvlar uchun. */
function jpeg(w = 256, h = 256, pad = 400): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00]);
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, (pad + 2) >> 8, (pad + 2) & 255]), Buffer.alloc(pad, 0x41)]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), com, sof, sos, Buffer.from([0xff, 0xd9])]);
}

let t: Ctx;
let admin: Client;
let smm: Client;
let op: Client;

const cookieOf = (c: Client) =>
  Object.entries(c.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
const upload = (c: Client, id: string, body: Buffer | string, headers: Record<string, string> = {}) =>
  t.app.inject({
    method: "POST",
    url: `/api/avatar/${id}`,
    remoteAddress: "127.0.0.1",
    headers: { "x-forwarded-for": c.ip, cookie: cookieOf(c), "content-type": "image/jpeg", "x-erp": "1", origin: ORIGIN, ...headers },
    payload: body,
  });
const get = (c: Client | null, id: string) =>
  t.app.inject({
    method: "GET",
    url: `/api/avatar/${id}`,
    remoteAddress: "127.0.0.1",
    headers: { "x-forwarded-for": c?.ip ?? "10.9.9.9", ...(c ? { cookie: cookieOf(c) } : {}) },
  });
const stateOf = async (c: Client) => (await c.req("GET", "/api/state")).json().state as ErpState;

beforeAll(async () => {
  t = await setup();
  for (const [id, login] of [
    ["u_admin", "admin"],
    ["u_smm1", "madina"],
    ["u_op1", "dilnoza"],
  ] as const)
    await giveLogin(t.db, id, login);
  admin = await loginAs(t.app, "admin");
  smm = await loginAs(t.app, "madina");
  op = await loginAs(t.app, "dilnoza");
});
afterAll(() => t.close());

describe("JPEG tekshiruvi", () => {
  it("to'g'ri JPEG o'tadi, o'lchami o'qiladi", () => {
    expect(checkJpeg(jpeg(256, 200))).toEqual({ ok: true, w: 256, h: 200 });
  });
  it("noto'g'ri fayllar rad etiladi", () => {
    expect(checkJpeg(Buffer.from("GIF89a" + "x".repeat(300))).ok).toBe(false);
    expect(checkJpeg(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(300)])).ok).toBe(false);
    expect(checkJpeg(jpeg(600, 600)).ok).toBe(false);
    expect(checkJpeg(jpeg(10, 10)).ok).toBe(false);
    expect(checkJpeg(jpeg().subarray(0, 300)).ok).toBe(false);
    const noEoi = jpeg();
    expect(checkJpeg(noEoi.subarray(0, noEoi.length - 2)).ok).toBe(false);
    expect(checkJpeg(Buffer.alloc(0)).ok).toBe(false);
    expect(checkJpeg(Buffer.concat([jpeg(), Buffer.alloc(200 * 1024)])).ok).toBe(false);
  });
});

describe("Profil rasmi", () => {
  it("xodim o'z rasmini yuklaydi; hamma ko'radi; holatda belgi paydo bo'ladi", async () => {
    const img = jpeg();
    const r = await upload(smm, "u_smm1", img);
    expect(r.statusCode).toBe(200);
    const g = await get(op, "u_smm1");
    expect(g.statusCode).toBe(200);
    expect(g.headers["content-type"]).toContain("image/jpeg");
    expect(g.headers["content-security-policy"]).toContain("sandbox");
    expect(g.rawPayload.equals(img)).toBe(true);
    // boshqa xodim holatda belgini ko'radi (rasm baytlari holatga kirmaydi)
    const seen = (await stateOf(op)).users.find((u) => u.id === "u_smm1")!;
    expect(seen.avatarAt).toBeTruthy();
    expect(JSON.stringify(await stateOf(op))).not.toContain("QUFB"); // rasm baytlari holatda yo'q
  });

  it("qayta so'rovda ETag bilan 304", async () => {
    const g = await get(op, "u_smm1");
    const again = await t.app.inject({
      method: "GET",
      url: "/api/avatar/u_smm1",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": op.ip, cookie: cookieOf(op), "if-none-match": String(g.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });

  it("kirmagan odam rasmni ko'ra olmaydi", async () => {
    expect((await get(null, "u_smm1")).statusCode).toBe(401);
  });

  it("boshqa xodim birovning rasmini almashtira olmaydi; admin istalganiga qo'yadi", async () => {
    expect((await upload(op, "u_smm1", jpeg())).statusCode).toBe(403);
    expect((await upload(op, "u_admin", jpeg())).statusCode).toBe(403);
    expect((await upload(admin, "u_op1", jpeg())).statusCode).toBe(200);
    expect((await get(smm, "u_op1")).statusCode).toBe(200);
    expect((await upload(admin, "u_yoq", jpeg())).statusCode).toBe(404);
  });

  it("hujum: yaroqsiz fayl, katta fayl, katta o'lcham, CSRF — hammasi rad etiladi", async () => {
    expect((await upload(smm, "u_smm1", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(400)]))).statusCode).toBe(400);
    expect((await upload(smm, "u_smm1", "<script>alert(1)</script>".repeat(20))).statusCode).toBe(400);
    expect((await upload(smm, "u_smm1", jpeg(1000, 1000))).statusCode).toBe(400);
    expect((await upload(smm, "u_smm1", Buffer.concat([jpeg(), Buffer.alloc(300 * 1024)]))).statusCode).toBe(413);
    expect((await upload(smm, "u_smm1", jpeg(), { "x-erp": "" })).statusCode).toBe(403);
    expect((await upload(smm, "u_smm1", jpeg(), { origin: "https://boshqa.sayt" })).statusCode).toBe(403);
    // boshqa kontent turi (masalan, matn) qabul qilinmaydi
    expect((await upload(smm, "u_smm1", jpeg(), { "content-type": "text/html" })).statusCode).toBeGreaterThanOrEqual(400);
  });

  it("yo'l (id) orqali hujum: g'alati ID rad etiladi", async () => {
    expect((await get(admin, "..%2F..%2Fetc")).statusCode).toBe(404);
    expect((await get(admin, "u_smm1'%20OR%201=1")).statusCode).toBe(404);
  });

  it("rasmni o'chirish: o'zi yoki admin; boshqa xodim — yo'q", async () => {
    expect((await op.req("POST", "/api/avatar/u_smm1/remove")).statusCode).toBe(403);
    expect((await smm.req("POST", "/api/avatar/u_smm1/remove")).statusCode).toBe(200);
    expect((await get(op, "u_smm1")).statusCode).toBe(404);
    expect((await stateOf(op)).users.find((u) => u.id === "u_smm1")!.avatarAt).toBeUndefined();
    expect((await admin.req("POST", "/api/avatar/u_op1/remove")).statusCode).toBe(200);
  });

  it("audit jurnaliga yoziladi, rasm bazada saqlanadi (zaxiraga kiradi)", async () => {
    await upload(smm, "u_smm1", jpeg());
    const a = await t.db.query("SELECT detail FROM audit_log WHERE kind = 'avatar'");
    expect(a.rowCount).toBeGreaterThan(2);
    const d = await t.db.query("SELECT length(data) AS n FROM user_avatars WHERE user_id = 'u_smm1'");
    expect(Number(d.rows[0].n)).toBeGreaterThan(100);
  });

  it("brauzerdan «holatga belgi qo'yish» amali (setAvatarStamp) ochiq emas", async () => {
    for (const c of [admin, smm]) expect((await action(c, "setAvatarStamp", ["u_op1", "2026-01-01T00:00:00.000Z"])).statusCode).toBe(403);
  });
});

describe("Xodim ismini o'zgartirish (faqat admin)", () => {
  it("admin o'zgartiradi; ortiqcha probellar tozalanadi; eski yozuvlar buzilmaydi", async () => {
    const before = t.store.current().state.leads.filter((l) => l.operatorId === "u_op1").length;
    const r = await action(admin, "setUserName", ["u_op1", "  Dilnoza   Yusupova-Karimova "]);
    expect(r.statusCode).toBe(200);
    expect(t.store.current().state.users.find((u) => u.id === "u_op1")!.name).toBe("Dilnoza Yusupova-Karimova");
    expect(t.store.current().state.leads.filter((l) => l.operatorId === "u_op1")).toHaveLength(before);
    expect(t.store.current().state.activity[0]!.text).toContain("ism o'zgartirildi");
  });

  it("oddiy xodim o'z ismini ham, birovnikini ham o'zgartira olmaydi", async () => {
    expect((await action(smm, "setUserName", ["u_smm1", "Yangi Ism"])).statusCode).toBe(403);
    expect((await action(op, "setUserName", ["u_admin", "Hacker"])).statusCode).toBe(403);
  });

  it("bo'sh, juda uzun yoki yo'q xodim rad etiladi", async () => {
    expect((await action(admin, "setUserName", ["u_smm1", "   "])).statusCode).toBe(422);
    expect((await action(admin, "setUserName", ["u_smm1", "x".repeat(81)])).statusCode).toBe(422);
    expect((await action(admin, "setUserName", ["u_yoq", "Ism"])).statusCode).toBe(422);
  });
});
