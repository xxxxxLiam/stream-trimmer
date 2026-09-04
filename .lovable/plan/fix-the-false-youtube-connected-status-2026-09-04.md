# Fix the false “YouTube connected” status

## Confirmed problem

The green **YouTube connected** chip is currently a false positive. The desktop
app declares success as soon as it finds any of three Google cookie names and
writes them to a file. It never asks YouTube whether those cookies represent a
valid signed-in account. The automatic one-minute recheck repeats that same
local cookie-existence check, so expired or rejected cookies continue to appear
connected.

That explains why the app can say connected while the download behaves as if it
is signed out and only receives 360p.

## Plan

1. Validate the connection with YouTube
   - After the sign-in window finds cookies, send the generated cookie file to the
     existing local download engine for a real YouTube account-session check.
   - Only show **YouTube connected** when that check confirms the account cookies
     are accepted—not merely present.
   - Keep cookie contents local and never return or log them.

2. Keep the sign-in window open until connection is real
   - Do not close the window immediately when a cookie name appears.
   - Show a short **Verifying YouTube…** state, close the window only after the
     real check succeeds, then turn the chip green.
   - If verification fails, keep the connection modal open with one clear retry
     action instead of reporting success.

3. Make automatic rechecks meaningful
   - Replace the current local cookie-existence recheck with the same real
     YouTube validation.
   - If YouTube rejects the session later, immediately clear the green status and
     reopen the Connect YouTube modal.

4. Prevent signed-out downloads
   - Before a 1080p+ download, validate the current YouTube session once more.
   - If invalid, stop and reopen the connection prompt rather than silently
     downloading a 360p signed-out file.
   - Do not fall back from rejected app cookies to a signed-out request.

5. Verify the complete flow
   - Check: sign in → verification succeeds → green chip appears → 1080p request
     uses the verified cookie file.
   - Check expired/cleared cookies: chip switches to disconnected, modal reopens,
     and no misleading low-quality download is saved.

## Technical notes

- `electron/youtubeSession.cjs`: `probe()` and `openLoginWindow()` currently call
  `hasAuth()`, which only tests for `SID`, `__Secure-3PSID`, or
  `__Secure-1PSID`. Keep this as a fast preliminary signal, not proof of a
  connection.
- `server/index.ts`: extend `/api/auth/youtube/status` to accept the validated
  app-managed cookie-file path as an alternative to `browser`, then run yt-dlp's
  auth probe with `--cookies`. Reuse the existing sanitized status classifier
  and path safety checks.
- `src/lib/youtubeConnection.ts`: after `youtubeConnect()`/`youtubeProbe()`, call
  the server validation before setting `connected: true`; revalidation must also
  cover browser-mode sessions rather than returning early.
- `server/index.ts` `/api/download`: remove the current app-cookie failure path
  that falls through to no cookies. Return an authentication-required response
  so the client invalidates connection state and opens the modal.
- `src/hooks/useClipper.ts`: recognize that authentication response, mark the
  shared YouTube connection disconnected, and do not save the downgraded file.
