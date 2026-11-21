# Area A + F — run 2: onboarding and sign-in; help, tutorials, diagnostics, updates

Everything below was driven against the **real packaged-shape app** under
`xvfb`, with a **fresh `--user-data-dir` per launch**, against **frozen mirrors**
I built myself (`/tmp/af-public`, `/tmp/af-owner`) rather than the repo's
`dist/` — another helper's working copy changed under me mid-run
(`git status` showed `audit/run-2/area-CD/d5-handoff.cjs` being edited while I
worked), which is exactly the swap the mirror prevents.

**No product file was changed.** `git status --porcelain`, filtered to
everything outside `audit/run-2/area-AF/`, is empty of product paths.

Scripts: `audit/run-2/area-AF/af-*.cjs`. Captured output, screenshots and
clipboard dumps: `audit/run-2/area-AF/out/<label>/`.

## Scaffolding, disclosed

- `mkmirror.cjs` — real `vite build` + real `scripts/build-server.cjs`
  (through its own `BUILD_SERVER_OUT`) into `/tmp/af-<shape>`; unmodified
  `electron/*.cjs` copied beside them. Owner shape uses my own salt
  `run2-af-salt-7c13` and this machine's hash.
- `mkstub.cjs` — **my own** scriptable `yt-dlp`, not the shared harness stub.
  `--version` always succeeds (otherwise `resolveYtDlp()` falls through to a
  real yt-dlp and reaches the network); four independently scriptable stages
  (`auth` with a `perSource` map so each `--cookies-from-browser` value can
  answer differently inside one sweep, `infoStage`, `subs` which writes a real
  `.en.vtt`, `downloadStage`); every invocation's literal argv is appended to
  `calls.log`, so process counts and `--cookies` provenance are measured.
  ffmpeg and deno stay real, so cuts are genuine.
- `markers.cjs` — **15 planted secrets of my own**, none reused from run 1,
  T8 or T2. Reports print only a shape, never a value.
- Updater payloads are sent over the **real** `updater:status` IPC channel from
  the main process. Clipboard assertions read Electron's own
  `clipboard.readText()`.
- One page-level substitution, in one test only (`af-11`, item 12): `window.fetch`
  is wrapped to record URLs so the renderer's own `jobId` can be read. No
  product code is involved; the product's fetch still runs.

Findings: **0 blocker, 3 major, 9 minor, 2 polish** (14).

---

## Verdict on each fix I was asked to re-run

| ID | Verdict | Evidence |
|---|---|---|
| **A-1** escape route | **HELD** | gate dismissible 3 ways; a skipped user cut a real 981,457-byte 360p MP4 end to end |
| **H-2** focus trap / inert | **HELD** | **0 of 44** Tab presses outside the dialog (run 1: 35 of 40); focus takes the dialog on open; both shell siblings `inert` + `aria-hidden`, both restored on close |
| **A-1 × H-2** interaction | **HELD** | Escape still dismisses, Continue is Tab stop **1**, Tab→Enter dismisses |
| **A-2** late sweep | **HELD** | late **failure** and late **success** both refused to overwrite; source stays `app` across 28 one-second samples |
| new persisted skip | **PARTLY SOUND** | survives relaunch, cleared by a real sign-in — but AF2-2, AF2-4, AF2-5, AF2-6, AF2-7 |
| **F-1** anchors | **HELD, and better than T10 claimed** | 27/27 declared anchors exist live; public build 30 of 32 steps spotlight, the 2 misses are the deliberate nulls; **0 false notices** |
| **F-6** Copy log clipboard | **HELD** | 1 of 15 markers, and that one is a redactor gap, not a missing call |
| **F-6** the *other* surface | **NOT COVERED** → AF2-1 | the same log is rendered raw on screen: **7 of 15** |
| **F-7** on-screen alert | **HELD** | 1 of 15 (download stage), 3 of 15 (pre-flight) — all three are redactor gaps |
| **redact() parity** | **HELD** | byte-identical on my corpus for `homeDir` = none, `/root`, `/home/user`, `/Users/sam`, `C:\Users\Sam` |
| **F-3** help button | **HELD** | clickable in **40 of 40** width×overlay states, plus the update-error state; side effects AF2-3, AF2-9, AF2-10 |
| **F-5** pre-flight bundle | **HELD** (residual AF2-12) | 2,756 bytes with job id, versions, attempt and 21 stderr lines (run 1: 639 bytes, all "unknown") |
| **F-8** gating | **HELD** | cookie-store error → no button; ffmpeg-234 control → button |
| **F-9** update honesty | **HELD** | "Update check failed" + the real reason; never "Up to date" |
| **F-10** error boundary | **HELD — first time exercised with a real render throw** | `TypeError: Cannot read properties of null (reading 'state')` caught; both Try again and Reload window recover fully |
| **item 12** 499 cancel | **HELD — first time driven for real** | engine-side cancel → renderer silent, no alert, no Copy diagnostics |
| **T10 item 8** ChannelExportPanel | **HELD** | 3 of 15, same three redactor gaps |
| **F-18** checklist anchors | **HELD** | "Open bank" moved `clips-tab-all` → `clips-tab-bank`; both ids resolve |

Unchanged, not my fixes, confirmed still broken (no new ID):
**F-2** (second tab ⇒ every tutorial dead: 0 spotlights, false notice, anchor
copies = 2, first copy invisible — the 11 new T10 ids inherit it) and
**F-12** (`-1%`, `999%`, `NaN%` still rendered raw).

---

## My own numbers

### Anchors (`af-06-anchors.cjs`)

Catalogue enumerated by transpiling `src/lib/helpTasks.ts` with esbuild and
`require`-ing it — never transcribed. Each step was probed **after performing
what its own preceding steps tell the user to do** (open Copy blocks, open
Symbols, open the campaign menu, Ctrl+F, add a segment, open All saved), in a
workspace seeded with a campaign, a second campaign, a saved clip, a real
transcript and a **used range to overlap**.

| | public | owner |
|---|---|---|
| declared anchors in `ANCHORS` | 27 | 27 |
| declared anchors absent from the live DOM | **0** | **0** |
| declared anchors no step uses (all present) | 6 | 6 |
| tasks / steps | 14 / 32 | 16 / 36 |
| steps with a spotlight | **30** | 32 (33 with an export running) |
| steps with a false "not on screen" notice | **0** | **0** |
| duplicate-id hits (one tab) | 0 | 0 |

**T10's claim checked, and it is conservative.** T10 reported 6 spotlight-less
steps and called each legitimate. I get:

- `check-unused#2` (`ui-overlap-warning`) — **not dead.** Seed a used range and
  mark one that overlaps it and the ring lands on the warning. T10 only missed
  it because its probe built no overlap.
- `fix-360p#2`, `#3` — deliberate `anchorId: null`, and the drawer correctly
  shows **no** notice for them. Legitimate.
- `ui-channel-link` — exists and spotlights in an owner build. Legitimate; it
  is genuinely absent from a public build, where the task is absent too.
- `ui-channel-stop` — exists and spotlights **while an export is running**,
  which is the state the step describes. Legitimate, with the caveat that the
  notice shown otherwise says "it appears once a video is loaded", which is
  wrong for this control.
- `ui-channel-start` — exists, is visible, no notice is shown, and **there is
  still no spotlight**. That one is a real defect, and not the one T10 named:
  see **AF2-8**.

So in a public build the only spotlight-less steps are the two deliberate
nulls, and in an owner build the only defect is AF2-8.

### Marker leaks (`af-07-parity.cjs`, `af-08-secrets.cjs`, `af-09-channel.cjs`)

15 markers of my own: a Netscape cookie row, a `Cookie:` header, a bare
`__Secure-3PAPISID=` assignment, an `Authorization: Bearer` header, a bare
`Bearer` token, `access_token=`, a JSON-quoted `"access_token"`, `po_token=`
+ `visitor_data=`, a query-style signed googlevideo URL, a **path-style**
signed googlevideo URL, an email, `/root/…`, `/home/user/…`, `--cookies <path>`
and a plain cookies-file path.

| surface | leaked / 15 |
|---|---|
| on-screen failure alert, download stage | **1** |
| on-screen failure alert, pre-flight stage | **3** |
| Copy diagnostics bundle, download stage | **3** |
| Copy diagnostics bundle, pre-flight stage | **3** |
| **Copy log** clipboard (`diagnostics:copy`) | **1** |
| ChannelExportPanel error alert | **3** |
| **Diagnostics panel rendered on screen (`diagnostics:read`)** | **7** |
| `<userData>/logs/main.log` (ground truth) | 7 |

Shapes that got through, and only shapes:
`…/id/o-R2MKpath…/sig/R2MKpath…REDACTED(15 chars)`,
`…"access_token": "R2MK…REDACTED(15 chars)`,
`…__Secure-3PAPISID=R2MK…REDACTED(18 chars)`,
plus, on screen only, `…binDir=/hom…REDACTED(10 chars)` and
`…write to /roo…REDACTED(6 chars)`.
Shapes that were correctly removed: `[cookie data removed]`,
`Cookie: <redacted>`, `Authorization: <redacted>`, `Bearer <redacted>`,
`access_token=<redacted>`, `po_token=<redacted> visitor_data=<redacted>`,
`…&id=REDACTED&sig=REDACTED&pot=REDACTED`, `<email>`, `~/Videos/…`,
`--cookies <redacted>`, `<cookies file>`.

---

### AF2-1  The Diagnostics panel renders the raw log on screen, two lines under "with no cookies, tokens or personal data"

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start with a valid `yt-cookies.txt`, load a video, mark a range.
  2. Make the download stage fail with engine stderr carrying the 15 planted
     markers (`af-08-secrets.cjs`, phase 1).
  3. From the status chip choose **Forget this sign-in** so the connect screen
     returns, then expand **Diagnostics** inside it.
  4. Read the `<pre>`.
- **Expected**: the same treatment the clipboard now gets. T2 fixed
  `diagnostics:copy`; the panel makes the identical categorical promise about
  the identical text.
- **Actual**: `ipcMain.handle("diagnostics:read")` returns
  `logger.tail(500)` with **no redaction at all**, and
  `DiagnosticsDisclosure` prints it verbatim in the `<pre>` directly beneath
  "The app's event log. It records what happened and when, **with no cookies,
  tokens or personal data**. If the app closed unexpectedly, the cause is
  here." 8,760 characters, **7 of my 15 markers present**: the signed-URL
  stream id, the path-style signed URL, the email, `/root/…`, `/home/user/…`,
  the `--cookies` path and a plain cookies-file path. On Windows those paths
  carry the user's account name. The adjacent **Copy log** button, reading the
  same `logger.tail(500)`, leaks **1**. So the two buttons sitting next to each
  other disagree about whether this text is safe.
  `Show file` reveals the same unredacted file in the file manager.
- **Proof**:
  - `audit/run-2/area-AF/out/af-08-p1/diagnostics-pre-onscreen.txt` (the text)
  - `audit/run-2/area-AF/out/af-08.json` → `p1_onScreenPreLeaks` (7),
    `p1_copyLogLeaks` (1), `p1_promiseSentence`
  - `audit/run-2/area-AF/out/af-17/01-diagnostics-pre-unredacted.png` — the
    promise sentence and `binDir=/home/user/stream-trimmer/…` on screen together
  - scripts `af-08-secrets.cjs`, `af-17-pre-shot.cjs`
- **Suspected file**: `electron/main.cjs:803` (`diagnostics:read` returns
  `logger.tail(500)` raw; `diagnostics:copy` at `:821` redacts),
  `src/components/DiagnosticsDisclosure.tsx:167`

---

### AF2-2  "Continue without signing in (360p)" does not give you 360p: the first cut is refused, at the quality the app itself defaults to

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start a fresh install with no cookies.txt. The footer quality chip
     reads **MP4 Best** (`af-14/01-gate-760.png`, bottom bar: "Uses MP4 Best").
  2. Press **Continue without signing in (360p)**, which says underneath:
     "Videos download at 360p until you sign in."
  3. Paste a link, mark a range, press **Cut as one file**
     (`af-04-skip-persist.cjs`, scenario S4).
- **Expected**: a 360p clip, as the button and its explanatory line promise.
  The engine does serve it — with the chip set to 360p the same flow produces
  a real 981,457-byte MP4 (`af-02`), which is the whole justification for the
  escape route.
- **Actual**: nothing is downloaded. A red alert reads **"No YouTube session is
  connected, and YouTube serves higher formats only to signed-in requests.
  Connect YouTube. Your marked range is kept."** and the clips folder stays
  empty. `server/index.ts:1412` refuses any `mp4` request where
  `quality === "best" || Number(quality) > 360`, and a new campaign is created
  with whatever the footer chip says, which on a fresh install is `"best"`
  (`useClipper.ts:138`). So the signed-out route the fix exists for fails on
  its very first use.
  Two things make it worse: the server's own `action`
  (`{id:"import_cookies", label:"Connect YouTube"}`) is **never rendered** —
  `DownloadBar` prints the sentence and no button — and nothing anywhere
  mentions the footer quality chip, which is the only fix.
  Separately, `lowQualityExplanation()` in `youtubeConnection.ts:110`, whose
  own comment says callers must show it "INSTEAD of silently handing over a
  360p file", is **called from nowhere in the product** (see AF2-14).
- **Proof**:
  - `audit/run-2/area-AF/out/af-04.json` → `s4` (`quality: "MP4Best"`,
    `anyAlert`, `clipsFolder: []`, `buttonsInAlert: []`)
  - `audit/run-2/area-AF/out/af-04-s4/01-skipped-cut-at-default-quality.png`
  - contrast: `audit/run-2/area-AF/out/af-02.json` (`quality: "MP4360p"` →
    `AF-stub0000001-01.mp4`, 981,457 bytes, `ftyp isom`, 640×360 h264)
  - `audit/run-2/area-AF/out/af-14/01-gate-760.png` (fresh install footer:
    "Uses MP4 Best")
  - scripts `af-02-skip-360p.cjs`, `af-04-skip-persist.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:294-304` (the
  promise), `src/hooks/useClipper.ts:138` + `src/lib/campaigns.ts:164` (the
  default), `src/components/shell/DownloadBar.tsx` (drops the server's action)

---

### AF2-3  Help opened over the sign-in gate is fully drawn, completely inert, and clicks fall through it onto the hidden gate beneath

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start with no cookies.txt so the gate is up.
  2. Click the "?" — which F-3's fix made reachable here, by portalling it to
     `document.body` at z-index 70.
  3. Try to use the drawer: type in the search field, click a task.
  4. Repeat with the window at 760px (`af-14-narrow-gate.cjs`).
- **Expected**: either help works, or the "?" is not offered in this state.
- **Actual**: the drawer mounts, renders at full brightness above the scrim
  (z-index 55 > the gate's 50) and lists all 14 tasks — and every control in it
  is dead. H-2's trap sets `inert` on the dialog's **siblings**, and the drawer
  lives inside one of them; the portalled button does not, because it is a
  child of `document.body`. Measured: `drawer.insideInert: true`,
  `searchDisabledByInert: true`, a Playwright `fill("#help-search", "folder")`
  reports success and the field's value is still `""`.
  Because `inert` also removes the subtree from hit-testing, the opaque panel
  is **click-through**: at 1440px `elementFromPoint` at the drawer's own
  midpoint returns the scrim, not the drawer. At 760px the drawer is full
  width, covers **88% of the dialog**, and a click at the coordinates where the
  user sees the drawer's "Setup checklist" row lands on the hidden
  **"Continue without signing in (360p)"** button underneath and dismisses the
  gate. So clicking a help panel silently takes the signed-out route.
  Escape still dismisses the gate, and the drawer becomes usable afterwards,
  so this is recoverable — but help, in the one state a brand-new user is in,
  went from unreachable (run 1's F-3) to visibly present and non-functional.
- **Proof**:
  - `audit/run-2/area-AF/out/af-01.json` → `helpDuringGate` (`insideInert:true`,
    `midIsDrawer:false`), `drawerUsable: {filled:true, value:""}`
  - `audit/run-2/area-AF/out/af-01-gate/03-help-during-gate.png`
  - `audit/run-2/area-AF/out/af-14.json` (`drawer {x:0,w:760}`,
    `dialogCoveredPct: 88`, `clickContinue: "escaped"`)
  - `audit/run-2/area-AF/out/af-14/02-drawer-over-gate-760.png`
  - scripts `af-01-gate.cjs`, `af-14-narrow-gate.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:170-220` (inert
  applied to siblings only), `src/components/shell/HelpButton.tsx` (portal
  escapes the inert subtree), `src/components/HelpDrawer.tsx:84` (`z-[55]`)

---

### AF2-4  An import that fails while the sign-in is skipped is completely silent — no message anywhere

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Launch with `clipper.signInSkipped: true` (what the new fix persists).
  2. Drop a file that is not a cookies.txt on the window, then a well-formed
     one whose probe comes back signed-out (`af-04` S3, `af-05` S7).
- **Expected**: the same message the gate would have shown.
- **Actual**: nothing. `[role="alert"]` is empty, no `role=status` changes, the
  body never mentions cookies, and the drag overlay ("Drop cookies.txt to sign
  in") never appears either — all of it is rendered inside
  `YouTubeConnectModal`, which returns `null` while `skipped`. The drop
  *handler* is still live (it keys on `open`, not on `skipped`), so the gesture
  the onboarding flow taught still does work silently on success and fails
  silently otherwise. For the well-formed-but-rejected file the store does
  hold a message — it is only visible if you later reopen the gate from the
  chip, where it then reads "Your saved YouTube sign-in has expired."
- **Proof**: `out/af-04.json` → `s3_badDrop {overlayShown:false}`,
  `s3_afterBad {anyAlert: [], bodyMentionsCookie: false, cookieFileOnDisk:false}`;
  `out/af-05.json` → `s7_after {anyAlert: []}`, `s7_afterReopen.dialogAlert`;
  `out/af-04-s3/02-after-bad-drop-while-skipped.png`,
  `out/af-05-s7/01-rejected-import-while-skipped.png`.
  Scripts `af-04-skip-persist.cjs`, `af-05-skip-import.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:251` (`if
  (state.skipped) return null` drops the only renderer of `state.message`),
  `src/lib/youtubeConnection.ts` (`importDroppedCookies`)

---

### AF2-5  After a rejected import the chip says the sign-in "ran out" on a date fourteen months in the future

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Skipped state, no session. Import a Netscape file whose `SID` expires in
     60 days and whose probe answers signed-out (`af-05` S7).
  2. Read the status chip and its tooltip.
- **Expected**: "Not signed in", or an expiry message that is true.
- **Actual**: the chip reads **"Sign-in expired"** with
  `title="This sign-in ran out on **Wed, Jan 20, 2027**. Without it YouTube
  gives 360p. Import a fresh cookies.txt."` — today is 21 Nov 2026.
  `markFailed` sets `expired: true` for a rejected file while `expiresAt` keeps
  the file's real future date; `deriveSessionStatus` returns `"expired"` and
  `describe()` then formats the future date as the day it ran out. The user is
  told to act on a date that has not happened.
- **Proof**: `out/af-05.json` → `s7_after.chip`, `s7_after.chipTitle`;
  `out/af-05-s7/01-rejected-import-while-skipped.png`. Script `af-05-skip-import.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts:349-362` (`markFailed`
  sets `expired` without clearing `expiresAt`),
  `src/components/YouTubeStatusChip.tsx:70-75`

---

### AF2-6  A persisted skip still runs the whole browser sweep on every launch, invisibly

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Skip the gate, quit, relaunch into the same user-data dir.
  2. Count `--cookies-from-browser` invocations in the stub's `calls.log`.
- **Expected**: a user who has said "continue without signing in", and whose
  choice now survives restarts, is not made to pay for a sign-in search they
  can neither see nor act on.
- **Actual**: **6 yt-dlp processes per launch**, one per browser, every launch,
  for ever — `chrome, safari, edge, firefox, brave, chromium`. The modal
  renders `null` while `skipped`, but the auto-sweep effect only checks
  `open`, `restoring`, `probed` and `connected`, so it still fires. In the
  `inconclusive` case the server retries all three probe videos, so this is 18.
  Nothing is shown and nothing is learned; the result is written into the
  store and surfaces later as AF2-7.
- **Proof**: `out/af-04.json` → `s1_relaunch.sweepProcessesOnRelaunch: 6`,
  `sweepSources`, with `dialogs: 0` and `anyAlert: []` in the same sample.
  `out/af-04-s1b/01-relaunch-after-skip.png`. Script `af-04-skip-persist.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:130-134`
  (auto-sweep effect does not check `state.skipped`)

---

### AF2-7  The gate reopened from the chip's "Sign in…" opens on a stale red failure the user never asked for

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Launch skipped; the invisible sweep (AF2-6) finishes and fails.
  2. Later, choose **Sign in…** from the status chip.
- **Expected**: the sign-in screen as it looks on first run.
- **Actual**: it opens with the red alert **"No supported browser is installed
  with a YouTube session."** already on it, left over from the sweep that ran
  minutes earlier at launch. The user pressed "Sign in…" and is greeted by a
  failure for something they did not do. The module-level `autoSwept` flag also
  means no fresh sweep runs, so the message cannot be cleared by trying again
  short of pressing "Check browsers again" by hand.
- **Proof**: `out/af-04.json` → `s5.afterResume.dialogAlert`;
  `out/af-04-s5/03-gate-reopened-via-chip.png`. Script `af-04-skip-persist.cjs`
- **Suspected file**: `src/lib/youtubeConnection.ts:685` (`resumeSignIn` does
  not clear `message`/`reason`)

---

### AF2-8  "Export a channel's data" destroys its own tutorial the moment you follow step 1

- **Severity**: minor
- **Status**: confirmed
- **Steps**: owner build. Open help, run "Export a channel's data". Step 1 is
  "Open Channel data in the header" and the ring is correctly on
  `#ui-channel-link`. Click it, as instructed.
- **Expected**: step 2, with the ring on **Export channel**.
- **Actual**: the drawer resets to the full 16-task list with an empty search
  box; the tutorial is gone. `App.tsx` renders `<HelpDrawer>` from two
  different places — inside `ThreeColumnLayout`'s `drawer` prop on the
  workspace screen (`:423`) and as a flex sibling on the channel screen
  (`:433`) — so changing screen unmounts and remounts it, and all of
  `taskId`/`step`/`query` is lost. This is why `export-channel#2` shows no
  spotlight even though `#ui-channel-start` is present and visible with no
  notice: by then there is no current step at all. Any tutorial abandoned by a
  screen change is lost the same way.
- **Proof**: `out/af-09.json` → `tutorialBeforeNav` (`"Step 1 of 2"`,
  spotlight `ui-channel-link`) vs `tutorialAfterNav` (`heading:null`,
  `stepLine:null`, `listShown:16`, `searchValue:""`);
  `out/af-09-owner/01-tutorial-after-screen-change.png`;
  `out/af-06-owner.json` → `stepsWithoutSpotlight` row `export-channel#2`
  (`found:true, visible:true, notice:false`). Scripts `af-09-channel.cjs`,
  `af-06-anchors.cjs`
- **Suspected file**: `src/App.tsx:423` and `:433` (two mount points for one
  drawer), `src/components/HelpDrawer.tsx` (state is local)

---

### AF2-9  With two workspace tabs there are two `#ui-help-button`s, and the one `getElementById` returns is a 2×2 px ghost in the top-left corner

- **Severity**: minor
- **Status**: confirmed
- **Steps**: launch signed in, press `+` in the tab strip, enumerate
  `[id="ui-help-button"]` and hit-test the window's corner.
- **Expected**: one help button.
- **Actual**: two. Each tab's `Layout` renders a `HelpButton`, and each
  portals a `position: fixed`, `z-index: 70` button onto `document.body`.
  The hidden tab's placeholder measures 0×0 inside a `display:none` ancestor,
  so its portal is drawn as a **2×2 px button at (0,0)** — on top of
  everything, and `document.elementFromPoint(1, 1)` returns it.
  `document.getElementById("ui-help-button")` returns that ghost, not the real
  one; clicking the corner opens the **background tab's** help drawer, which is
  invisible (`hiddenDrawerOpenedInstead: true`, `searchFieldVisible: false`).
  The visible "?" at (1058, 39) still works, and `HelpDrawer`'s focus return
  happens to use a saved element reference rather than the id, so focus is not
  lost today — but the id-based fallback at `HelpDrawer.tsx:48` and anything
  else that looks the button up by id now resolves to the ghost.
- **Proof**: `out/af-12.json` → `t1_twoTabs` (`helpButtons:2`, rects
  `[{0,0,2,2},{1058,39,32,32}]`, `getElementByIdIsFirst:true`);
  `out/af-13.json` → `corner.at_1_1: "BUTTON#ui-help-button.icon-btn"`,
  `visibleClickTwoTabs {visibleDrawers:1}`, `focusReturnTwoTabs` (not the
  ghost). `out/af-12-tabs/02-two-tabs-help-button.png`.
  Scripts `af-12-regressions.cjs`, `af-13-twotabs.cjs`
- **Suspected file**: `src/components/shell/HelpButton.tsx` (one portal per
  tab, no guard for a zero-size slot), root cause `src/App.tsx` (per-tab `Layout`)

---

### AF2-10  The portalled "?" is now the last focusable element in the whole document: 35 Tab stops instead of 7

- **Severity**: minor
- **Status**: confirmed
- **Steps**: signed in, a video loaded, a transcript, a campaign. Blur, then
  press Tab until focus reaches `#ui-help-button`.
- **Expected**: what run 1 measured and recorded as a pass — "Tab reaches the
  ? in 7 stops".
- **Actual**: **stop 35 of 35**, out of 37 focusables in the document. The
  header slot now holds an `aria-hidden`, `pointer-events-none`, `invisible`
  placeholder, and the real button is appended to `document.body`, so it comes
  after the transcript lines, the mark bar, the clips column and the whole
  footer. A keyboard user reaching for help tabs through every caption line
  first. The shortcut (`⌘/`) still works and is still advertised only in the
  button's own `title`. T8 flagged this as a side effect; this is the measured
  size of it.
- **Proof**: `out/af-10.json` → `tab.order` (35 entries, `#ui-help-button`
  last), `tab.helpAtStop: 35`, `tab.focusablesInDocument: 37`.
  Script `af-10-helpbutton.cjs`
- **Suspected file**: `src/components/shell/HelpButton.tsx`

---

### AF2-11  Three shapes still get through both copies of `redact()` — identically, so the parity test cannot catch them

- **Severity**: minor
- **Status**: confirmed
- **Steps**: `node af-07-parity.cjs` (pure node: the renderer's `redact()`
  transpiled from `src/lib/diagnostics.ts`, and `electron/redact.cjs`, over my
  15-marker corpus at five `homeDir` settings), then the same markers through
  the live surfaces in `af-08` and `af-09`.
- **Expected**: the shapes the product's own rules treat as credentials.
- **Actual**: parity itself is **sound** — byte-identical output for
  `homeDir` = none, `/root`, `/home/user`, `/Users/sam`, `C:\Users\Sam`. But
  because both copies are identical, both miss the same three shapes, and the
  drift guard in `electron/redact.test.ts` cannot see it:
  1. **Path-style signed googlevideo URLs.** `url-secrets` only rewrites
     `?a=b` pairs. googlevideo also serves
     `…/videoplayback/expire/1/id/o-…/sig/…/file/video.mp4`, and the id and
     signature survive on **every** surface, including the otherwise-clean
     Copy log clipboard — shape `…/id/o-R2MKpath…/sig/R2MKpath…`.
     This is the single marker that leaks through `diagnostics:copy`.
  2. **JSON-quoted token keys.** The `po-token` rule needs the name to be
     immediately followed by `=` or `:`, so `access_token=x` is removed but
     `{"access_token": "x"}` is not — shape `…"access_token": "R2MK…`.
     The bare `access_token=` form in the same line *is* removed, in the same
     report, which is what makes it look safe.
  3. **A cookie assignment without a `Cookie:` prefix.** `auth-headers` keys on
     the literal header name, so `__Secure-3PAPISID=<value>` on its own line
     survives — shape `…__Secure-3PAPISID=R2MK…`.
  All three reach the on-screen alert, the Copy-diagnostics bundle and the
  ChannelExportPanel alert.
- **Proof**: `out/af-07-parity.json` (`parityIdenticalForEveryHome: true`,
  `leaksNoHome/leaksRootHome/leaksUserHome` all the same three ids, plus
  `perMarker` with each redacted shape); `out/af-08.json`
  (`p2_bundleLeaks`, `p2_alertLeaks`, `p1_copyLogLeaks`); `out/af-09.json`
  (`exportErrorLeaks`). Scripts `af-07-parity.cjs`, `af-08-secrets.cjs`,
  `af-09-channel.cjs`
- **Suspected file**: `src/lib/diagnostics.ts:103-193` and the identical
  `electron/redact.cjs:27-117`

---

### AF2-12  The pre-flight diagnostics bundle still carries zero job-scoped log lines

- **Severity**: minor
- **Status**: confirmed
- **Steps**: make the metadata probe fail after the video has loaded, press
  **Copy diagnostics** (`af-08` phase 2), compare with the download-stage
  bundle from phase 1.
- **Expected**: the same report shape as the download stage.
- **Actual**: F-5's main complaint is fixed — the bundle is 2,756 bytes with a
  real job id, app/OS/yt-dlp/ffmpeg versions, the attempted ranges and **21
  stderr lines** (run 1: 639 bytes, every field "unknown", 0 lines). But the
  last section still reads `--- log lines for job job_… (0 lines) --- (none
  captured)`, where the download-stage bundle for the same run has **24**.
  Nothing on the server has logged anything tagged with that `job=` by the time
  the pre-flight fails.
- **Proof**: `out/af-08-p2/bundle-preflight.txt` (line 37) against
  `out/af-08-p1/bundle-download-stage.txt` (line 52); `out/af-08.json` →
  `p2_bundleHasStderr: true`, `p2_bundleHasJob: true`. Script `af-08-secrets.cjs`
- **Suspected file**: `server/index.ts` (the pre-flight failure path's
  `diag()`), `src/lib/diagnostics.ts` (`buildDiagnosticsBundle`)

---

### AF2-13  Dismissing the gate drops focus to `BODY`; the next Tab lands on the help button, not on the app

- **Severity**: polish
- **Status**: confirmed
- **Steps**: cold start with no cookies.txt, touch nothing with the pointer,
  press Escape (or Tab then Enter on the Continue button).
- **Expected**: focus somewhere useful in the app — the URL field is the
  obvious one.
- **Actual**: `document.activeElement` is `BODY`. The trap's cleanup restores
  focus to whatever held it before the dialog opened, which is `BODY`, and the
  `previous !== document.body` guard then skips the restore. The first Tab
  afterwards goes to `#ui-help-button` (the portal is reachable from `BODY`
  before the shell is), then to the tab strip. `inert` and `aria-hidden` are
  both cleaned up correctly, including across a reopen from the chip.
- **Proof**: `out/af-15.json` (`escape` and `tabEnter`, both
  `focusAfter {tag:"BODY", isBody:true}`, `tabsAfter[0] = BUTTON#ui-help-button`);
  `out/af-16.json` (inert/aria-hidden restored on both dismissals).
  Scripts `af-15-keyboard-escape.cjs`, `af-16-ariahidden.cjs`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:218`

---

### AF2-14  `lowQualityExplanation()` is dead code, so nothing ever explains a 360p result

- **Severity**: polish
- **Status**: confirmed
- **Steps**: `grep -rn "lowQualityExplanation" src` returns only its own
  definition and its test.
- **Expected**: its own contract — "Callers show this INSTEAD of silently
  handing over a 360p file."
- **Actual**: no caller exists anywhere in the renderer. The only path that
  does explain a low-quality result is the server's `staleSessionFailure`,
  which is phrased as *"the saved session expired"* — wrong for someone who
  skipped the gate and never had one. For a successfully delivered 360p clip
  the only text is the saved toast's "Downloaded at 360p." with no reason.
  Supporting detail for AF2-2 rather than an independent user-visible bug,
  recorded because it is a concrete loose end of the signed-out route.
- **Proof**: `src/lib/youtubeConnection.ts:110-123`; the "Downloaded at 360p."
  toast in `out/af-02.json` → `toast`.
- **Suspected file**: `src/lib/youtubeConnection.ts:110`

---

## What was attacked and held

Recorded because these were driven, not reasoned about.

- **The escape route, three ways.** Tab stop 1 is "Continue without signing in
  (360p)"; Tab→Enter dismisses; Escape dismisses; a pointer click dismisses.
  The skip is written to `clipper.signInSkipped`, survives a relaunch, is
  cleared by `markConnected` on any real sign-in (import **or** a cookies.txt
  appearing on disk before the next launch), and is re-armed by a second
  Escape. After dismissal every covered control is clickable again — URL field,
  format chip, settings, campaign chip, sign-in chip, all five measured.
- **The signed-out job, end to end.** Skip → paste → mark 00:00:02–00:00:08 →
  Cut → `AF-stub0000001-01.mp4`, 981,457 bytes, `ftyp isom`, h264 640×360,
  "Downloaded at 360p.", `usedRanges` recorded, no `--cookies` in any child's
  argv. The engine really does serve signed-out users.
- **The trap.** 44 Tab presses, 0 outside the dialog, cycling exactly the five
  dialog controls. Dialog takes focus on open. Both shell siblings get `inert`
  **and** `aria-hidden`, and both are restored on dismiss and on a second
  dismiss after reopening from the chip (`af-16`).
- **A-2 both ways.** With the probe scripted so that the LAST browser would
  have answered `signed_in`, the sweep still wrote nothing: source stayed
  `app`, the modal stayed closed for all 28 samples, chip "Signed in". The
  sweep visibly stops after the browser in flight when the epoch moves.
- **Anchors.** 27/27 declared ids exist in the live DOM; 30/32 public steps
  spotlight; 0 false notices; 0 duplicate-id hits on one tab.
- **Help button.** 5 widths × 8 overlay states = 40 real clicks, all landed and
  all toggled the drawer; `fromRight:10 fromTop:39` and `hitIsSelf:true` in
  every unwrapped state, `zIndex:70`, `parentIsBody:true`. Still clickable in
  the wrapped-header states at 760/900/1024 with an update error.
- **F-8 gating, with a control.** `could not find chrome cookies database` →
  "Your in-app YouTube sign-in is no longer valid…" and **no** Copy
  diagnostics; `ffmpeg exited with code 234` → the button is there.
- **F-9.** `updater:check` answers
  `{ok:false, error:"The update check did not run, so there is no answer…"}`;
  the strip shows "Update check failed" with that text in `title`; the log says
  `[updater] manual check did not run`. "Up to date" never appeared in 24
  samples over 12 s.
- **The error boundary, with a real render throw.** `updater:status` → `null`
  raises exactly one page error, the tree is replaced by the fallback (not a
  blank window), `#ui-error-retry` restores the header and the mark bar, and
  `#ui-error-reload` recovers too. A second, independent throw is caught the
  same way.
- **The 499 cancel.** The renderer's own in-flight `POST /api/download`
  received the 499 (the engine was cancelled out-of-band so the fetch was not
  aborted first): no alert, no Copy diagnostics, the status line went back to
  "00:00:06 clip · MP4".
- **The setup checklist.** `help-anchor-youtube-status` and
  `help-anchor-clips-tabs` both resolve; "Open bank" really moves the clips
  column from `clips-tab-all` to `clips-tab-bank`.
- **Still broken, unchanged, not mine**: F-2 (any tab but the first: 0
  spotlights, false notice, two copies of every anchor — now including all 11
  new ids) and F-12 (`-1%`, `999%`, `NaN%` rendered verbatim).

## Not provable here

- Real YouTube, a real signed-in session and real 1080p. Every `signed_in`
  verdict in this area came from scripted yt-dlp output; what is proven is the
  app's handling of each verdict.
- Whether real yt-dlp prints the three shapes AF2-11 names. The path-style
  googlevideo URL and JSON token output are both real yt-dlp forms, but I
  planted them; what is measured is that the redactor does not remove them.
- A genuine OS-level file drop (no window manager); `DragEvent` with a real
  `File` in its `DataTransfer` was used instead, which is the same code path
  from the listener down.
- Installers, code signing and auto-update. F-9 is proven at the handler and
  the strip; a packaged build against a real feed is not reachable here.
- The duration of a real browser sweep. The **process count** in AF2-6 is
  measured (6 per launch here, 18 when the verdict is `inconclusive`); the
  wall-clock cost of a cold Python start plus a network round trip is not.
