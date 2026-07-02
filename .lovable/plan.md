
# Electron Desktop Packaging Plan

## Analysis — current repo state

- **Stack**: Vite 5 + React 18 (TypeScript) front-end on port 8080; Express backend `server/index.ts` on port 5174, run via `tsx`.
- **Dev model**: `npm run dev` uses `concurrently` to run Vite + Express. Vite proxies `/api` → `http://localhost:5174`.
- **Binaries**: `ffmpeg-static` (bundled path resolved at runtime) + `yt-dlp` resolved via `youtube-dl-exec`'s bundled binary with a system-PATH fallback (`resolveYtDlp()` in `server/index.ts`).
- **Endpoints**: `/api/info`, `/api/download`, `/api/transcript` — preserved as-is.
- **Constraint**: `package.json` sets `"type": "module"`, so the Electron main process must be `.cjs` for `__dirname` / `require('electron')` to work.

## Action plan

1. **Add Electron deps** (dev-only, free/OSS): `electron`, `electron-builder`, `electron-serve` (for loading built assets over a real URL instead of `file://`, which keeps `fetch('/api/...')` working after we rewrite it to an absolute loopback URL — see step 4).
2. **Vite config**: set `base: './'` so built assets load correctly when served locally by Electron.
3. **Main process** (`electron/main.cjs`):
   - On `app.whenReady()`: pick a free port with `net.createServer().listen(0)`, set `process.env.PORT` and `process.env.ELECTRON_RESOURCES` (pointing at `process.resourcesPath` in production, repo root in dev), then `require('./server-entry.cjs')` to start Express in-process (single instance, no child process, clean shutdown on `app.quit`).
   - Create one `BrowserWindow` (1100×760, min 900×600, `contextIsolation: true`, `nodeIntegration: false`).
   - In production, load `file://.../dist/index.html`; in dev (env `ELECTRON_DEV=1`), load `http://localhost:8080`.
   - Expose the chosen port to the renderer via a tiny preload that sets `window.__API_BASE__ = 'http://127.0.0.1:<port>'`.
   - Handle `window-all-closed` → `app.quit()`; `before-quit` → close Express server; guard against duplicate instances with `app.requestSingleInstanceLock()`.
4. **Server entry for Electron** (`electron/server-entry.cjs`): compiles `server/index.ts` on the fly. Since we can't ship `tsx` cleanly, we'll pre-bundle `server/index.ts` into `electron/dist/server.cjs` with `esbuild` (already a transitive dep of Vite) during the build step. The entry just `require`s that bundle. The bundled server reads `ELECTRON_RESOURCES` and looks for `yt-dlp` / `ffmpeg` binaries there first.
5. **Binary resolution update** (`server/index.ts`): extend `resolveYtDlp()` and the ffmpeg path check to prefer `path.join(process.env.ELECTRON_RESOURCES ?? '', 'bin', ytDlpName)` before falling back to the current bundled/PATH logic. Same for `ffmpeg-static` — copy the resolved binary into `resources/bin/` at package time and prefer that path at runtime. No endpoint or behavior changes.
6. **Front-end API base** (`src/hooks/useClipper.ts` + any other `fetch('/api/...')` sites): replace with a `apiUrl(path)` helper that returns `${window.__API_BASE__ ?? ''}${path}`. In browser dev mode `__API_BASE__` is undefined and Vite's `/api` proxy handles it (unchanged). In Electron it points to the chosen loopback port.
7. **Preload** (`electron/preload.cjs`): `contextBridge`-safe injection of `window.__API_BASE__` from a URL query param the main process appends when loading the window.
8. **Bundle binaries at build time** (`scripts/bundle-binaries.cjs`): copies `ffmpeg-static`'s resolved binary and the `youtube-dl-exec` bundled `yt-dlp` into `resources/bin/{platform}/` for the target platform. Runs before `electron-builder`.
9. **electron-builder config** (in `package.json` under `"build"`):
   - `appId: app.youtubeclipper.local`, `productName: "YouTube Clipper"`.
   - `files`: `dist/**`, `electron/**`, `resources/**`, minimal `node_modules` (only what the bundled server needs — most is inlined by esbuild).
   - `extraResources`: `resources/bin/${os}` → `bin/`.
   - macOS: `target: dmg`, `category: public.app-category.utilities`, `identity: null` (explicitly unsigned, no cert required).
   - Windows: `target: nsis`, `sign: null`.
   - Icons: placeholder `build/icon.png` / `.icns` / `.ico` (generated from a simple asset).
10. **Scripts** (`package.json`):
    - `dev`: unchanged (browser workflow preserved).
    - `dev:electron`: `ELECTRON_DEV=1 concurrently "npm:dev" "wait-on http://localhost:8080 && electron electron/main.cjs"`.
    - `build:electron`: `vite build && node scripts/bundle-binaries.cjs && node scripts/build-server.cjs`.
    - `dist:mac`: `npm run build:electron && electron-builder --mac dmg`.
    - `dist:win`: `npm run build:electron && electron-builder --win nsis`.
    - Remove `postinstall` yt-dlp check from Electron flow (still runs for `npm install` dev users; harmless).
11. **Docs**: short `docs/DESKTOP.md` with build commands and the one-time "unidentified developer" instructions (macOS right-click → Open; Windows SmartScreen → More info → Run anyway). Note code-signing is optional and not required.
12. **Verify**: launch dev-electron locally, then `dist:mac` / `dist:win`. Confirm single backend process (activity monitor / task manager), clean quit, all features work, binaries resolve from `resources/bin/`.

## Implementation — files

**New:**
- `electron/main.cjs` — Electron main process, single-instance lock, in-process Express, clean shutdown.
- `electron/preload.cjs` — injects `window.__API_BASE__`.
- `electron/server-entry.cjs` — thin loader for the built server bundle.
- `scripts/bundle-binaries.cjs` — copies `ffmpeg` + `yt-dlp` into `resources/bin/<platform>/`.
- `scripts/build-server.cjs` — esbuild bundle of `server/index.ts` → `electron/dist/server.cjs`.
- `build/icon.png` (+ generated `.icns` / `.ico`) — app icon placeholder.
- `docs/DESKTOP.md` — build + "open anyway" instructions.

**Modified:**
- `package.json` — add electron deps, `build` block for electron-builder, new scripts.
- `vite.config.ts` — `base: './'`.
- `server/index.ts` — prefer `ELECTRON_RESOURCES/bin/*` for yt-dlp and ffmpeg, keep existing fallbacks.
- `src/hooks/useClipper.ts` (and any sibling `fetch` sites) — route through `apiUrl()` helper.
- `src/lib/clip.ts` — export `apiUrl()` helper.

**Unchanged:** all UI components, `ClipperContext`, backend endpoints, Zod schemas, 10-minute cap, transcript logic, size estimator.

## Technical notes

- **Why in-process Express, not a child**: simplest lifecycle, guaranteed single instance, no orphan risk. Electron main is Node — Express runs happily there.
- **Why esbuild-bundle the server**: avoids shipping `tsx` / `typescript` to end users and keeps the packaged app slim. `youtube-dl-exec`, `ffmpeg-static`, `express`, `cors`, `zod` are all pure JS / native-binary refs and bundle cleanly (binaries kept external via `extraResources`).
- **Port selection**: `net.createServer().listen(0)` → read `.address().port` → pass to Express — eliminates `EADDRINUSE`.
- **`file://` gotcha**: setting `base: './'` in Vite is required or the packaged window renders blank.
- **Unsigned OK**: `identity: null` on mac + no `sign` on win keeps builds free. Users see the standard OS warning once.
- **Sandbox limitation**: this environment can't produce a real `.dmg` (needs `hdiutil` on macOS) or run the packaged app end-to-end. The build will succeed for Linux/Windows in-sandbox; macOS `.dmg` and full launch verification must be done on the user's own machines. This will be flagged in the verification section after implementation.
