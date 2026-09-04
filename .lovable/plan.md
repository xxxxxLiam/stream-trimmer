# Move YouTube connection out of the main UI (and make it one click)

## What changes for you

**No more sign-in row inside the Clip tab.** The compact browser/session row currently sitting under Format and Quality is removed. Its place is taken by a small status chip in the top bar: a green "YouTube connected" dot, or an amber "Not connected" chip you can click at any time.

**The app checks on its own.** On launch (and once per session afterwards) the app silently probes whether it can read a signed-in YouTube session. You never press "Check status" for it to notice.

**A prompt appears when you're not connected.** If the probe comes back negative, a modal explains in one line that connecting unlocks 1080p+ downloads, with a single primary button: **Connect YouTube**. Options are "Connect", "Not now" (dismissed for this launch), and "Don't ask again" (remembered).

**One button, no round trip.** Clicking Connect opens a real YouTube sign-in window *inside the app*. You log in as you normally would; the moment the app sees a valid session it closes the window itself and flips the chip to connected. No switching to your browser, no coming back, no "Check status".

**Downloads use it automatically** once connected, exactly as they do today.

## Recommended connection method

Today the app reads cookies out of your *external* browser (`yt-dlp --cookies-from-browser`). That works but it is why the flow is clunky: it depends on which browser you used, and Chrome locks its cookie database while running, hence the manual re-check.

The better free, fully local option — no Firebase, no Google Cloud project, no OAuth app, no external service — is to do the login **in the desktop app itself**:

- The app opens an Electron window pointed at YouTube's sign-in page, in its own isolated, persistent session.
- After you log in, the app reads that window's own cookies (it owns them, so nothing is locked or encrypted-away) and writes a standard `cookies.txt` into the app's private data folder.
- `yt-dlp` is then given `--cookies <that file>` instead of `--cookies-from-browser`.
- The session persists across app restarts, so this is a one-time action.

This is strictly better than the current approach: one click, no browser choice, no locked-database errors, no manual re-check. Google OAuth is *not* a viable alternative here — YouTube's Data API does not grant download access, and it would require a verified Google Cloud project, so it would be more setup for less capability.

The existing browser-cookie path stays as a fallback (surfaced inside the modal under "Use my browser's session instead") so nothing you rely on today disappears, and so the browser build still has an option.

## Technical notes

- **New Electron main-process module** `electron/youtubeSession.cjs`:
  - `openLoginWindow()` — `BrowserWindow` with `session.fromPartition("persist:youtube")`, loading the YouTube sign-in URL. Polls that session's cookies for the auth cookies (`SID`/`__Secure-3PSID`) on `did-navigate` / an interval; on detection, writes cookies and closes the window.
  - `exportCookieFile()` — serialises `session.cookies.get({})` for `.youtube.com`/`.google.com` into Netscape `cookies.txt` at `app.getPath("userData")/yt-cookies.txt`, mode `0600`.
  - `probe()` — returns `{ connected, path }` based on presence of the auth cookies (no network call needed for the fast path).
  - `clear()` — clears the partition and deletes the file.
  - IPC: `youtube:connect`, `youtube:probe`, `youtube:disconnect`; exposed on `electronAPI` in `electron/preload.cjs` and typed in `src/vite-env.d.ts`. Cookie *values* are never returned to the renderer or logged — only booleans and the file path.
- **Backend** (`server/index.ts`): the clip/info/export request bodies accept `cookieFile` alongside the existing `cookieBrowser`; when present, yt-dlp gets `--cookies <file>` and the browser flag is skipped. Path is validated to live inside the app's userData dir. `server/youtubeAuth.ts` classification is unchanged and still used for the browser fallback.
- **Renderer state** moves out of `FormatQualityFields.tsx` into `useClipper`:
  - `ytAuth` gains `mode: "app" | "browser"`; new `connectYouTube()` (Electron path) and existing `checkYouTubeAuth()` (browser fallback).
  - A mount effect runs the silent probe once per tab-independent app session (guarded by a module-level flag in `src/lib/persist.ts`-backed state so multiple workspace tabs don't each probe).
  - `clipper.ytPromptDismissed` persisted via the existing settings layer for "Don't ask again".
- **New components**: `src/components/YouTubeConnectModal.tsx` (the prompt + connect flow + browser fallback section) and `src/components/YouTubeStatusChip.tsx` (top-bar chip, opens the modal on click). `YouTubeSignInRow` is deleted from `FormatQualityFields.tsx`, leaving just Format and Quality there.
- The chip lives in the mode bar next to `UpdateStatus`, and the modal renders once at the app shell level (not per workspace tab), since the connection is shared across tabs.
- Browser (non-Electron) build: the chip and modal show only the existing browser-cookie flow; the in-app login button is hidden.
