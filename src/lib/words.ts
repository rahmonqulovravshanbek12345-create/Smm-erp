// Summani o'zbek tilida so'z bilan yozish (hujjatlar uchun): 15 000 000 → "o'n besh million".
const ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];
const SCALES = ["", "ming", "million", "milliard", "trillion"];

function triple(n: number): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? "bir yuz" : `${ONES[h]} yuz`);
  if (t) parts.push(TENS[t]!);
  if (o) parts.push(ONES[o]!);
  return parts.join(" ");
}

export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "nol";
  const groups: string[] = [];
  let i = 0;
  while (n > 0) {
    const g = n % 1000;
    if (g) groups.unshift(`${triple(g)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
    n = Math.floor(n / 1000);
    i++;
  }
  return `${value < 0 ? "minus " : ""}${groups.join(" ")}`;
}

/** "O'n besh million so'm 00 tiyin" — bosh harf bilan; tiyin raqamda (hujjatlardagi odatiy shakl). */
export function moneyWords(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100) * Math.sign(value || 1);
  const s = `${numberToWords(whole)} so'm ${String(cents % 100).padStart(2, "0")} tiyin`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Bir ming besh yuz AQSH dollari 00 sent". */
export function usdWords(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const s = `${numberToWords(Math.floor(cents / 100))} AQSH dollari ${String(cents % 100).padStart(2, "0")} sent`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
