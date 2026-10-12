// Saralangan holat xodim sahifalarida to'liq holat bilan bir xil natija berishi kerak (ish ochiqmi, qarz, to'lov).
import { describe, expect, it } from "vitest";
import { projectDebt, prepayPaid } from "./finance";
import { visibleProjects } from "./permissions";
import { redactFor } from "./redact";
import { workBlockedReason } from "./rules";
import { TODAY, demoState } from "./test-utils";

describe("redactFor", () => {
  const full = demoState();
  for (const u of full.users.filter((x) => x.active)) {
    it(`${u.id} (${u.role}): o'z loyihalarida ish holati, qarz va oldindan to'lov to'liq holat bilan bir xil`, () => {
      const r = redactFor(full, u);
      for (const p of visibleProjects(full, u)) {
        const rp = r.projects.find((x) => x.id === p.id);
        expect(rp, p.id).toBeTruthy();
        expect(workBlockedReason(r, rp!), p.id).toBe(workBlockedReason(full, p));
        expect(prepayPaid(r, p.id), p.id).toBe(prepayPaid(full, p.id));
        expect(projectDebt(r, p.id, TODAY), p.id).toEqual(projectDebt(full, p.id, TODAY));
      }
    });
  }
});
