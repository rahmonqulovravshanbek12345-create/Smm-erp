import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "./xlsx";

/** STORE (siqilmagan) ZIP'ni o'qiydi va har bir fayl CRC'ini tekshiradi. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extra = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const data = bytes.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    expect(crc32(data) >>> 0, `CRC ${name}`).toBe(crc);
    out.set(name, new TextDecoder().decode(data));
    p += 30 + nameLen + extra + size;
  }
  return out;
}

describe("Excel (.xlsx) yozuvchi", () => {
  const files = unzip(
    buildXlsx([
      {
        name: "Foyda va zarar: 2026/10",
        columns: ["Modda", "Summa"],
        rows: [
          ['Daromad <SMM> & "target"', 15_000_000.4],
          ["Foiz", 12.3456],
          ["Bo'sh", null],
          ["Xato", Number.NaN],
        ],
        title: ["SMM Studio"],
      },
      { name: "Foyda va zarar: 2026/10", columns: ["A"], rows: [] },
      { name: "Juda uzun varaq nomi o'ttiz bir belgidan oshib ketadi", columns: ["A"], rows: [["x"]] },
    ]),
  );

  it("OOXML paket tuzilmasi to'liq, CRC to'g'ri", () => {
    for (const f of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet3.xml",
    ]) {
      expect(files.has(f), f).toBe(true);
    }
  });
  it("varaq nomlari Excel qoidasiga mos: taqiqlangan belgisiz, 31 belgigacha, takrorlanmaydi", () => {
    const names = [...files.get("xl/workbook.xml")!.matchAll(/name="([^"]+)"/g)].map((m) => m[1]!);
    expect(names).toHaveLength(3);
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[[\]:*?/\\]/);
    }
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
  });
  it("matn XML uchun xavfsiz, summalar butun so'mga, NaN — bo'sh katak", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Daromad &lt;SMM&gt; &amp; &quot;target&quot;");
    expect(sheet).toContain("<v>15000000</v>");
    expect(sheet).toContain("<v>12.35</v>");
    expect(sheet).not.toContain("NaN");
  });
});
