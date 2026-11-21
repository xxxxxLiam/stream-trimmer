# Area A — Onboarding and sign-in

Everything below was produced by driving the real Electron app through the
harness (`audit/harness/app.cjs`) under `xvfb-run`, with the scriptable yt-dlp
stub as `cwd`. Scripts live in `audit/run-1/area-A/`, screenshots and captured
output in `audit/out/area-A/`. No product file was changed.

**Harness substitution, disclosed:** Electron's `dialog.showOpenDialog` is a
native modal the driver cannot click, so the picker tests replace *Electron's
dialog* (not product code) with one that resolves to a chosen path
(`audit/run-1/area-A/lib.cjs: stubPicker`). Everything downstream — the
`youtube:importCookies` handler, `importCookieFile`, validation, the atomic
commit and the UI — runs for real.

**Stub realism:** `app:` and `browser:` blocks in `stub.json` let an imported
session and a browser sweep answer differently in one run
(`audit/run-1/area-A/mkstub.cjs`). Failure strings are real yt-dlp output
(`Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies
for the authentication…`, `Sign in to confirm your age`, the
`[debug] Found YouTube account cookies` line the classifier keys on).

Findings: **1 blocker, 5 major, 8 minor, 1 polish**.

---

### A-1  The connect modal is an undismissable gate: a user with no cookies.txt cannot reach the app at all

- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. Cold start a fresh install with no `yt-cookies.txt` in userData
     (`xvfb-run -a node audit/run-1/area-A/01-cold-boot.cjs`).
  2. Let the automatic browser sweep finish and fail (it does on any machine
     with no signed-in browser profile).
  3. Try to leave the modal: look for a close/skip control, press `Escape`,
     click the URL field, click the Help button.
- **Expected**: a way out. The product is built for unsigned use — its own
  copy says "Without a sign-in YouTube gives 360p", `SETUP_FIRST_LINE` says
  "Setup is optional. You can paste a link and cut a clip right now with
  nothing set", and the engine proves it: with no session on disk
  `POST /api/info` returns 200 with full metadata and `POST /api/download` at
  `quality: "360"` returns 200 with a real MP4 body (only `best`/>360 returns
  `YOUTUBE_AUTH_REQUIRED`). A user who cannot produce a cookies.txt should
  still be able to cut 360p clips.
- **Actual**: `YouTubeConnectModal` has no close, skip, "not now" or "continue
  without" control, takes no `onClose`, and is mounted purely from derived
  state — `App.tsx:467` renders it whenever `!connection.connected`. `Escape`
  is not handled (pressed twice, modal still open). It is `fixed inset-0
  z-50`, so `document.elementFromPoint` over the URL field returns the
  overlay and `page.click("header input")` times out. The whole product is
  unreachable for anyone who cannot produce a valid signed-in cookies.txt.
  The only crack is a keyboard one, which is itself a bug (A-10): focus is not
  trapped, so `Tab` reaches the covered Help button and `Enter` opens the help
  drawer *behind* the overlay.
- **Proof**:
  - `audit/out/area-A/captured/01-cold-boot.txt` — `AFTER ESC modalOpen = true`;
    modal button list contains only Choose cookies.txt / Check browsers again /
    Pick a browser / Diagnostics.
  - `audit/out/area-A/A-01/01-cold-boot.png`, `audit/out/area-A/A-01/02-after-escape.png`
  - `audit/out/area-A/captured/11-unsigned-usable.txt` — 360p download returns
    200 with MP4 bytes while signed out.
  - `audit/out/area-A/captured/02-happy-path.txt` (run of `02-happy-path.cjs`) —
    `CLICK URL FIELD -> BLOCKED: TimeoutError`.
  - Scripts: `audit/run-1/area-A/01-cold-boot.cjs`, `11-unsigned-usable.cjs`,
    `10-focus-escape.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx` (no dismissal
  path), `src/App.tsx:467` (open condition)

---

### A-2  A cookies.txt imported while the automatic sweep is running is thrown away when the sweep finishes

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start a fresh install. The modal opens and the automatic sweep
     starts ("Checking chrome…", "Checking safari…", …).
  2. While it is still checking, drop a valid signed-in `cookies.txt` on the
     window — the only import route available at that moment, because the
     picker button is replaced by a disabled "Checking…" while `state.busy`.
  3. Watch the modal close and the chip read "Signed in".
  4. Wait for the sweep to work through all six browsers.
- **Expected**: a successful import ends the sign-in flow. A sweep that was
  already in flight must not overwrite a later, better result.
- **Actual**: the import succeeds, the modal closes and the chip reads
  "Signed in" for ~15 s; then `sweepBrowsers` reaches the end of its loop and
  calls `set({ connected: false, message: "None of your browsers would hand
  over a YouTube session." })`. The blocking modal reopens, the chip reverts to
  "Not signed in", and the user is shown a failure for a sign-in that worked —
  while the valid cookie file is still on disk and `clipper.authSource` is
  still `"app"`. There is no cancellation token or generation check on the
  sweep. Recoverable only by importing again or restarting.
- **Proof**: `audit/out/area-A/captured/06-races.txt` section (a) —
  `t+1s … chip":"Signed in"` through `t+8s`, then
  `END OF SWEEP: {"modal":true,…,"alert":"None of your browsers would hand over
  a YouTube session.","chip":"Not signed in"}` with
  `cookie file still on disk: true` and `store: "app"`.
  Screenshots `audit/out/area-A/A-06-a/02-after-drop-during-sweep.png` (signed
  in) and `audit/out/area-A/A-06-a/03-sweep-finished.png` (locked out again).
  Script: `audit/run-1/area-A/06-races.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts` (`sweepBrowsers`, final
  `set(...)`; no guard against a newer `markConnected`)

---

### A-3  An already-expired cookies.txt imports as a success and the app reports "Signed in"

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Start the app with no session, so the connect modal is open.
  2. Press "Choose cookies.txt" and pick a Netscape file whose `SID` row has
     `expires = 1000000000` (September 2001).
  3. Read the modal, the status chip and the setup checklist.
- **Expected**: the import is refused, or accepted with a plain warning that
  this file has already expired and a fresh export is needed. The app has the
  information: `readCookieFileState` computes `expired: true` from the file
  itself and `youtube:probe` returns `{connected:false, expired:true}`.
- **Actual**: `validateCookieText` deliberately ignores expiry, so the import
  returns `ok:true`; `verifyImported` then reads the expiry (`expired: true`),
  immediately throws it away by running the yt-dlp probe, and on a
  `signed_in` verdict calls `markConnected("app")`, which sets
  `expired: false` and closes the modal. `clipper.authSource: "app"` is
  persisted and `cookiePayload()` will hand the dead file to every download.
  At the same moment the status chip — which uses `deriveSessionStatus` and
  does look at `expiresAt` — reads "Sign-in expired", and the setup
  checklist's "Sign in to YouTube" row stays unticked. Two parts of the UI
  state opposite things about the same file, and the gate (`connected`) picks
  the wrong one.
- **Proof**: `audit/out/area-A/captured/04-expired.txt` section (b) —
  `modal still open: false`, `chip: Sign-in expired`,
  `store: …"clipper.authSource":"app"`. Screenshot
  `audit/out/area-A/A-04/02-b-imported-expired.png`. The accepted-with-expiry
  row is also in `audit/out/area-A/A-03/matrix.json`
  (`"expires in the past" … ok:true … probeExpired:true`).
  Scripts: `audit/run-1/area-A/04-expired.cjs`, `03-malformed-matrix.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts` (`verifyImported`,
  `markConnected` clearing `expired`), `electron/cookieFile.cjs`
  (`validateCookieText` does not surface expiry to the caller)

---

### A-4  The expired-session message — the only place the date and the right next step appear — is wiped by the sweep that starts a split second later

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Put a cookies.txt whose `SID` expired in the past into userData.
  2. Start the app (returning user).
  3. Read the red alert in the modal at every moment from launch onwards.
- **Expected**: `EXPIRED_MESSAGE` — "Your YouTube sign-in expired on
  Sun 9 Sep 2001. Import a fresh cookies.txt to get 1080p again." — stays on
  screen. It is the only place the user is told *when* it expired and that a
  fresh export is the fix.
- **Actual**: `restoreConnection` sets that message, then the modal's
  `useEffect` fires `sweepBrowsers`, whose first action for each browser is
  `set({ message: undefined })`. Sampled across the whole sweep the alert is
  `null`; when the sweep ends it is replaced by "None of your browsers would
  hand over a YouTube session." The expired user is never shown the expiry
  message and is instead pointed at their browsers, which are not the problem.
  Only the modal heading ("YouTube sign-in expired") and the chip survive.
- **Proof**: `audit/out/area-A/captured/08-stories.txt` story S3 — six samples,
  all `"alert":null` with `"notice":["Checking chrome…"]` … `["Checking
  chromium…"]`; and `audit/out/area-A/captured/04-expired.txt` section (a),
  where the sweep has already finished and the alert reads "None of your
  browsers would hand over a YouTube session." Screenshots
  `audit/out/area-A/A-08-s3/01-s3-expired-message-overwritten.png`,
  `audit/out/area-A/A-04/01-a-returning-expired.png`.
  Scripts: `audit/run-1/area-A/08-stories.cjs`, `04-expired.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts` (`sweepBrowsers` clearing
  `message`; `restoreConnection`'s `EXPIRED_MESSAGE`),
  `src/components/YouTubeConnectModal.tsx` (auto-sweep effect does not skip a
  known-expired session)

---

### A-5  Every sweep spawns 18 yt-dlp processes, cannot be cancelled, and blocks the import button while it runs

- **Severity**: major
- **Status**: confirmed (process count); duration on a real network is an
  estimate and labelled as such
- **Steps**:
  1. Cold start with no session and count yt-dlp invocations (the audit stub
     logs its argv to `/tmp/stub-A/calls.log`).
  2. Press "Check browsers again" three times.
  3. Sign in, then choose "Forget this sign-in" from the chip menu.
- **Expected**: one probe per browser at most, a way to stop it, and no probe
  storm from an unrelated action.
- **Actual**: 6 browsers x 3 probe videos = **18 yt-dlp processes per sweep**,
  because the server retries all of `AUTH_PROBE_URLS` whenever a run comes
  back `inconclusive` (which is what a browser with no profile produces here),
  and the client then treats the result as a failure anyway. Three presses of
  "Check browsers again" = **54 processes** (measured). "Forget this sign-in"
  starts a whole fresh sweep and ends with "None of your browsers would hand
  over a YouTube session." — an error the user never asked for. There is no
  cancel; the primary button is replaced by a disabled "Checking…" for the
  duration, so the picker route is unavailable and only drag-and-drop works
  (which is how A-2 is reached). Here each stubbed process is ~30 ms; a real
  yt-dlp is a cold Python start plus a network round trip, so 18 of them is
  minutes, not seconds, of an unescapable modal — that extrapolation is
  reasoning, the process count is measured.
- **Proof**: `audit/out/area-A/captured/02-happy-path.txt` —
  `SWEEP yt-dlp runs: 18` with the per-browser `--cookies-from-browser=` list;
  `audit/out/area-A/captured/08-stories.txt` story S6 —
  `yt-dlp browser probes spawned by three presses: 54`; story S5 shows the
  post-disconnect sweep and its message. Main-process log in
  `audit/out/area-A/A-02/logs.json` repeats "auth probe inconclusive on this
  target, trying the next one".
  Scripts: `audit/run-1/area-A/02-happy-path.cjs`, `08-stories.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts` (`sweepBrowsers`: serial,
  uncancellable, no "not installed" short-circuit),
  `server/index.ts` (`probeYouTubeAuth` retries every URL on `inconclusive`)

---

### A-6  "inconclusive" — which the server documents as "not a verdict" — is treated by the renderer as a failed sign-in

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Make yt-dlp produce output with no marker the classifier recognises (the
     stub's default run: progress lines only). This is the documented
     real-world case — `server/youtubeAuth.ts` records a macOS user whose
     valid session printed nothing recognisable.
  2. Cold start with no cookies file and watch the sweep.
  3. Repeat with a valid cookies.txt on disk at launch.
- **Expected**: what the server says — "'I could not tell' is the honest
  answer and callers are free to proceed on it"; `authProbeVerdict` maps
  `inconclusive` to `"ok"` and lets a download through.
- **Actual**: `checkSource` in the renderer treats everything that is not
  exactly `signed_in` as a failure. For the sweep, six `inconclusive` verdicts
  become "None of your browsers would hand over a YouTube session." For a
  restored session, `markFailed(..., hadFile=true)` only spares
  `rate_limited`, `probe_unavailable`, `timeout` and `inconclusive` —
  `inconclusive` *is* in `NOT_ABOUT_SIGN_IN`, so a restored session survives;
  but a *freshly imported* file that probes `inconclusive` goes through the
  same path and leaves the user connected with a vague notice, while a sweep
  result is a hard failure. The server and the renderer disagree about what
  the same verdict means, and with A-1 the disagreement is what locks a user
  out: the lockout state in every cold-boot run here is produced by
  `inconclusive`, not by a real refusal.
- **Proof**: `audit/out/area-A/captured/01-cold-boot.txt` — "Technical
  details" reads `chrome: inconclusive / safari: inconclusive / … ` under the
  alert "None of your browsers would hand over a YouTube session.";
  `audit/out/area-A/A-01/01-cold-boot.png`.
  Script: `audit/run-1/area-A/01-cold-boot.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts` (`checkSource` /
  `sweepBrowsers` verdict mapping) vs `server/youtubeAuth.ts`
  (`authProbeVerdict`)

---

### A-7  The picker accepts a 10 MB cookies.txt and installs it; dropping the same file is refused

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Build a 10.4 MB Netscape cookies.txt (one valid `SID` row plus padding
     rows) — an extension that exported every cookie in the profile.
  2. Import it with "Choose cookies.txt".
  3. Drop the same file on the window.
  4. Call `youtube:importCookiesText` with the same text.
- **Expected**: one answer, whichever route is used.
- **Actual**: three different answers. The picker accepts it
  (`{"ok":true,"count":44003}`) and installs a 10.4 MB
  `yt-cookies.txt`, which `withRunCookies` then copies for every yt-dlp run.
  The drop route refuses it in the renderer with a good message, "That file is
  too large to be a cookies.txt (over 5 MB)." The main-process guard in
  `youtube:importCookiesText` refuses anything over 5,000,000 characters with
  the *wrong* message, "That does not look like a cookies.txt file." —
  size reported as a format problem. `importCookieFile` has no size guard at
  all.
- **Proof**: `audit/out/area-A/captured/07-edges.txt` section 1 —
  `picker route -> {"ok":true,"count":44003}`,
  `cookie file on disk now: 10.4 MB`,
  `importCookiesText route -> {"ok":false,"error":"That does not look like a
  cookies.txt file."}`,
  `drop route UI message: "That file is too large to be a cookies.txt (over 5
  MB)."` Screenshot `audit/out/area-A/A-07/01-big-file-drop.png`.
  Script: `audit/run-1/area-A/07-edges.cjs`
- **Suspected file**: `electron/youtubeSession.cjs` (`importCookieFile`, no
  size check), `electron/main.cjs:701` (wrong message for the length guard),
  `src/lib/youtubeConnection.ts:488` (the 5 MB rule lives only in the renderer)

---

### A-8  Raw Node errno strings, with absolute paths, are shown to the user as the sign-in error

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Open the connect modal, press "Choose cookies.txt".
  2. Choose a file that is no longer there (exported to Downloads, then the
     browser's "clear downloads" removed it; or the user picks a folder).
- **Expected**: a plain sentence and a next step, in the style of every other
  message in this flow ("That file is JSON. Export it again and choose the
  Netscape (cookies.txt) format.").
- **Actual**: the modal's red alert reads
  `ENOENT: no such file or directory, open '/home/user/…/deleted-cookies.txt'`
  verbatim, and a directory gives
  `EISDIR: illegal operation on a directory, read`. No next step, and the
  errno text is what `importCookieFile`'s catch block puts in `error`.
- **Proof**: `audit/out/area-A/captured/07-edges.txt` section 3, including
  `UI alert: "ENOENT: no such file or directory, open '…'"`. Screenshot
  `audit/out/area-A/A-07/02-missing-file-error.png`.
  Script: `audit/run-1/area-A/07-edges.cjs`
- **Suspected file**: `electron/youtubeSession.cjs` (`importCookieFile` catch
  returns `err.message`)

---

### A-9  The expiry column is read with no bounds and no validation: "Invalid Date" on screen, garbage read as an immortal session

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Import a cookies.txt whose `SID` row has `expires = 99999999999999`.
     Hover the status chip (or read its `title`).
  2. Import files with `expires` of `never`, `-1` and `1e309`.
- **Expected**: an out-of-range or unparseable expiry is treated as unknown
  and the app says nothing about a date, or says it cannot tell.
- **Actual**: `expirySeconds` accepts any finite positive number, so
  `99999999999999 * 1000` = 9.9999e16 ms, past the maximum JS date. The chip
  tooltip reads "…It runs out on **Invalid Date**. The app warns you before
  then." — `formatExpiryDay` has no validity guard and `toLocaleDateString`
  does not throw, so the fallback never runs. Separately, `never`, `-1` and
  `1e309` all become `null`, which the code reads as "session cookie, no
  expiry", so the app reports a healthy sign-in that can never expire and no
  warning is ever possible for that file.
- **Proof**: `audit/out/area-A/captured/04-expired.txt` section (c) —
  `chip attrs: {"title":"…It runs out on Invalid Date…"}` and
  `probe: {"connected":true,"expiresAt":99999999999999000,…}`. Screenshots
  `audit/out/area-A/A-04/04-c-huge-expiry.png`,
  `audit/out/area-A/A-04/05-c-huge-expiry-panel.png`.
  `audit/out/area-A/A-03/matrix.json` rows "expires not a number",
  "expires -1", "expires 1e309" — all `connected:true, expiresAt:null`.
  Scripts: `audit/run-1/area-A/04-expired.cjs`, `03-malformed-matrix.cjs`
- **Suspected file**: `electron/cookieState.cjs` (`expirySeconds`),
  `src/lib/youtubeConnection.ts` (`formatExpiryDay`)

---

### A-10  `aria-modal="true"` with no focus containment: focus never enters the dialog, 17 covered controls stay focusable, Escape does nothing

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with no session so the connect modal is open.
  2. Inspect `document.activeElement`.
  3. Press `Tab` repeatedly and record where focus lands.
  4. `Tab` to the Help button and press `Enter`.
  5. Press `Escape`.
  6. Complete the sign-in from the keyboard and check where focus goes.
- **Expected**: focus moves into the dialog on open, is trapped inside it,
  `Escape` closes it, the background is `inert`/`aria-hidden`, and focus
  returns somewhere sensible on close.
- **Actual**: focus stays on `BODY`. The first 17 `Tab` stops are controls the
  overlay is covering (tabs, campaign chip, URL field, Copy blocks, Symbols,
  the status chip, Settings, Help, …); the import button is the **19th** stop.
  Nothing is `aria-hidden` (`ariaHiddenOnBackground: 0`). Pressing `Enter` on
  the covered Help button opens the help drawer and the full setup checklist
  *behind* the overlay — keyboard users can operate what pointer users cannot
  (`page.click("#ui-help-button")` times out). `Escape` closes the help drawer
  but never the modal, twice over. After a keyboard sign-in succeeds, focus is
  dropped back to `BODY`.
- **Proof**: `audit/out/area-A/captured/07-edges.txt` section 5 —
  `"focusOnOpen":"BODY"`, `"focusInsideDialog":false`,
  `"controlsOutsideStillFocusable":17`, `"ariaHiddenOnBackground":0`,
  `Tab presses needed to reach the import button: 19`,
  `focus after the modal closed: BODY/…`;
  `audit/out/area-A/captured/10-focus-escape.txt` —
  `pointer click on the covered Help button: blocked`,
  `Help button reachable by Tab while the modal is open: true`,
  `help drawer opened behind the modal: true`, `checklist rows found: 8`,
  `after a second Escape: modal = true`. Screenshots
  `audit/out/area-A/A-10/01-help-opened-behind-modal.png`,
  `audit/out/area-A/A-10/02-after-escapes.png`,
  `audit/out/area-A/A-01/02-after-escape.png`.
  Scripts: `audit/run-1/area-A/07-edges.cjs`, `10-focus-escape.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx`
- **Note (not a defect)**: every control inside the dialog does have an
  accessible name, `aria-labelledby` resolves, the browser `<select>` carries
  `aria-label="Browser to check"`, and keyboard-only sign-in does complete.

---

### A-11  The modal says "Not found automatically" from the first frame, while it is still checking

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with no session.
  2. Read the modal at t=0 ms, while the progress line says "Checking chrome…".
- **Expected**: the three-step cookies.txt instructions appear once the
  automatic route has actually failed.
- **Actual**: the step list and the line "Not found automatically. Three
  steps:" are rendered unconditionally, so they are on screen before the first
  browser has been checked and for the whole sweep, directly above a live
  "Checking chrome…" status and a button reading "Checking…". The screen
  simultaneously claims to be searching and to have finished searching.
- **Proof**: `audit/out/area-A/captured/09-drop-and-copy.txt` —
  `t=0ms {"working":["Checking chrome…"],"saysNotFoundAutomatically":true,
  "primaryButton":"Checking…"}` and the same at 1500 ms and 4000 ms.
  Screenshot `audit/out/area-A/A-09/01-copy-during-sweep.png`.
  Script: `audit/run-1/area-A/09-drop-and-copy.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx` (the `<ol>` and
  its lead-in are not gated on `state.probed && !state.busy`)

---

### A-12  After the sweep, the instructions name the wrong browser — always the last one tried

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with no session; read step 1 of the instructions as the modal
     opens.
  2. Let the sweep run through chrome, safari, edge, firefox, brave, chromium.
  3. Read step 1 again, and the "Pick a browser" dropdown.
- **Expected**: what the file's own doc comment promises — "The extension is
  named for the user's browser."
- **Actual**: `sweepBrowsers` calls `set({ browser })` on every iteration, and
  `extensionFor(state.browser)` follows it, so when the sweep ends the modal
  names whichever browser happened to be last in the list. On this machine it
  ends up telling the user to "Install Get cookies.txt LOCALLY in **Chromium**"
  and leaves the dropdown on `chromium`, regardless of what they actually use.
  The browser is only persisted on success, so the next launch starts from
  `chrome` again and ends on `chromium` again.
- **Proof**: `audit/out/area-A/captured/12-browser-label.txt` (before/after
  step-1 text and dropdown value); visible in
  `audit/out/area-A/A-06-a/03-sweep-finished.png` — "Install Get cookies.txt
  LOCALLY in Chromium" — and `audit/out/area-A/A-12/01-browser-label-after-sweep.png`.
  Script: `audit/run-1/area-A/12-browser-label.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts` (`sweepBrowsers` mutating
  `state.browser`), `src/components/YouTubeConnectModal.tsx`
  (`extensionFor(state.browser)`)

---

### A-13  Once signed in, dropping a cookies.txt on the window is a silent no-op

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Sign in so the modal is closed.
  2. Export a fresh cookies.txt (what the app tells users to do before the old
     one rotates) and drop it on the window.
- **Expected**: the file is imported, or the app says why it was not.
- **Actual**: nothing at all. The `dragover`/`drop` listeners are registered
  inside the modal's `useEffect` and torn down when the modal unmounts, so a
  signed-in window has no drop handling: the cookie file on disk is unchanged,
  no alert, no status, not even the "Drop cookies.txt to sign in" overlay.
  Refreshing a session is only possible through the status chip's "Import new
  cookies.txt", which the onboarding flow never mentions — it taught the drop
  gesture.
- **Proof**: `audit/out/area-A/captured/09-drop-and-copy.txt` —
  `modal open: false`, `cookie file changed by the drop: false`,
  `any message shown to the user: {"alert":null,"statuses":["Paste a YouTube
  link to begin"],"overlay":false}`. Screenshot
  `audit/out/area-A/A-09-drop/01-drop-while-signed-in.png`.
  Script: `audit/run-1/area-A/09-drop-and-copy.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx` (drop listener
  scoped to `open`)

---

### A-14  Four different causes share one message, and a signed-out export is called "not a cookies.txt"

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Import, one at a time: a file with only the Netscape header; a file whose
     columns are space-separated; a binary file renamed `.txt`; a six-column
     row; and a genuine Netscape row whose cookie value is empty
     (`…\t2000000000\tSID\t`).
- **Expected**: the header-only and empty-value cases are recognisable
  cookies.txt files and should be diagnosed as such ("no cookies in it",
  "signed out") — the main process already computes a `kind`
  (`wrong_format` / `no_youtube_cookies` / `signed_out`) for exactly this.
- **Actual**: all five produce the single string "That doesn't look like a
  cookies.txt file. It should be the Netscape format, with tab-separated
  columns." The empty-value case is the worst: `parseCookieRows` trims each
  line *before* counting columns, so the trailing tab disappears, the row
  drops to six columns and is discarded — a signed-out export is reported as
  a wrong file format, sending the user to re-export in a different format
  instead of signing in. The `kind` the main process returns over IPC is
  never read by the renderer (`result.kind` is unused in
  `importCookies`/`importDroppedCookies`).
- **Proof**: `audit/out/area-A/captured/03-malformed-matrix.txt` — rows
  "header only", "space separated not tabs", "wrong column count (5)",
  "SID present but empty value" all `kind=wrong_format` with the same text;
  `audit/out/area-A/A-03/matrix.json`. Binary case in
  `audit/out/area-A/captured/07-edges.txt` section 2.
  Scripts: `audit/run-1/area-A/03-malformed-matrix.cjs`, `07-edges.cjs`
- **Suspected file**: `electron/cookieState.cjs` (`parseCookieRows` trims
  before splitting), `electron/cookieFile.cjs` (`validateCookieText`
  messages), `src/lib/youtubeConnection.ts` (discards `kind`)

---

### A-15  After the v4 folder migration the checklist demands a clips folder the app is already using

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Seed an older `settings.json`: `clipper.saveDir: "/tmp/area-A-old-clips"`,
     `clipper.saveDirs: ["/tmp/area-A-old-clips"]`, and a campaign row from the
     old shape (`{ id, name }` only).
  2. Start the app, sign in, open Help → Setup checklist.
- **Expected**: the step is ticked, or at least not blocking. `migrateSettings`
  exists precisely to carry the old folder forward, and the footer confirms it
  worked: "Clips **area-A-old-clips**".
- **Actual**: the checklist reads the folder from `active.clipsDir` only, which
  the migration does not populate (it writes the app-level
  `clipper.clipsDir`), so "Choose the clips folder" is unticked and "Choose
  what happens after cutting" is permanently blocked with "Waiting for: Choose
  the clips folder" — for an upgrading user whose clips are already going to
  that folder. Progress reads 4 of 6 with no way to move it except re-picking
  the same folder.
- **Proof**: `audit/out/area-A/captured/05-checklist.txt`, scenario
  `older-shape` — `clips-folder done=false`, `after-cutting blocked=true
  waiting=Choose the clips folder`. Screenshot
  `audit/out/area-A/A-05-older-shape/01-checklist.png` shows the footer reading
  "Clips area-A-old-clips" while the checklist asks for it.
  Script: `audit/run-1/area-A/05-checklist.cjs`
- **Suspected file**: `src/components/SetupChecklist.tsx` (passes
  `active.clipsDir`, not the resolved `folders.clipsDir`),
  `src/lib/setupTasks.ts` (`clipsDone`)

---

### A-16  A nonsense clip-length band from an older file is silently rewritten and ticked as done

- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. Seed a campaign with `targetMinSec: 90, targetMaxSec: 60, hardMaxSec: 30`
     (a hand-edited or downgraded settings file).
  2. Start the app and open the setup checklist.
- **Expected**: either the checklist flags the band as not set, or the user is
  told their band was repaired.
- **Actual**: `normalizeBand` rewrites it to 90/90/90 on load — a band in
  which every clip must be exactly 90 seconds — and "Set the clip length band"
  shows a tick. Nothing anywhere says the stored values were changed.
- **Proof**: `audit/out/area-A/captured/05-checklist.txt`, scenario
  `half-finished` — `length-band done=true` for the seeded 90/60/30.
  Screenshot `audit/out/area-A/A-05-half-finished/01-checklist.png`.
  Script: `audit/run-1/area-A/05-checklist.cjs`
- **Suspected file**: `src/lib/campaigns.ts` (`normalizeBand`, area C) read
  through `src/lib/setupTasks.ts` (`bandIsSet`)

---

## Coverage

Proved by driving the running app, not by reading code.

**Automatic browser sweep** — runs once per app session on modal open; order
comes from `system:browserOrder` (default order here, no default browser
detected in this container); stops early on `rate_limited` /
`probe_unavailable`; reports per-browser failures under "Technical details".
Cost, cancellability and the browser-label side effect are A-5, A-12; the
`inconclusive` mapping is A-6; the mid-sweep race is A-2.

**Import by file picker** — happy path end to end: modal → native dialog →
validation → atomic commit → verify → modal closes → `clipper.authSource:
"app"` persisted → chip "Signed in" → `yt-cookies.txt` written with mode
`0600`. Double-click produced exactly one dialog and one probe. Importing the
same file twice is idempotent and leaves no temp files.

**Import by dropped text** — same end state as the picker. Overlay ("Drop
cookies.txt to sign in") appears on dragover. 5 MB guard works on this route.
Dead once signed in (A-13).

**Malformed cookies.txt, 24 cases x 2 routes** (`A-03/matrix.json`): empty,
whitespace-only, header-only, 5 columns, 8 columns, space-separated, expiry in
the past / 0 / -1 / 99999999999999 / 1e309 / 1800000000.75 / "never",
unicode+emoji values, CRLF, `.notyoutube.com`, `.vimeo.com`, `.google.com`
only, no auth cookie, empty `SID` value, JSON export, an HTML error page,
`#HttpOnly_` rows only, embedded NUL bytes; plus a 10.4 MB file and a 4 KB
binary renamed `.txt`. **No rejected import ever disturbed the good session
already on disk** — the atomic commit holds. `.notyoutube.com` is correctly
not mistaken for YouTube. `#HttpOnly_` rows and CRLF parse correctly. Defects
found are A-3, A-7, A-9, A-14.

**Session probe and expiry warning** — valid future date → "Signed in"; 36
hours out → "Signed in, expires soon"; past date on launch → heading "YouTube
sign-in expired" and chip "Sign-in expired"; absent file → "Not signed in".
Real yt-dlp rate-limit text ("Sign in to confirm you're not a bot…") with a
good file on disk correctly keeps the user signed in and shows the
"re-importing cookies won't help" notice rather than dropping the session —
this one works exactly as documented. Defects: A-3, A-4, A-9.

**Disconnect** — "Forget this sign-in" deletes `yt-cookies.txt`, clears
`clipper.authSource`, returns the modal, and the menu correctly drops to
"Import cookies.txt" / "Copy log". Disconnect twice is a clean no-op
(`{ok:true}` both times). Disconnect → re-import restores the session. The
unasked-for sweep it triggers is counted under A-5.

**Setup checklist and gating** — fresh (1 of 6, items 3-9 blocked on "Create a
campaign", after-cutting also on the clips folder, clip-bank also on "Load a
video"); half-finished; older settings shape; complete. Blocked rows show
"Waiting for: …" and hide their action button; done-ness is derived, not
stored; the optional clip-bank row never counts against progress; the
channel-data row is correctly absent from a non-owner build. Defects: A-15,
A-16, plus the fact that in a fresh install the checklist is only reachable
behind the connect modal (A-1/A-10).

**Interruptions** — the app was SIGKILLed mid-verification, 2.5 s after a drop
import, while the UI read "Checking those cookies with YouTube…". The cookie
file was already committed, intact and byte-identical; no `yt-cookies.txt.import-*`
temp file was left behind; a relaunch with that file restored straight to
"Signed in" with no modal. Nothing lost.

**Security** — proven good, no finding:
- The cookie file path is never accepted from the renderer. `youtube:importCookies`
  takes no arguments; `youtube:importCookiesText` takes text only. Passing
  `null`, a number, `{path:"/etc/passwd"}`, an array or 5,000,001 characters all
  return `{ok:false}` and change nothing.
- `server/index.ts` resolves the file from `process.env.YT_CLIPPER_COOKIE_FILE`
  (set by `electron/main.cjs:190`). `POST /api/auth/youtube/status` with
  `{browser:"/etc/passwd"}` or `{"browser":"../../yt-cookies.txt"}` → 400
  "Invalid input"; an extra `cookies:"/etc/passwd"` field is ignored by the zod
  schema.
- **Cookie values never cross the IPC bridge.** `youtube:probe` returns exactly
  `{connected, error, expiresAt, expired}` — no path, no values (the `path`
  `youtubeSession.probe()` computes is dropped by the main handler).
  `youtube:importCookiesText` returns `{ok, count}` / `{ok, kind, error}`.
  Neither return value contains the userData path or `yt-cookies`.
- The committed file is `0600`, written to a temp file and `rename`d.

## Not provable here

- **Whether yt-dlp actually gets 1080p from an imported file.** No YouTube
  session exists here and the network policy refuses youtube.com, so every
  `signed_in` verdict in this area came from scripted yt-dlp output. What is
  proven is the app's handling of each verdict, not the verdict itself.
- **Permission denied on the cookie file, then granted.** The container runs as
  root, which bypasses file modes, so an EACCES import could not be produced.
  The neighbouring `ENOENT`/`EISDIR` paths were tested instead (A-8), and
  `locked` / `decrypt_failed` classification was exercised only as yt-dlp text.
- **A real OS-level file drop.** Playwright can synthesise the `drop` event but
  not a window-manager drag, so Chromium's default behaviour for a file dropped
  on a window with no handler (A-13's state) is untested. Renderer-initiated
  `location.href = "file:///…"` is blocked ("Not allowed to load local
  resource"), and `electron/main.cjs` has no `will-navigate` guard; whether a
  genuine drop would navigate the window away is left open rather than claimed.
- **Two app instances at once.** The harness gives each launch its own
  `--user-data-dir`, which is also what defeats Electron's single-instance
  lock, so "two flows at once against one cookie file" is out of scope here.
- **macOS and Windows specifics** named all over this flow: Safari's Full Disk
  Access, Chrome 127 App-Bound Encryption, a running browser locking its cookie
  DB. All Linux-inapplicable.
- **Real first-run wall-clock time** for the 18-probe sweep (A-5): the process
  count is measured, the duration is an extrapolation from real yt-dlp startup
  costs.

### Contract note (not a product defect)

`audit/inventory.md` and `audit/harness/README.md` both list
`/api/auth/youtube/status` as **GET**. It is registered POST-only
(`server/index.ts:1023`) and takes `{ browser }`; a GET returns Express's HTML
404 page. Worth fixing in the inventory before the action plan is written
against it. Proof: `audit/out/area-A/captured/07-edges.txt` section 4.
