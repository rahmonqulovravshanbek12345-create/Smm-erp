/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#05070d", 900: "#0a0e18", 800: "#0f1524", 700: "#161d30", 600: "#1f2a44", 500: "#2b3958" },
        mist: { 400: "#8b95ab", 300: "#aab2c5", 200: "#c7cddb", 100: "#e6e9f0" },
        signal: { 500: "#17d68f", 400: "#3ee6a4", 300: "#79f0c0" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
