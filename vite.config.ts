/**
 * File: vite.config.ts
 * Path: vite.config.ts
 * Description: Vite dev server on 8080 with /api proxy to local Express backend.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: true,
    port: 8080,
    proxy: {
      "/api": "http://localhost:5174",
    },
  },
});