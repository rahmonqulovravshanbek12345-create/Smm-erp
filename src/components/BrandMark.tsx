// Agentlik belgisi: haqiqiy tizimda Friday Agency logotipi (FD), demo'da umumiy belgi.
import { SERVER_MODE } from "../lib/api";
import { Icon } from "./icons";

// Friday Agency logotipi: qora doira ichida yashil «FD» (asl rasm o'lchamlari bo'yicha chizilgan)
const BG = "#191919";
const GREEN = "#86D20D";
const F_PATH = "M0 0H223V53H53V85H143V161H53V264H0Z";
const D_PATH = "M266 0H326A132 132 0 0 1 326 264H108V211H326A79 79 0 0 0 326 53H266Z";

/** Brauzer yorlig'i va telefon ekrani uchun belgi (data: URL). */
export const FD_ICON_HREF = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 712 712"><circle cx="356" cy="356" r="356" fill="${BG}"/>` +
    `<g transform="translate(127 224)" fill="${GREEN}"><path d="${F_PATH}"/><path d="${D_PATH}"/></g></svg>`,
)}`;

export function BrandMark({ small }: { small?: boolean }) {
  const box = small ? "h-9 w-9" : "h-11 w-11";
  if (SERVER_MODE) {
    return (
      <svg viewBox="0 0 712 712" aria-hidden className={`shrink-0 drop-shadow-[0_4px_8px_rgb(0_0_0/0.25)] ${box}`}>
        <circle cx="356" cy="356" r="356" fill={BG} />
        <g transform="translate(127 224)" fill={GREEN}>
          <path d={F_PATH} />
          <path d={D_PATH} />
        </g>
      </svg>
    );
  }
  return (
    <span
      className={`flex items-center justify-center rounded-[12px] bg-gradient-to-br from-[#5856D6] via-[#007AFF] to-[#5AC8FA] text-white shadow-[0_6px_16px_-6px_rgb(0_122_255/0.7),inset_0_1px_0_rgb(255_255_255/0.35)] ${box}`}
    >
      <Icon name="sparkle" size={small ? 18 : 22} strokeWidth={2} />
    </span>
  );
}
