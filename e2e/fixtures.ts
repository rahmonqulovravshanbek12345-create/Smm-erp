// Testlar uchun umumiy `test`: serverli rejimda har bir test oldidan baza demo holatiga qaytariladi.
import { test as base, expect } from "@playwright/test";
import { SERVER } from "./helpers";

export const test = base.extend<{ freshServer: void }>({
  freshServer: [
    async ({ request }, use) => {
      if (SERVER) {
        const r = await request.post("./__test/reset", { headers: { "x-erp": "1" } });
        expect(r.ok(), "test serverini tozalash").toBe(true);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
