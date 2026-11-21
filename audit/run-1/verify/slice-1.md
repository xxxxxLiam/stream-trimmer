# Verification — slice 1 (renderer crashes and lost work)

Independent re-run of 13 findings: B-1, B-2, B-3, B-4, B-5, B-7, B-8, C-1, C-3,
C-4, D-1, D-3, F-10.

**Method.** Every finding was re-driven from its written Steps with scripts I
wrote myself, in `audit/run-1/verify/slice-1/`; none of the original authors'
scripts was run. Each attempt is a cold start: a fresh `launchApp` (fresh
`--user-data-dir`) and, for most, a fresh stub root. The YouTube gate is passed
with the product's own `youtube:importCookiesText` and a synthetic Netscape
cookie file — **no CSS is injected and no overlay is hidden**, unlike area C's
harness note, so nothing here depends on suppressing product UI. The stub root
(`v-stub.cjs`) wraps the official `audit/harness/make-stub-root.cjs` and adds
only the two documented extensions (answer the auth probe, write a real WebVTT)
plus a real-ffmpeg `--download-sections` cut, so finished clips are measurable
with the real `ffprobe`. **No product code was changed.** Captured output and
screenshots are under `audit/run-1/verify/slice-1/out/<label>/`
(`run.txt` + PNGs).

Where a finding could be made to fail on purpose, I tried: every one has at
least one control arm that is expected *not* to reproduce, and most have one.

---

### B-1 — Transcript search blanks the whole app and loses every unsaved mark
- **Verdict**: CONFIRMED
- **Severity**: blocker (unchanged)
- **Runs**: 5 attempts — 4 crash attempts (type-one-more-character ×2, clear the
  box ×1, Escape ×1), 4 reproduced; 1 control (a query that never matches)
  correctly did not.
- **What I did**: cold start, load the video, add two segments, type `needle`
  (counter reads `Match 1/1`), then empty the result set three different ways.
  After each, read `#root`'s child count and `document.body.innerText.length`
  immediately, again 12 s later, then try to use the app (`#ui-settings`), then
  reload and see what survived. The control typed a string that never matches at
  any prefix.
- **Proof**: `audit/run-1/verify/slice-1/v-b1-search.cjs`;
  `out/v-b1-type/run.txt`, `out/v-b1-clear/run.txt`, `out/v-b1-escape/run.txt`,
  control `out/v-b1-nomatch/run.txt`. Screenshots `out/v-b1-type/03-after-type.png`
  (empty window), `out/v-b1-clear/03-after-clear.png`,
  `out/v-b1-escape/03-after-escape.png`.
  Key lines: `counter after 'needle': Match 1/1` →
  `alive right after [type]: {"rootChildren":0,"bodyLen":0,"header":false}` →
  `alive 12s later: {"rootChildren":0,...}` →
  `could not click #ui-settings: page.click: Timeout 3000ms exceeded` →
  `after reload: {"total":"00:00:00","source":"Reload"}` →
  `page errors: ["TypeError: Cannot read properties of undefined (reading 'line')"]`.
  Control: `counter after a never-matching query: Match 0/0`,
  `alive: {"rootChildren":1,...}`, `page errors: []`.
- **Notes**: the control is what makes the stated cause the actual cause — a
  query that never has matches renders `0/0` perfectly; it is specifically the
  transition from "some matches" to "none" that throws, exactly as
  `TranscriptColumn.tsx`'s `activeMatch` / `useTranscriptWindow.ts`'s unclamped
  `active` predicts. Two small wording corrections: the window goes to the
  **empty body background (dark in this theme), not white**, and the segments
  are not recoverable by reload — the reload brings back an empty workspace.

---

### B-2 — One global segment list is shared by every tab; opening a tab destroys the first tab's clip
- **Verdict**: CONFIRMED
- **Severity**: blocker (unchanged) — and I proved the consequence the original
  only inferred.
- **Runs**: 3 attempts, 3 reproduced (2 of the finding's own steps, 1 extra arm
  that carries it through to a finished file). The bank was left empty
  throughout so this cannot be confused with C-1.
- **What I did**: tab 1 loads Video AAA, two segments (`Stitched total, 2
  segments 00:00:40`); click **+**; read *every* mounted pane, not just the
  visible one; load Video BBB in tab 2; add one segment there; switch back to
  tab 1. Then a separate arm (`v-b2b-wrong-cut.cjs`) repeats it with ranges
  inside the 30 s fixture and actually presses **Cut as one file** in tab 1.
- **Proof**: `audit/run-1/verify/slice-1/v-b2-tabs.cjs`, `out/v-b2-tabs/run.txt`,
  screenshots `01-tab1-two-segments.png` … `04-tab1-after-switch-back.png`;
  and `v-b2b-wrong-cut.cjs`, `out/v-b2b-wrong-cut/run.txt`.
  Step 2 (tab 1 not even on screen): `{"i":0,"visible":false,"rows":[],...}` —
  both segments already gone. Step 4: the single new segment appears in **both**
  panes. Step 5, tab 1: `rows:["1 00:02:00 to 00:02:05 ..."], source:"Video AAA"`,
  `cut button enabled in tab 1: {"text":"Cut as one file ⌘↵","disabled":false}`.
  The extra arm ends with
  `file written while tab 1 (Video AAA) was on screen: ["Video AAA [00-00-02-00-00-05].mp4"]`
  and `sections the engine cut: ["*2.00-5.00","*2.00-5.00"]` — Video AAA cut at
  the range marked only on Video BBB, while AAA's own 00:00:10–14 was silently
  discarded and never cut.
- **Correction to the original**: it reports tab 1's total dropping to
  `00:00:00` at step 2; mine reads `00:10:00` (with no rows), because with no
  segments `#ui-stitched-total` shows the pending whole-video length. The
  substance — the rows are gone — is identical.

---

### B-3 — From the second segment on, the preview covers the in/out fields and Add segment; clicks are swallowed
- **Verdict**: CONFIRMED (mechanism and geometry), **DOWNGRADED** on severity
- **Severity**: **major** (original: blocker)
- **Runs**: 3 attempts — 2 at 1440×900, both reproduced with identical pixel
  geometry; 1 control at 1440×1250 which did not reproduce.
- **What I did**: at 1440×900, add segments one at a time and after each record
  the preview panel box, the `.aspect-video` box, the In field and Add button
  boxes, `document.elementFromPoint` at the centre of each, and the result of a
  **real mouse click** (Playwright `locator.click`, not `element.click()`). When
  the mouse click is refused the run continues with the keyboard so the table
  can be completed. Then `scrollIntoView` on the button to test the "just scroll
  to it" workaround, and a re-run at 1440×1250.
- **Proof**: `audit/run-1/verify/slice-1/v-b3-overflow.cjs`;
  `out/v-b3-1440x900/run.txt` (and the control `out/v-b3-1440x1250/run.txt`);
  screenshots `out/v-b3-1440x900/03-5-segments.png`, `04-after-scroll.png`.
  Measured at 1440×900 (panel box / aspect-box bottom / In+Add row / hit test):
  0 seg `86–482 / 543 / 607–643 / ITSELF`; 1 seg `86–446 / 543 / 571–607 /
  ITSELF`; 2 seg `86–388 / 543 / 513–549 / **COVERED**`; 3 seg `86–329 / 543 /
  454–490 / COVERED`; 5 seg `86–212 / 543 / 337–373 / COVERED`.
  `3 segment(s): MOUSE CLICK REFUSED`, `4 …REFUSED`, `5 …REFUSED`.
  `after scrollIntoView on Add segment: {"hit":"DIV.absolute inset-0 …"}` —
  scrolling does not help, the elements overlap.
  Control at 1440×1250: every click worked, `hitAdd: "ITSELF"` throughout.
- **Why the original's severity is wrong**: the finding calls ⌘⇧↵ "the
  undocumented shortcut". It is printed on the button itself —
  `visible keyboard hint on the Add button: {"text":"Add segment ⌘⇧↵",
  "keyshortcuts":"Control+Shift+Enter Meta+Shift+Enter"}` — and the user has
  seen it twice before the button is first covered. My own run added segments
  3, 4 and 5 with it and reached a five-segment clip. A documented keyboard
  route that completes the headline task is a workaround, so this is major
  ("core function badly broken"), not blocker. Two other corrections: the first
  click actually refused is the one that would add the **third** segment (with
  two rows on screen), and the covering element happens to be the blocked-player
  overlay only because no player can load in this container — the box that
  overflows is the always-rendered `.aspect-video` wrapper (458 px tall in every
  state), so a working player would overflow the same way, and with
  `PlayerControls` also rendered it would be worse.

---

### B-4 — A sub-second or non-numeric mark silently becomes the whole video
- **Verdict**: CONFIRMED (behaviour), **DOWNGRADED** on severity
- **Severity**: **minor** (original: major)
- **Runs**: 2 attempts, 2 reproduced, each covering all three input pairs plus a
  valid-range control and a cut carried to the end.
- **What I did**: 30-minute source. For `10.5`/`20.25`, `abc`/`def`,
  `-5`/`00:00:20` and a valid control, each from a freshly reloaded workspace:
  read the Length readout, `aria-invalid` on both fields, whether Add and Cut
  are enabled, the row Add produces, every `role=status`/`role=alert` message,
  then press Cut and list the clips folder.
- **Proof**: `audit/run-1/verify/slice-1/v-b4-marks.cjs`, `out/v-b4-marks/run.txt`,
  screenshots `02-sub-second-decimals.png`, `03-letters.png`, `05-after-cut.png`.
  `[sub-second decimals] … length:"00:30:00", addDisabled:false,
  ariaInvalid:["false","false"]` → after Add,
  `rows:["1 00:00:00 to 00:30:00 30:00 …"]` → after Cut,
  `messages:["Clip length capped at 600 seconds (10 minutes) …"]`,
  `files in the clips folder: []`. `abc`/`def` the same with
  `ariaInvalid:["true","true"]`; `-5`/`00:00:20` yields `00:00:00 to 00:00:20`.
  Control: `00:00:10`/`00:00:20` → `rows:["1 00:00:10 to 00:00:20 …"]`.
- **Why the original's severity is wrong**: it is not silent. In all three bad
  cases the mark bar shows **"Timestamp must look like HH:MM:SS"** in a
  `role="status"` and **Cut is disabled** (`cutDisabled:true`) until Add is
  pressed; the bogus length is also on screen as `00:30:00` before and after
  Add, and the row itself reads `00:00:00 to 00:30:00`. Nothing is lost, the
  server refuses the job, no file is written, and the documented format is
  stated on screen and works. That is "wrong but survivable, with a workaround"
  — minor. The real defect (two parsers disagree, so Add is enabled on input the
  app has just called invalid) is unchanged and worth fixing.

---

### B-5 — A URL with no video id loads as a source, and "Cut as one file" then does nothing at all
- **Verdict**: CONFIRMED
- **Severity**: major (unchanged)
- **Runs**: 4 attempts — channel URL ✓, playlist URL ✓, `youtube.com/live/<id>`
  URL ✓ (a route I added), and one control that did **not** reproduce and
  sharpened the precondition.
- **What I did**: for each URL, first ask `/api/info` directly (so the stub's
  share of the result is on the record), then paste it and press Enter, mark
  `00:00:05–00:00:15`, Add, click **Cut as one file**, and watch for 10 s:
  every status/alert message, any Cancel button, any progress bar, the clips
  folder, and the stub's own call log for a `--download-sections` invocation.
- **Proof**: `audit/run-1/verify/slice-1/v-b5-novideoid.cjs`
  (`out/v-b5-novideoid/run.txt`), `v-b5c-live-url.cjs`
  (`out/v-b5c-live/run.txt`), control `v-b5b-novideoid-nostub.cjs`
  (`out/v-b5b-novideoid/run.txt`). For every one of the three URLs:
  `cutDisabled:false` → `10s after clicking Cut:` identical state,
  `messages:["1 segment, 00:00:10 · MP4"]`, `cancelVisible:false`,
  `progressBars:0`, `files on disk: []`,
  `yt-dlp calls that mention a download: 0`. The `/live/` run's control — the
  same video through `watch?v=` — produced
  `["Verify video [00-00-05-00-00-15].mp4"]`.
- **Notes on the harness, and why the finding survives them**: the stub answers
  *any* URL with the same video metadata, so "a channel URL loads as a source"
  is partly the stub's doing — real yt-dlp would return channel/playlist
  metadata for `@somechannel`. That is why I added the `/live/` arm:
  `extractVideoId` (`src/lib/clip.ts:211`) understands `watch?v=`, `youtu.be/`,
  `/embed/`, `/shorts/` and `/v/` but **not** `youtube.com/live/<id>`, the
  canonical URL YouTube hands out for a live stream or premiere, which real
  yt-dlp resolves as an ordinary video. So the stub answering that URL with real
  video metadata is exactly what the real tool would do, and the defect is
  reached with no pretence. The control also matters: merely typing a
  no-video-id URL into the bar is **not** enough (segments clear and Cut goes
  `disabled`), so the precondition really is "info loaded while `videoId` is
  null", as the finding says.

---

### B-7 — Deleting a segment while the cut runs still puts it in the finished file
- **Verdict**: CONFIRMED
- **Severity**: major (unchanged)
- **Runs**: 2 attempts, 2 reproduced, both measured with the real `ffprobe`.
- **What I did**: three segments `00:00:02–05`, `00:00:20–24`, `00:00:10–13`
  (10 s stitched), the stub slowed to `delayMs: 4000` so the job genuinely
  runs, click **Cut as one file**, then 3 s in click the × on segment 2
  (`Remove segment 2`), then wait for the file and measure it.
- **Proof**: `audit/run-1/verify/slice-1/v-b7-midcut.cjs`, `out/v-b7-midcut/run.txt`,
  screenshots `01-three-segments.png`, `02-deleted-midcut.png`, `03-finished.png`.
  `mid-cut removal: clicked: Remove segment 2` →
  `after removing #2 mid-cut: rows: 2, messages:["Segment 2 removed","2 segments,
  00:00:06 · MP4"]` → `files produced: ["Verify video [00-00-02-00-00-13].mp4"]`
  → `Verify video [00-00-02-00-00-13].mp4: 10.023220s (3 segments = 10s, without
  #2 = 6s)` → `sections the engine was asked to cut:
  ["*2.00-5.00","*20.00-24.00","*10.00-13.00", …]` →
  `final screen: rows: []`.
- **Notes**: the screen says 00:00:06 and announces "Segment 2 removed" while
  the file is 10.02 s, and the row list is emptied when the job finishes, so
  nothing on screen ever contradicts the lie. Identical in both runs to three
  decimal places.

---

### B-8 — A tab remembers nothing: no reopen, no confirmation on close, nothing restored on relaunch
- **Verdict**: CONFIRMED
- **Severity**: major (unchanged)
- **Runs**: 2 attempts, 2 reproduced (each with a live part and a relaunch part).
- **What I did**: tab 1 renamed "Interview" with a loaded video and a segment;
  open tab 2, load a video, add a segment; close tab 2 with its × while
  listening for any `dialog` event (a native `confirm()` would fire one); then
  search the whole DOM for any reopen affordance (buttons, menu items, body
  text matching reopen/recently closed/undo close/restore) and press
  Ctrl+Shift+T; read what reached `settings.json`; then a **second cold launch
  seeded with exactly what the first app persisted**, which is the same
  `clipper.workspaces` the real app reads on start.
- **Proof**: `audit/run-1/verify/slice-1/v-b8-tabmemory.cjs`,
  `out/v-b8-live/run.txt` + `out/v-b8-relaunch/run.txt`, screenshots
  `out/v-b8-live/02-after-close.png`, `out/v-b8-relaunch/01-relaunched.png`.
  `confirm dialogs seen while closing: []`;
  `any reopen affordance in the DOM: {"hits":[],"bodyMentionsReopen":false}`;
  `after Ctrl+Shift+T:` unchanged;
  `clipper.workspaces persisted: {"tabs":[{"id":"ws_…","name":"Interview"}],"activeId":"ws_…"}`;
  `after the relaunch: {"tabs":["Interview",…],"chip":"Reload","total":"00:00:00",
  "rows":[],"transcriptRows":0}`.
- **Notes**: severity kept at major on the strength of the close half — one
  click on a hover-only × destroys a tab's loaded video and unsaved marks with
  no confirmation and no undo of any kind. Taken alone, "nothing is restored on
  relaunch" would be minor.

---

### C-1 — Two video tabs plus a non-empty clip bank blanks the entire app
- **Verdict**: CONFIRMED
- **Severity**: blocker (unchanged)
- **Runs**: 5 attempts — seeded bank ×2 and the import route ×1, all 3
  reproduced; 2 controls (empty bank, and a bank row whose status is `cut`) both
  correctly did not.
- **What I did**: cold start with one campaign and a video loaded; bank holding
  one row (seeded, or imported through the real import box); open the Bank
  sub-tab; click **+**. Record `#root`'s children immediately, 10 s later, every
  page error, then reload and read `settings.json`.
- **Proof**: `audit/run-1/verify/slice-1/v-c1-newtab.cjs`;
  `out/v-c1-seeded/run.txt`, `out/v-c1-import/run.txt`; controls
  `out/v-c1-empty/run.txt`, `out/v-c1-cutstatus/run.txt`; screenshots
  `out/v-c1-seeded/01-before-new-tab.png` → `02-after-new-tab.png` →
  `03-10s-later.png`.
  `alive before +: {"rootChildren":1,"bodyLen":2622,"header":true}` →
  `alive right after +: {"rootChildren":0,"bodyLen":0,"header":false}` →
  `alive 10s later:` the same →
  `page errors: ["Error: Minified React error #185 …"]` (maximum update depth
  exceeded) → `bank on disk after the crash:` intact.
- **Refinement of the precondition**: it is not "a non-empty bank" but "a bank
  row that still yields a planned range". A row with `status:"cut"` is on screen
  and visibly a bank row, yet clicking **+** is harmless
  (`alive right after +: {"rootChildren":1,…}`, `page errors: []`) — because
  `bankedRanges()` skips non-`banked` rows, so there is nothing for the two
  mounted `ClipsColumn`s to fight over. That is strong evidence for the
  mechanism in the finding (`ClipsColumn.tsx`'s `setBankedRanges` effect
  ping-ponging through the single module store).

---

### C-3 — Switching campaign with the import box open throws the whole paste away
- **Verdict**: CONFIRMED (behaviour), **DOWNGRADED** on severity
- **Severity**: **minor** (original: major)
- **Runs**: 3 attempts — the switch ×2, both reproduced; 1 control (re-pick the
  *same* campaign) which did not.
- **What I did**: two campaigns seeded, video loaded, Bank tab, **Import
  timestamps**, fill the textarea with a 40-line block (932 characters; the
  preview correctly offers "Import 29 clips"); without confirming, open the
  campaign chip and pick the other campaign; then pick the first one again.
  Record whether the textarea still exists and what it holds, any `dialog`
  event, and any "unsaved/discard" wording anywhere on screen.
- **Proof**: `audit/run-1/verify/slice-1/v-c3-import-switch.cjs`,
  `out/v-c3-switch/run.txt`, control `out/v-c3-same/run.txt`; screenshots
  `out/v-c3-switch/01-mid-import.png` → `02-after-pick.png` → `03-back-on-acme.png`.
  `paste in the box: {"textareaOpen":true,"textLength":932,…}` →
  `after picking [Beta Launch]: {"textareaOpen":false,"textLength":0,
  "importButtons":["Import timestamps"]}` → `back on Acme Q4:` the same →
  `any confirm/alert dialog at any point: []` →
  `any 'unsaved'/'discard' wording on screen: false`.
  Control: after re-picking **Acme Q4** the box is still there with all 932
  characters — so the campaign *change*, not the popover, is the cause, exactly
  as the finding says.
- **Why the original's severity is wrong**: the function being lost is an
  unconfirmed draft, not stored data, and the feature's own workflow is
  "paste a block" — the block is still on the clipboard, so recovery is normally
  one Ctrl+V. Nothing on disk changes, the import itself works, and no clip is
  lost. Only edits made *inside* the box are unrecoverable. That is "wrong but
  survivable" — minor. (It is still a real defect: there is no warning and no
  draft.)

---

### C-4 — A category or tier cannot be set or changed after import
- **Verdict**: CONFIRMED (no control exists), **DOWNGRADED** on severity
- **Severity**: **minor** (original: major)
- **Runs**: 2 attempts, 2 reproduced.
- **What I did**: seeded a bank with one uncategorised row and one categorised
  row, then tried hard to find an editor: dumped every interactive node in
  `#ui-col-clips` on all three sub-tabs; single-clicked, double-clicked,
  right-clicked (context menu) a row; focused it and pressed Enter and F2;
  clicked the category chip on the row itself. After each, counted visible
  `input`/`select`/`textarea`, `contenteditable`, and any `role=dialog`/`menu`.
  Then tested whether re-importing the same id with a category is a working
  route (on a freshly reloaded workspace, so no filter chip was left applied).
- **Proof**: `audit/run-1/verify/slice-1/v-c4-categorise.cjs`,
  `out/v-c4-categorise/run.txt`, screenshots `01-bank-tab.png`,
  `02-after-hunting.png`, `03-after-reimport.png`.
  `every control in the clips column (Bank tab): ["This video","Bank","All
  saved","Search the bank","Import timestamps","hook","Tier T1","Sort by
  tier", <row>, "Cut","Remove OLD1 from the bank", <row>, "Cut","Remove OLD2
  from the bank"]`; after every probe
  `editors present: {"inputs":["INPUT[search] Search the bank"],
  "contentEditable":0,"dialogs":0,"anyCategoryWording":false}`.
- **Why the original's severity is wrong**: there *is* a working in-product
  route, and I drove it. Re-importing the same line with the **same id** and a
  category updates the existing row in place rather than adding a second one:
  `re-import button: Import 1 clip` →
  `rows after re-importing OLD1 with a category: ["… OLD1 no category at all
  payoff T2 In band banked …", "… OLD2 …"]`. The duplicate-row trap the finding
  describes (story 9) happens only when the id is *changed*. The same route is
  open to keyboard users (area C itself proved a keyboard-only import). A
  missing control with a working, if clumsy and undiscoverable, workaround and
  no data loss is minor.

---

### D-1 — Dragging a clip out of the window freezes the whole app until it is killed
- **Verdict**: **DOWNGRADED** — reproduces here every time, but the cause cannot
  be attributed to the product in this container; as a user-facing freeze it is
  **not provable here**.
- **Severity**: **not provable here** (original: blocker). On the evidence that
  *is* product-side — an unguarded fire-and-forget IPC channel that can park the
  main process's message loop — at most **minor** until it can be retested on a
  real desktop.
- **Runs**: 4 attempts — real mouse gesture ×2 and a direct `file:startDrag`
  with an existing path ×1 all wedged main-process IPC; the control
  (`file:startDrag` with a path that does not exist) did not.
- **What I did**: cut a real clip, wait for the "Clip saved" toast and its
  `Drag … to another app` grip, then `mouse.down` + 12 `mouse.move`s +
  `mouse.up` out of the toast. After the gesture, ping **two** things on a
  timeout: the bridge (`electronAPI.fileExists`) and the renderer alone
  (`document.title` + body length). Then try to escape it: `mouse.up`, Escape, a
  5 s wait, a 20 s wait. The control arm sends the same IPC with a missing path,
  which `electron/main.cjs:600` rejects before `startDrag`.
- **Proof**: `audit/run-1/verify/slice-1/v-d1-startdrag.cjs`;
  `out/v-d1-gesture/run.txt`, `out/v-d1-ipc-real/run.txt`, control
  `out/v-d1-ipc-missing/run.txt`; screenshot `out/v-d1-gesture/01-drag-handle.png`.
  Gesture arm: `IPC ping [baseline]: answered true (3ms)` →
  `real mouse drag gesture completed` →
  `IPC ping [right after the drag]: *** NO ANSWER after 10000ms ***` →
  `IPC ping [20s later]: *** NO ANSWER ***`. Control:
  `IPC ping [right after the drag]: answered true (1ms)`.
- **Why I do not accept it as stated**: (1) **The symptom is misdescribed.** The
  renderer is *not* frozen — through the whole wedge it answers normally
  (`renderer ping [right after the drag]: renderer answered: YouTube
  Clipper|2628`). What stops is main-process IPC. (2) **The container cannot
  produce the end of a drag.** `event.sender.startDrag()` runs a nested
  OS drag loop that only returns when the drag is dropped or cancelled. This
  container has **no window manager** (`openbox`/`metacity`/`mutter`/`twm`: none
  installed) and no real pointer input (`xdotool`/`wmctrl`: absent) — Playwright's
  mouse events are synthetic CDP events, so the X server never saw a button
  press and can never deliver a release. A drag loop that never ends is the
  expected outcome, not evidence of a defect. (3) **The code follows Electron's
  own documented recipe** (`ipcMain.on` + `startDrag` inside `dragstart`, with
  `preventDefault` in `DragOutHandle.tsx`), and the control shows the block is
  inside `startDrag` itself, not in the product's wrapper. The one real,
  product-side observation worth keeping: `file:startDrag` is a fire-and-forget
  channel with no check that a drag gesture is in progress, so any renderer code
  can call it at any time and park main — which I did in the `ipc-real` arm with
  no gesture at all. That is a robustness gap worth a guard, not a blocker.
  **Retest on macOS/Windows, or on Linux with a window manager, before fixing.**

---

### D-3 — The Copy blocks panel never works: all seven blocks are permanently disabled
- **Verdict**: CONFIRMED, **DOWNGRADED** on severity
- **Severity**: **major** (original: blocker)
- **Runs**: 2 attempts, 2 reproduced, each sampling four progressively richer
  states.
- **What I did**: booted with an active campaign whose `clipIdPattern` is
  `{prefix}-{videoId}-{nn}`, then opened the panel and dumped all seven blocks
  (label, note/reason, `disabled`) in four states: nothing loaded; a loaded
  video + transcript + campaign; plus a marked segment; and finally after a real
  clip had been cut and written to disk.
- **Proof**: `audit/run-1/verify/slice-1/v-d3-copyblocks.cjs`,
  `out/v-d3-copyblocks/run.txt`, screenshots
  `01-01-nothing-loaded.png` … `04-04-after-a-real-cut.png`.
  All four states are byte-identical: `enabledCount: 0`, with
  `1. Source link — No video id found in the link.`,
  `2./3./4. … No transcript loaded.`, `5. Download ranges — Add a segment
  first.`, `6. Used-material line — No video id found in the link.`,
  `7. Clip id and filename — This campaign has no clip id pattern.`, while the
  screen behind the panel shows a loaded video, a transcript, the row
  `1 00:00:03 to 00:00:09`, and `clip on disk: ["AUD-stub0000001-01.mp4"]`.
- **Why the original's severity is wrong**: the bar for blocker is "cannot
  complete the job or loses data". Copy blocks is an auxiliary handoff surface;
  with it dead the clipping job still completes end to end (my own run cut and
  saved a real file in the same session). A feature that does not work at all in
  any state, with no workaround, is exactly "a core function badly broken with
  no workaround" — major. One factual correction: focus on open does not stay on
  `document.body`; it lands on a `BUTTON` (`focus: "BUTTON"` in all four
  states), just never on a `button[data-copy]`, since none is enabled.

---

### F-10 — One malformed `updater:status` payload blanks the whole window, with no error boundary and no way back
- **Verdict**: CONFIRMED (the crash), **DOWNGRADED** on severity
- **Severity**: **minor** (original: major)
- **Runs**: 2 attempts, 2 reproduced; each attempt also pushed 11 other payload
  shapes, none of which crashed.
- **What I did**: pushed twelve payloads over the real `updater:status` channel
  from the **main process** (`app.evaluate` → `webContents.send`, the same call
  `sendUpdateStatus` makes), checking `#root` after each: the eight real shapes
  the product sends, then three plausible-but-wrong ones (`{}`, a string, a
  number), then `null`. Then audited every sender in the product.
- **Proof**: `audit/run-1/verify/slice-1/v-f10-updater.cjs`,
  `out/v-f10-updater/run.txt`, screenshots `01-a-number.png` (app fine),
  `02-null-payload.png` (empty window).
  Every other shape survives, including the malformed ones:
  `[empty-object] alive={"rootChildren":1,…} pageErrors=0`,
  `[a-string] … pageErrors=0`, `[a-number] … pageErrors=0`. Then
  `[null-payload] alive={"rootChildren":0,"bodyLen":0,"header":false} pageErrors=2`,
  `page errors: ["Error: Cannot read properties of null (reading 'state')", …]`,
  still gone 6 s later.
- **Why the original's severity is wrong**: the trigger does not exist in the
  product. All ten `sendUpdateStatus(...)` call sites in `electron/main.cjs`
  (lines 109, 117, 124, 128, 132, 136, 157, 641, 647) pass an object literal
  with a `state`; `null` can only arrive from a test harness, which the finding
  itself concedes. And the shapes that *could* plausibly go wrong — a missing
  payload field, a wrong type — are all handled. So no user can reach this: it
  is a latent robustness gap, minor. The half of the finding that matters is the
  missing error boundary, and that half is **already proved user-reachable by
  B-1 and C-1**; it should be fixed on their evidence, not this one's.

---

## Shared root causes — where two fixes collapse into one

**B-2 and C-1 are two symptoms of one defect**, and one fix removes both.

- The defect: `src/hooks/useSegments.ts` keeps the clip being built in a single
  **module-level** `state` object (`let state: SegmentsState`, lines 35–46) with
  no per-tab scope, while `src/App.tsx:446-464` mounts **every** workspace tab at
  once (each inside its own `ClipperProvider`, hidden with `display:none`). So
  every tab's `MarkBar` and `ClipsColumn` reads and writes the same store.
- B-2 is that store's **`syncVideo`** path: a newly mounted tab's MarkBar effect
  calls `store.syncVideo(null)`, whose `set({videoId, segments: EMPTY, banked:
  EMPTY_BANKED})` wipes the segments of a tab that is not even on screen; from
  then on both tabs show one list. Proved directly — a segment marked in tab 2
  appears in tab 1 and is cut as `Video AAA [00-00-02-00-00-05].mp4`.
- C-1 is the same store's **`setBankedRanges`** path: two mounted `ClipsColumn`s
  with different `planned` lengths each see `seg.banked.length !==
  planned.length` and overwrite each other forever (React error #185). My
  control arms pin this down: no crash with an empty bank, and no crash when the
  one bank row's status is `cut` (so `bankedRanges()` yields nothing and the two
  tabs have nothing to disagree about).
- They are not duplicates to *report* — each is separately observable and needs
  its own regression test — but scoping that store per tab (a provider, or
  keying by tab id) fixes both, and no fix to `ClipsColumn.tsx` alone will stop
  B-2.

**A second, smaller overlap**: B-1, C-1 and F-10 all end the same way — one
throw or one runaway loop unmounts the whole tree, because there is no React
error boundary above the shell in `src/App.tsx`. Adding that boundary does not
fix any of the three underlying bugs, but it turns all three from "the app is
gone until you relaunch" into "one panel is broken". F-10's only durable value
is as a third witness for that boundary.

## Harness notes

- No product code, settings or CSS was changed by this slice. The YouTube gate
  was passed with the product's own `youtube:importCookiesText` IPC and a
  synthetic cookie file — area C's injected stylesheet is not needed, and none
  of these verdicts depends on hiding product UI.
- Each finding's script is self-contained and takes the stub root in `$STUB`:
  ```
  node audit/run-1/verify/slice-1/v-stub.cjs /tmp/mystub
  STUB=/tmp/mystub xvfb-run -a --server-args="-screen 0 1600x1300x24" \
    node audit/run-1/verify/slice-1/v-b1-search.cjs type
  ```
  Scripts that are sensitive to window height take the viewport on the command
  line (`v-b3-overflow.cjs 1440 900`). Several scripts deliberately run in a
  1440×1250 window so that B-3 cannot interfere with what they are measuring.
- `v-b5-novideoid.cjs`'s channel and playlist arms lean on the stub answering
  any URL as a video; `v-b5c-live-url.cjs` does not, and is the arm to trust.
- D-1 is the only finding in this slice whose verdict is bounded by the
  container: no window manager and no real pointer input exist here, so a native
  drag can never finish.
