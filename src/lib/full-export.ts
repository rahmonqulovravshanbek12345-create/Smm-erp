// Butun ERP ma'lumotini Excel varaqlariga yig'adi (kunlik zaxira nusxa: soat 23:50 da adminga Telegram orqali ketadi).
// Har bir ro'yxat — alohida varaq. Ustunlar yozuvlardagi maydonlardan o'zi olinadi, shuning uchun yangi maydonlar ham tushib qoladi.
// Maxfiy kalitlar (Telegram, Meta tokenlari) hech qachon kirmaydi; shaxsiy bildirishnomalar kirmaydi.
import { fmtDate } from "./dates";
import { withoutSecrets } from "./redact";
import type { ErpState } from "./types";
import type { CellValue, SheetData } from "./xlsx";

/** Excel katagi sig'imi 32 767 belgi. */
const CELL_MAX = 32_000;
/** Faoliyat tarixi juda katta bo'lishi mumkin — faqat eng yangilari (to'liq tarix audit jurnalida). */
const TAIL_ROWS = 5_000;

const SHEETS: { key: keyof ErpState; name: string; tail?: boolean }[] = [
  { key: "users", name: "Xodimlar" },
  { key: "leads", name: "Lidlar" },
  { key: "projects", name: "Loyihalar" },
  { key: "posts", name: "Postlar" },
  { key: "shoots", name: "Syomkalar" },
  { key: "tasks", name: "Vazifalar" },
  { key: "targetReports", name: "Target hisobotlari" },
  { key: "reports", name: "Oylik hisobotlar" },
  { key: "accounts", name: "Hisoblar" },
  { key: "transactions", name: "Tranzaksiyalar" },
  { key: "invoices", name: "Fakturalar" },
  { key: "vendors", name: "Yetkazuvchilar" },
  { key: "bills", name: "Qarzlar (kreditor)" },
  { key: "payProfiles", name: "Ish haqi profillari" },
  { key: "accruals", name: "Ish haqi hisoblari" },
  { key: "budget", name: "Byudjet" },
  { key: "tariffs", name: "Tariflar" },
  { key: "proposals", name: "Takliflar" },
  { key: "quotas", name: "Kvotalar" },
  { key: "articles", name: "Maqolalar" },
  { key: "integrationLog", name: "Integratsiya jurnali", tail: true },
  { key: "activity", name: "Faoliyat", tail: true },
];

function cellOf(v: unknown): CellValue {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "ha" : "yo'q";
  if (typeof v === "string") return v.length > CELL_MAX ? `${v.slice(0, CELL_MAX)}…` : v;
  const j = JSON.stringify(v);
  return j.length > CELL_MAX ? `${j.slice(0, CELL_MAX)}…` : j;
}

/** Obyektlar ro'yxati → jadval: ustunlar — barcha yozuvlardagi birinchi darajadagi maydonlar (paydo bo'lish tartibida). */
export function toSheet(name: string, items: readonly object[]): SheetData {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    for (const k of Object.keys(it)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  if (!cols.length) cols.push("(bo'sh)");
  const rows = items.map((it) => cols.map((c) => cellOf((it as Record<string, unknown>)[c])));
  return { name, columns: cols, rows };
}

/** Bosh varaq: qisqa raqamlar + qaysi varaqda nechta yozuv bor. */
function summary(s: ErpState, today: string, counts: [string, number][]): SheetData {
  const todayTx = s.transactions.filter((t) => t.date === today);
  const rows: CellValue[][] = [
    ["Kompaniya", s.settings.companyName],
    ["Sana", fmtDate(today)],
    ["USD kursi", s.settings.usdRate],
    ["Faol xodimlar", s.users.filter((u) => u.active).length],
    ["Loyihalar", s.projects.length],
    ["Lidlar", s.leads.length],
    ["Bugungi kirimlar (soni)", todayTx.filter((t) => t.dir === "in").length],
    ["Bugungi chiqimlar (soni)", todayTx.filter((t) => t.dir === "out").length],
    ["", ""],
    ["Varaq", "Yozuvlar soni"],
    ...counts,
  ];
  return { name: "Xulosa", columns: ["Ko'rsatkich", "Qiymat"], rows };
}

/** Telegram botlari 50 MB gacha fayl qabul qiladi. */
export const TELEGRAM_FILE_LIMIT = 49 * 1024 * 1024;

/** Butun ma'lumot varaqlari. `dropLogs` — juda katta fayl uchun jurnallarni tashlab yuboradi. */
export function fullExportSheets(state: ErpState, today: string, opts: { dropLogs?: boolean } = {}): SheetData[] {
  const s = withoutSecrets(state);
  const sheets: SheetData[] = [];
  const counts: [string, number][] = [];
  for (const def of SHEETS) {
    if (opts.dropLogs && def.tail) continue;
    const all = s[def.key] as unknown as object[];
    const items = def.tail ? all.slice(0, TAIL_ROWS) : all;
    counts.push([def.name, all.length]);
    sheets.push(toSheet(def.name, items));
  }
  // Sozlamalar: tokenlar yashirilgan (withoutSecrets), qolganlari bir qator ko'rinishida
  const { telegram, integrations, ...plain } = s.settings;
  sheets.push(
    toSheet("Sozlamalar", [
      {
        ...plain,
        "telegram.enabled": telegram.enabled,
        "meta.accounts": Object.keys(integrations.meta.accounts ?? {}).length,
        "meta.autoSync": integrations.meta.autoSync,
      },
    ]),
  );
  return [summary(s, today, counts), ...sheets];
}
