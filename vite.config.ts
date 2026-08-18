import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE_PATH || "/",
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },
    plugins: [react()],
    server: { host: "0.0.0.0", port: 5173, allowedHosts: ["terminal.local"] },
    preview: { host: "0.0.0.0", port: 4173 },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            supabase: ["@supabase/supabase-js"],
            icons: ["lucide-react"],
          },
        },
      },
    },
  };
});
