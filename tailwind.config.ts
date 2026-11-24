/**
 * File: tailwind.config.ts
 * Path: tailwind.config.ts
 * Description: Tailwind v3 config; scans HTML + all TS/TSX sources. Holds the
 *   design tokens from BUILD-SPEC sections 1 and 2. Gradient "premium layer"
 *   values live as CSS custom properties in src/renderer/src/styles.css so one accent change
 *   carries through; the utilities here only point at them.
 */
import type { Config } from "tailwindcss";

const accentHsl = "hsl(var(--accent-h) var(--accent-s) var(--accent-l)";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    // Four sizes plus numerals. There is deliberately no 11px.
    fontSize: {
      title: ["20px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "500" }],
      section: ["16px", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "500" }],
      body: ["13px", { lineHeight: "1.4", letterSpacing: "0" }],
      meta: ["12px", { lineHeight: "1.33", letterSpacing: "0" }],
      numeral: ["26px", { lineHeight: "1.1", letterSpacing: "0" }],
    },
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0B0B0C",
          // Preview plate / video well (see --g-plate).
          deep: "#08080A",
        },
        panel: {
          DEFAULT: "#161618",
          raised: "#1C1C1F",
          hover: "#252527",
        },
        // Flat aliases for the spec names.
        raised: "#1C1C1F",
        hover: "#252527",
        hairline: "rgba(255,255,255,0.08)",
        hairlineStrong: "rgba(255,255,255,0.14)",
        // Two readable text tiers only. fg-faint was removed (3.25:1, fails AA).
        fg: {
          DEFAULT: "#F5F5F7",
          dim: "#969697",
        },
        // Text inside disabled controls only (5.67:1 on panel).
        disabled: "#909092",
        accent: {
          DEFAULT: `${accentHsl} / <alpha-value>)`,
          // Tint for error/warning cards: accent text sits on this.
          soft: `${accentHsl} / 0.15)`,
          on: "#0B0B0C",
        },
      },
      borderRadius: {
        panel: "14px",
        control: "8px",
        chip: "5px",
      },
      spacing: {
        // Control heights (spec section 2). Use as h-btn, h-row, size-icon...
        btn: "36px",
        row: "28px",
        chip: "24px",
        icon: "32px",
        header: "48px",
        footer: "32px",
      },
      boxShadow: {
        panel: "var(--g-panel-shadow)",
        raised: "var(--g-raised-shadow)",
        primary: "var(--g-primary-shadow)",
        "accent-card": "var(--g-accent-card-shadow)",
        drawer: "var(--g-drawer-shadow)",
        "range-glow": "var(--g-range-glow)",
      },
      backgroundImage: {
        ground: "var(--g-ground)",
        "panel-wash": "var(--g-panel)",
        "raised-wash": "var(--g-raised)",
        primary: "var(--g-primary)",
        "range-fill": "var(--g-range-fill)",
        "accent-card": "var(--g-accent-card)",
        plate: "var(--g-plate)",
        "row-wash": "var(--g-row-wash)",
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
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        arabic: [
          "Geeza Pro",
          "Al Bayan",
          "Arabic Typesetting",
          "Noto Naskh Arabic",
          "serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
