import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const backend = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // One origin for the browser: the refresh cookie (SameSite=Strict, Path=/api/auth/) just works.
    proxy: {
      "/api": { target: backend, changeOrigin: false },
      "/media": { target: backend, changeOrigin: false },
      "/django-admin": { target: backend, changeOrigin: false },
      "/static": { target: backend, changeOrigin: false },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
