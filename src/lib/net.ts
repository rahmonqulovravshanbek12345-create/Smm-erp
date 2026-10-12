// Tarmoq so'rovlari uchun vaqt chegarasi (AbortSignal.timeout yo'q eski brauzerlarda — Safari/iOS 15 va undan eski — ham ishlaydi).
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
