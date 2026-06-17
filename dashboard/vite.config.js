import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Watchpost dashboard: static client-side app for Vercel or Netlify.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
