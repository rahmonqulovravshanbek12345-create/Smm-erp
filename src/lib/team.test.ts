import { describe, expect, it } from "vitest";
import { applyTeam, seedTeamHistory, teamOn } from "./team";
import { demoState, TODAY } from "./test-utils";
import { addDays } from "./dates";
import type { ErpState, Project, TeamChange } from "./types";

const ch = (role: TeamChange["role"], userId: string, from: string, at = "2026-01-01T00:00:00.000Z"): TeamChange => ({
  id: `tm_${role}${from}${userId}`,
  role,
  userId,
  from,
  by: "u_admin",
  at,
});
const withProject = (s: ErpState): Project => s.projects.find((p) => p.targetologId) ?? s.projects[0]!;

describe("Jamoa tarixi", () => {
  it("boshlang'ich yozuvlar joriy xodimlardan olinadi (2020 sanasi bilan)", () => {
    const s = demoState();
    const p = withProject(s);
    const seed = seedTeamHistory(p);
    expect(seed.find((x) => x.role === "marketolog")?.userId).toBe(p.marketologId);
    expect(seed.every((x) => x.from === "2020-01-01")).toBe(true);
  });

  it("teamOn: berilgan sanada kim turgani (tarix bo'yicha)", () => {
    const s = demoState();
    const p = { ...withProject(s), teamHistory: [ch("smm", "u_old", "2020-01-01"), ch("smm", "u_new", "2026-10-20")] };
    expect(teamOn(p, "smm", "2026-10-19")).toBe("u_old");
    expect(teamOn(p, "smm", "2026-10-20")).toBe("u_new");
    expect(teamOn(p, "smm", "2030-01-01")).toBe("u_new");
    // Tarixda yo'q lavozim — joriy qiymat
    expect(teamOn(p, "targetolog", "2026-10-19")).toBe(p.targetologId);
  });

  it("applyTeam: sanasi kelmagan yozuv kuchga kirmaydi, kelgani kiradi", () => {
    const s = demoState();
    const p = { ...withProject(s), smmId: "u_old" };
    p.teamHistory = [ch("smm", "u_old", "2020-01-01"), ch("smm", "u_new", addDays(TODAY, 5))];
    expect(applyTeam(s, p, TODAY)).toEqual([]);
    expect(p.smmId).toBe("u_old");
    expect(applyTeam(s, p, addDays(TODAY, 5))).toEqual([{ role: "smm", from: "u_old", to: "u_new" }]);
    expect(p.smmId).toBe("u_new");
  });

  it("o'tmish sana darhol kuchga kiradi", () => {
    const s = demoState();
    const p = { ...withProject(s), smmId: "u_old" };
    p.teamHistory = [ch("smm", "u_old", "2020-01-01"), ch("smm", "u_new", addDays(TODAY, -10))];
    applyTeam(s, p, TODAY);
    expect(p.smmId).toBe("u_new");
  });

  it("targetolog almashsa — ochiq target vazifalari yangi xodimga o'tadi, yopiqlari o'zida qoladi", () => {
    const s = demoState();
    const p = { ...withProject(s), targetologId: "u_t1" };
    const open = {
      id: "tk_open",
      projectId: p.id,
      kind: "target",
      assigneeId: "u_t1",
      title: "A",
      brief: "",
      status: "todo",
    } as unknown as ErpState["tasks"][number];
    const done = { ...open, id: "tk_done", launchedAt: "2026-10-01" } as unknown as ErpState["tasks"][number];
    s.tasks = [...s.tasks, open, done];
    p.teamHistory = [ch("targetolog", "u_t1", "2020-01-01"), ch("targetolog", "u_t2", TODAY)];
    applyTeam(s, p, TODAY);
    expect(s.tasks.find((t) => t.id === "tk_open")!.assigneeId).toBe("u_t2");
    expect(s.tasks.find((t) => t.id === "tk_done")!.assigneeId).toBe("u_t1");
  });

  it("ikkinchi marta qo'llash xavfsiz (idempotent)", () => {
    const s = demoState();
    const p = { ...withProject(s), smmId: "u_old" };
    p.teamHistory = [ch("smm", "u_old", "2020-01-01"), ch("smm", "u_new", TODAY)];
    applyTeam(s, p, TODAY);
    expect(applyTeam(s, p, TODAY)).toEqual([]);
    expect(p.smmId).toBe("u_new");
  });
});
