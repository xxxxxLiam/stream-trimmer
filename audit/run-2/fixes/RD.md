# Fix thread RD: privacy, owner gate, sign-in, help (run 2)

All five fixed. Not committed by me (a lead "wip" commit already carries most of the diff).
Real-app checks ran against my own frozen mirrors (`/tmp/rd-public`, `/tmp/rd-owner`, `/tmp/rd-owner-other`,
and `/tmp/rd-ctrl` = the app with the old HelpButton/HelpDrawer/useClipper), scratchpad scripts, xvfb, fresh user-data dirs.
Not verified against real YouTube (stubbed yt-dlp).

| ID | Status | Negative control |
|---|---|---|
| AF2-1 | fixed | unit: all 3 files fail when reverted; real app: raw `diagnostics:read` returns 18/18 markers, fixed returns 0 |
| AF2-2 | fixed | real app, old useClipper: first Cut refused, 0 files; fixed: MP4 981,457 B |
| AF2-3 | fixed | real app, old help code: "?" present at the gate and drawer survives a gate reopen; fixed: neither |
| E2-1 | fixed | real app, old settingsStore: chip reads `Data \| channel-data \| Confirm`; fixed: `Data \| data \| Confirm` |
| E2-2 | fixed | unit: forwarding renderer args fails; remembering a renderer verdict fails |

## AF2-1 redaction path (and AF2-11's three shapes)
- `electron/main.cjs`: the raw log (`logger.tail`) is read in exactly one place, `readLogScrubbed()`. `diagnostics:read` (text and path) and `diagnostics:copy` both use it. `electron/diagnosticsPath.test.ts` fails if a second `logger.tail(` appears or either handler skips it, so a new reader is safe by default.
- `DiagnosticsDisclosure.tsx` additionally runs the renderer `redact()` on whatever it prints (second layer).
- `redact()` in both copies, changed together: path-style signed URLs (`/id/…/sig/…`), JSON-quoted token keys (`"access_token": "…"`, single-quoted too), bare Google cookie assignments (`__Secure-3PAPISID=…`, `SID=`, `SAPISID=`). New rule `cookie-assignment`. Parity test extended with these shapes and passes; `diagnostics.test.ts` mutation table updated (auth-headers now overlaps cookie-assignment, so it moved to the focused cases).
- Marker counts, 18 own markers (RDXK prefix: the auditor's 15 shapes plus single-quoted refresh_token, `/lsig/` path URL, bare `SAPISID=`), leaked / 18:
  - on-screen failure alert: download stage 0, pre-flight 0
  - Copy diagnostics bundle: download stage 0, pre-flight 0
  - Copy log clipboard: 0
  - Diagnostics panel `<pre>` on the connect screen: 0 (run 2: 7)
  - whole page body text: 0
  - IPC `readDiagnostics` on a seeded log: 0 (negative control, raw handler: 18/18)
  - raw `main.log` on disk: 7 (unchanged: the file itself is not scrubbed; "Show file" opens it. See "Not owned".)
- Shapes only, e.g. before `…/id/o-RDXK…/sig/RDXK…` now `/id/REDACTED/sig/REDACTED`; `"access_token": <redacted>`; `__Secure-3PAPISID=<redacted>`.

## AF2-2
`signedOutQuality()` / `isSignedOut()` in `youtubeConnection.ts`; `useClipper.ts` holds mp4 quality at 360p while there is no session and none being restored, remembers the user's choice, gives it back on sign-in (never overriding a quality picked since). The gate's line now says the quality setting moves to 360p and returns on sign-in; the footer chip reads MP4 360p. Real app: fresh install and a campaign seeded at "best" both produce a file after "Continue without signing in"; importing a cookies file switches the chip back to Best.

## AF2-3
Chose "keep it out of the way": while the gate (`isSignInGateUp`) is up, `HelpButton` renders no "?" and `HelpDrawer` renders nothing and calls `onClose` (so Ctrl/Cmd+/ cannot leave a dead drawer, and a drawer open when the gate returns withdraws). Real app: 0 buttons and 0 drawers at 1440 and 760 wide, 0 drawers after the shortcut, 0 of 40 Tab presses outside the dialog, and after Escape the "?" returns and typing in the search works (not inert). Help is not available during the gate by design; it is one Escape away.

## E2-1
`settingsStore.cjs` no longer contains the folder name. `migrateSettings(input, {dataFolderName})` only writes `clipper.dataDir` when the build supplies a name; otherwise it sets `dataDirConfirmed: false` and leaves the path to the renderer's gated `defaultDataDir`. The owner build gets its name from the build sidecar (below).
- Grep of the built public mirror: `channel-data` 0 in `dist/` (renderer), 0 in `electron/*.cjs`, 0 in `electron/dist/server.cjs`; no `build-shape.json` present.
- On-screen, public build upgrading a v3 install: settings.json has no dataDir; chip `Data | data | Confirm`, tooltip `…/data. Confirm or choose another.`, popover, Settings and body text: 0 matches for `channel-data`. Owner build still gets `channel-data` and works as before.

## E2-2
Main decides from baked values, never renderer input. `scripts/build-server.cjs` (outside my list, flagged below) writes `electron/dist/build-shape.json` `{list, salt, dataFolderName}` only in an owner build and deletes a stale one in a public build. `ownerCheck.cjs` reads it once; `owner:check` ignores its arguments; `export:save` awaits `ownerGate.isOwner()`. Real app, `isOwnerMachine(["*"], "")` then `saveExport`: public and non-owner build both `Could not save.` before and after a reload, 0 folders created; owner build saves and the "Channel data" link and `owner:check` still answer true. This also closes the E-6 hash oracle.

## Suite
`tsc --noEmit` clean. `tsx --test` over all test files plus my new ones: 649/649 (was 609). New: `electron/diagnosticsPath.test.ts`, `electron/buildShape.test.ts` (builds both shapes for real), `src/lib/signedOutQuality.test.ts`, plus additions to ownerCheck, redact, diagnostics and settingsMigration tests. Parity, 40/40 trap and 18/18-marker surfaces re-run in the real app; I did not re-run the 27-anchor or 57-needle scripts (only my own public grep above).

## Not owned / needed
- `scripts/build-server.cjs` (edited, additive, for the sidecar) and `src/hooks/useClipper.ts` (edited, one effect + imports): neither was on my list nor anyone's I was told of. Please confirm no collision.
- `electron/logger.cjs`: scrubbing at write time would also clean the file "Show file" reveals. Not done.
- `DownloadBar` still drops the server's `action` ("Connect YouTube") button (AF2-2 secondary), and `lowQualityExplanation()` is still uncalled (AF2-14).
- Dev (`dev:electron`) has no sidecar, so `export:save` fails closed there; build an owner bundle to use it. Deliberate: reading the flag/list names in a shipped file would add to E2-7.
- AF2-4..AF2-10, AF2-12, AF2-13 untouched (outside this brief). E2-7 not addressed beyond not adding names (`build-shape` now appears in the public `main.cjs`/`ownerCheck.cjs`).
