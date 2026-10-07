/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`;

// Ranglar CSS o'zgaruvchilaridan olinadi — yorug' va qorong'i rejim index.css'da almashadi.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: rgb("--bg"),
        elevated: rgb("--elevated"),
        label: rgb("--label"),
        label2: "var(--label2)",
        label3: "var(--label3)",
        fill: "var(--fill)",
        fill2: "var(--fill2)",
        sep: "var(--sep)",
        accent: rgb("--accent"),
        green: rgb("--green"),
        orange: rgb("--orange"),
        red: rgb("--red"),
        purple: rgb("--purple"),
        indigo: rgb("--indigo"),
        teal: rgb("--teal"),
        pink: rgb("--pink"),
        yellow: rgb("--yellow"),
        gray: rgb("--gray"),
        viz1: rgb("--viz-1"),
        viz2: rgb("--viz-2"),
        viz3: rgb("--viz-3"),
        vizneg: rgb("--viz-neg"),
      },
      // text-* uchun to'qroq (kontrastli) variant, bg-* yorqin rangda qoladi
      textColor: {
        accent: rgb("--accent-ink"),
        green: rgb("--green-ink"),
        red: rgb("--red-ink"),
        orange: rgb("--orange-ink"),
        purple: rgb("--purple-ink"),
        teal: rgb("--teal-ink"),
        pink: rgb("--pink-ink"),
        indigo: rgb("--indigo-ink"),
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        display: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["SF Mono", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      opacity: {
        12: "0.12",
        18: "0.18",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)",
        float: "0 20px 50px -20px rgb(0 0 0 / 0.35)",
      },
      keyframes: {
        "sheet-up": { "0%": { transform: "translateY(24px) scale(0.98)", opacity: "0" }, "100%": { transform: "none", opacity: "1" } },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        island: {
          "0%": { transform: "translateX(-50%) scale(0.6)", opacity: "0" },
          "60%": { transform: "translateX(-50%) scale(1.03)", opacity: "1" },
          "100%": { transform: "translateX(-50%) scale(1)", opacity: "1" },
        },
        pop: { "0%": { transform: "scale(0.96)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
      },
      animation: {
        "sheet-up": "sheet-up 0.32s cubic-bezier(0.32, 0.72, 0, 1) both",
        "fade-in": "fade-in 0.2s ease-out both",
        island: "island 0.45s cubic-bezier(0.32, 0.72, 0, 1) both",
        pop: "pop 0.25s cubic-bezier(0.32, 0.72, 0, 1) both",
      },
    },
  },
  plugins: [],
};
