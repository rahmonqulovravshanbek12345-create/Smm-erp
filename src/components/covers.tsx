// Bo'lim muqovalari: sahifa sarlavhasi orqasidagi yengil vektor rasmlar (har bo'lim o'z ishini ko'rsatadi).
// Tashqi rasm yuklanmaydi — hammasi shu yerda chizilgan; harakat faqat qurilmada animatsiya o'chirilmagan bo'lsa.
import type { ReactNode } from "react";

export type CoverKind = "content" | "montaj" | "finance";

/** Muqova foni: bo'limning rangi (yorug' va qorong'i mavzuda yumshoq). */
export const COVER_BG: Record<CoverKind, string> = {
  content: "cover-content",
  montaj: "cover-montaj",
  finance: "cover-finance",
};

const Float = ({ d = 0, children }: { d?: number; children: ReactNode }) => (
  <g className="cover-float" style={{ animationDelay: `${d}s` }}>
    {children}
  </g>
);

/** Kontent reja: telefon lentasi va ijtimoiy tarmoqlar. */
function ContentArt() {
  return (
    <>
      <defs>
        <linearGradient id="cv-ig" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset=".3" stopColor="#FA7E1E" />
          <stop offset=".6" stopColor="#D62976" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      {/* Telefon va postlar to'ri */}
      <g transform="rotate(6 246 100)">
        <rect x="200" y="22" width="96" height="164" rx="18" fill="#1C1C1E" />
        <rect x="206" y="30" width="84" height="148" rx="13" fill="#fff" />
        <circle cx="219" cy="42" r="6" fill="url(#cv-ig)" />
        <rect x="229" y="39" width="34" height="6" rx="3" fill="#E5E5EA" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`${r}${c}`}
              x={210 + c * 26}
              y={54 + r * 26}
              width="24"
              height="24"
              rx="4"
              fill={["#FFD6E0", "#FFE7C2", "#D9E4FF", "#E2F7D9", "#F3DBFF", "#FFE0D1", "#D2F1FF", "#FFF2B8", "#E7E0FF"][r * 3 + c]}
            />
          )),
        )}
        <rect x="210" y="136" width="60" height="6" rx="3" fill="#E5E5EA" />
        <rect x="210" y="147" width="42" height="6" rx="3" fill="#F2F2F7" />
      </g>
      {/* Instagram */}
      <Float>
        <g transform="translate(134 18)">
          <rect width="46" height="46" rx="13" fill="url(#cv-ig)" />
          <rect x="10" y="10" width="26" height="26" rx="8" fill="none" stroke="#fff" strokeWidth="3.4" />
          <circle cx="23" cy="23" r="6.2" fill="none" stroke="#fff" strokeWidth="3.4" />
          <circle cx="31.5" cy="14.5" r="2.2" fill="#fff" />
        </g>
      </Float>
      {/* Telegram */}
      <Float d={1.2}>
        <g transform="translate(316 34)">
          <circle r="23" fill="#29A9EB" />
          <path d="M-11 -1 L12 -10 L7 12 L0 6 L-4 10 L-4 3 L8 -6 L-6 1 Z" fill="#fff" />
        </g>
      </Float>
      {/* TikTok */}
      <Float d={2.1}>
        <g transform="translate(150 112)">
          <circle r="21" fill="#111" />
          <path d="M3 -12 v17 a6 6 0 1 1 -6 -6" fill="none" stroke="#25F4EE" strokeWidth="4" strokeLinecap="round" transform="translate(-1.5 -1)" />
          <path d="M3 -12 v17 a6 6 0 1 1 -6 -6" fill="none" stroke="#FE2C55" strokeWidth="4" strokeLinecap="round" transform="translate(1.5 1)" />
          <path d="M3 -12 v17 a6 6 0 1 1 -6 -6 M3 -12 q2 7 9 8" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </g>
      </Float>
      {/* YouTube */}
      <Float d={0.6}>
        <g transform="translate(298 120)">
          <rect width="48" height="34" rx="10" fill="#FF0033" />
          <path d="M19 10 L32 17 L19 24 Z" fill="#fff" />
        </g>
      </Float>
      {/* Yurakcha va izoh */}
      <Float d={1.6}>
        <g transform="translate(292 86)">
          <rect x="-6" y="-14" width="42" height="24" rx="12" fill="#fff" />
          <path d="M6 -2 a4 4 0 0 1 7 -4 a4 4 0 0 1 7 4 l-7 7 z" fill="#FF2D55" />
          <rect x="22" y="-5" width="9" height="4" rx="2" fill="#FF2D55" opacity=".35" />
        </g>
      </Float>
    </>
  );
}

/** Montaj: kinolenta, ijro tugmasi va vaqt chizig'i. */
function MontajArt() {
  const clips: [number, number, string][][] = [
    [
      [150, 70, "#AF52DE"],
      [226, 60, "#5856D6"],
      [292, 50, "#AF52DE"],
    ],
    [
      [170, 90, "#FF2D55"],
      [266, 76, "#FF9500"],
    ],
    [[150, 192, "#30B0C7"]],
  ];
  return (
    <>
      {/* Kinolenta */}
      <g transform="rotate(-8 250 60)">
        <rect x="140" y="24" width="230" height="62" rx="6" fill="#1C1C1E" />
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <rect x={146 + i * 19} y="28" width="10" height="7" rx="1.5" fill="#fff" opacity=".85" />
            <rect x={146 + i * 19} y="75" width="10" height="7" rx="1.5" fill="#fff" opacity=".85" />
          </g>
        ))}
        {["#5856D6", "#FF2D55", "#FF9500", "#30B0C7"].map((c, i) => (
          <rect key={c} x={146 + i * 55} y="39" width="50" height="32" rx="3" fill={c} opacity=".9" />
        ))}
      </g>
      {/* Ijro tugmasi */}
      <Float>
        <g transform="translate(252 58)">
          <circle r="27" fill="#fff" />
          <circle r="27" fill="none" stroke="#5856D6" strokeOpacity=".25" strokeWidth="6" />
          <path d="M-8 -12 L14 0 L-8 12 Z" fill="#5856D6" />
        </g>
      </Float>
      {/* Vaqt chizig'i */}
      <g transform="translate(0 112)">
        {clips.map((row, r) => (
          <g key={r}>
            <rect x="146" y={r * 17} width="200" height="12" rx="6" fill="#8E8E93" opacity=".18" />
            {row.map(([x, w, c]) => (
              <rect key={x} x={x} y={r * 17} width={w} height="12" rx="6" fill={c} />
            ))}
          </g>
        ))}
        <g className="cover-playhead">
          <rect x="238" y="-8" width="3" height="58" rx="1.5" fill="#FF3B30" />
          <path d="M233 -12 h13 l-6.5 7 z" fill="#FF3B30" />
        </g>
      </g>
      {/* Qaychi */}
      <Float d={1.4}>
        <g transform="translate(150 30) rotate(-20)" fill="none" stroke="#FF9500" strokeWidth="3.5" strokeLinecap="round">
          <circle cx="-6" cy="10" r="6" />
          <circle cx="6" cy="10" r="6" />
          <path d="M-2 5 L10 -14 M2 5 L-10 -14" />
        </g>
      </Float>
    </>
  );
}

/** Moliya: o'sayotgan grafik, pul va tangalar. */
function FinanceArt() {
  const bars = [34, 52, 46, 74, 96];
  return (
    <>
      <defs>
        <linearGradient id="cv-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34C759" />
          <stop offset="1" stopColor="#30B0C7" />
        </linearGradient>
        <linearGradient id="cv-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE066" />
          <stop offset="1" stopColor="#FFB300" />
        </linearGradient>
      </defs>
      {/* Ustunli grafik */}
      {bars.map((h, i) => (
        <rect key={i} x={168 + i * 26} y={168 - h} width="18" height={h} rx="5" fill="url(#cv-bar)" opacity={0.55 + i * 0.1} />
      ))}
      <Float d={0.8}>
        <path d="M160 128 L196 104 L222 112 L250 82 L284 58" fill="none" stroke="currentColor" strokeOpacity=".7" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M284 58 l-12 1 m12 -1 l-3 11" fill="none" stroke="currentColor" strokeOpacity=".7" strokeWidth="3.5" strokeLinecap="round" />
      </Float>
      {/* Pul */}
      <Float>
        <g transform="translate(214 14) rotate(-10)">
          <rect width="94" height="50" rx="8" fill="#34C759" />
          <rect x="5" y="5" width="84" height="40" rx="5" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="2" />
          <circle cx="47" cy="25" r="11" fill="#fff" opacity=".85" />
          <path d="M47 18 v14 M43 21 h6 a2.5 2.5 0 0 1 0 5 h-4 a2.5 2.5 0 0 0 0 5 h6" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" />
        </g>
      </Float>
      {/* Tangalar */}
      <Float d={1.5}>
        <g transform="translate(330 120)">
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(0 ${-i * 9})`}>
              <ellipse cy="6" rx="22" ry="8" fill="#E39A00" />
              <ellipse rx="22" ry="8" fill="url(#cv-coin)" />
            </g>
          ))}
          <text y="-24" textAnchor="middle" fontSize="11" fontWeight="800" fill="#B26B00">
            UZS
          </text>
        </g>
      </Float>
      {/* Hamyon belgisi */}
      <Float d={2.2}>
        <g transform="translate(150 26)">
          <circle r="18" fill="#fff" />
          <path
            d="M-8 -5 h14 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-14 a3 3 0 0 1 -3 -3 v-9 a3 3 0 0 1 3 -3 z M3 1 h6"
            fill="none"
            stroke="#34C759"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
        </g>
      </Float>
    </>
  );
}

const ART: Record<CoverKind, () => ReactNode> = { content: ContentArt, montaj: MontajArt, finance: FinanceArt };

/** Muqova rasmi: o'ng tomonda, matnga xalaqit bermaydi (bezak — ekran o'quvchilar uchun yashirin). */
export function CoverArt({ kind, className = "" }: { kind: CoverKind; className?: string }) {
  const Art = ART[kind];
  return (
    <svg viewBox="128 -14 252 212" preserveAspectRatio="xMaxYMid meet" aria-hidden className={`text-label ${className}`}>
      <Art />
    </svg>
  );
}
