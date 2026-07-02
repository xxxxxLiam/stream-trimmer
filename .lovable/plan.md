## Goal

Rewrite this project to match your spec: a public-repo-ready, plain **Vite + React (JSX) SPA** with a bundled `yt-dlp` + `ffmpeg` local backend, so a stranger can `git clone` → `npm install` → `npm run dev`.

## Key decision: strip TanStack Start

The current repo is a TanStack Start (TS + SSR + router) scaffold. Your spec explicitly lists `src/App.jsx`, `src/main.jsx`, `index.html`, `vite.config.js` — a plain Vite SPA. Keeping TanStack Start would contradict the spec, bloat the repo for a personal tool, and confuse anyone cloning it. **Plan: fully strip TanStack Start and shadcn scaffolding**, leaving a minimal SPA.

## Files to create / rewrite

**Root**
- `package.json` — replace entirely. Deps: `express`, `cors`, `zod`, `youtube-dl-exec`, `ffmpeg-static`, `concurrently`, `react`, `react-dom`. Dev: `vite`, `@vitejs/plugin-react`. Scripts: `dev` (concurrently client+server), `dev:client` (`vite`), `dev:server` (`node server/index.js`), `build`, `preview`.
- `vite.config.js` — plain React SPA, dev proxy `/api` → `http://localhost:5174`.
- `index.html` — minimal, mounts `#root`, loads `src/main.jsx`.
- `.nvmrc` — `18`.
- `LICENSE` — MIT.
- `README.md` — exactly the section order you specified.
- `.gitignore` — Node/Vite defaults.

**src/**
- `src/main.jsx` — mounts `<App />`.
- `src/App.jsx` — URL input, iframe preview, dual-handle range (two `<input type="range">`), `HH:MM:SS` timestamps, Download button, inline status/error area, client-side validation (URL, `start<end`, `end≤duration`, `end-start≤600`).
- `src/styles.css` — pure black bg, white text, thin white input borders, no other color.

**server/**
- `server/index.js` — Express, `POST /api/info`, `POST /api/download`. Uses `youtube-dl-exec` (bundled yt-dlp) and `ffmpeg-static` (bundled ffmpeg path passed via `--ffmpeg-location`). Preflight resolves both binaries; on failure logs per-OS friendly guidance and returns a clear 500 from the endpoints. Same Zod validation as client. Download uses `--download-sections "*START-END"` + `--force-keyframes-at-cuts` + stream-copy merge to `mp4`, streams the file back, cleans up temp dir.

**Files to delete** (TanStack Start / shadcn / Lovable scaffolding not needed for a plain SPA repo)
- `src/routes/`, `src/routeTree.gen.ts`, `src/router.tsx`, `src/start.ts`, `src/server.ts` (if present), any `src/components/ui/*`, `src/integrations/*`, `src/lib/*` that only supports the scaffold.
- `.tanstack/`, `components.json`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `bunfig.toml`, `bun.lock`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `AGENTS.md`, `vite.config.ts`.
- `public/` shadcn/lovable placeholders (keep only `favicon.ico` if present).

I'll only delete files that exist; nothing outside the SPA scope will remain.

## Validation rules (shared)

Client and server both enforce: valid URL matching `youtube.com`/`youtu.be`; `start ≥ 0`; `end > start`; `end ≤ duration`; `end - start ≤ 600`. Server also re-probes duration via `yt-dlp --print duration` before download.

## README structure (exact order)

1. `# YouTube Clipper` — one-line description
2. `![screenshot](docs/screenshot.png)` placeholder
3. `## What it does`
4. `## Quick start` — three commands
5. `## Prerequisites` — Node 18+ (note binaries auto-install)
6. `## Usage`
7. `## How it works`
8. `## Legal & responsible use` — rights-cleared content, respect YouTube ToS + copyright, link to yt-dlp
9. `## Maintenance` — as-is, unmaintained, forks welcome
10. `## License` — MIT

## Preview caveat

The Lovable preview will render the UI but cannot run the local backend (no `yt-dlp`/`ffmpeg`/long-running Node). The app is intended to be cloned and run locally — that's the whole point of the spec. I'll keep a small, non-intrusive inline hint in the error area when the fetch fails against a non-localhost host, without adding banners or extra UI beyond the spec.

## Out of scope

No accounts, DB, analytics, styling beyond black/white, no TanStack, no shadcn, no TypeScript.
