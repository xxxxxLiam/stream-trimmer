# One button, no options

You're right — the modal currently shows a link because the in-app sign-in button
only exists in the installed desktop app. In the web preview there is no Electron
window to log into, so all that's left is the fallback, hidden behind a disclosure
link. That's backwards.

## What the modal becomes

A single primary button: **Connect YouTube**. Nothing else — no browser picker,
no "Open YouTube", no "Check session", no disclosure link, no "Not now".

Clicking it does the right thing for wherever the app is running:

- **Desktop app**: opens the YouTube sign-in window inside the app, watches it,
  closes it the moment you're signed in, and flips the chip to connected.
- **If that finds nothing** (or the app is running in a browser): it silently
  falls back to reading an already-signed-in session from your installed
  browsers — trying each one in turn — and connects with the first one that
  works. No selection, no second click.

While it works, the button shows a spinner with a one-line status ("Opening
sign-in…", "Checking your browsers…"). If every path fails, the button returns
with a single plain-language line explaining what to do (for example, fully quit
Chrome so its cookie store can be read) and stays clickable to retry.

The auto-reconnect behaviour from the last change stays: the app re-checks on a
timer and on window focus, and reopens this modal by itself if YouTube signs you
out.

## Technical notes

- `src/components/YouTubeConnectModal.tsx`: delete `showFallback` state, the
  browser `<select>`, the "Open YouTube" / "Check session" buttons, and the
  fallback section. Render one `btn-primary` plus `state.message`, driven by a
  new `connect()` action and a `state.step` label.
- `src/lib/youtubeConnection.ts`: add `connect()` orchestrating the sequence —
  `connectInApp()` when `window.electronAPI.youtubeConnect` exists, then
  `checkBrowserSession()` iterated across the `BROWSERS` allowlist, stopping at
  the first `signed_in`; sets `mode: "browser"` and persists the winning browser
  via the existing `clipper.cookieBrowser` setting. Add a `step` field to
  `YouTubeConnectionState` for the progress line, and collapse per-browser
  failures into one actionable message rather than six.
- `setBrowser` / `openExternalSignIn` / `checkBrowserSession` stay exported (the
  probe endpoint and settings key are unchanged) but are no longer rendered in
  any UI.
- No backend changes: `/api/auth/youtube/status` and the `cookieFile` /
  `cookiesFromBrowser` payloads stay exactly as they are.
