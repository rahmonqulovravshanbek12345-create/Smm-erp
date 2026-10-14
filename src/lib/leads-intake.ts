// Facebook Lead Ads lidini CRM lidiga aylantirish (sof funksiyalar: server ham, testlar ham ishlatadi).

export interface GraphLead {
  id: string;
  created_time?: string;
  field_data?: { name?: string; values?: string[] }[];
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
}

export interface IntakeLead {
  externalId: string;
  name: string;
  phone: string;
  service: string;
  note: string;
  createdAt?: string;
}

const clip = (v: unknown, n: number) =>
  String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, n);

/** +998 90 123 45 67. Tanib bo'lmasa — bo'sh (lid baribir saqlanadi, telefon izohda). */
export function normalizePhone(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  const full = d.length === 9 ? `998${d}` : d;
  if (full.length === 12 && full.startsWith("998")) return `+998 ${full.slice(3, 5)} ${full.slice(5, 8)} ${full.slice(8, 10)} ${full.slice(10, 12)}`;
  if (d.length >= 7 && d.length <= 15) return `+${d}`;
  return "";
}

/** Solishtirish uchun telefonning oxirgi 9 raqami. */
export const phoneKey = (p: string) => p.replace(/\D/g, "").slice(-9);

const NAME_KEYS = ["full_name", "name", "ism", "fio", "ism_familiya"];
const PHONE_KEYS = ["phone_number", "phone", "telefon", "tel", "mobile", "raqam"];

export function mapGraphLead(g: GraphLead): IntakeLead {
  const fields = (g.field_data ?? []).map((f) => ({
    key: clip(f.name, 80).toLowerCase(),
    label: clip(f.name, 80).replace(/_/g, " "),
    value: clip((f.values ?? []).join(", "), 300),
  }));
  const by = (keys: string[]) => fields.find((f) => keys.includes(f.key) && f.value)?.value ?? "";
  const first = fields.find((f) => f.key === "first_name")?.value ?? "";
  const last = fields.find((f) => f.key === "last_name")?.value ?? "";
  const email = fields.find((f) => f.key === "email")?.value ?? "";
  const rawPhone = by(PHONE_KEYS);
  const phone = normalizePhone(rawPhone);
  const name = by(NAME_KEYS) || [first, last].filter(Boolean).join(" ") || email || (phone ? "Facebook lid" : "Facebook lid (noma'lum)");
  const used = new Set([...NAME_KEYS, ...PHONE_KEYS, "first_name", "last_name"]);
  const lines = fields.filter((f) => !used.has(f.key) && f.value).map((f) => `${f.label}: ${f.value}`);
  if (rawPhone && !phone) lines.unshift(`Telefon (tanilmadi): ${clip(rawPhone, 40)}`);
  const ad = [g.campaign_name, g.adset_name, g.ad_name].filter(Boolean).map((x) => clip(x, 80));
  if (ad.length) lines.push(`Reklama: ${ad.join(" › ")}`);
  if (g.platform) lines.push(`Joy: ${g.platform === "ig" ? "Instagram" : g.platform === "fb" ? "Facebook" : clip(g.platform, 20)}`);
  return {
    externalId: `fb:${clip(g.id, 40)}`,
    name: clip(name, 120),
    phone,
    service: clip(g.campaign_name, 100),
    note: lines.join("\n").slice(0, 2_000),
    createdAt: g.created_time,
  };
}
