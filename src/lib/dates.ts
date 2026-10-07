// Sana bilan ishlash uchun yordamchi funksiyalar. Sanalar mahalliy vaqt bo'yicha "YYYY-MM-DD".

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function parseDate(s: string): Date {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Oy qo'shadi; 31-sana 30 kunlik oyga tushsa, oyning oxirgi kuni olinadi. */
export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** a − b, kunlarda. */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const MONTHS_FULL = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
export const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export function fmtDate(s?: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

export function fmtDateShort(s?: string): string {
  if (!s) return "—";
  const d = parseDate(s);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${fmtDate(toISODate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function fmtMonth(key: string): string {
  const [y, m = "1"] = key.split("-");
  return `${MONTHS_FULL[Number(m) - 1]} ${y}`;
}

export function shiftMonthKey(key: string, n: number): string {
  return monthKey(addMonths(`${key}-01`, n));
}

export function relDays(date: string, today: string): string {
  const n = diffDays(date, today);
  if (n === 0) return "bugun";
  if (n === 1) return "ertaga";
  if (n === -1) return "kecha";
  return n > 0 ? `${n} kundan keyin` : `${-n} kun oldin`;
}

/** Hisoblab bo'lmagan qiymat (0 ga bo'lish va h.k.) ekranga "NaN" bo'lib chiqmasin. */
export function fmtMoney(n: number): string {
  return Number.isFinite(n) ? `${fmtNum(n)} so'm` : "—";
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const MONTHS_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];

/** "2026-10" → "Okt" */
export function monthShort(key: string): string {
  return MONTHS_SHORT[Number(key.slice(5, 7)) - 1] ?? key;
}

export function monthEnd(key: string): string {
  return addDays(`${shiftMonthKey(key, 1)}-01`, -1);
}
