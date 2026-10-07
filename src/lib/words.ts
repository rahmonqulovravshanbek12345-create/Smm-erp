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

/** "o'n besh million so'm 00 tiyin" — bosh harf bilan. */
export function moneyWords(value: number): string {
  const s = `${numberToWords(value)} so'm 00 tiyin`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
