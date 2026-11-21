# Area F — Help, diagnostics and updates

Scope: `src/components/HelpDrawer.tsx`, `Spotlight.tsx`, `DiagnosticsDisclosure.tsx`,
`UpdateStatus.tsx`, `OverlayLoader.tsx`, `src/components/shell/HelpButton.tsx`,
`src/lib/helpTasks.ts`, `src/lib/diagnostics.ts`, `electron/updater.cjs`,
`electron/logger.cjs`, and the `diagnostics:*` / `updater:*` IPC channels.

No product code was changed. Everything under `audit/run-1/area-F/` and
`audit/out/area-F/` is audit scaffolding.

## How these runs were driven

`audit/run-1/area-F/lib.cjs` launches a **frozen mirror** of the app
(`/tmp/f-app`, built by `audit/run-1/area-F/setup-app-mirror.cjs`) rather than
the repo's `dist/`, because parallel audit helpers rebuild `dist/` mid-run — one
such rebuild silently swapped a channel-data build under an early run of mine.
The mirror is an unmodified copy of `electron/*.cjs` plus a vanilla
`vite build` and `scripts/build-server.cjs` output. Two further mirrors exist:
`/tmp/f-app-channel` (`VITE_ENABLE_CHANNEL_DATA=1`, owner machine) and
`/tmp/f-app-channel-nonowner` (exporter compiled in, machine not an owner).

`yt-dlp` is the harness stub with two additions kept in `/tmp/stub-F` (not in the
repo): `--version` always succeeds, and `authStderr` / `downloadExitCode` let the
auth probe, the metadata probe and the download stage be scripted independently.
Update states are driven by sending the **real** `updater:status` IPC message
from the main process with Playwright's `app.evaluate`, so no product code is
touched. Clipboard assertions read Electron's own `clipboard.readText()`.

Scripts: `F-00-smoke` … `F-14-setup-checklist-anchors`, plus
`F-13-user-stories.cjs` (step 4).

---

### F-1  Every `help-anchor-*` id in the help catalogue is absent from the app, so 24 of 32 tutorial steps highlight nothing
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-F/setup-app-mirror.cjs`
  2. `cd audit/run-1/area-F && xvfb-run -a --server-args="-screen 0 1440x900x24" node F-01-spotlight.cjs`
  3. The script enumerates all 14 public tasks from `src/lib/helpTasks.ts`, opens
     the drawer, picks each task, walks every step, and probes
     `document.getElementById(step.anchorId)` at that moment — twice, once with
     an empty workspace and once with a video loaded.
- **Expected**: each step puts the Spotlight ring and numbered badge on the real
  control it names (the feature the user asked for: "highlight the real UI
  steps, a spotlight over actual controls, not a picture of them").
- **Actual**: 24 of 32 step-probes report `ANCHOR ABSENT`, in both states. All
  sixteen `help-anchor-*` ids and `ui-primary-action` are defined in `ANCHORS`
  but are never put on any element: `F-02` dumps every `[id]` in the live
  workspace (video loaded, each overlay opened) and 19 of the 26 `ANCHORS`
  entries are present nowhere. The controls themselves exist under *different*
  ids — `ui-cut` (not `ui-primary-action`), `ui-add-segment` (not
  `help-anchor-add-segment`), `ui-mark-in` / `ui-mark-out` (not
  `help-anchor-mark-in` / `-out`), `clips-tab-all` (not
  `help-anchor-clips-tabs`). Only 8 probes succeed, all on `ui-*` ids that
  Phase A had already placed (`ui-campaign-chip`, `ui-footer-clips`,
  `ui-footer-data`, `ui-copy-blocks`, `ui-symbols`).
  Every failing step shows the fallback notice "That control is not on screen
  right now. It may be on another screen or tab, or it appears once a video is
  loaded." — which is untrue: the control is on screen.
  Whole tutorials are dead end to end: `cut-clip` (3/3), `stitch-two-moments`
  (3/3), `find-by-words` (2/2), `nudge-edge` (2/2), `check-unused` (2/2),
  `reorder-segments` (2/2), `fix-360p` (3/3), `recut-saved` (3/3).
  `src/lib/helpTasks.test.ts` passes because it only asserts that each anchor id
  is spelled like a known constant, never that the element exists.
- **Proof**:
  - `audit/out/area-F/F-01-spotlight/spotlight-results.json` (64 probes, 48 failing rows)
  - `audit/out/area-F/F-02-dom-ids/dom-ids.json` (`anchorStatus`, `namedControls`)
  - `audit/out/area-F/F-01-spotlight/01-empty-cut-clip.png`
  - working counter-example (anchor that does exist):
    `audit/out/area-F/F-11-accessibility/01-a11y-tutorial.png`
  - scripts `audit/run-1/area-F/F-01-spotlight.cjs`, `F-02-dom-ids.cjs`
- **Suspected file**: `src/lib/helpTasks.ts` (`ANCHORS`), and the components that
  were meant to carry the ids (`Timeline.tsx`, `TranscriptColumn.tsx`,
  `MarkBar.tsx`, `SegmentList.tsx`, `ClipsColumn.tsx`, `CopyBlocks.tsx`,
  `SymbolPalette.tsx`, `YouTubeStatusChip.tsx`, `CampaignMenu.tsx`)

---

### F-2  With a second workspace tab open, every remaining tutorial breaks: duplicate ids make `getElementById` return the hidden tab's copy
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Launch, press the `+` in the tab strip so a second workspace tab is active.
  2. Open help and run "Switch campaign", "Change where clips save",
     "Copy a transcript for a chat", "Insert a symbol or honorific" — the four
     tutorials whose first anchor does exist.
  3. `xvfb-run -a node F-06b-spotlight-second-tab.cjs`
- **Expected**: the ring lands on the visible chip.
- **Actual**: `copies=2, firstVisible=false, visibleCopyExists=true,
  spotlight=false, notice=true` for all four. `App.tsx` renders one `Layout`
  (header, footer, help drawer) per tab and hides the inactive ones with
  `display:none`, so `ui-campaign-chip`, `ui-footer-clips`, `ui-footer-data`,
  `ui-copy-blocks`, `ui-symbols`, `ui-source-chip`, `ui-help-button`,
  `ui-help-drawer` and `help-search` each exist twice. `Spotlight.measure()`
  uses `document.getElementById`, which returns the first — the hidden first
  tab's copy — whose rect is 0×0, so the spotlight renders nothing and the
  drawer claims the control is not on screen. Combined with F-1 this leaves
  **no working tutorial at all** on any tab but the first.
- **Proof**:
  - `audit/out/area-F/F-06b-spotlight-second-tab/second-tab.json`
  - `audit/out/area-F/F-06-tabs/tabs.json` (`anchorDupes`: `count: 2` for six ids)
  - `audit/out/area-F/F-13-s06-tabs/01-s06.png`
  - script `audit/run-1/area-F/F-06b-spotlight-second-tab.cjs`
- **Suspected file**: `src/components/Spotlight.tsx` (`measure`, `useAnchorBox`);
  root cause in `src/App.tsx` (per-tab `Layout`)

---

### F-3  The help button is covered and unclickable whenever Copy blocks or Symbols is open, and during the first-run sign-in modal
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-03b-modal-overlay.cjs` — opens Copy blocks, then
     Symbols, and attempts a real Playwright click on `#ui-help-button`.
  2. `xvfb-run -a node F-03c-signin-modal.cjs` — cold start with no cookies file
     and a signed-out probe, then a real click on `#ui-help-button`.
- **Expected**: "a help button in the same location on every screen" — present
  **and usable** in every state.
- **Actual**: the button stays at the same coordinates but is covered:
  - Copy blocks open → click times out; covered by
    `div.surface-panel fixed right-4 top-14 z-50`.
  - Symbols open → click times out, same panel geometry.
  - First-run sign-in modal → click times out; covered by the modal's
    `fixed inset-0 z-50` scrim. The only way in is `⌘/` / `Ctrl+/`, which is
    advertised nowhere except the button's own `title` — the button the user
    cannot reach. Pressing it does open the drawer, but the drawer then renders
    *behind* the scrim, dimmed and inert.
  - The same two overlays also cover the open help drawer, so a user following
    "Copy a transcript for a chat" cannot read step 2 while the panel they were
    told to open is up (`covered: ["div.text-body", "div.t-meta"]`).
  Both overlays are reachable only from `#ui-copy-blocks` / `#ui-symbols`, which
  the panel also covers, so the panel's own × or Escape is the only way out.
- **Proof**:
  - `audit/out/area-F/F-03b-overlays/clicks.json`
  - `audit/out/area-F/F-03b-overlays/01-copyblocks-help-blocked.png`
  - `audit/out/area-F/F-03b-overlays/03-drawer-under-copyblocks.png`
  - `audit/out/area-F/F-03-position/04-1440x900-overlay-copyblocks.png`
  - `audit/out/area-F/F-03c-signin-modal/01-signin-modal.png`,
    `02-after-help-shortcut.png`
  - scripts `F-03b-modal-overlay.cjs`, `F-03c-signin-modal.cjs`
- **Suspected file**: `src/components/CopyBlocks.tsx`, `SymbolPalette.tsx`,
  `YouTubeConnectModal.tsx` (z-order / geometry) vs
  `src/components/shell/HelpButton.tsx` in a `z-30` header

---

### F-4  An update error at 1024px or narrower wraps the header and moves the help button out of the top-right corner
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-10b-updater-tail.cjs`
  2. Set the viewport to 1024×768, send `{ state: "error", message: "ENOENT: …" }`
     on `updater:status`, measure `#ui-help-button`.
- **Expected**: the "?" stays the last item top right in every state
  (`HelpButton.tsx`: "ALWAYS the last item top right of the header, on every
  screen").
- **Actual**: the header grows from 48px to 82px and the "?" moves from
  `fromRight: 10, fromTop: 39` to `fromRight: 634, fromTop: 77` — it drops to
  the middle-left of a second header row. Reproduced at 1024, 900 and 760px; at
  1440px the header does not wrap. The same wrap happens for any long update
  label, so the help button's position depends on what the updater happens to
  be saying.
- **Proof**:
  - `audit/out/area-F/F-10b-updater-tail/updater-tail.json`
  - `audit/out/area-F/F-10b-updater-tail/03-error-1024.png` (the "?" visibly on row 2)
  - `audit/out/area-F/F-13-main/10-s13.png`
  - script `F-10b-updater-tail.cjs`, story S13 in `F-13-user-stories.cjs`
- **Suspected file**: `src/components/shell/AppHeader.tsx` (`flex-wrap` header),
  `src/components/UpdateStatus.tsx`

Position is otherwise correct: measured at 1440×900, 1024×768 and 900×800 on the
workspace screen, the channel screen, with the settings popover, campaign
popover, Copy blocks, Symbols and the help drawer open, and during the sign-in
modal and the restoring overlay, the button is always `fromRight: 10,
fromTop: 39` and the last header child
(`audit/out/area-F/F-03-position/positions.json`,
`audit/out/area-F/F-12-channel-help.json`).

---

### F-5  Copy diagnostics copies an empty report for any failure during the metadata pre-flight — no job id, no engine stderr, no log lines
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. Load a video, mark a range.
  2. Make `yt-dlp` fail on the metadata probe (stub `exitCode: 1`, stderr
     `ERROR: Traceback … TypeError: NoneType object is not subscriptable`).
  3. Press "Cut as one file", then press "Copy diagnostics".
  4. `xvfb-run -a node F-07-diagnostics.cjs` and `node F-07b-failure-body.cjs`.
- **Expected**: the report carries "the logs for that specific failure", which is
  what the button is for.
- **Actual**: the clipboard holds
  `App: unknown / OS: unknown / yt-dlp: unknown / ffmpeg: unknown / Job: unknown`,
  `--- engine stderr, this run only (0 lines) --- (none captured)` and
  `--- log lines for job unknown (0 lines) --- (none captured)`. The developer
  receives one sentence and nothing else.
  `F-07b` shows why: `POST /api/download` returns
  `{error, code, cause, action, preserved}` with **no `diagnostics` key** when
  the failure happens in the pre-flight probe — `server/index.ts:1215` calls
  `sendFailure(res, classifyFailure(...))` with no extra, and
  `server/index.ts:1210` (the cookie branch) returns a bare `{error}`. Only the
  download-stage catch at `server/index.ts:2056` passes `{ diagnostics }`.
  Because the probe is the first yt-dlp call, most engine failures land here.
  When the failure *does* reach the download stage the report is good (F-07c:
  22 stderr lines, 26 job-scoped log lines, progress chatter stripped).
- **Proof**:
  - `audit/out/area-F/F-07b-failure-body/failure-body.json` and
    `failure-body-nojobid.json` (no `diagnostics` key, status 500)
  - `audit/out/area-F/F-07-diagnostics/clipboard-dev-failure.txt`
  - `audit/out/area-F/F-07c-download-stage/clipboard.txt` (the good case, for contrast)
  - story S9 in `audit/out/area-F/F-13-user-stories.json`
  - scripts `F-07-diagnostics.cjs`, `F-07b-failure-body.cjs`, `F-07c-download-stage-failure.cjs`
- **Suspected file**: `server/index.ts` (lines 1210, 1215) feeding
  `src/components/DiagnosticsDisclosure.tsx` → `src/lib/diagnostics.ts`

---

### F-6  "Copy log" puts raw cookie values, bearer tokens, the user's email and absolute home paths on the clipboard, under a line promising it does not
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-09-log-redaction.cjs` — loads a video, makes the
     download stage fail with engine stderr containing a Netscape cookie row
     (`SID  SECRETsidrowvalue999`), `Cookie: SID=SECRETsid123`,
     `Authorization: Bearer SECRETbearertoken…`, `access_token=…`,
     a signed `googlevideo` URL, `sam.clipper@example.com` and
     `/root/Videos/clips/SECRETFOLDER/out.mp4`.
  2. Read `<userData>/logs/main.log`, then call `diagnostics:copy` (the
     "Copy log" button in the Diagnostics disclosure) and read the clipboard.
- **Expected**: what `DiagnosticsDisclosure.tsx` tells the user — "It records
  what happened and when, with **no cookies, tokens or personal data**" — and
  what `electron/logger.cjs` claims in its header comment.
- **Actual**: every planted secret is in both the log file and the clipboard,
  verbatim: `cookieRow`, `cookieHeader`, `bearer`, `accessToken`, `sig`, the
  plain email, `/root/…` and the cookies file path. `logger.captureConsole()`
  forwards the bundled server's console into the log, and the server logs raw
  yt-dlp stderr; `ipcMain.handle("diagnostics:copy")` does
  `clipboard.writeText(logger.tail(500))` with no redaction. The redactor in
  `src/lib/diagnostics.ts` is only ever applied to the per-failure bundle. The
  user is explicitly told it is safe to send this to the developer.
- **Proof**:
  - `audit/out/area-F/F-09-log-redaction/log-redaction.json`
    (`secrets present` lists all seven for both sinks)
  - `audit/out/area-F/F-09-log-redaction/main.log.copy`
  - `audit/out/area-F/F-09-log-redaction/copy-log-clipboard.txt`
  - story S15, `audit/out/area-F/F-13-main/story15-log.txt`
  - script `F-09-log-redaction.cjs`
- **Suspected file**: `electron/logger.cjs` (`captureConsole`, `tail`),
  `electron/main.cjs` (`diagnostics:copy`, `diagnostics:read`),
  `src/components/DiagnosticsDisclosure.tsx` (the promise text)

---

### F-7  The on-screen failure alert renders the engine's raw stderr unredacted — cookie values, bearer token, email, home path
- **Severity**: major
- **Status**: confirmed
- **Steps**: as F-6 steps 1–2, then read the `[role="alert"]` text in the
  workspace (`F-07c-download-stage-failure.cjs`).
- **Expected**: a plain message. The redactor exists and is known-good — it
  cleans the same text for the clipboard bundle in the very same render.
- **Actual**: the alert above the status strip reads
  `YouTube refused the media request for this video: .youtube.com TRUE / TRUE
  2000000000 SID SECRETsidrowvalue999 / Cookie: SID=SECRETsid123; … /
  Authorization: Bearer SECRETbearertoken… / … access_token=SECRETaccesstoken… /
  user sam.clipper@example.com / writing /root/Videos/clips/SECRETFOLDER/out.mp4
  / ERROR: Postprocessing: ffmpeg exited with code 234`.
  `classifyFailure`'s `unknown` branch puts the whole stderr tail into
  `failure.error`, `DownloadBar` renders `{error}` as-is, and `redact()` is
  never called on it. Anyone screen-sharing or screenshotting a failed cut
  publishes their YouTube session cookie. The same raw tail is also shown for an
  `/api/info` crash (`F-07-diagnostics`, case `dev: /api/info crash`).
- **Proof**:
  - `audit/out/area-F/F-07c-download-stage/on-screen-alert.txt`
  - `audit/out/area-F/F-07c-download-stage/01-download-stage-failure.png`
  - `audit/out/area-F/F-07-diagnostics/diagnostics.json` (`dev: /api/info crash` → `statusText`)
  - script `F-07c-download-stage-failure.cjs`
- **Suspected file**: `src/lib/diagnostics.ts` (`redact` is never applied to the
  displayed message), `src/components/shell/DownloadBar.tsx`,
  `server/segments.ts` (`classifyFailure` unknown branch)

---

### F-8  Copy diagnostics is offered next to a plainly user-fixable error, because that failure path sends no `code`
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-07-diagnostics.cjs`
  2. Case `user: save folder gone` — yt-dlp fails with
     `unable to open for writing … No such file or directory` while its `-v`
     output also mentions the cookies file (which real `yt-dlp -v` always does).
- **Expected**: the user's explicit requirement — code-level errors, and only
  those, offer "Copy diagnostics".
- **Actual**: the app shows **"Your in-app YouTube sign-in is no longer valid.
  Sign in again from the YouTube button."** — a message whose own text is the
  fix — and attaches a **Copy diagnostics** button to it
  (`copyButton: true`). `isCookieError` matches on
  `text.includes("cookies") && text.includes("no such file")`, and that branch
  (`server/index.ts:1210` / `:2008`) returns the failure **without a `code`**;
  `classifyFailureKind(undefined)` is `needsDeveloper`, so the button renders.
  The four genuinely user-fixable classifications that do carry a code behave
  correctly (disk full, network dropped, private video, bad URL: all
  `copyButton: false`).
- **Proof**:
  - `audit/out/area-F/F-07-diagnostics/diagnostics.json`
    (row `case: "user: save folder gone"`, `copyButton: true`)
  - `audit/out/area-F/F-07-diagnostics/02-case-user-save-folder-gone.png`
  - script `F-07-diagnostics.cjs`
- **Suspected file**: `server/index.ts` (the two `isCookieError` branches omit
  `code`), `src/lib/diagnostics.ts` (`classifyFailureKind` default)

---

### F-9  "Check for updates" says "Up to date" when the check never happened
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-10c-real-check.cjs` (GitHub is unreachable from this
     container, and this Linux build is not running as an AppImage).
  2. Press the header's "Check" and sample the strip every 500ms for 20s.
- **Expected**: either a result or a failure. Never a false "you are current".
- **Actual**: the strip reads **"Up to date"** for 4 seconds and then clears.
  The main log shows `[updater] manual check requested` and then only
  electron-updater's warning `APPIMAGE env is not defined, current application
  is not an AppImage` — no `update-not-available` event, no `[updater] error:`
  line. `ipcMain.handle("updater:check")` treats *any* resolution without a
  version as "none": `if (!version || version === app.getVersion())
  sendUpdateStatus({ state: "none" })`. "The check could not run" and "you are
  on the newest version" are reported identically.
- **Proof**:
  - `audit/out/area-F/F-10c-real-check/real-check.json` (40 samples)
  - `audit/out/area-F/F-10c-real-check/logs.json` (`mainLog`)
  - `audit/out/area-F/F-13-main/09-s12.png`, story S12
  - script `F-10c-real-check.cjs`
- **Suspected file**: `electron/main.cjs` (`updater:check` handler),
  `src/components/UpdateStatus.tsx`

---

### F-10  One malformed `updater:status` payload blanks the whole window, with no error boundary and no way back
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-10-updater-states.cjs`
  2. The script sends each `UpdateStatusPayload` in turn over the real
     `updater:status` channel; the last one is `null`.
- **Expected**: at worst, the strip renders nothing.
- **Actual**: `TypeError: Cannot read properties of null (reading 'state')`
  thrown from `UpdateStatus`, and the entire renderer tree unmounts — the window
  is solid black. Everything after that point in the run returns `undefined`:
  no header, no tabs, no marks, no way to recover but relaunch. There is no
  React error boundary above the header, so *any* throw in the update strip
  takes the whole app with it. The `null` payload itself is not reachable from
  the shipped main process, but the missing boundary is what makes any future
  throw here catastrophic.
- **Proof**:
  - `audit/out/area-F/F-10-updater-states/22-update-null-payload.png` and
    `23-after-check.png` (both solid black)
  - `audit/out/area-F/F-10-updater-states/updater-states.json`
    (`pageErrorsSoFar` jumps to 2 on the `null-payload` row)
  - script `F-10-updater-states.cjs`
- **Suspected file**: `src/components/UpdateStatus.tsx`, `src/App.tsx`
  (no error boundary around the shell)

---

### F-11  Help offers the two channel-exporter tutorials on machines where the channel screen does not exist
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node setup-app-mirror.cjs --non-owner` (built with
     `VITE_ENABLE_CHANNEL_DATA=1`, owner list set to a hash this machine cannot match)
  2. `xvfb-run -a node F-12-channel-help.cjs`
- **Expected**: the help list matches what the user can actually do.
- **Actual**: the drawer lists 16 tasks including "Export a channel's data" and
  "Stop a run and keep what it got" while `#ui-channel-link` does not exist and
  never will on this machine. `HelpDrawer.tsx` gates the channel tasks on the
  **build** flag `import.meta.env.VITE_ENABLE_CHANNEL_DATA`; `AppHeader` gates
  the link on the **owner** check (`__CHANNEL_DATA__` + `__OWNER_MACHINES__`).
  Two different gates.
  Separately, on an owner build both tutorials are broken anyway:
  `help-anchor-channel-start` and `help-anchor-channel-stop` are absent even
  while the channel screen is open (an instance of F-1).
- **Proof**:
  - `audit/out/area-F/F-12-channel-help.json`
  - `audit/out/area-F/F-13-s11-nonowner/01-s11.png`, story S11
  - script `F-12-channel-help.cjs`
- **Suspected file**: `src/components/HelpDrawer.tsx` (the `TASKS` ternary)

---

### F-12  The downloading percent is rendered straight from the payload: `-1%`, `999%`, `NaN%`, `undefined%`
- **Severity**: minor
- **Status**: confirmed
- **Steps**: `xvfb-run -a node F-10-updater-states.cjs`, rows
  `downloading-minus1`, `downloading-999`, `downloading-NaN`,
  `downloading-missing-percent`.
- **Expected**: a clamped 0–100, or no number.
- **Actual**: the strip reads "Downloading update… -1%", "… 999%", "… NaN%",
  "… undefined%". `UpdateStatus.tsx` interpolates `status.percent` with no
  clamp; `OverlayLoader.tsx` does clamp the same kind of value
  (`Math.max(0, Math.min(100, …))`), so the two disagree.
  `electron-updater`'s `download-progress` percent comes from the feed, so
  out-of-range values are reachable; `NaN`/`undefined` are defensive only
  (`main.cjs` coerces them to 0).
- **Proof**: `audit/out/area-F/F-10-updater-states/updater-states.json`;
  screenshots `11-update-downloading-NaN.png`, `12-update-downloading-minus1.png`,
  `13-update-downloading-999.png`, `14-update-downloading-missing-percent.png`
- **Suspected file**: `src/components/UpdateStatus.tsx`

---

### F-13  The update error's actual reason is only in a hover tooltip, and the strip is not a live region
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node F-10b-updater-tail.cjs` and `F-11-accessibility.cjs`.
  2. Send `{ state: "error", message: "ENOENT: … app-update.yml" }`.
- **Expected**: a plain message with the reason and a next step; state changes
  announced.
- **Actual**: the visible text is only "Update check failed"; the real message
  is in `title=` on the span, so it is mouse-only — unreachable by keyboard, by
  touch and by a screen reader that does not surface `title`. The strip has no
  `aria-live` and no `role`, so "Checking…", "Downloading… 50%", "Update ready"
  and "Update check failed" are never announced. The `manual` state's
  explanation ("This macOS build is unsigned and cannot replace itself") is
  likewise tooltip-only.
  Also in the same area: `checking` has no timeout, so the strip still read
  "Checking for updates…" 8 seconds after a `checking` with no follow-up
  (there is no corresponding `none`-style self-clear).
- **Proof**:
  - `audit/out/area-F/F-10b-updater-tail/updater-tail.json` (`stripTitle`,
    `checking after 8s`)
  - `audit/out/area-F/F-11-accessibility/accessibility.json`
    (`updateLive: {"hasLive": null, "role": null}`)
  - `audit/out/area-F/F-10b-updater-tail/01-checking-stuck.png`
- **Suspected file**: `src/components/UpdateStatus.tsx`

---

### F-14  "All tasks" does not show all tasks: the search box keeps its query
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Open help, type `folder` (2 results), open "Change where clips save",
     press "All tasks".
  2. `xvfb-run -a node F-05b-tutorial-switch.cjs`
- **Expected**: a link labelled "All tasks" shows all 14.
- **Actual**: `{"listShown": 2, "query": "folder"}` — the list is still filtered
  and the field still holds the old query, with no visible clear affordance
  beyond selecting the text. `backToList()` resets `taskId` and `step` but not
  `query`.
- **Proof**: `audit/out/area-F/F-05b-tutorial-switch/tutorial-switch.json`
  (rows `a1`, `a3`), `01-all-tasks-keeps-query.png`
- **Suspected file**: `src/components/HelpDrawer.tsx` (`backToList`)

---

### F-15  Closing and reopening help silently drops the user back into the middle of a tutorial
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Open help, run "Cut a clip", press "Next step" once (step 2 of 3).
  2. Press the "?" to close, press it again to reopen.
  3. `xvfb-run -a node F-05-order-races.cjs`
- **Expected**: either a deliberate "resume" affordance, or the task list.
- **Actual**: the drawer reopens at `"Step 2 of 3"` of "Cut a clip" with the old
  query still in the box and no list in sight. `HelpDrawer` returns `null` when
  closed but stays mounted, so all state survives. A user who opened help for a
  different question has to notice the "All tasks" link first.
  Related, same script: opening a new workspace tab closes the drawer outright
  (help state is per tab), and Escape during a tutorial closes the whole drawer
  rather than the tutorial.
- **Proof**: `audit/out/area-F/F-05-order-races/order-races.json`
  (rows `1. tutorial at step 2`, `1. after reopen`), `01-reopen-state.png`
- **Suspected file**: `src/components/HelpDrawer.tsx`

---

### F-16  Two tutorials point both of their steps at the same control, so "Next step" changes nothing on screen
- **Severity**: minor
- **Status**: confirmed
- **Steps**: run "Change where clips save" and "Change where exported data
  saves" in `F-01-spotlight.cjs`; both steps probe the same anchor.
- **Expected**: each step highlights the control that step is about.
- **Actual**: `change-clips-folder` uses `ui-footer-clips` for both steps and
  `change-data-folder` uses `ui-footer-data` for both, so the ring and the badge
  number stay exactly where they were when the user presses "Next step"
  (`reorder-segments` does the same with `help-anchor-segment-list`, though that
  anchor does not exist at all — F-1). Step 2 of each ("Choose a folder") is
  about a native folder picker that has no anchor.
- **Proof**: `audit/out/area-F/F-01-spotlight/spotlight-results.json`
  (`change-clips-folder` step1/step2 both `ui-footer-clips`, both `ok`);
  screenshots `audit/out/area-F/F-01-spotlight/08-empty-change-clips-folder.png`,
  `09-empty-change-data-folder.png`
- **Suspected file**: `src/lib/helpTasks.ts`

---

### F-17  Arabic queries never match, although the tokenizer goes out of its way to keep Arabic
- **Severity**: minor
- **Status**: confirmed
- **Steps**: open help, type `بسم` (`F-04-search.cjs`, case `arabic`; story S5).
- **Expected**: "Insert a symbol or honorific" — the task whose aliases are
  `arabic`, `bismillah`, `salawat`, `sallallahu`.
- **Actual**: 0 results, "No task matches. Try clip, folder, copy or symbol."
  `tokenize()` explicitly preserves the Arabic block (`[^a-z0-9؀-ۿ']`), but no
  title or alias in the catalogue contains a single Arabic character, so the
  preserved tokens can never match. The one task the feature was clearly built
  for is the one it cannot find.
- **Proof**: `audit/out/area-F/F-04-search/search.json` (row `arabic`),
  `audit/out/area-F/F-13-main/04-s05.png`
- **Suspected file**: `src/lib/helpTasks.ts` (`HELP_TASKS` aliases, `tokenize`)

---

### F-18  The Setup checklist inside the help drawer drives the same dead anchor ids
- **Severity**: minor
- **Status**: confirmed
- **Steps**: `xvfb-run -a node F-14-setup-checklist-anchors.cjs` — opens the
  drawer, expands "Setup checklist", probes the ids its actions resolve.
- **Expected**: each checklist action takes the user to the thing it names.
- **Actual**: `document.getElementById("help-anchor-youtube-status")` and
  `document.getElementById("help-anchor-clips-tabs")` are both `null` in the
  live app (the Bank tab is really `clips-tab-bank` inside `clips-panel`), so
  `SetupChecklist`'s `sign-in` fallback and its `open-bank` action are
  silent no-ops with `?.click()` swallowing the miss. Pressing "Import a fresh
  cookies.txt" in the drawer produced no visible change.
- **Proof**: `audit/out/area-F/F-14-setup-checklist/setup-checklist.json`
  (`deadAnchors: {youtubeStatus:false, clipsTabs:false, realClipsTab:true}`),
  `01-setup-checklist.png`, `02-after-checklist-actions.png`
- **Suspected file**: `src/lib/helpTasks.ts` (`ANCHORS`),
  `src/components/SetupChecklist.tsx`

---

### F-19  The googlevideo stream `id` parameter survives redaction
- **Severity**: minor
- **Status**: confirmed
- **Steps**: `xvfb-run -a node F-07c-download-stage-failure.cjs`; the planted
  stderr contains
  `https://rr3---sn-abc.googlevideo.com/videoplayback?…&id=o-SECRETSTREAMID&sig=…`.
- **Expected**: the same treatment as `sig`, `n`, `ip` and `pot`, all of which
  are correctly replaced with `REDACTED`.
- **Actual**: the clipboard keeps `id=o-SECRETSTREAMID`. `SENSITIVE_PARAM_EXACT`
  is `{s, ip, si, n}` and `SENSITIVE_PARAM_CONTAINS` matches `sid` but not `id`,
  so the per-session stream identifier goes out in every report.
  Everything else in the bundle redacts correctly: cookie rows become
  `[cookie data removed]`, `Cookie:` / `Authorization:` become `<redacted>`,
  `access_token` / `po_token` / `visitor_data` become `<redacted>`, the email
  becomes `<email>` and `/root/...` becomes `~/...` — **no absolute path
  revealing the user's name reaches the clipboard** on this path.
- **Proof**: `audit/out/area-F/F-07c-download-stage/summary.json`
  (`leaks: ["signedUrl:SECRETSTREAMID", …]`), `clipboard.txt`
- **Suspected file**: `src/lib/diagnostics.ts` (`SENSITIVE_PARAM_EXACT`)

---

### F-20  A query of pure punctuation returns the whole catalogue and is reported as a real result set
- **Severity**: polish
- **Status**: confirmed
- **Steps**: `xvfb-run -a node F-04-search.cjs`, cases `.*`, `((`, `$^`,
  `null-ish` (`\u0000`), `emoji`.
- **Expected**: either "no task matches" or, at least, not "14 tasks" as though
  the query had matched them.
- **Actual**: all of them show every task with the status line "14 tasks", while
  `[a-z]+` and `<script>alert(1)</script>` show 0. `queryTokens` strips
  non-alphanumerics and the empty-token case deliberately means "show
  everything" — correct for `"   the a "`, surprising for `".*"`. No crash, no
  regex injection, no layout break: a 1,000-character query is handled in
  ~300 ms with no horizontal overflow (`drawerScrollW == drawerClientW == 398`).
- **Proof**: `audit/out/area-F/F-04-search/search.json`;
  `02-search-emoji.png`, `03-search-1000-chars.png`
- **Suspected file**: `src/lib/helpTasks.ts` (`queryTokens`)

---

## Step 4 — user stories, run against the app

`audit/run-1/area-F/F-13-user-stories.cjs`, results in
`audit/out/area-F/F-13-user-stories.json`. **15 stories, 11 failed.**

| # | Story | Verdict | What happened |
|---|---|---|---|
| S1 | New user blocked by the sign-in modal presses "?" | FAIL | click swallowed by the scrim; only the undocumented ⌘/ works (F-3) |
| S2 | First clip: search "cut a clip", follow 3 steps | FAIL | 0/3 steps highlighted anything (F-1) |
| S3 | Search "stitch" to find Add segment | FAIL | 3/3 steps highlighted nothing; the button is `#ui-add-segment` (F-1) |
| S4 | Types "campiagn" | PASS | first result "Switch campaign" |
| S5 | Types بسم for the honorific palette | FAIL | 0 results (F-17) |
| S6 | Two tabs open, help on the second | FAIL | every anchor resolves to the hidden tab's duplicate (F-2) |
| S7 | Follow "Copy a transcript for a chat" | FAIL | the panel covers the drawer and the "?"; step 2's anchor absent (F-3, F-1) |
| S8 | ffmpeg dies; Copy diagnostics and paste to the developer | PASS | 2,423-char scoped report, no secrets — but the on-screen alert leaks them (F-7) |
| S9 | yt-dlp dies reading metadata; Copy diagnostics | FAIL | report has no job id, no stderr, no log lines (F-5) |
| S10 | Disk fills mid-download | PASS | plain message, a next step, no developer button |
| S11 | Non-owner build, browses help | FAIL | offered "Export a channel's data" with no channel screen (F-11) |
| S12 | Presses Check on a locked-down network | FAIL | "Up to date" (F-9) |
| S13 | 1024px laptop, update error, looks top right for "?" | FAIL | header wrapped, "?" moved to 634px from the right (F-4) |
| S14 | Keyboard-only: Tab to "?", open, read, Escape | PASS | focus to `#help-search`, Escape returns focus to the button |
| S15 | Support asks for the log; presses Copy log | FAIL | clipboard holds the raw SID cookie and the Bearer token (F-6) |

---

## What passed

Worth recording, because these were attacked and held up.

- **Help button position.** 10px from the right edge, 39px from the top, last
  header child, in 20 measured states across three viewports, both screens, five
  overlays, the sign-in modal and the restoring overlay — except when the header
  wraps (F-4). `audit/out/area-F/F-03-position/positions.json`.
- **Search robustness.** 27 queries including 1,000 characters, regex
  metacharacters, emoji, NUL, HTML and mixed case: no crash, no page error, no
  overflow, case-insensitive, whitespace trimmed, one-typo tolerance works,
  stop-words ignored, the empty state names four things to try.
  `audit/out/area-F/F-04-search/search.json`.
- **Log file interruptions.** No log file → `{"ok": false, "error": "No log file
  yet."}`; empty log → handled; invalid UTF-8 → replacement characters, no
  throw; **50 MB log → read in 175 ms and copied in 244 ms**, window still
  responsive, because `logger.tail` only keeps the last 500 lines (46 KB).
  `audit/out/area-F/F-08-log-file.json`.
- **Spotlight mechanics.** Where the anchor exists the ring and numbered badge
  are correct, `aria-hidden="true"`, `pointer-events: none`, `z-index: 60`, no
  focusable children, and the highlighted control stays clickable (verified with
  a real click). It does not strand focus.
  `audit/out/area-F/F-11-accessibility/01-a11y-tutorial.png`.
- **Drawer accessibility.** `<aside aria-label="Help">` with an `h2`, every
  control named (0 unlabelled), the result count and "Step n of m" in polite
  live regions, Tab reaches the "?" in 7 stops, Enter opens it and moves focus
  to the search field, Escape closes and returns focus to the "?".
  Focus is **not** trapped — correct for a non-modal drawer that is a flex
  sibling of the app, and the user can keep working with it open.
  `audit/out/area-F/F-11-accessibility/accessibility.json`.
- **Per-failure scoping, when the diagnostics actually arrive.** The
  download-stage report carries the job id, 22 stderr lines for that run only,
  26 log lines filtered by `job=`, progress chatter stripped, cookies/tokens/
  email/home path redacted, fenced for pasting, 4 KB.
  `audit/out/area-F/F-07c-download-stage/clipboard.txt`.
- **Copy diagnostics is correctly absent** for a bad URL, disk full, network
  dropped and private video. `audit/out/area-F/F-07-diagnostics/diagnostics.json`.
- **Updater renderer states.** 21 of 22 payloads render without a crash,
  including `{state: "wat"}` (renders nothing but the Check button) and an
  empty or 3,000-character error message (label stays "Update check failed",
  no overflow). The `none` state does self-clear after 4 s.
- **Races and repetition.** Double-clicking the "?", twelve rapid Escapes, and
  opening help while a download runs all leave the app intact with no page
  errors. Typing in the search during a tutorial cleanly abandons it; only one
  `[data-help-spotlight]` element ever exists.
  `audit/out/area-F/F-05-order-races/order-races.json`.

---

## Coverage

| Thing to prove | How | Result |
|---|---|---|
| Every tutorial's anchor exists and is visible | all 14 public + 2 channel tasks, every step, enumerated from `helpTasks.ts`, in an empty and a loaded workspace | F-1, F-11, F-16 |
| Spotlight with duplicate ids (multi-tab) | second tab active, 4 live anchors | F-2 |
| Help button position | 3 viewports × (workspace, channel, 5 overlays, sign-in modal, restoring overlay) = 20 measurements, plus real clicks | F-3, F-4 |
| Help drawer search | 27 queries (empty, whitespace, no match, emoji, Arabic, 1,000 chars, regex metacharacters, case, all-matching, leading/trailing spaces, HTML, NUL) | F-17, F-20, otherwise clean |
| Order of actions | navigate away mid-tutorial, new tab, tutorial over tutorial, close/reopen, a step needing a video with none loaded | F-15, F-16 |
| Repetition and races | double-click, 12× Escape, help during a live download | clean |
| Copy diagnostics gating | 5 engine classifications + bad URL + `/api/info` crash | F-8, correct for the other 5 |
| Copy diagnostics contents | clipboard asserted against 8 planted secrets, two failure stages | F-5, F-7, F-19 |
| Whole-log route | log file + `diagnostics:copy` clipboard asserted against the same secrets | F-6 |
| Log interruptions | missing, empty, 50 MB, invalid UTF-8 | clean |
| Update states | all 7 `UpdateStatusPayload` variants + 12 edge payloads, screenshotted, plus a real `updater:check` | F-9, F-10, F-12, F-13 |
| Accessibility | CDP accessibility tree, real Tab/Enter/Escape, focus tracking, live regions, spotlight focus | F-13 (update strip only); drawer clean |
| User stories | 15, run end to end | 11 failed |

Not covered in my area, by design: the content of the Copy blocks and Symbols
palettes (area D), the failure classifier's own correctness (area G), the
sign-in modal's own behaviour (area A). Each is referenced only where it changes
what help or diagnostics does.

## Not provable here

- **The installer actually replacing the app**, on any OS. `updater:quitAndInstall`
  was not fired; `electron-updater`'s download and swap need the packaged
  artefacts (`.dmg` / `.exe` / `.AppImage`) and a real release feed.
- **Code signing**, and therefore whether `canInstallInPlace(platform) === false`
  on macOS is the right call. `electron/updater.cjs` is pure data and its
  `ASSETS` names are already asserted against `package.json` by
  `server/updater.test.ts`; the renderer's handling of the resulting `manual`
  state is tested above, but the premise is not.
- **The `manual` state in situ.** It only occurs on `darwin`; this is Linux. The
  renderer path was driven with real payloads instead.
- **What `autoUpdater.checkForUpdates()` does in a packaged build with no
  network.** Here it resolves quietly because the app is not running as an
  AppImage. F-9's defect — `updater:check` treating "no version came back" as
  "up to date" — is in the handler's own logic and holds either way, but the
  exact trigger in a packaged build is unverified.
- **Real GitHub release metadata**, so `downloadUrl()` could not be checked
  against an actual asset. The network policy refuses the host.
