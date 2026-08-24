# Fix YouTube browser-session detection

## Confirmed diagnosis

There is no sign-in “receiver” in the current flow. Electron opens YouTube with `shell.openExternal`, while the app independently polls yt-dlp against every supported browser’s local cookie store. YouTube never redirects back to the app and does not notify it when sign-in finishes.

The current probe is also fragile:
- It treats extraction of the private Watch Later playlist as the authentication test, so YouTube extractor changes and unrelated playlist errors can look like “not signed in.”
- Every check probes six browsers in parallel, each with a 20-second timeout; the UI can therefore remain on “Checking” for a long time and repeat expensive probes for two minutes.
- The timeout rejects the wrapper promise but does not terminate the underlying yt-dlp process.
- Chromium-family cookie stores may be locked or undecryptable while the browser remains open, particularly with newer Chrome security and macOS cookie encryption. Being visibly signed in in Chrome therefore does not guarantee yt-dlp can reuse that session.
- The UI suppresses transient backend details while polling, then replaces them with a generic failure, hiding the actual reason.

## Changes

### 1. Replace the misleading redirect-and-poll loop
- Keep the compact one-row UI.
- Change the action to a short two-step flow: **Open YouTube** followed by **Check session** when the user returns.
- Stop claiming the app is waiting for a redirect or continuously “receiving” sign-in.
- Remove the two-minute polling loop so the app performs one deliberate, bounded check and immediately reports its result.

### 2. Check one explicit browser session
- Add a compact browser selector/menu beside the sign-in action and remember the choice locally.
- Open YouTube in the system browser, but clearly identify which browser session the app will inspect; do not scan unrelated browsers.
- Keep Firefox as the recommended fallback when Chromium cookie access is blocked.

### 3. Make the backend probe accurate and cancellable
- Replace the Watch Later success heuristic with a dedicated yt-dlp process that captures diagnostic output and verifies that YouTube account cookies were actually found, without logging or returning cookie values.
- Spawn the probe directly, enforce one short timeout, and terminate the child process on timeout or client disconnect.
- Classify outcomes separately: signed in, signed out/no account cookies, browser profile not found, browser still open/locked, cookie decryption blocked, timeout, and YouTube/extractor error.
- Return only the browser name, status, and sanitized explanation.

### 4. Surface actionable status in the compact row
- Show the real failure instead of the generic “No sign-in detected” message.
- For locked Chromium sessions, ask the user to fully quit that browser and retry.
- For decryption restrictions, recommend Firefox rather than repeatedly asking the user to sign in again.
- On success, select that browser, enable browser-cookie downloads automatically, and keep the existing concise success state.

### 5. Verification
- Add focused tests for probe classification, timeout cleanup, and frontend state transitions.
- Verify signed-in, signed-out, missing-profile, locked-browser, and timeout paths.
- Confirm no cookie values appear in API responses or logs and that normal anonymous downloads remain unchanged.

## Technical files
- `server/index.ts`: replace multi-browser Watch Later polling with a single-browser, cancellable account-cookie probe and structured error mapping.
- `src/hooks/useClipper.ts`: remove repeated polling; model open/check/success/failure states and remember the selected browser.
- `src/components/FormatQualityFields.tsx`: retain the compact row while adding the browser menu and truthful actions/messages.
- `src/lib/clip.ts` and context typings: refine probe response/status types.
- Add focused test files following the existing TypeScript conventions.
