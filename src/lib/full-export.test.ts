import { describe, expect, it } from "vitest";
import { fullExportSheets, toSheet } from "./full-export";
import { demoState, TODAY } from "./test-utils";
import { buildXlsx } from "./xlsx";

describe("Butun ma'lumot Excel'i", () => {
  const st = demoState();
  st.settings.telegram = { enabled: true, botToken: "123456:SECRET-BOT-TOKEN-XYZ" };
  st.settings.integrations.meta.token = "EAAB-META-SECRET-TOKEN-QQQ";
  const sheets = fullExportSheets(st, TODAY);
  const text = JSON.stringify(sheets);

  it("har bir ro'yxat uchun varaq bor va yozuvlar soni to'g'ri", () => {
    const by = (n: string) => sheets.find((s) => s.name === n)!;
    expect(by("Xulosa")).toBeTruthy();
    expect(by("Loyihalar").rows).toHaveLength(st.projects.length);
    expect(by("Lidlar").rows).toHaveLength(st.leads.length);
    expect(by("Tranzaksiyalar").rows).toHaveLength(st.transactions.length);
    expect(by("Xodimlar").rows).toHaveLength(st.users.length);
    expect(by("Sozlamalar")).toBeTruthy();
    // Bildirishnomalar (shaxsiy) kirmaydi
    expect(sheets.some((s) => s.name.toLowerCase().includes("bildirish"))).toBe(false);
  });

  it("Telegram va Meta tokenlari fayl ichida ochiq turmaydi", () => {
    expect(text).not.toContain("SECRET-BOT-TOKEN-XYZ");
    expect(text).not.toContain("META-SECRET-TOKEN-QQQ");
  });

  it("katta jurnallar qisqartiriladi, dropLogs ularni olib tashlaydi", () => {
    const big = { ...st, activity: Array.from({ length: 9000 }, (_, i) => ({ ...st.activity[0]!, id: `a${i}` })) };
    const a = fullExportSheets(big, TODAY).find((s) => s.name === "Faoliyat")!;
    expect(a.rows).toHaveLength(5000);
    expect(fullExportSheets(big, TODAY, { dropLogs: true }).some((s) => s.name === "Faoliyat")).toBe(false);
  });

  it("ichma-ich obyektlar, mantiqiy qiymatlar va uzun matn xavfsiz yoziladi", () => {
    const sh = toSheet("T", [
      { a: 1, b: true, c: { x: [1, 2] }, d: "q".repeat(40_000) },
      { a: 2, e: null },
    ]);
    expect(sh.columns).toEqual(["a", "b", "c", "d", "e"]);
    expect(sh.rows[0]).toEqual([1, "ha", '{"x":[1,2]}', "q".repeat(32_000) + "…", ""]);
    expect(sh.rows[1]).toEqual([2, "", "", "", ""]);
    expect(toSheet("bo'sh", []).columns).toEqual(["(bo'sh)"]);
  });

  it("yaroqli .xlsx fayl chiqadi (ZIP imzosi)", () => {
    const bytes = buildXlsx(sheets);
    expect(bytes.length).toBeGreaterThan(1000);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
