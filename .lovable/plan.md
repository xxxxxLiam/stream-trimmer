# Fix: the app closes when connecting to YouTube

## What I can confirm from the code

- The desktop app has **no crash logging at all**: nothing listens for a main-process
  error, a window crash, or a failed child process. So when the sign-in step dies, it
  disappears silently with no clue left behind. That is the first thing to fix.
- The sign-in window is created as a **child of the main window** and, while it is open,
  a repeating 1.5-second timer keeps poking it (reading cookies, renaming its title,
  calling the local verification step). Several of those pokes can run **after** the
  window has been closed, and one of them (renaming the title) is not protected.
- The verification call the sign-in step makes has **no time limit** and its failure is
  not fully handled, so a hung check can leave the sign-in flow stuck forever.

I have not yet proven which of these ends the app, so step 1 is to capture the actual
failure instead of guessing.

## Plan

1. Record what actually happens
   - Log every unexpected error, window crash, and unresponsive-window event to a small
     local log file in the app's own data folder, with the moment it happened.
   - Add a short trace around the connect step: window opened, cookies found, verifying,
     verified, closed.
   - No cookie values, tokens or personal data are ever written to that log.

2. Make the sign-in window safe to close at any time
   - Stop the repeating check the instant the window goes away, and skip any step that
     touches a window that no longer exists.
   - Let the verification finish or be abandoned cleanly instead of touching a closed
     window.

3. Put a limit on verification
   - Give the "Verifying YouTube…" step a hard time limit (about 20 seconds).
   - On timeout, keep the sign-in window open and show a single clear retry, rather than
     hanging or dropping out.

4. Never let a sign-in problem take the app down
   - Wrap the whole connect action so any failure returns a normal "couldn't connect"
     result to the connection pop-up.
   - The pop-up shows the reason and a retry button; the main window stays open.

5. Verify
   - Open the connection pop-up, click Connect, then close the sign-in window mid-way —
     the app must stay open and show a retry.
   - Repeat with the verification made to fail and to time out.
   - Then run the normal happy path and confirm the green connected state still appears
     only after a real check.
   - Read the new log file to confirm the original crash cause is captured, and fix it
     directly if it turns out to be something else.

## Technical notes

- `electron/main.cjs`: register `process.on("uncaughtException")`,
  `process.on("unhandledRejection")`, `app.on("render-process-gone")`,
  `app.on("child-process-gone")`, and per-window `unresponsive`; append to
  `path.join(app.getPath("userData"), "logs", "main.log")` with rotation at ~1MB.
- `electron/youtubeSession.cjs`: guard `win.setTitle` and every post-await step with
  `win.isDestroyed()`; clear the interval in the `closed` handler before `finish(false)`;
  set `destroyed = true` so an in-flight `validate` result is discarded.
- `electron/main.cjs` `youtube:connect` validate callback: pass `AbortSignal.timeout(20000)`
  to `fetch`, and return `false` on abort/network error instead of throwing.
- Keep the existing verification contract (`/api/auth/youtube/status` with `cookieFile`)
  and the current renderer store logic unchanged.
