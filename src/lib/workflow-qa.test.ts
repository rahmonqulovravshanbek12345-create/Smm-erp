import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { addDays } from "./dates";
import { alertsFor, workBlockedReason } from "./rules";
import { userLoad } from "./staff";
import { syncAll } from "./store-sync";
import { TODAY, demoState, makeCtx } from "./test-utils";

const user = (s: ReturnType<typeof demoState>, id: string) => s.users.find((u) => u.id === id)!;

describe("QA-1 late penalty is computed from acceptance date, not submission date", () => {
  it("assignee who submitted on time is fined because the reviewer accepted late", () => {
    const s = demoState();
    s.settings.latePenaltyPct = 10;
    // montajyor submits on the deadline day
    const deadline = TODAY;
    const ctxMt = makeCtx(s, "u_mt1", deadline);
    act.createTask(makeCtx(s, "u_smm1").c, { kind: "montaj", projectId: "p_mebel", assigneeId: "u_mt1", title: "QA reels", brief: "", deadline });
    const t = s.tasks.find((x) => x.title === "QA reels")!;
    act.startTask(ctxMt.c, t.id);
    act.submitTask(ctxMt.c, t.id, "https://drive.google.com/x");
    // SMM reviews 3 days later
    act.acceptTask(makeCtx(s, "u_smm1", addDays(deadline, 3)).c, t.id);
    expect(s.accruals.filter((a) => a.sourceId === `late:${t.id}`)).toEqual([]);
  });
});

describe("QA-2 closed project can be re-opened for work by un-ticking 'pauseWork'", () => {
  it("after closeProject, unpausing lets new tasks/posts/shoots be created on a closed project", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_boss");
    act.closeProject(c, "p_gym", TODAY);
    expect(() => act.updateProject(c, "p_gym", { pauseWork: false })).toThrow(/yopilgan/);
    const p = s.projects.find((x) => x.id === "p_gym")!;
    expect(p.status).toBe("closed");
    expect(workBlockedReason(s, p)).not.toBeNull();
  });
});

describe("QA-3 alerts for a closed project never clear", () => {
  it("open tasks / posts of a closed project keep producing red/amber alerts", () => {
    const s = demoState();
    const { c } = makeCtx(s, "u_boss");
    act.closeProject(c, "p_gym", TODAY);
    const ids = alertsFor(s, user(s, "u_boss"), TODAY).map((a) => a.id);
    const gymTasks = s.tasks.filter((t) => t.projectId === "p_gym").map((t) => `tl-${t.id}`);
    const gymPosts = s.posts.filter((p) => p.projectId === "p_gym").map((p) => `pw-${p.id}`);
    expect(ids.filter((id) => gymTasks.includes(id) || gymPosts.includes(id))).toEqual([]);
  });
});

describe("QA-4 status dropdown bypasses marketolog approval", () => {
  it("SMM can move a post from 'plan' straight to 'client'/'approved'/'published' (setPostStatus)", () => {
    const s = demoState();
    const post = s.posts.find((p) => p.status === "plan" && p.projectId === "p_mebel")!;
    const { c } = makeCtx(s, "u_smm1");
    for (const st of ["client", "approved", "published"] as const) expect(() => act.setPostStatus(c, post.id, st)).toThrow();
    expect(post.status).toBe("plan");
    // To'g'ri zina: ichki tasdiq → marketolog → mijoz tasdig'i
    act.setPostStatus(c, post.id, "internal");
    expect(() => act.setPostStatus(c, post.id, "client")).toThrow(/marketolog/);
    act.setPostStatus(makeCtx(s, "u_mk").c, post.id, "client");
    act.setPostStatus(c, post.id, "approved");
    expect(post.status).toBe("approved");
  });
});

describe("QA-5 status downgrade from 'published' leaves publication marks", () => {
  it("published → plan keeps publishedOn/publishedAt (post looks unpublished but carries publish data)", () => {
    const s = demoState();
    const post = s.posts.find((p) => p.status === "published" && p.projectId === "p_mebel")!;
    act.setPostStatus(makeCtx(s, "u_smm1").c, post.id, "plan");
    expect(post.status).toBe("plan");
    expect(post.publishedAt).toBeUndefined();
    expect(Object.keys(post.publishedOn ?? {})).toEqual([]);
  });
});

describe("QA-6 adding a platform to a published post", () => {
  it("post stays 'published' although the new platform is not published", () => {
    const s = demoState();
    const post = s.posts.find((p) => p.status === "published" && !p.platforms.includes("tiktok"))!;
    const { id, ...rest } = post;
    act.savePost(makeCtx(s, "u_smm1").c, { ...rest, id, platforms: [...post.platforms, "tiktok"] });
    const pending = post.platforms.filter((pl) => !post.publishedOn?.[pl]);
    expect(pending).toEqual(["tiktok"]);
    expect(post.status).not.toBe("published");
  });
});

describe("QA-7 montaj TZ for a post whose shoot is already handed gets no footage link", () => {
  it("createTask with postId only (TaskModal from TaskBoard/Content) never receives footage", () => {
    const s = demoState();
    const sh = s.shoots.find((x) => x.status === "handed" && x.projectId === "p_mebel")!; // sh_1 → post_n
    act.createTask(makeCtx(s, "u_smm1").c, {
      kind: "montaj",
      projectId: sh.projectId,
      postId: sh.postIds[0],
      assigneeId: "u_mt2",
      title: "QA re-edit",
      brief: "",
      deadline: addDays(TODAY, 2),
    });
    const t = s.tasks.find((x) => x.title === "QA re-edit")!;
    expect(t.footageLink).toBe(sh.footageLink);
  });
});

describe("QA-8 archived employees keep receiving work notifications and blocking review", () => {
  it("project SMM archived → task submission & post approval still notify the archived user only", () => {
    const s = demoState();
    act.archiveUser(makeCtx(s, "u_admin").c, "u_smm1");
    const mt = makeCtx(s, "u_mt1");
    const t = s.tasks.find((x) => x.id === "task_23")!; // p_mebel, progress, u_mt1
    act.submitTask(mt.c, t.id, "https://drive.google.com/y");
    const to = mt.notes.flatMap((n) => n.to);
    expect(to).not.toContain("u_smm1");
  });
  it("addService on project whose SMM is archived assigns the new SMM service to the archived user", () => {
    const s = demoState();
    // O'rniga xodim tanlansa — loyihalar, ochiq vazifalar va syomkalar unga o'tadi
    act.archiveUser(makeCtx(s, "u_admin").c, "u_smm1", "u_smm2");
    const p = s.projects.find((x) => x.id === "p_mebel")!;
    expect(p.smmId).toBe("u_smm2");
    expect(s.posts.filter((x) => x.assigneeId === "u_smm1" && x.status !== "published")).toEqual([]);
    // O'rniga tanlanmasa ham: yangi SMM xizmati faol SMM menejerga biriktiriladi
    const s2 = demoState();
    act.archiveUser(makeCtx(s2, "u_admin").c, "u_smm1");
    const q = s2.projects.find((x) => x.id === "p_dent")!;
    q.services = q.services.filter((x) => x.kind !== "smm");
    q.smmId = "u_smm1";
    act.addService(makeCtx(s2, "u_mk").c, "p_dent", { kind: "smm", title: "SMM", price: 8_000_000 });
    expect(user(s2, q.smmId).active).toBe(true);
  });
});

describe("QA-9 userLoad counts launched target tasks as open forever", () => {
  it("targetolog always has 'open tasks' in archive modal", () => {
    const s = demoState();
    const launched = s.tasks.filter((t) => t.kind === "target" && t.launchedAt);
    const load = userLoad(s, "u_tg", TODAY);
    expect(load.openTasks.filter((t) => launched.includes(t))).toEqual([]);
  });
});

describe("QA-10 launchTarget with an earlier date moves the billing period start backwards", () => {
  it("period start of an already billed project shifts when a new ad is launched with a back-date", () => {
    const s = demoState();
    const p = s.projects.find((x) => x.id === "p_mebel")!;
    const before = p.periodStart; // 2026-04-17, monthly invoices already issued for periods 0..5
    const nBefore = s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly").length;
    act.launchTarget(makeCtx(s, "u_tg").c, "task_2c", "2026-03-01"); // date picker typo / back-dated campaign
    syncAll(s, TODAY);
    const nAfter = s.invoices.filter((i) => i.projectId === p.id && i.kind === "monthly").length;
    expect({ start: p.periodStart, newInvoices: nAfter - nBefore }).toEqual({ start: before, newInvoices: 0 });
  });
});

describe("QA-11 deletePost leaves dangling references", () => {
  it("shoot.postIds / task.postId still point to deleted post", () => {
    const s = demoState();
    const sh = s.shoots.find((x) => x.id === "sh_2")!;
    const pid = sh.postIds[0]!;
    act.deletePost(makeCtx(s, "u_smm1").c, pid);
    expect(sh.postIds).not.toContain(pid);
  });
});

describe("QA-12 launchTarget with a cleared date input wipes the billing period", () => {
  it("launch date '' (cleared <input type=date>, Target.tsx:133 uses ?? today) sets periodStart to ''", () => {
    const s = demoState();
    const p = s.projects.find((x) => x.id === "p_mebel")!;
    expect(() => act.launchTarget(makeCtx(s, "u_tg").c, "task_2c", "")).toThrow();
    expect(() => act.launchTarget(makeCtx(s, "u_tg").c, "task_2c", "2099-01-01")).toThrow();
    expect(p.periodStart).toBe("2026-04-17");
  });
});

describe("QA-3b period-end alert keeps firing for closed project", () => {
  it("closed p_gym still shows 'davr tugashiga … keyingi oy to'lovi' to boss/finance", () => {
    const s = demoState();
    act.closeProject(makeCtx(s, "u_boss").c, "p_gym", TODAY);
    const d = "2026-10-30"; // p_gym period: 2026-10-02 .. 2026-11-02
    const ids = alertsFor(s, user(s, "u_mol"), d).map((a) => a.id);
    expect(ids.filter((id) => id.startsWith("per-p_gym"))).toEqual([]);
  });
});

describe("QA-13 TZ / shoot without a date is accepted", () => {
  it("createTask with deadline '' (cleared date input; TaskModal only requires title/assignee/project) is stored and instantly 'late'", () => {
    const s = demoState();
    s.settings.latePenaltyPct = 10;
    const { c } = makeCtx(s, "u_smm1");
    let threw = false;
    try {
      act.createTask(c, { kind: "dizayn", projectId: "p_mebel", assigneeId: "u_dz", title: "QA no date", brief: "", deadline: "" });
    } catch {
      threw = true;
    }
    const t = s.tasks.find((x) => x.title === "QA no date");
    if (t) {
      act.submitTask(makeCtx(s, "u_dz").c, t.id, "https://drive.google.com/z");
      act.acceptTask(c, t.id);
    }
    expect(threw).toBe(true);
  });
});
