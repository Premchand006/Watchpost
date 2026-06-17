/** @type {import('tailwindcss').Config} */
// Tailwind is available for small layout needs. The Watchpost styles
// (colors, panels, telemetry) live in src/index.css.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg0: "#05070e",
        panel: "#0d1424",
        cyan: "#3ae7d6",
        violet: "#a78bfa",
        amber: "#f6b545",
        red: "#ff476f",
        green: "#52e08c",
      },
      fontFamily: {
        display: ["Chakra Petch", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
