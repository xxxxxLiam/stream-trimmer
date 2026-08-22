# Guided YouTube sign-in with automatic detection

## Goal
Replace the passive "Sign in via my browser" checkbox with a guided flow: click **Sign in to YouTube** → your browser opens to YouTube's sign-in page → the app automatically recognizes when sign-in succeeds and starts using the session for higher-quality downloads. 100% free — no OAuth app, no Google Cloud project, no third-party service. Everything stays local.

## Why this approach (free constraint)
A real OAuth redirect flow does not work for this app's purpose, even setting cost aside: YouTube's official API never exposes downloadable media streams, and yt-dlp cannot use OAuth tokens for downloads. The only free, working authentication path is reusing the browser's logged-in session via yt-dlp's `--cookies-from-browser` — which the app already does. This task makes that path guided and self-confirming instead of manual and silent.

## Changes

### 1. Server: sign-in status probe — `server/index.ts`
- New route `POST /api/auth/youtube/status` with body `{ browser }` (same `CookieBrowser` allowlist as `downloadSchema`).
- Runs yt-dlp with `--cookies-from-browser <browser> --skip-download --simulate` against `https://www.youtube.com/playlist?list=WL` (Watch Later requires sign-in; logged out, YouTube returns a sign-in error page). Hard timeout ~20s per probe.
- Response mapping:
  - exit 0 → `{ status: "signed_in" }`
  - stderr matches "sign in" / "Sign in" → `{ status: "signed_out" }`
  - `isCookieError(e)` → `{ status: "unreadable", message: cookieErrorMessage(browser) }` (browser locked/unsupported profile)
  - anything else → `{ status: "unknown", message }`
- No cookie values are ever logged or returned — only the browser name crosses the API, as today.
- Guard with `binariesOk` like the other routes.

### 2. Electron: open the sign-in page — `electron/main.cjs`, `electron/preload.cjs`, `src/vite-env.d.ts`
- New IPC handler `shell:openYouTubeSignIn` calling `shell.openExternal("https://www.youtube.com/signin")` (YouTube redirects to Google sign-in).
- Preload exposes `openYouTubeSignIn()` on `window.electronAPI`; type added to `ElectronAPI`.
- Browser/dev fallback: `window.open(url, "_blank")` (works there too since the server is still local).

### 3. Front-end: guided sign-in UI — `src/hooks/useClipper.ts`, `src/components/FormatQualityFields.tsx`
- New state: `ytAuth: { status: "idle" | "checking" | "signed_in" | "signed_out" | "unreadable" | "unknown", message?: string }`.
- `beginYouTubeSignIn()`: opens the sign-in page (IPC or `window.open`), then polls `POST /api/auth/youtube/status` every 3s for up to 2 minutes. Stops on `signed_in`/`unreadable`, timeout, or unmount.
- On `signed_in`: automatically enable `useBrowserCookies` so subsequent downloads reuse the session, and show a success pill: "Signed in via Chrome — higher quality enabled".
- On `unreadable`: show the existing clear message ("Couldn't read Chrome's cookies — fully quit the browser and retry"), with a **Retry check** button.
- The manual checkbox + browser picker stay as a fallback underneath; the picker drives which browser the probe checks.
- Copy note: Firefox is the most reliable cookie source; Chrome on Windows can block cookie reads entirely (app-bound encryption) — the `unreadable` state surfaces this instead of failing silently at download time.

### 4. Small type additions — `src/lib/clip.ts`
- `YouTubeAuthStatus` response type for the new endpoint.

## Out of scope / unchanged
- Download pipeline, format chain, quality reporting — untouched; `cookiesFromBrowser` payload unchanged.
- No accounts, tokens, or keys stored anywhere. No network calls beyond the existing loopback server and YouTube itself.

## Verification
- `npx tsgo --noEmit` for types.
- Manual: click Sign in → browser opens → sign in to YouTube → pill flips to "Signed in" within a few seconds; run a 1080p download and confirm the delivered-resolution header shows the higher tier where available.
- Signed-out and browser-locked paths show their respective states and never break the standard anonymous download path.
