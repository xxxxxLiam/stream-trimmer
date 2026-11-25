/**
 * File: vite.config.ts
 * Path: vite.config.ts
 * Description: Vite dev server on 8080 with /api proxy to local Express backend.
 *
 * Also bakes the owner-gate constants (see src/renderer/src/shared/utils/ownerGate.ts). With
 * VITE_ENABLE_CHANNEL_DATA unset, __CHANNEL_DATA__ is the literal false and the
 * channel-data code is dead-code-eliminated, so the machine list and salt are
 * dropped from the bundle too.
 */
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const truthy = (v: string | undefined) =>
  /^(1|true|yes|on)$/i.test(String(v ?? "").trim());

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const built = truthy(env.VITE_ENABLE_CHANNEL_DATA);
  return {
    // The renderer lives in src/renderer (index.html, public/, src/); the build
    // goes to ./dist, which the main process loads.
    root: "src/renderer",
    envDir: process.cwd(),
    plugins: [
      react(),
      {
        // The dev server's hot-reload preamble is an inline script the page's content policy would refuse,
        // so the policy meta is left out of dev pages. The built app keeps it.
        name: "csp-build-only",
        apply: "serve",
        transformIndexHtml: (html: string) => html.replace(/\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, ""),
      },
    ],
    base: "./",
    build: { outDir: "../../dist", emptyOutDir: true },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __CHANNEL_DATA__: JSON.stringify(built),
      __OWNER_MACHINES__: JSON.stringify(built ? (env.VITE_OWNER_MACHINES ?? "") : ""),
      __REPORT_RELAY_URL__: JSON.stringify((env.VITE_REPORT_RELAY_URL ?? "").trim()),
      __OWNER_SALT__: JSON.stringify(built ? (env.VITE_OWNER_SALT ?? "") : ""),
    },
    server: {
      host: true,
      port: 8080,
      proxy: {
        "/api": "http://localhost:5174",
      },
    },
  };
});
