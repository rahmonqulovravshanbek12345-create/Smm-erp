// Tizim nomi: haqiqiy tizimda — agentlik nomi, demo'da — umumiy nom (boshqa mijozlarga ko'rsatish uchun).
// Server paketida ham VITE_SERVER=1 (server/build.mjs) — Telegram xabarlari shu nom bilan ketadi.
export const BRAND = import.meta.env?.VITE_SERVER === "1" ? "Friday Agency" : "SMM Studio";
