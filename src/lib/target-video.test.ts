import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { AD_VIDEO, quotaProgress, tariffQuota, typesFor } from "./content";
import { monthKey } from "./dates";
import { hasAds, hasContent } from "./services";
import { tariffOf } from "./tariffs";
import { TODAY, demoState, makeCtx } from "./test-utils";

const newAd = (s: ReturnType<typeof demoState>, projectId = "p_gym") => {
  act.savePost(makeCtx(s, "u_smm1").c, {
    projectId,
    date: TODAY,
    platforms: ["instagram"],
    typeId: AD_VIDEO,
    format: "video",
    topic: "Sinov reklama videosi",
    script: "",
    assigneeId: "u_smm1",
    forTarget: false,
  });
  return s.posts.find((p) => p.topic === "Sinov reklama videosi")!;
};

describe("Target video (reklama uchun alohida video)", () => {
  it("platformasiz saqlanadi va target uchun belgilanadi", () => {
    const s = demoState();
    const p = newAd(s);
    expect(p.platforms).toEqual([]);
    expect(p.forTarget).toBe(true);
  });

  it("tasdiqlanmagan videoni targetologga berib bo'lmaydi; tasdiqdan keyin TZ ketadi va reja bajarilgan sanaladi", () => {
    const s = demoState();
    const month = monthKey(TODAY);
    const project = s.projects.find((x) => x.id === "p_gym")!;
    const before = quotaProgress(s, project, month).find((r) => r.key === AD_VIDEO)!;
    const p = newAd(s);
    expect(() => act.handToTarget(makeCtx(s, "u_smm1").c, p.id)).toThrow(/tasdiq/);
    p.status = "approved";
    const ctx = makeCtx(s, "u_smm1");
    act.publishPost(ctx.c, p.id); // oddiy «Joylandi» ham targetologga berishga aylanadi
    expect(p.status).toBe("published");
    const task = s.tasks.find((t) => t.postId === p.id && t.kind === "target")!;
    expect(task.assigneeId).toBe(project.targetologId);
    expect(task.deadlineTime).toBe("18:00");
    expect(ctx.notes.some((n) => n.to.includes(project.targetologId!) && n.text.includes("Sinov reklama videosi"))).toBe(true);
    const after = quotaProgress(s, project, month).find((r) => r.key === AD_VIDEO)!;
    expect(after.done).toBe(before.done + 1);
    expect(after.planned).toBe(before.planned + 1);
    // Ikkinchi marta bosish ikkinchi TZ yaratmaydi
    act.handToTarget(makeCtx(s, "u_smm1").c, p.id);
    expect(s.tasks.filter((t) => t.postId === p.id).length).toBe(1);
  });

  it("reklama xizmati yo'q mijozda target video turi chiqmaydi; bor mijozda chiqadi", () => {
    const s = demoState();
    const smmOnly = s.projects.find((p) => hasContent(p) && !hasAds(p));
    const withAds = s.projects.find((p) => hasContent(p) && hasAds(p))!;
    expect(typesFor(s, withAds).some((t) => t.id === AD_VIDEO)).toBe(true);
    if (smmOnly) expect(typesFor(s, smmOnly).some((t) => t.id === AD_VIDEO)).toBe(false);
  });

  it("target kiritilgan paketda oyiga 4 ta reklama videosi standart", () => {
    const s = demoState();
    expect(tariffQuota(tariffOf(s, "t_biznes"))[AD_VIDEO]).toBe(4);
    expect(tariffQuota(tariffOf(s, "t_start"))[AD_VIDEO] ?? 0).toBe(0);
  });

  it("eski saqlangan kontent turlari ro'yxatiga target video avtomatik qo'shiladi", () => {
    const s = demoState();
    s.settings.contentTypes = s.settings.contentTypes.filter((t) => t.id !== AD_VIDEO);
    expect(typesFor(s).some((t) => t.id === AD_VIDEO)).toBe(true);
  });
});
