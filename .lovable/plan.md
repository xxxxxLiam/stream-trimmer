# Make the YouTube sign-in stick, and stop losing saved folders

Two separate problems. One of them I found a concrete bug for; the other has a
likely cause plus a design that removes the fragility entirely.

## Problem 1 — Saved folders (and your browser choice) vanish on restart

This is a real, confirmed bug in the app's startup order.

Settings live in a `settings.json` file inside the app's data folder. On launch
the app does, in this order:

```text
1. start the engine
2. create the window   <-- the page immediately asks for the saved settings
3. load settings.json  <-- too late
4. register the settings handlers  <-- much too late
```

The page asks for your saved settings during step 2, but nothing is listening
yet and nothing has been read from disk, so it always starts with **no saved
folders, no folder names, and no remembered browser**. The moment you then add
or change a folder, that empty list is written back over the good one — which
is why the folders are gone for good after a restart.

**Fix:** load `settings.json` and register the settings handlers *before* the
window is created, i.e. reorder startup to `loadSettings() → registerIpc() →
startBackend() → createWindow()`. Also make writes merge into the file on disk
rather than overwrite the in-memory copy blindly, and write the file
atomically (temp file + rename) so a quit mid-write can't truncate it.

This alone restores saved folders, custom folder names, download history, the
channel passcode, and the remembered browser.

## Problem 2 — "Connect YouTube" fails even though you are signed in

### Why it broke

The app currently verifies your session by asking yt-dlp to read cookies
**directly out of your browser's cookie database** (`--cookies-from-browser
chrome`). That method has become unreliable, and the most likely reason it
"worked before and stopped" is that Chrome now encrypts its cookie store with
App-Bound Encryption — yt-dlp can no longer decrypt it on a normal desktop
profile, and a running Chrome also locks the database. Nothing changed on your
side; the browser did.

It is also inherently fragile: it depends on which browser, which profile,
whether the browser is open, and OS keychain permissions. There is no way to
make that path guaranteed.

Before building, the first step is to confirm this: surface the raw yt-dlp
error text from a failed check into the app (currently it is replaced with a
friendly sentence), run one check, and read the actual reason. The rest of the
plan holds either way, but this tells us exactly what your machine is hitting.

### The guaranteed method

Stop reading the browser's cookie jar. Sign in **once inside the app**, in its
own private window, and keep that session in the app forever.

The app already contains this code (`electron/youtubeSession.cjs`) from an
earlier version — it opens a real Google/YouTube login window in an isolated,
persistent app session and writes the resulting cookies to a `yt-cookies.txt`
file in the app's data folder. yt-dlp then runs with `--cookies <that file>`,
which is the most reliable path yt-dlp offers.

Why this is durable:

- The session lives in the app's own storage, so closing or updating Chrome
  cannot affect it.
- Google sessions last months; the cookie file is refreshed automatically from
  the app's session on every launch and after every download, so it keeps
  rolling forward and effectively never expires.
- You sign in once. On later launches the app verifies silently and opens
  straight into the main UI — no prompt, no button.

### New connection flow

```text
launch
  └─ cookie file present? ── yes ─▶ verify quietly against YouTube
  │                                   └─ ok ─▶ app opens, chip = Connected
  │                                   └─ no ─▶ show Connect screen
  └─ no ──────────────────────────▶ show Connect screen

Connect screen: one button, "Sign in to YouTube"
  └─ opens the in-app sign-in window
  └─ detects sign-in, verifies it for real against YouTube
  └─ closes itself, app unlocks. Never asked again.
```

- **No browser dropdown, no "Open YouTube then come back and check"** — those
  disappear, along with the whole browser-cookie path as the primary route.
- **"Use my browser session instead"** stays as a small secondary link on the
  Connect screen, for anyone the in-app window doesn't suit. It keeps the
  browser dropdown behind it. It is a fallback, not the main road.
- **"Sign out of YouTube"** is added to the status chip menu so the stored
  session can be cleared deliberately.
- The periodic re-checking you disliked stays off. Verification happens on
  launch and only when a download is actually rejected for auth — never on a
  timer.

## Files and responsibilities

| File | Change |
| --- | --- |
| `electron/main.cjs` | Reorder startup (settings + IPC before window); atomic, merging settings writes; re-register `youtube:connect` / `youtube:probe` / `youtube:disconnect` IPC |
| `electron/youtubeSession.cjs` | Already present; refresh the cookie file on launch and after each download so the session rolls forward |
| `electron/preload.cjs` | Re-expose `youtubeConnect`, `youtubeProbe`, `youtubeDisconnect` |
| `src/vite-env.d.ts` | Type declarations for those three |
| `src/lib/youtubeConnection.ts` | Cookie-file session becomes the primary path; browser-cookie check demoted to fallback; remembered connection state persisted; no timer-based re-checks |
| `src/components/YouTubeConnectModal.tsx` | Single "Sign in to YouTube" button; failure shows the real yt-dlp reason; secondary "use my browser session" disclosure with the dropdown |
| `src/components/YouTubeStatusChip.tsx` | Adds a "Sign out of YouTube" action |
| `server/index.ts` | Prefer the app cookie file over browser cookies; return the raw failure reason on a rejected check |

## Edge cases

- **Sign-in window closed early** — Connect screen stays, no false "connected".
- **Cookie file present but rejected by YouTube** — treated as signed out, one
  prompt to sign in again, with the real reason shown.
- **Session actually expires** — the next download returns an auth error and
  the Connect screen reappears once. This is the only time you'd sign in again.
- **Non-desktop / browser preview** — falls back to the browser-cookie check,
  since there is no in-app window there.
- **Cookie file contents** never reach the page; only a boolean and a path.

## Order of work

1. Startup-order and atomic-write fix for settings — verify folders, names and
   history survive a restart.
2. Surface the raw yt-dlp reason on a failed check; run one check and confirm
   the Chrome decryption diagnosis.
3. Re-wire the in-app sign-in window end to end (main, preload, types, client).
4. Backend prefers the cookie file; refresh it on launch and after downloads.
5. Connect screen and status chip rework, browser path demoted to a fallback.
6. Tests: settings survive a simulated relaunch, cookie-file-first selection,
   expired-session re-prompt fires exactly once.

The multi-language / auto-dub audio track feature you asked about earlier is
parked and will be picked up after this.
