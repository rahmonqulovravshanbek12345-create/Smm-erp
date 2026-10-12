// Server sozlamalari muhit o'zgaruvchilaridan (/etc/smm-erp/env). Noto'g'ri yoki yetishmayotgan bo'lsa — server ishga tushmaydi.
import { z } from "zod";
import { ROLE_LABELS } from "../../src/lib/labels";

const bool = z.enum(["0", "1", "true", "false"]).transform((v) => v === "1" || v === "true");

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Saytning to'liq manzili, masalan https://erp.fridayagency.uz — so'rov qayerdan kelganini tekshirish uchun. */
  APP_ORIGIN: z.string().url(),
  /** 32 baytlik maxfiy kalit (base64) — 2FA kalitlarini shifrlash uchun. */
  SECRET_KEY: z.string().refine((v) => Buffer.from(v, "base64").length >= 32, "SECRET_KEY kamida 32 bayt (base64) bo'lishi kerak"),
  /** index.html joylashgan papka. */
  STATIC_DIR: z.string().min(1),
  /** Cookie faqat HTTPS orqali (ishlab chiqarishda doim 1). */
  COOKIE_SECURE: bool.default(true),
  /** Ikki bosqichli kirish majburiy bo'lgan rollar: «all» — hamma xodimlar (standart), yoki vergul bilan ro'yxat. */
  REQUIRE_2FA_ROLES: z
    .string()
    .default("all")
    .transform((v) =>
      v.trim() === "all"
        ? (Object.keys(ROLE_LABELS) as string[])
        : v
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
    ),
  /** Nginx ortida: haqiqiy IP X-Forwarded-For dan olinadi (faqat shu manzildagi proksiga ishoniladi). */
  TRUST_PROXY: z.string().default("127.0.0.1"),
  /** Bitta xodim bir kunda qo'sha oladigan ma'lumot hajmi (MB) — tizimni ataylab to'ldirib tashlashga qarshi. Admin uchun cheklov yo'q. */
  USER_DAILY_WRITE_MB: z.coerce.number().positive().max(1000).default(5),
  /** So'rov cheklovlari (parolni taxmin qilishga qarshi). Faqat avtomatik brauzer testlarida o'chiriladi. */
  RATE_LIMITS: bool.default(true),
  /** Jadval bo'yicha ishlar (kurs, Meta, eslatmalar). Testlarda o'chiriladi. */
  JOBS: bool.default(true),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TZ: z.string().default("Asia/Tashkent"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Env.safeParse(env);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Sozlamalar noto'g'ri:\n${msg}`);
  }
  return r.data;
}
