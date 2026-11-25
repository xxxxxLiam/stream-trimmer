/**
 * File: tailwind.config.ts
 * Path: tailwind.config.ts
 * Description: Tailwind v3 config; scans HTML + all TS/TSX sources. Holds the
 *   design tokens from BUILD-SPEC sections 1 and 2. Gradient "premium layer"
 *   values live as CSS custom properties in src/renderer/src/styles.css so one accent change
 *   carries through; the utilities here only point at them.
 */
import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    // Four sizes plus numerals. There is deliberately no 11px.
    fontSize: {
      title: ["20px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "500" }],
      section: ["15px", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "500" }],
      // Named exceptions from the Type and Components boards.
      cliplength: ["22px", { lineHeight: "1.2", letterSpacing: "0", fontWeight: "500" }],
      "drawer-title": ["17px", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "500" }],
      body: ["13px", { lineHeight: "1.4", letterSpacing: "0" }],
      meta: ["12px", { lineHeight: "1.33", letterSpacing: "0" }],
      numeral: ["26px", { lineHeight: "1.1", letterSpacing: "0" }],
    },
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0A0D0F",
          // Preview plate / video well: the same bg, flat.
          deep: "#0A0D0F",
        },
        panel: {
          DEFAULT: "#121619",
          raised: "#181D21",
          hover: "#232A2F",
        },
        // Flat aliases for the spec names.
        raised: "#181D21",
        hover: "#232A2F",
        hairline: "rgba(255,255,255,0.08)",
        hairlineStrong: "rgba(255,255,255,0.14)",
        // Two readable text tiers only.
        fg: {
          DEFAULT: "#F2F5F6",
          dim: "#94A0A5",
        },
        // Text inside disabled controls only.
        disabled: "#8B979C",
        // Brand. Ice is the one signal colour; Frost is the light.
        ice: {
          DEFAULT: "rgb(95 216 202 / <alpha-value>)",
          "tint-06": "var(--ice-tint-06)",
          "tint-08": "var(--ice-tint-08)",
          "tint-10": "var(--ice-tint-10)",
          "tint-12": "var(--ice-tint-12)",
          "tint-15": "var(--ice-tint-15)",
          "tint-18": "var(--ice-tint-18)",
          "tint-25": "var(--ice-tint-25)",
          "tint-30": "var(--ice-tint-30)",
          "tint-35": "var(--ice-tint-35)",
          "tint-50": "var(--ice-tint-50)",
          "tint-60": "var(--ice-tint-60)",
          "tint-80": "var(--ice-tint-80)",
        },
        frost: {
          DEFAULT: "rgb(184 228 234 / <alpha-value>)",
          "tint-08": "var(--frost-tint-08)",
          "tint-35": "var(--frost-tint-35)",
          "tint-45": "var(--frost-tint-45)",
          "tint-60": "var(--frost-tint-60)",
          "tint-80": "var(--frost-tint-80)",
        },
        // Failure only, as a 1px border and the sentence. Never the brand colour.
        error: {
          DEFAULT: "rgb(255 99 99 / <alpha-value>)",
          "tint-15": "var(--error-tint-15)",
        },
        "bg-overlay": {
          50: "var(--bg-overlay-50)",
          60: "var(--bg-overlay-60)",
          75: "var(--bg-overlay-75)",
          80: "var(--bg-overlay-80)",
          92: "var(--bg-overlay-92)",
        },
        // Legacy name: reads as Ice. R2 to R6 move call sites to ice-* and error as they go.
        accent: {
          DEFAULT: "rgb(95 216 202 / <alpha-value>)",
          soft: "var(--ice-tint-15)",
          on: "#0A0D0F",
        },
      },
      borderRadius: {
        panel: "14px",
        control: "8px",
        chip: "5px",
        pill: "22px",
      },
      spacing: {
        // Fixed control sizes. target = the 44px minimum hit area from the Type board.
        target: "44px",
        btn: "36px",
        row: "28px",
        chip: "24px",
        icon: "32px",
        header: "48px",
        footer: "32px",
      },
      boxShadow: {
        // Named glows mean state. There are no plain drop shadows.
        cut: "var(--glow-cut)",
        range: "var(--glow-range)",
        row: "var(--glow-row)",
        playhead: "var(--glow-playhead)",
        box: "var(--glow-box)",
        mark: "var(--glow-mark)",
        saved: "var(--flash-saved)",
        "clip-hover": "var(--glow-clip-hover)",
        open: "var(--glow-open)",
        made: "var(--glow-made)",
        // Legacy names, now flat or mapped to a named glow.
        panel: "none",
        raised: "none",
        primary: "var(--glow-cut)",
        "accent-card": "none",
        drawer: "none",
        "range-glow": "var(--glow-range)",
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
        // Inter ships inside the app (@fontsource-variable/inter); no network font.
        sans: ['"Inter Variable"', "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        // There is no monospace in the app: the old class resolves to Inter's tabular figures.
        mono: ['"Inter Variable"', "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
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
