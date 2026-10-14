// Brauzerda .xlsx faylni yuklab olish (xlsx.ts serverda ham ishlatiladi, shuning uchun brauzerga oid qism alohida).
import { buildXlsx, type SheetData } from "./xlsx";

/** Brauzerda faylni yuklab olish. */
export function downloadXlsx(filename: string, sheets: SheetData[]): void {
  const bytes = buildXlsx(sheets);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
