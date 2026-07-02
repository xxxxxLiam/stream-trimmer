/**
 * File: tailwind.config.ts
 * Path: tailwind.config.ts
 * Description: Tailwind v3 config; scans HTML + all TS/TSX sources.
 */
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0B0B0C",
          deep: "#08080A",
        },
        panel: {
          DEFAULT: "#161618",
          raised: "#1C1C1F",
          hover: "rgba(255,255,255,0.06)",
        },
        hairline: "rgba(255,255,255,0.08)",
        hairlineStrong: "rgba(255,255,255,0.14)",
        fg: {
          DEFAULT: "#F5F5F7",
          muted: "rgba(255,255,255,0.55)",
          faint: "rgba(255,255,255,0.35)",
        },
        accent: {
          DEFAULT: "#FF6363",
          soft: "rgba(255,99,99,0.15)",
        },
      },
      borderRadius: {
        panel: "14px",
        row: "8px",
        chip: "5px",
      },
      boxShadow: {
        panel:
          "0 40px 80px -20px rgba(0,0,0,0.7), 0 8px 20px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        row: "inset 0 0 0 1px rgba(255,255,255,0.06)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;