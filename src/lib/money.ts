// Pul bilan ishlash: yaxlitlash xatosi chegarasi.
// USD to'lov sentgacha yaxlitlanadi (1 sent ≈ 126 so'm), shuning uchun so'mdagi faktura bir necha o'n so'mga kam
// to'lanib qolishi mumkin. Bunday farq «qisman to'langan» va «qarz» hisoblanmasligi kerak.
export const PAID_TOL = 100;

/** Qolgan qarz (chegaradan kichik qoldiq — nol). */
export const outstandingOf = (amount: number, paid: number): number => {
  const left = amount - paid;
  return left > PAID_TOL ? left : 0;
};

/** To'liq to'langan hisoblanadimi. */
export const isSettled = (amount: number, paid: number): boolean => outstandingOf(amount, paid) === 0;
