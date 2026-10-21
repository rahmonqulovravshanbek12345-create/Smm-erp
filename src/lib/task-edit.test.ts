// Berilgan TZ'ni o'zgartirish va bekor qilish, dizayn turlari (Stories, Karusel…) va ish haqiga ta'siri.
import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { denyReason } from "./action-rules";
import { designOptions, designTypeLabel } from "./content";
import { taskWorkType } from "./finance";
import { demoState, makeCtx } from "./test-utils";
import type { ErpState, Task } from "./types";

const dz = (s: ErpState, status: Task["status"]) => s.tasks.find((t) => t.kind === "dizayn" && t.status === status)!;
const user = (s: ErpState, id: string) => s.users.find((u) => u.id === id)!;

describe("TZ'ni o'zgartirish", () => {
  it("deadline va TZ matni o'zgaradi; ijrochiga nima o'zgargani yoziladi; holat saqlanadi", () => {
    const s = demoState();
    const t = dz(s, "new");
    const { c, notes, logs } = makeCtx(s, t.createdBy);
    act.updateTask(c, t.id, { deadline: "2026-10-30", deadlineTime: "15:00", brief: "Yangi TZ matni" });
    expect(t.deadline).toBe("2026-10-30");
    expect(t.deadlineTime).toBe("15:00");
    expect(t.brief).toBe("Yangi TZ matni");
    expect(t.status).toBe("new");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.to).toEqual([t.assigneeId]);
    expect(notes[0]!.text).toContain("TZ o'zgartirildi");
    expect(notes[0]!.text).toContain("deadline");
    expect(notes[0]!.text).toContain("TZ matni");
    expect(logs.at(-1)).toContain("o'zgartirildi");
  });

  it("hech narsa o'zgarmasa — xabar ham, yozuv ham yo'q", () => {
    const s = demoState();
    const t = dz(s, "new");
    const { c, notes, logs } = makeCtx(s, t.createdBy);
    act.updateTask(c, t.id, { title: t.title, deadline: t.deadline, brief: t.brief });
    expect(notes).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("ijrochi almashtirilsa: yangisiga «Yangi TZ», eskisiga «sizdan olindi», vazifa boshidan boshlanadi", () => {
    const s = demoState();
    s.users.push({ id: "u_dz2", name: "Ikkinchi Dizayner", role: "dizayner", active: true });
    const t = dz(s, "progress");
    t.resultLink = "https://drive.google.com/eski";
    const old = t.assigneeId;
    const { c, notes } = makeCtx(s, "u_mk");
    act.updateTask(c, t.id, { assigneeId: "u_dz2" });
    expect(t.assigneeId).toBe("u_dz2");
    expect(t.status).toBe("new");
    expect(t.resultLink).toBeUndefined();
    expect(notes.find((n) => n.to.includes("u_dz2"))?.text).toContain("Yangi TZ");
    expect(notes.find((n) => n.to.includes(old))?.text).toContain("sizdan olindi");
  });

  it("qabul qilingan vazifani o'zgartirib bo'lmaydi (ish haqi hisoblangan)", () => {
    const s = demoState();
    const t = s.tasks.find((x) => x.status === "accepted")!;
    const { c } = makeCtx(s, "u_mk");
    expect(() => act.updateTask(c, t.id, { title: "Boshqa" })).toThrow(/Qabul qilingan/);
  });

  it("noto'g'ri qiymatlar rad etiladi: bo'sh nom, sana, arxivdagi ijrochi, boshqa loyiha posti", () => {
    const s = demoState();
    const t = dz(s, "new");
    const { c } = makeCtx(s, "u_mk");
    expect(() => act.updateTask(c, t.id, { title: "  " })).toThrow(/nomini/);
    expect(() => act.updateTask(c, t.id, { deadline: "ertaga" })).toThrow(/Deadline/);
    user(s, "u_mt1").active = false;
    expect(() => act.updateTask(c, t.id, { assigneeId: "u_mt1" })).toThrow(/Ijrochi/);
    const foreign = s.posts.find((p) => p.projectId !== t.projectId)!;
    expect(() => act.updateTask(c, t.id, { postId: foreign.id })).toThrow(/Post/);
  });

  it("postdan uzish: bo'sh qator yuborilsa bog'lanish olib tashlanadi", () => {
    const s = demoState();
    const t = s.tasks.find((x) => x.kind === "dizayn" && x.postId && x.status !== "accepted")!;
    const { c, notes } = makeCtx(s, "u_mk");
    act.updateTask(c, t.id, { postId: "" });
    expect(t.postId).toBeUndefined();
    expect(notes[0]!.text).toContain("bog'langan post");
  });
});

describe("TZ'ni bekor qilish", () => {
  it("boshlanmagan vazifa o'chiriladi, ijrochiga xabar boradi", () => {
    const s = demoState();
    const t = dz(s, "new");
    const { c, notes } = makeCtx(s, t.createdBy);
    act.cancelTask(c, t.id);
    expect(s.tasks.some((x) => x.id === t.id)).toBe(false);
    expect(notes[0]!.to).toEqual([t.assigneeId]);
    expect(notes[0]!.text).toContain("bekor qilindi");
  });

  it("boshlangan, tekshiruvdagi yoki qabul qilingan vazifa bekor qilinmaydi", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    for (const st of ["progress", "review", "accepted"] as const) {
      const t = s.tasks.find((x) => x.status === st)!;
      expect(() => act.cancelTask(c, t.id), st).toThrow(/boshlanmagan/);
    }
  });
});

describe("Kim o'zgartira oladi", () => {
  it("TZ bergan SMM, marketolog, rahbar, admin — ha; ijrochi va boshqa loyiha SMM'i — yo'q", () => {
    const s = demoState();
    const t = dz(s, "new");
    const p = s.projects.find((x) => x.id === t.projectId)!;
    const otherSmm = s.users.find((u) => u.role === "smm" && u.id !== p.smmId && u.id !== t.createdBy)!;
    const ok = (id: string) => denyReason("updateTask", user(s, id), s, [t.id, { title: "x" }]) === null;
    expect(ok(t.createdBy)).toBe(true);
    for (const id of ["u_mk", "u_boss", "u_admin"]) expect(ok(id), id).toBe(true);
    expect(ok(t.assigneeId)).toBe(false);
    expect(ok(otherSmm.id)).toBe(false);
    expect(ok("u_mol")).toBe(false);
    expect(denyReason("cancelTask", user(s, t.assigneeId), s, [t.id])).not.toBeNull();
  });
});

describe("Dizayn turlari", () => {
  it("ro'yxat: post, rasm formatidagi turlar (Stories, qo'shilgan Karusel) va oblojka; video va umumiy «Dizayn» turi yo'q", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    act.saveContentType(c, { name: "Karusel", format: "image", active: true });
    const opts = designOptions(s);
    const labels = opts.map((o) => o.label);
    expect(opts[0]).toEqual({ value: "post", label: "Post dizayni" });
    expect(opts.at(-1)).toEqual({ value: "cover", label: "Oblojka" });
    expect(labels).toContain("Stories");
    expect(labels).toContain("Karusel");
    expect(labels.some((l) => /Video|Dizayn \(rasm/.test(l))).toBe(false);
  });

  it("o'chirilgan tur ro'yxatda chiqmaydi, lekin tahrirlanayotgan vazifada qoladi", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    act.saveContentType(c, { name: "Karusel", format: "image", active: true });
    const kar = s.settings.contentTypes!.find((t) => t.name === "Karusel")!;
    kar.active = false;
    expect(designOptions(s).some((o) => o.value === kar.id)).toBe(false);
    expect(designOptions(s, kar.id).some((o) => o.value === kar.id)).toBe(true);
  });

  it("yangi tur bilan TZ beriladi va o'zgartiriladi; video turi yoki noma'lum qiymat rad etiladi", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_mk");
    act.saveContentType(c, { name: "Karusel", format: "image", active: true });
    const kar = s.settings.contentTypes!.find((t) => t.name === "Karusel")!;
    const t = dz(s, "new");
    act.updateTask(c, t.id, { designType: kar.id });
    expect(t.designType).toBe(kar.id);
    expect(designTypeLabel(s, t.designType)).toBe("Karusel");
    expect(() => act.updateTask(c, t.id, { designType: "ct_video" })).toThrow(/Dizayn turini/);
    expect(() => act.updateTask(c, t.id, { designType: "nimadir" })).toThrow(/Dizayn turini/);
  });

  it("ish haqi: oblojka — o'z stavkasi, qolgan hamma dizayn turlari — «Post dizayni» stavkasi", () => {
    const base = { kind: "dizayn" } as Task;
    expect(taskWorkType({ ...base, designType: "cover" })).toBe("dizayn_cover");
    expect(taskWorkType({ ...base, designType: "post" })).toBe("dizayn_post");
    expect(taskWorkType({ ...base, designType: "ct_stories" })).toBe("dizayn_post");
    expect(taskWorkType({ ...base })).toBe("dizayn_post");
  });
});
