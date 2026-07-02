# Analysis

Repo matches the prompt's assumptions:
- Front-end: `src/App.jsx`, `src/main.jsx`, `src/hooks/useClipper.js`, `src/hooks/useDualRange.js`, `src/components/DualRange.jsx`, `src/lib/clip.js`, `src/styles.css`, plus `index.html`, `vite.config.js`.
- Backend: `server/index.js` (315 lines) — Express with `/api/info`, `/api/download`, `/api/transcript`, Zod validation, yt-dlp bundled+PATH fallback, `ffmpeg-static`, 10-min cap, transcript fetch.
- `npm run dev` uses `concurrently` to run `vite` + `node server/index.js`.

Notes / small discrepancies:
- `useDualRange.js` exists but is unused by the current `DualRange.jsx` (which is fully controlled). I'll type it but leave it in place unless removal is trivially safe.
- Current URL flow uses `onBlur` + Enter + a debounced auto-load in the hook. All three need to be removed in favor of an explicit Search button (Enter kept as convenience).
- Loading UI today = inline meta text ("Loading video info…") and a bottom progress bar. Both replaced/augmented by the overlay loader per prompt.

# Action plan

1. **Tooling**
   - Add deps: `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `@types/express`, `@types/cors`, `tsx`, `tailwindcss@3`, `postcss`, `autoprefixer`, `framer-motion`, `react-bootstrap-icons`.
   - Add `tsconfig.json` (client) and `tsconfig.server.json` (or a single config with includes). Update `vite.config.js` → `vite.config.ts`.
   - Update `package.json`: `"dev:server": "tsx server/index.ts"`, `"dev:client": "vite"` unchanged.

2. **Tailwind setup**
   - `tailwind.config.ts` scanning `index.html` + `src/**/*.{ts,tsx}`.
   - `postcss.config.js`.
   - Replace `src/styles.css` with a minimal Tailwind entry (`@tailwind base/components/utilities`) plus a few `@layer` rules for the dual-range native thumb styling (can't be done purely with utilities).

3. **Front-end TS migration** (behavior-preserving)
   - `src/lib/clip.ts` — typed helpers, exported `Timestamp`, `VideoInfo`, `TranscriptLine`, `DownloadRequest` interfaces.
   - `src/hooks/useClipper.ts` — typed state; remove the debounced auto-load `useEffect`; expose `loadInfo` for the Search button; keep everything else identical (validation, transcript, download).
   - `src/hooks/useDualRange.ts` — typed (kept as-is functionally).
   - `src/components/DualRange.tsx` — typed props, Tailwind classes, native thumb styles via `@layer components` in the CSS entry.
   - Split `App.jsx` into small typed components: `UrlBar` (input + Search button), `TimeRangeControls` (timestamp fields + dual range + selected duration), `FormatQualityFields`, `PreviewPanel` (video ↔ transcript with Framer Motion `AnimatePresence`), `OverlayLoader`. `App.tsx` composes them.
   - Introduce a small typed `ClipperContext` (`createContext<ReturnType<typeof useClipper>>`) so the split components don't prop-drill. Provider in `App.tsx`.
   - `src/main.tsx` updated import.

4. **Backend TS migration**
   - Convert `server/index.js` → `server/index.ts` with `Request`/`Response` types, Zod inference (`z.infer`), typed yt-dlp option objects (loose `Record<string, unknown>` where the youtube-dl-exec types are awkward).
   - Run via `tsx`. No build step. Binary resolution logic (`ffmpeg-static`, bundled yt-dlp path with PATH fallback) preserved byte-for-byte in behavior.
   - If any typing forces a behavior change (e.g., stream piping types), fall back to `as any` locally rather than altering runtime.

5. **UX changes**
   - **Search button**: URL input + adjacent Search button (`BsSearch` icon). Removes `onBlur` auto-fetch and the debounced effect. Enter-in-input still triggers.
   - **Overlay loader**: Full-panel overlay (semi-transparent black, thin white border, spinner via `BsArrowRepeat` with `animate-spin`, label) shown while `loadingInfo || downloading || loadingTranscript`. Fades via Framer Motion.
   - **Icons** (`react-bootstrap-icons`): `BsSearch` (Search), `BsClipboard` (Paste), `BsCopy` (Copy transcript), `BsDownload` (Download button), `BsCameraVideo` / `BsFileText` (video ↔ transcript toggle).
   - **Framer Motion**: `AnimatePresence` for video↔transcript swap (fade+slide), fade-in for loaded info meta, fade for overlay loader. No layout-shifting animations.

6. **Verification**
   - Run typecheck; run `npm run dev` (client only reachable in preview) and confirm Vite starts on 8080.
   - Manually verify in preview: URL input + Search button, disabled states, timestamp editing, dual-range interaction, format/quality swap, transcript toggle animation, overlay loader appearance (simulated via network conditions).
   - Note that real `/api/info`, `/api/download`, `/api/transcript` calls require the user's local machine (yt-dlp + ffmpeg) — same as today. Backend contract unchanged.

# Files touched

Created: `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`, `src/context/ClipperContext.tsx`, `src/components/UrlBar.tsx`, `src/components/TimeRangeControls.tsx`, `src/components/FormatQualityFields.tsx`, `src/components/PreviewPanel.tsx`, `src/components/OverlayLoader.tsx`, `server/index.ts`.

Converted: `src/main.jsx`→`.tsx`, `src/App.jsx`→`.tsx`, `src/hooks/useClipper.js`→`.ts`, `src/hooks/useDualRange.js`→`.ts`, `src/components/DualRange.jsx`→`.tsx`, `src/lib/clip.js`→`.ts`, `src/styles.css` reduced to Tailwind entry + tiny `@layer` block, `vite.config.js`→`.ts`, `package.json` (scripts + deps), `index.html` (script src).

Deleted: original `.jsx`/`.js` counterparts and `server/index.js` after successful conversion.

# Risks / stop-conditions

- If `tsx` + bundled yt-dlp path resolution behaves differently under TS (e.g., `import.meta.url` path math), I'll keep the exact same resolution code and, if needed, revert `server/index.ts` back to `server/index.js` and report it — per the prompt.
- `youtube-dl-exec` types can be incomplete; I'll use `z.infer` for our inputs and narrow-casting for its option object rather than fighting the library types.

# Verification notes (planned)

- `npm run dev` boots both processes.
- All existing features preserved: URL → info (now via Search), dual-range with 10-min cap, HH:MM:SS fields + Paste, MP4/MP3 + quality swap, download with progress (now overlay), transcript swap + Copy + auto-generated note, responsive two-column grid, strict B/W minimalist styling.
- API contract unchanged.
- Real download/transcript calls verifiable only locally (unchanged from today).
