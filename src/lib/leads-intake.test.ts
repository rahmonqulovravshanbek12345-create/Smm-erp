import { describe, expect, it } from "vitest";
import { mapGraphLead, normalizePhone, phoneKey } from "./leads-intake";

describe("Telefon raqamini tartiblash", () => {
  it.each([
    ["+998901234567", "+998 90 123 45 67"],
    ["998901234567", "+998 90 123 45 67"],
    ["90 123-45-67", "+998 90 123 45 67"],
    ["p:+998 (90) 123 45 67", "+998 90 123 45 67"],
    ["+1 415 555 0132", "+14155550132"],
  ])("%s → %s", (raw, out) => expect(normalizePhone(raw)).toBe(out));

  it("tanib bo'lmaydigan qiymat bo'sh qaytadi", () => {
    for (const bad of ["", "abc", "123", "9".repeat(20)]) expect(normalizePhone(bad)).toBe("");
  });

  it("solishtirish kaliti — oxirgi 9 raqam", () => {
    expect(phoneKey("+998 90 123 45 67")).toBe("901234567");
    expect(phoneKey(normalizePhone("90 123 45 67"))).toBe(phoneKey("+998901234567"));
  });
});

describe("Facebook lidini CRM lidiga aylantirish", () => {
  it("ism, telefon, qo'shimcha javoblar va reklama ma'lumoti", () => {
    const l = mapGraphLead({
      id: "123",
      created_time: "2026-10-14T09:00:00+0000",
      field_data: [
        { name: "first_name", values: ["Aziza"] },
        { name: "last_name", values: ["Karimova"] },
        { name: "phone_number", values: ["+998901234567"] },
        { name: "email", values: ["a@b.uz"] },
        { name: "qaysi_xizmat", values: ["SMM", "Target"] },
      ],
      campaign_name: "Kafe",
      adset_name: "Toshkent",
      ad_name: "Video 1",
      platform: "fb",
    });
    expect(l.externalId).toBe("fb:123");
    expect(l.name).toBe("Aziza Karimova");
    expect(l.phone).toBe("+998 90 123 45 67");
    expect(l.service).toBe("Kafe");
    expect(l.note).toContain("email: a@b.uz");
    expect(l.note).toContain("qaysi xizmat: SMM, Target");
    expect(l.note).toContain("Reklama: Kafe › Toshkent › Video 1");
    expect(l.note).toContain("Joy: Facebook");
    expect(l.note).not.toContain("phone number");
  });

  it("telefon yo'q yoki noto'g'ri bo'lsa lid baribir saqlanadi; ism bo'lmasa email/umumiy nom", () => {
    const a = mapGraphLead({ id: "1", field_data: [{ name: "email", values: ["x@y.uz"] }] });
    expect(a.name).toBe("x@y.uz");
    expect(a.phone).toBe("");
    const b = mapGraphLead({ id: "2", field_data: [{ name: "phone_number", values: ["abc"] }] });
    expect(b.phone).toBe("");
    expect(b.note).toContain("Telefon (tanilmadi): abc");
    expect(mapGraphLead({ id: "3" }).name).toContain("Facebook lid");
  });

  it("uzun matn va boshqaruv belgilari kesiladi", () => {
    const l = mapGraphLead({
      id: "4",
      field_data: [
        { name: "full_name", values: ["A\u0000B\n" + "x".repeat(500)] },
        ...Array.from({ length: 40 }, (_, i) => ({ name: `savol_${i}`, values: ["j".repeat(300)] })),
      ],
    });
    expect(l.name.length).toBeLessThanOrEqual(120);
    expect([...l.name].some((ch) => ch.charCodeAt(0) < 32)).toBe(false);
    expect(l.note.length).toBeLessThanOrEqual(2000);
  });
});
