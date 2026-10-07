// Chiziqli ikonkalar (24×24, SF Symbols uslubida). Rang `currentColor` dan olinadi.
import type { SVGProps } from "react";

const PATHS = {
  gauge: "M12 14l3.5-3.5M4.6 18a9 9 0 1114.8 0M12 14a1.5 1.5 0 100 .01",
  phone:
    "M5 4h3l1.6 4-2 1.3a11 11 0 005.1 5.1l1.3-2 4 1.6v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z",
  folder: "M3.5 7.5A2 2 0 015.5 5.5h3.6l2 2h7.4a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z",
  calendar: "M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v10a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5zM4 10h16M8.5 3v4M15.5 3v4",
  checkSeal:
    "M12 3l2.1 1.5 2.6-.2.8 2.5 2.1 1.5-.8 2.5.8 2.5-2.1 1.5-.8 2.5-2.6-.2L12 21l-2.1-1.5-2.6.2-.8-2.5-2.1-1.5.8-2.5-.8-2.5 2.1-1.5.8-2.5 2.6.2zM9 12l2 2 4-4",
  camera: "M3.5 8.5A2 2 0 015.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  film: "M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  brush: "M14.5 4.5l5 5L11 18H6v-5zM12.5 6.5l5 5M6 18c-1 1.5-2 2-3 2 0-1 .5-2 2-3",
  target: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 12.01V12",
  wallet: "M4 7.5A2.5 2.5 0 016.5 5H18v3M4 7.5v10A2.5 2.5 0 006.5 20H20v-12H6.5A2.5 2.5 0 014 7.5zM16 14h.01",
  bell: "M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0",
  history: "M3.5 12a8.5 8.5 0 102.5-6M3.5 4v4h4M12 8v4.5l3 2",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 01-2 1.2l-.3 2h-3.6l-.3-2a7 7 0 01-2-1.2l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 010-2.4L3.4 9.3l1.8-3.1 1.9.7a7 7 0 012-1.2l.3-2h3.6l.3 2a7 7 0 012 1.2l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 010 2.4z",
  plus: "M12 5v14M5 12h14",
  chevronLeft: "M14.5 5.5L8 12l6.5 6.5",
  chevronRight: "M9.5 5.5L16 12l-6.5 6.5",
  chevronDown: "M5.5 9.5L12 16l6.5-6.5",
  x: "M6 6l12 12M18 6L6 18",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  monitor: "M3.5 5.5A1.5 1.5 0 015 4h14a1.5 1.5 0 011.5 1.5v10A1.5 1.5 0 0119 17H5a1.5 1.5 0 01-1.5-1.5zM9 21h6M12 17v4",
  search: "M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM16 16l5 5",
  arrowUpRight: "M7 17L17 7M8 7h9v9",
  alert: "M12 4l9 16H3zM12 10v4M12 17.01V17",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6.5 6.5 0 013.5 6",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  play: "M7 4.5v15l12-7.5z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5",
  send: "M4 12L20 4l-6 16-2.5-6.5z",
  logout: "M14 4h4.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H14M10 16l-4-4 4-4M6 12h10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.8, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** iOS Settings uslubidagi rangli ikonka-chip. */
export const CHIP_COLORS = {
  blue: "bg-accent",
  green: "bg-green",
  orange: "bg-orange",
  red: "bg-red",
  purple: "bg-purple",
  indigo: "bg-indigo",
  teal: "bg-teal",
  pink: "bg-pink",
  yellow: "bg-yellow",
  gray: "bg-gray",
} as const;

export type ChipColor = keyof typeof CHIP_COLORS;

export function IconChip({ name, color, size = 28 }: { name: IconName; color: ChipColor; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[8px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] ${CHIP_COLORS[color]}`}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    >
      <Icon name={name} size={Math.round(size * 0.6)} strokeWidth={2} />
    </span>
  );
}
