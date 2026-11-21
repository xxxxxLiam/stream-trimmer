# Audit run 1 — action plan

Confirmed problems only, blockers first, grouped by root cause and split into
nine threads that own **disjoint file sets** so they run in parallel without
colliding. A thread must not edit a file another thread owns; if it needs
one, it says so in its report instead of reaching across.

Every fix carries a test **and a negative control**: revert the fix, watch the
new test fail, restore it. A test that could never have failed is not
evidence.

## Ownership map

| Thread | Owns exclusively |
|---|---|
| T1 server | `server/index.ts`, `server/resumeCache.ts`, `server/csv.ts`, `server/quality.ts` |
| T2 main | `electron/main.cjs`, `electron/exportSave.cjs`, `electron/logger.cjs`, `electron/settingsStore.cjs` |
| T3 shell | `src/App.tsx`, `src/components/shell/ThreeColumnLayout.tsx`, `src/components/shell/AppHeader.tsx`, `src/components/WorkspaceTabs.tsx`, `src/components/PreviewPanel.tsx`, `src/styles.css` |
| T4 clip state | `src/hooks/useSegments.ts`, `src/hooks/useClipper.ts`, `src/context/WorkspaceContext.tsx`, `src/components/TranscriptColumn.tsx`, `src/components/SegmentList.tsx` |
| T5 bank | `src/context/CampaignContext.tsx`, `src/lib/campaigns.ts`, `src/components/ClipsColumn.tsx` |
| T6 sign-in | `src/components/YouTubeConnectModal.tsx`, `src/lib/youtubeConnection.ts` |
| T7 exporter | `server/channelRoutes.ts`, `src/context/ChannelExportContext.tsx`, `src/lib/channel.ts`, `src/components/ChannelExportPanel.tsx` |
| T8 diagnostics | `src/lib/helpTasks.ts`, `src/lib/diagnostics.ts`, `src/components/shell/DownloadBar.tsx`, `src/components/Spotlight.tsx`, `src/components/CopyBlocks.tsx` |
| T9 handoff | `src/lib/fcpxml.ts`, `src/components/EditorHandoff.tsx` |

## T1 — server

- **G-1 (blocker)** Two downloads of the same video+quality+ranges key the
  same work folder; each start deletes the other's in-flight files and both
  return 200. Key the folder per job, not per request shape.
- **G-12** is T2's (`settingsStore.cjs`), not T1's — do not touch it.
- **G-2** Binds `0.0.0.0` with `Access-Control-Allow-Origin: *`. Bind
  `127.0.0.1` and restrict CORS to the app's own origin. Proven reachable
  off-loopback with no credential: metadata read, a 981,457-byte file written
  to disk, the cache wiped via a no-preflight `text/plain` POST.
- **G-3** `urlSchema` accepts any URL merely *containing* "youtube.com", so
  `https://youtube.com@evil.example/x` and `http://169.254.169.254/youtube.com/…`
  reach yt-dlp. Parse the URL and check the host.
- **G-4 / G-6** `-ss` before `-i` with `-c copy` leaves an mp4 edit list that
  the concat demuxer ignores, so a joined clip contains footage from before
  the in-point: measured 100 marked frames + **14 frames from before an
  in-point**, opening 0.46s early. The server's own duration check notices,
  logs "STILL OFF" three times, and returns success anyway. Fix the cut so
  the edit list cannot leak pre-roll, and never return success when the
  duration check fails.
- **G-5** `/api/info`, `/api/transcript`, `/api/comments` and
  `/api/auth/youtube/status` hand yt-dlp the canonical `yt-cookies.txt`;
  only `/api/download` uses the protective copy. Route all five through
  `cookieJar.ts`.
- **G-8** `clearCache` has no in-use marker and deletes files a running job
  needs. Shares its deletion with E-2 (T7).
- **G-9** A damaged cached download permanently breaks that clip behind a
  misleading error.
- **G-10** Cancel does not stop yt-dlp and there is no cancel endpoint.
- **E-7** CSV formula injection: a comment starting with `=` is written
  unescaped (`server/csv.ts`).
- **F-5** The metadata pre-flight returns no `diagnostics` key, so Copy
  diagnostics copies an empty report.

## T2 — electron main

- **D-2 (blocker)** `clip:save` renames onto the computed path, destroying an
  existing file of the same name while reporting "Clip saved". The CapCut
  copy path in the same codebase correctly adds " 2".
- **F-6 (blocker)** `diagnostics:copy` does not call `redact()`; 9 of 9
  planted markers reached the clipboard under UI copy promising none would.
- **G-12 (blocker)** A settings.json with a BOM is destroyed during boot,
  before any user action, taking the clip bank, with no backup. Parse
  tolerantly, and never overwrite an unparseable file without keeping it.
- **D-6** `file:save` writes to any absolute path. One containment check on
  the *resolved* target at `main.cjs:502-522`, `:525-554` and
  `exportSave.cjs:41-43` closes this and D-7.
- **D-1 keeper** `file:startDrag` is unguarded: renderer code can wedge the
  main process with no gesture in progress. Guard it. The wider freeze is
  not provable on Linux — do not claim it fixed.

## T3 — shell and layout

- **B-3** From the second segment, the always-rendered `.aspect-video`
  wrapper (458px in every state) overflows and swallows clicks on In/Out and
  Add segment at widths ≥1160px.
- **H-3 (+H-4, +B-10)** The default window is 1100px wide
  (`electron/main.cjs:261`, T2's file — coordinate, do not edit) while the
  three-column layout needs `min-[1160px]`. Fix on the layout side.
- **H-6** Hide scrollbars app-wide in `styles.css` per `CLAUDE.md`, without
  costing wheel or keyboard scrolling.
- **E-1** `AppHeader.tsx:141` tests the runtime prop `p.channelAvailable`, so
  `define` cannot fold the branch and 7 occurrences of 6 exporter strings
  survive in the public bundle. Gate on `__CHANNEL_DATA__` directly.
  Required regardless of its minor rating: the user's requirement is that
  nobody learns the feature exists.
- **D-3** `App.tsx:422` renders `<CopyBlocks>` with no `input` prop, so all
  seven blocks are permanently disabled.
- **F-10** No React error boundary above the shell; B-1, C-1 and F-10 all end
  as a blank window. Add one.

## T4 — clip state

- **B-1 (blocker)** `TranscriptColumn.tsx` reads `matches[active].line` with
  a stale index; when the result set empties — including on clearing the box
  or pressing Escape — the whole app unmounts and every unsaved mark is lost.
- **B-2 + C-1 (both blocker, one fix)** `useSegments.ts` holds the clip in a
  module-level variable with no per-tab scope. Scope it per tab.
- **B-5** A URL with no video id loads as a source and Cut then does nothing.
- **B-6** Cancel does not stop the engine (pairs with G-10 in T1).
- **B-7** A segment deleted while the cut runs still lands in the file.
- **B-8** A tab remembers nothing across relaunch.

## T5 — bank and campaigns

- **C-2** A deleted campaign's bank survives in settings.json, and because
  the id is a slug of the name, recreating that name adopts the dead
  campaign's clips, categories and tiers.

## T6 — sign-in

- **A-1 (blocker)** The modal cannot be dismissed, yet the engine serves
  signed-out users at 360p. Give it an explicit way past.
- **H-2** The modal sets `aria-modal` but takes no focus, traps none (35 of
  40 Tab stops land behind the scrim) and leaves the background live.
  **Order matters: the escape route must land before or with the trap**, or
  the only current way out disappears.
- **A-2** A cookies.txt imported while the sweep runs is clobbered when the
  sweep finishes, and dragging is the only route available mid-sweep.

## T7 — channel exporter

- **E-2 (blocker)** Clearing the cache mid-export silently empties
  comments.csv and transcripts.csv and still reports success with a
  summary.csv that claims otherwise. Deletion half shares a cause with G-8.
- **E-3 (blocker)** `ChannelExportProvider` is per workspace tab, so two tabs
  give two exporters writing one date-named folder; the empty result
  overwrites the full one and both report success. No devtools needed.
- **E-4** The owner gate has no server side: on a non-allowlisted machine the
  UI is hidden but `POST /api/channel/export` still writes the CSVs.
- **E-5** Re-exporting the same channel the same day merges two runs into one
  folder behind a summary.csv that describes neither.

## T8 — help and diagnostics

- **F-1** 19 of 26 anchor ids exist nowhere in `src/`; 24 of 32 steps show a
  false "not on screen" notice and 8 of 14 tutorials are dead. Point the
  catalogue at the ids that exist, and make the test assert the anchor is in
  the DOM rather than merely spelled consistently.
- **F-3** The help button is covered and unclickable whenever Copy blocks or
  Symbols is open — exactly when it is needed.
- **F-7** `DownloadBar` renders raw stderr unredacted; `redact()` exists and
  is simply not applied.
- **F-8** Copy diagnostics is offered beside a plainly user-fixable error.

## T9 — handoff

- **D-4** The automatic "After cutting → Send to Final Cut" discards
  `runAfterCutting`'s outcome and fails in silence; the same settings through
  the panel's own button produce a correct message.
- **D-5** Cutting another clip replaces the session's `.fcpxml` with a
  one-clip version.

## After the threads

Re-run the full suite plus `tsc`, rebuild both bundle shapes, then run the
audit again as run 2 per step 9 of the protocol.
