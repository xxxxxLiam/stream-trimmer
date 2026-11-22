# Area B — Core clipping loop

Everything below was produced by driving the real Electron app through the
harness (`audit/harness/app.cjs`) with real clicks and real keystrokes, with a
scriptable `yt-dlp` and the **real** ffmpeg cutting and concat pipeline. Scripts
live in `audit/run-1/area-B/`, screenshots and logs in
`audit/run-1/area-B/out/<label>/`. No product code was changed.

Run them with:

```
node audit/run-1/area-B/stubroot.cjs /tmp/stubB
xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-1/area-B/t01-happy-path.cjs
```

`stubroot.cjs` extends the harness stub in two audit-only ways, both needed to
reach this area at all: it answers the auth probe as signed in (the connect
modal is an undismissable gate in front of the whole workspace), and it writes a
real WebVTT file so the transcript column has something to window. It also cuts
the fixture with real ffmpeg when `--download-sections` is passed, exactly as
yt-dlp would, so the duration of a finished clip is a meaningful assertion.

---

### B-1  Transcript search blanks the whole app and loses every unsaved mark

- **Severity**: blocker
- **Status**: confirmed
- **Steps**: from a cold start,
  1. Paste a YouTube link and let the transcript load.
  2. Mark an in and out and press ⌘⇧↵ to add a segment. Add a second one.
  3. Click the transcript search box and type a word that is in the transcript
     (`needle`). The counter reads `1/1`.
  4. Type one more character so nothing matches any more (`needles`) — **or**
     simply clear the box, **or** press Escape, which the box itself documents
     as "clear the search".
- **Expected**: the match counter reads `0/0`, or the transcript returns to its
  unfiltered view. Nothing else changes.
- **Actual**: the entire window goes white. Every workspace tab, the loaded
  video, the in/out marks and all segments are gone. The renderer throws
  `TypeError: Cannot read properties of undefined (reading 'line')`, React
  unmounts the whole tree (there is no error boundary), and the app never
  recovers — `document.body.innerText.length` is still `0` ten seconds later.
  Only a reload brings the UI back, and it comes back empty: 0 segments, no
  source. This is reachable by the most ordinary action in the feature — typing
  a search and then clearing it.
- **Proof**:
  - `audit/run-1/area-B/t13-search-crash.cjs` — output shows `typed "s" ->
    alive=false bodyLen=0`, then `after reload — segments: 0`.
  - `audit/run-1/area-B/out/t13-search-crash/02-white-screen.png`
  - `audit/run-1/area-B/t13b-search-clear-crash.cjs` — `after clearing the box:
    {"alive":false,"bodyLen":0}` and `after Escape ...: {"alive":false}`.
  - `audit/run-1/area-B/out/t13b-clear/02-after-clearing.png`,
    `audit/run-1/area-B/out/t13b-escape/01-after-escape.png`
- **Suspected file**: `src/components/TranscriptColumn.tsx` —
  `const activeMatch = w.active >= 0 ? w.matches[w.active] : null;` then
  `i >= activeMatch.line`. `matches` is recomputed during render while `active`
  is only reset in an effect, so on the render where the result set empties,
  `matches[active]` is `undefined` and `activeMatch !== null` passes.
  Co-owner: `src/hooks/useTranscriptWindow.ts` (`active` is not clamped to
  `matches.length`).

---

### B-2  One global segment list is shared by every tab; opening a tab destroys the first tab's clip

- **Severity**: blocker
- **Status**: confirmed
- **Steps**: from a cold start,
  1. In tab 1, load video AAA. Mark `00:00:10–00:00:20`, Add segment. Mark
     `00:01:00–00:01:30`, Add segment. The mark bar reads
     `Stitched total, 2 segments  00:00:40`.
  2. Click **+** to open tab 2.
  3. In tab 2, load a different video BBB.
  4. In tab 2, mark `00:02:00–00:02:05` and Add segment.
  5. Click back to tab 1.
- **Expected**: each tab holds its own clip. Tab 1 still has its two segments of
  video AAA; tab 2 has its one segment of video BBB.
- **Actual**:
  - At step 2, **tab 1's two segments are already gone** — the new tab's mark bar
    mounts with no video and resets the one shared store. Tab 1's total drops to
    `00:00:00` with no rows, while tab 1 is not even on screen.
  - At step 4 the new segment appears in **both** panes at once. Tab 1 now shows
    `00:02:00 to 00:02:05` as a segment of **video AAA**, drawn on AAA's
    timeline, with "Cut as one file" enabled. Cutting there cuts AAA at
    timestamps the user only ever marked on BBB.
  - Story 7 reproduces the same thing in a realistic two-video session.
- **Proof**:
  - `audit/run-1/area-B/t04-tabs.cjs`. Output:
    `after loading BBB in tab 2 — ALL PANES: [{"i":0,...,"total":"00:00:00","rows":[]},...]`
    then `after adding a segment in tab 2 — ALL PANES:` both panes carry
    `00:02:00 to 00:02:05`, then
    `*** switched back to TAB 1 (Video AAA): {"rows":["1 00:02:00 to 00:02:05 ..."],"total":"00:00:05","source":"Video AAA 00:10:00 Change"}`.
  - `audit/run-1/area-B/out/t04-tabs/01-tab1-two-segments.png`,
    `03-tab2-one-segment.png`, `04-tab1-after-switch-back.png`
  - `audit/run-1/area-B/t17-stories.cjs` story 7, shots
    `out/t17-stories/06-story7-two-tabs.png`.
- **Suspected file**: `src/hooks/useSegments.ts` — the store is a single
  module-level `state` object, not per tab. Driven by
  `src/components/MarkBar.tsx` (`store.syncVideo(videoId)` in an effect that
  every mounted tab runs) and `src/App.tsx` (every tab is mounted at once,
  hidden with `display:none`).

---

### B-3  From the second segment on, the video preview covers the in/out fields and Add segment; clicks are swallowed

- **Severity**: blocker
- **Status**: confirmed
- **Steps**: in a 1440x900 window (any width ≥1160, where the three columns sit
  on one row),
  1. Load a video.
  2. Mark a range and click **Add segment**. It works.
  3. Mark a second range and click **Add segment**. It works.
  4. Mark a third range and try to click **Add segment**.
- **Expected**: Add segment keeps working. Building a clip from several
  segments is the headline feature of this area.
- **Actual**: from the second segment on, the preview panel's `aspect-video` box
  no longer fits its own flex item and spills downward over the timeline, the
  In/Out fields and the Add segment button. `document.elementFromPoint` at the
  centre of `#ui-add-segment` returns the preview's "The owner blocks playback
  here" overlay, and a real mouse click is swallowed. With five segments the
  preview covers 331px of the mark bar. The user can still type in neither
  field (the In field is covered too) and the only way on is the undocumented
  ⌘⇧↵ shortcut.

  Measured (1440x900), per added segment — the preview panel's own box shrinks
  while its video box stays 457px tall and overflows:

  | segments | preview panel box | aspect box bottom | In / Add row | hit test |
  |---|---|---|---|---|
  | 0 | 86–482 | 543 | 607–643 | OK |
  | 1 | 86–446 | 543 | 571–607 | OK |
  | 2 | 86–388 | 543 | 513–549 | **COVERED** |
  | 3 | 86–329 | 543 | 454–490 | **COVERED** |
  | 5 | 86–212 | 543 | 337–373 | **COVERED** |
- **Proof**:
  - `audit/run-1/area-B/t11-overflow-per-segment.cjs` — prints the table above
    and `MOUSE CLICK REFUSED` from segment 3 on.
  - `audit/run-1/area-B/out/t11-1440x900/03-refused-at-5.png` — the timeline and
    segment pills are drawn *inside* the preview rectangle and the mark bar is
    behind it.
  - Hit geometry captured in `audit/run-1/area-B/t09-fold-and-overlay.cjs`:
    `{"btn":{"top":513,"bottom":549},"topElement":"absolute inset-0 flex flex-col
    items-center justify-center...","aspectVideo":{"top":86,"bottom":543}}`.
- **Suspected file**: `src/components/PreviewPanel.tsx` — the root is
  `flex min-h-0 min-w-0 flex-1 flex-col` and the video wrapper is `shrink-0`
  with `aspect-video`, so the fixed-ratio child outgrows the panel instead of
  shrinking or clipping. Interacts with
  `src/components/shell/ThreeColumnLayout.tsx` (`#ui-col-centre` gives the
  preview whatever is left).

---

### B-4  A sub-second or non-numeric mark silently becomes the whole video

- **Severity**: major
- **Status**: confirmed
- **Steps**: load a 30-minute video, then
  1. Type `10.5` into **In** and `20.25` into **Out**.
  2. Read the Length readout; click **Add segment**.
  3. Repeat with `abc` / `def`, and with `-5` / `00:00:20`.
- **Expected**: either the decimals are honoured (`segments.ts: parseTimecode`
  accepts `.mmm` and the mark bar marks the fields valid), or they are rejected
  with the message the app already has ("That is not a time"). Garbage text must
  never produce a segment.
- **Actual**:
  - `10.5` / `20.25` → Length reads **00:30:00**, the whole video.
    `aria-invalid` is `false` on both fields, so nothing looks wrong. Add
    segment is enabled and produces the row `00:00:00 to 00:30:00 · 30:00`.
    Cut is then enabled (the 10-minute client cap is skipped once a segment
    exists) and the server refuses the job with
    `Clip length capped at 600 seconds (10 minutes)`. No file is written.
  - `abc` / `def` → same: Length `00:30:00`, Add enabled, one whole-video
    segment, though here `aria-invalid` is `true` on both fields.
  - `-5` / `00:00:20` → the In field still shows `-5` but the segment silently
    starts at `00:00:00`.
- **Proof**:
  - `audit/run-1/area-B/t02-inputs.cjs` time battery:
    `[sub-second decimals] in="10.5" out="20.25" total=00:30:00 addDisabled=false ... ariaInvalid=false/false`
  - `audit/run-1/area-B/t03-marking.cjs`:
    `segment rows: ["1 00:00:00 to 00:30:00 30:00 ..."]`,
    `alerts: ["Clip length capped at 600 seconds (10 minutes) ..."]`,
    `files written: []`
  - `audit/run-1/area-B/out/t03-marking/02-subsecond-segment.png`,
    `03-subsecond-cut-result.png`, `04-letters-segment.png`
- **Suspected file**: `src/hooks/useClipper.ts` — `start`/`end` fall back to
  `0` and `duration` when `parseTimestamp` (`src/lib/clip.ts`, `/^\d+$/`, no
  decimals, no sign) returns null, while `src/components/MarkBar.tsx` judges
  validity with `parseTimecode` (`src/lib/segments.ts`), which accepts decimals.
  Two parsers disagree and the looser one gates the button.

---

### B-5  A URL with no video id loads as a source, and "Cut as one file" then does nothing at all

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Paste `https://www.youtube.com/@somechannel` (or a `/playlist?list=…` URL)
     and press Enter.
  2. The URL bar collapses to a source chip, the mark fields enable, the
     transcript column fills.
  3. Mark `00:00:05–00:00:15`, Add segment, click **Cut as one file**.
- **Expected**: either the link is refused up front ("that is a channel, not a
  video"), or the cut runs.
- **Actual**: the app accepts it as a loaded source. Cut is enabled. Clicking it
  does **nothing**: no progress, no Cancel button, no error, no file, the
  segments just sit there. `cutClip` returns on `!videoId` before anything
  happens. The user clicks the only primary action on screen and gets silence.
- **Proof**:
  - `audit/run-1/area-B/t03-marking.cjs` section 6:
    `cut disabled: false`, `after clicking Cut: files added = 0`,
    `downloading indicator: 0`, `alerts: []`,
    `segments still there: ["1 00:00:05 to 00:00:15 ..."]`
  - `audit/run-1/area-B/out/t03-marking/05-no-videoid-cut.png`
  - `audit/run-1/area-B/t02-inputs.cjs`: `[playlist]` and `[channel url]` both
    end with `markFieldsDisabled=false` and a loaded source chip.
- **Suspected file**: `src/App.tsx` (`cutClip`: `if (!videoId || segments.length
  === 0) return;` with no feedback) and `src/hooks/useClipper.ts`
  (`loadInfo` is fired for any string the server accepts;
  `extractVideoId` returning null is never checked).

---

### B-6  Cancel does not stop the engine, and killing the app orphans it

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Mark a range, add it, start a cut against a source that takes minutes.
  2. Press **Cancel** in the status strip.
  3. Count the `yt-dlp` processes.
  4. Start another cut and kill the app.
- **Expected**: Cancel stops the work. The engine process ends, bandwidth and
  CPU are released, and nothing survives the app.
- **Actual**: the UI returns to idle immediately (progress and Cancel both
  disappear) but the `yt-dlp` child keeps running — still there 15 seconds
  later, and with a real source still downloading. Killing the app leaves every
  such child orphaned and running with no parent.
- **Proof**: `audit/run-1/area-B/t15-cancel-leak.cjs`
  ```
  during the cut: 1 yt-dlp process(es)
      13281       4 node .../stubB/resources/bin/yt-dlp
  15s after Cancel: 1 yt-dlp process(es) still running
      13281      19 node .../stubB/resources/bin/yt-dlp
  UI says: {"cancel":false,"status":""}
  before SIGKILL: 2 yt-dlp process(es)
  6s after the app was killed: 2 yt-dlp process(es) still running
  ```
  `audit/run-1/area-B/out/t15-leak/01-after-cancel.png`
- **Suspected file**: `src/hooks/useClipper.ts` — `cancelDownload` only aborts
  the renderer's `fetch`; nothing tells the job to stop. (The server's
  `res.on("close")` kill is wired for `/api/auth/youtube/status`, not for the
  download's own children — cross-check with area G.)

---

### B-7  Deleting a segment while the cut runs still puts it in the finished file

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Build a three-segment clip: `00:00:02–05`, `00:00:20–24`, `00:00:10–13`
     (10 seconds stitched).
  2. Click **Cut as one file**.
  3. While it is running, click the **×** on segment 2.
- **Expected**: either the row cannot be removed while the job that contains it
  is running, or removing it cancels and restarts the cut — and in any case the
  file must match what the user last saw.
- **Actual**: the row disappears from the list immediately, the cut carries on
  with all three ranges, and the saved file is 10.01s — it still contains the
  segment the user just deleted. Nothing on screen says so. When the cut
  finishes, the remaining rows are cleared too, so there is no way to notice.
- **Proof**: `audit/run-1/area-B/t18-midcut-mutations.cjs`
  ```
  mid-cut rows: 3 rows
  after removing #2 mid-cut: 2 rows
  file produced: ["Mutate [00-00-02-00-00-13].mp4"]
    Mutate [00-00-02-00-00-13].mp4: 10.01s  (the cut was launched with 3 segments = 10s)
  sections the engine cut: ["*2.00-5.00","*20.00-24.00","*10.00-13.00", ...]
  ```
  `audit/run-1/area-B/out/t18-midcut/02-deleted-midcut.png`
- **Suspected file**: `src/components/MarkBar.tsx` / `src/components/SegmentList.tsx`
  (remove stays live during `downloading`) and `src/App.tsx` `cutClip`
  (snapshots the list, then `clearSegments()` regardless).

---

### B-8  A tab remembers nothing: no reopen, no confirmation on close, nothing restored on relaunch

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Open two tabs, load a video in each, mark some segments.
  2. Close one tab with its ×.
  3. Look for any way to get it back. Press Ctrl+Shift+T.
  4. Quit and relaunch.
- **Expected**: closing a tab with work in it asks, or can be undone; a relaunch
  brings the tabs back pointing at the same videos, as a browser-style tab strip
  implies.
- **Actual**:
  - Closing a tab that is not mid-download takes no confirmation and discards
    its video and marks instantly.
  - There is no reopen anywhere: no menu item, no wording ("reopen", "recently
    closed", "undo close") anywhere in the DOM, and Ctrl+Shift+T does nothing.
  - Only `{id, name}` is persisted. After a relaunch every tab comes back as an
    empty "New tab" — a tab the user had renamed "Interview" returns named
    "Interview" with no video, no transcript and no segments.
- **Proof**: `audit/run-1/area-B/t04-tabs.cjs`
  ```
  workspaces persisted: {"tabs":[{"id":"ws_...","name":""}],"activeId":"ws_..."}
  any reopen wording on screen: false
  tabs after Ctrl+Shift+T: [ 'Video AAA' ]
  tabs after relaunch: [ 'New tab', 'Interview' ]
  live pane: {"rows":[],"total":"00:00:00","source":"Reload", ...}
  ```
  `audit/run-1/area-B/out/t04-relaunch/01-relaunched.png`
- **Suspected file**: `src/context/WorkspaceContext.tsx` — `PersistedState` is
  `{tabs:[{id,name}], activeId}`; `closeTab` only confirms when `meta[id].busy`.

---

### B-9  With many tabs the strip never scrolls to the active tab and the + button is off screen

- **Severity**: major
- **Status**: confirmed
- **Steps**: seed `clipper.workspaces` with 25 tabs and `activeId` set to the
  last one, then launch.
- **Expected**: the active tab is scrolled into view, and a new tab can still be
  opened.
- **Actual**: the strip renders all 25 tabs in a `overflow-x-auto` row with
  `scrollLeft: 0` and never scrolls to the selection. The active tab is off
  screen (`activeInView: false`, scrollWidth 2592 vs clientWidth 1421) and so is
  the **New tab** button (`newTabButtonInView: false`). The user cannot see
  which tab they are in, and cannot open another one without finding a way to
  scroll a strip that has no visible scrollbar. Every one of the 25 tabs is also
  fully mounted (25 live copies of the transcript column, mark bar and preview).
- **Proof**: `audit/run-1/area-B/t04-tabs.cjs`
  ```
  workspace tabs rendered: 25
  element ids, 25 tabs: [["ui-mark-in",25],["ui-cut",25],["ui-stitched-total",25],...]
  active tab in view: {"activeInView":false,"scrollLeft":0,"scrollWidth":2592,"clientWidth":1421,"newTabButtonInView":false}
  ```
  `audit/run-1/area-B/out/t04-25tabs/01-25-tabs.png`
- **Suspected file**: `src/components/WorkspaceTabs.tsx` (no `scrollIntoView`
  for the selected tab, the + button is inside the scrolling row) and
  `src/App.tsx` (`tabs.map` mounts every tab).

---

### B-10  The primary action sits below the fold at the app's own minimum window size

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Resize the window to 900x600 — the smallest the app itself allows
     (`minWidth: 900, minHeight: 600` in `electron/main.cjs`).
  2. Load a video and look for **Cut as one file**.
  3. At 1024x768, add a single segment and look again.
- **Expected**: the one filled-accent action on screen is reachable without
  hunting.
- **Actual**:
  - 900x600, nothing marked: Cut's box is 665–701 in a 600px viewport — off the
    bottom (`hitCut: "OFFSCREEN"`). It can be scrolled to, but nothing indicates
    there is anything below.
  - 1024x768: Cut is on screen until the **first** segment is added, then it
    moves to 732–768 and off: 827 with two segments, 886 with three, 1003 with
    five. Every segment pushes the primary action further out of sight.
  - 1440x900 and 900x800 are fine.
- **Proof**:
  - `audit/run-1/area-B/t08-layout.cjs`:
    `900x600 ... Cut in viewport: false`, `hitCut: "OFFSCREEN"`,
    `after scrollIntoView: {"nowVisible":true}`
  - `audit/run-1/area-B/t11-overflow-per-segment.cjs` 1024x768 block:
    `cut:[732,768] ... hit cut COVERED`, then `[791,827]`, `[850,886]`,
    `[908,944]`, `[967,1003]` with `hit: none`.
  - `audit/run-1/area-B/out/t08-layout/04-layout-900x600.png`,
    `out/t11-1024x768/01-five-segments.png`
- **Suspected file**: `src/components/shell/ThreeColumnLayout.tsx` — the centre
  column grows with the segment list and only the outer wrapper scrolls; nothing
  keeps the primary action in view.

---

### B-11  Cutting the same range twice silently overwrites the file and leaves a phantom history row

- **Severity**: minor
- **Status**: confirmed
- **Steps**: cut `00:00:01–00:00:04`, wait for "Clip saved", then mark and cut
  exactly the same range again.
- **Expected**: either a second file (`… (2).mp4`), or a warning that this range
  is already on disk.
- **Actual**: the second cut writes over the first without a word. The clips
  folder has one file; the saved-files list has two rows with the same name and
  the same path, so it claims two clips that do not both exist. (The "Already
  used" gate only fires for ranges recorded against a campaign — with no
  campaign selected there is no warning at all.)
- **Proof**: `audit/run-1/area-B/t05-races.cjs` step 2 —
  `clips now: ["Race video [00-00-01-00-00-04].mp4"]` (one file) with
  `downloads in state: [... "Race video [00-00-01-00-00-04].mp4","Race video [00-00-01-00-00-04].mp4"]`.
  Same in `t17-stories.cjs` story 4.
  `audit/run-1/area-B/out/t05-races/02-same-range-twice.png`
- **Suspected file**: `src/hooks/useClipper.ts` (`buildClipFilename` is a pure
  function of title + range, with no collision check before the save).

---

### B-12  A multi-segment clip is named and logged with a range it does not contain

- **Severity**: minor
- **Status**: confirmed
- **Steps**: build a clip from `00:00:00–01`, `00:00:05–12` and `00:00:25–30`
  (13 seconds stitched) and cut it.
- **Expected**: the filename and the saved-files row describe the clip — its
  three ranges, or at least its real length.
- **Actual**: the file is called `Agreement [00-00-00-00-00-30].mp4`, which
  reads as a 30-second clip from 0:00 to 0:30. It is 13.01s of three disjoint
  ranges. The saved-files row records
  `detail: "Downloaded at 360p."` and nothing about the ranges (the range list
  is only used as a fallback when no quality detail exists), so neither the
  name nor the history says what is in the file.
- **Proof**: `audit/run-1/area-B/t16-timestamps.cjs` —
  `files: ["Agreement [00-00-00-00-00-30].mp4"]`,
  `decoded=13.01s container=13.02s`,
  `downloads row detail: {... "detail":"Downloaded at 360p." ...}`.
  Also `t01-happy-path.cjs`: a 13s two-range clip named
  `Stub video [00-00-02-00-00-28].mp4`.
- **Suspected file**: `src/hooks/useClipper.ts` — `cutStart = segs[0].start`,
  `cutEnd = segs[segs.length - 1].end` feed `buildClipFilename`, and `detail ??
  <range list>` means a quality detail always wins.

---

### B-13  The I and O keys the mark bar advertises do nothing whenever the player is unavailable

- **Severity**: minor
- **Status**: confirmed
- **Steps**: load a video whose embed is blocked (or any video when the YouTube
  player cannot be reached). Click outside a text field and press `i`, then `o`.
- **Expected**: the In/Out fields carry `In  I` and `Out  O` key hints, so the
  keys should set the marks at the playhead.
- **Actual**: nothing happens. The In and Out fields are unchanged. The I/O
  handler and the "Set start"/"Set end" buttons live in `PlayerControls`, which
  `PreviewPanel` only renders when `videoId && !embedBlocked`. In the blocked
  state the whole transport strip — play/pause, the playhead readout, Set start,
  Set end, Play selection — is removed, while the mark bar keeps advertising the
  shortcuts. The on-screen message says only "Cutting and downloading still
  work", not that marking at the playhead has gone.
- **Proof**: `audit/run-1/area-B/t03-marking.cjs` section 1 and 2 —
  `{"rangeInputs":0,"setStartButton":false,"playButton":false,
  "markInKbdLabel":"In I","markOutKbdLabel":"Out O","previewMessage":"The owner
  blocks playback here ..."}`, then
  `before I/O: {"in":"","out":"00:10:00"} after: {"in":"","out":"00:10:00"}`.
  `audit/run-1/area-B/out/t03-marking/01-io-keys.png`
- **Suspected file**: `src/components/PreviewPanel.tsx` (the `!embedBlocked`
  guard around `PlayerControls`), `src/components/PlayerControls.tsx` (owns the
  only I/O handler), `src/components/MarkBar.tsx` (shows the hints regardless).

---

### B-14  A player that could not be reached is reported as "The owner blocks playback here"

- **Severity**: minor
- **Status**: confirmed
- **Steps**: open a video while the YouTube IFrame API cannot be loaded (offline,
  a corporate proxy, a blocked domain).
- **Expected**: "Could not reach the YouTube player" — a cause the user can act
  on.
- **Actual**: the preview shows "The owner blocks playback here", which names the
  wrong culprit and sends the user to find a different video. `useYouTubePlayer`
  sets the same `blocked` flag for an embed-permission error (codes 101/150/153)
  and for a failed script load.
- **Proof**: `audit/run-1/area-B/t03-marking.cjs` —
  `previewMessage: "The owner blocks playback here Cutting and downloading still
  work. Watch on YouTube"`, in a container where the failure is a refused
  network request, not an embed restriction.
  `audit/run-1/area-B/out/t10-overlap/01-marked.png`
- **Suspected file**: `src/hooks/useYouTubePlayer.ts` —
  `.catch(() => !cancelled && setBlocked(true))` shares one flag with
  `EMBED_BLOCKED_CODES`; `src/components/PreviewPanel.tsx` renders one message
  for both.

---

### B-15  Keyboard reordering moves a segment one place and then drops the focus

- **Severity**: minor
- **Status**: confirmed
- **Steps**: build three segments. Tab to segment 3's row (its label says "Alt
  and the arrow keys reorder"). Press Alt+↑ twice to move it to the top.
- **Expected**: two presses move it two places, as in every reorderable list.
- **Actual**: the first press moves it from 3 to 2 and announces "Segment moved
  to position 2 of 3". The focus then lands on `BODY`, so the second press does
  nothing at all and the segment is stranded in the middle. A keyboard-only user
  cannot move a segment more than one place without re-finding the row, and a
  screen-reader user loses their place entirely.
- **Proof**: `audit/run-1/area-B/t18-midcut-mutations.cjs`
  ```
  focused: Segment 3, 00:00:20 to 00:00:2
  after 1st Alt+Up: [... "2 00:00:20 to 00:00:24", "3 00:00:10 to 00:00:13"]
  focus now: BODY
  after 2nd Alt+Up: (unchanged)
  ```
  `audit/run-1/area-B/out/t18-midcut/01-keyboard-reorder.png`
- **Suspected file**: `src/components/SegmentList.tsx` — the row key is
  `` `${i}-${seg.start}-${seg.end}` ``, so reordering remounts the rows and the
  focused node is destroyed; nothing refocuses the moved row.

---

### B-16  Changing the URL mid-cut leaves the old cut running under the new video's labels

- **Severity**: minor
- **Status**: confirmed
- **Steps**: start a cut, and while the progress bar is up click **Change** and
  load a different video.
- **Expected**: either the cut is cancelled with the source it belongs to, or
  the status strip keeps describing the job that is actually running.
- **Actual**: the old cut carries on and eventually saves correctly (named after
  the old video), but while it runs the status strip reads `00:00:30 clip · MP4`
  — the **new** video's full range — beside a live "Downloading segment 1 of 1"
  and a Cancel button. There is nothing on screen that identifies which clip is
  being made, and pressing Cancel would cancel a job the user can no longer see.
- **Proof**: `audit/run-1/area-B/t05-races.cjs` step 4 —
  `mid-cut after URL change: {"source":"Loading", ..., "cancelVisible":true}`,
  `after it settles: {"source":"Other video 00:00:30 Change","status":"00:00:30
  clip · MP4"}`, `clips: [... "Race video [00-00-20-00-00-24].mp4"]`.
  `audit/run-1/area-B/out/t05-races/05-url-change-midcut.png`
- **Suspected file**: `src/hooks/useClipper.ts` (download state is not tied to
  the video it was started for) and
  `src/components/shell/DownloadBar.tsx` (the status line is computed from the
  current `info`, not from the running job).

---

### B-17  A blank or unparseable link is answered with the validator's own words

- **Severity**: minor
- **Status**: confirmed
- **Steps**: type a space, or `hello`, into the URL bar and press Enter.
- **Expected**: "That does not look like a YouTube link."
- **Actual**: the status strip shows `Invalid url` — the raw zod message, lower
  case and with no next step. A non-YouTube link does better ("URL must be a
  YouTube link"), and an empty box does best ("Paste a YouTube link to begin"),
  so the three cases are inconsistent.
- **Proof**: `audit/run-1/area-B/t02-inputs.cjs`
  ```
  [whitespace]   ... status "Invalid url"
  [bare word]    ... status "Invalid url"
  [non-youtube]  ... status "URL must be a YouTube link"
  ```
  `audit/run-1/area-B/out/t02-inputs/01-url-last.png`
- **Suspected file**: `src/components/UrlBar.tsx` / `src/hooks/useClipper.ts`
  (`searchNow` posts anything non-empty and renders the server's text verbatim).

---

### B-18  Every tab mounts a duplicate of every element id

- **Severity**: minor
- **Status**: confirmed
- **Steps**: open two tabs, then count `document.querySelectorAll("#ui-mark-in")`.
- **Expected**: one element per id, as HTML requires.
- **Actual**: one copy per open tab — 2 with two tabs, 25 with twenty-five, for
  `ui-mark-in`, `ui-mark-out`, `ui-cut`, `ui-add-segment`, `ui-stitched-total`,
  `ui-col-centre`, `ui-col-transcript` and the rest. `getElementById` and any
  `aria-*`/`for` reference resolve to the first (hidden) copy, which is what
  assistive technology and the app's own guided-tutorial spotlight follow.
- **Proof**: `audit/run-1/area-B/t04-tabs.cjs` —
  `element ids, two tabs: [["ui-mark-in",2],["ui-cut",2],...]`,
  `element ids, 25 tabs: [["ui-mark-in",25],...]`
- **Suspected file**: `src/App.tsx` (`tabs.map` renders every tab's `Layout`),
  with the ids set in `src/components/MarkBar.tsx` and
  `src/components/shell/ThreeColumnLayout.tsx`.

---

### B-19  Three of this area's range-control files are unreachable dead code

- **Severity**: minor
- **Status**: confirmed
- **Steps**: load a video and count the range inputs on screen.
- **Expected**: `TimeRangeControls` / `DualRange` are listed as the in/out
  controls, so at least one `input[type=range]` should exist.
- **Actual**: zero. `document.querySelectorAll('input[type="range"]').length ===
  0` and `input[aria-label="Start time"]` does not exist. `TimeRangeControls.tsx`
  is imported by nothing, `DualRange.tsx` only by `TimeRangeControls`, and
  `useDualRange.ts` by nothing at all. The shipped range UI is `MarkBar` +
  `Timeline`. The dead `setStartFromSeconds`/`setEndFromSeconds` clamps
  (`Math.min(value, end - 1)`) they were written for are still exported and
  still used by the I/O keys in B-13.
- **Proof**: `audit/run-1/area-B/t03-marking.cjs` section 1 —
  `{"rangeInputs":0,"startTimeSlider":false, ...}`;
  `grep -rn "TimeRangeControls\|DualRange\|useDualRange" src/` returns only the
  files themselves.
- **Suspected file**: `src/components/TimeRangeControls.tsx`,
  `src/components/DualRange.tsx`, `src/hooks/useDualRange.ts`.

---

### B-20  A timestamped link's `?t=` is carefully preserved and then ignored

- **Severity**: minor
- **Status**: confirmed
- **Steps**: paste `https://www.youtube.com/watch?v=…&t=90s&si=TRACKING`.
- **Expected**: `normalizeYouTubeUrl` goes out of its way to keep `t` ("Preserves
  the `t` (start-time) param when present"), so the obvious payoff is that the
  in point, or at least the playhead, lands at 1:30. Tracking params are
  correctly dropped.
- **Actual**: the link loads, `si`/`utm_*`/`list` are stripped, and `t` reaches
  the server — where nothing reads it. The In field stays empty and the playhead
  stays at 0. Someone pasting a link from a timestamped comment has to re-find
  the moment by hand.
- **Proof**: `audit/run-1/area-B/t17-stories.cjs` story 6 —
  `timestamped: {"source":"Reload","in":"","out":"00:00:30"}`.
  `audit/run-1/area-B/out/t17-stories/05-story6-url-variants.png`
- **Suspected file**: `src/lib/clip.ts` (`normalizeYouTubeUrl`) and
  `src/hooks/useClipper.ts` (`loadInfo` never looks at `t`).

---

### B-21  Every cut downloads each segment twice

- **Severity**: minor
- **Status**: confirmed
- **Steps**: cut any clip at the default MP4 / Best and read the engine's call
  log.
- **Expected**: one `--download-sections` run per segment.
- **Actual**: two. A three-segment clip issues six section downloads; the whole
  set is re-run on a second player-client list because the delivered height came
  back below what the probe listed. For the user that is double the wait on
  every cut, with no indication that anything is being retried (the progress bar
  simply runs to 99 and starts again).
- **Proof**: `audit/run-1/area-B/t17-stories.cjs` story 3 —
  `join order the engine was given: [["*2.00-5.00","seg-01.mp4"],
  ["*20.00-24.00","seg-02.mp4"],["*10.00-13.00","seg-03.mp4"],
  ["*2.00-5.00","seg-01.mp4"],["*20.00-24.00","seg-02.mp4"],
  ["*10.00-13.00","seg-03.mp4"]]`; same doubling in `t01-happy-path.cjs`.
- **Suspected file**: `server/index.ts` (the `isDegradedDelivery` retry) — owned
  by **area G**, logged here because it is felt entirely inside this loop.

---

## Coverage

What was driven in the real app, and what it did.

**The single most important assertion — passes.** Paste a URL, mark
`00:00:02–00:00:07`, Add segment, mark `00:00:20–00:00:28`, Add segment, Cut as
one file: **one** file is written, and real ffmpeg decodes it at **13.02s**,
exactly the sum of the 5s and 8s ranges. Reproduced a second time with three
ranges (1 + 7 + 5) at 13.01s, and a third time with a reordered list at 10.01s.
`t01-happy-path.cjs`, `t16-timestamps.cjs`, `t17-stories.cjs` story 3.

| Function | Driven | Result |
|---|---|---|
| Paste / change a URL | 13 URL shapes: empty, whitespace, non-YouTube, bare word, playlist, watch+list, Shorts, youtu.be, `?t=`, tracking params, emoji/unicode, 10,000 characters, channel | Shorts, `youtu.be`, watch+list, tracking params and a 10k string all resolve and load; tracking params are stripped. Defects: B-5, B-17, B-20 |
| Tabs: open, switch, close, reopen, many | 1, 2 and 25 tabs; close, close-the-last, relaunch, Ctrl+Shift+T | Closing the last tab correctly leaves a fresh one. Defects: B-2, B-8, B-9, B-18 |
| Transcript load and windowing | 6,000 cues (a 6h40m stream) | **Passes, and it is genuinely windowed**: `6,000 lines · 40 drawn`, 40 DOM rows, ready in ~660ms, grows 40→80→120 on "drawing the next 40" and then **caps at 120**. Nothing loads the whole transcript into the DOM. `t12-transcript.cjs` |
| Transcript search and follow | whole-transcript search over 6,000 lines, a phrase spanning two caption lines, a query with no hits, Enter/Shift+Enter stepping, Follow | Search itself is correct and fast (~1.5s over 6,000 lines, cross-line phrase found, `1/1`). But B-1 destroys the app the moment the result set empties |
| Mark in / out, keyboard rhythm | typed marks, 12 bad-time cases, ⌘⇧↵, ⌘↵, ⌘⌫, ⌘Z, Tab order, I/O | ⌘⇧↵ and ⌘↵ work; Tab order In → Out → segment rows → Cut is sane. Defects: B-3, B-4, B-13 |
| Several segments → one linked file | 2, 3 and 5 segments; reordered by Alt+↑ and by drag | The join honours the on-screen order (seg-01…seg-03 match rows 1…3) and the duration is the sum. Defects: B-3, B-7, B-15 |
| Preview and scrub | timeline click-to-seek, keyboard Home/End/PageUp/PageDown, playhead marker | The timeline is a labelled `role="slider"` with `aria-valuetext`, and click-to-seek drives the transcript's current line. The player itself is **not provable here** |
| Download, progress, cancel | double-click Cut, same range twice, cancel + immediate re-cut, two tabs at once, stall, engine failure, app killed | Double-click produces one file (Cut disables while running). Cancel keeps the marks and leaves no temp folder. Two tabs cutting at once both produce the right file (`t19-two-tab-cuts.cjs`: `["ALPHA […].mp4","BETA […].mp4"]`). A yt-dlp failure gives a plain message, keeps the segments and offers a retry that then succeeds. Defects: B-6, B-11, B-16 |
| Used-ranges record | cut inside a campaign, then re-mark the same moment | **Passes end to end**: `usedRanges` written back as `{"used0000001":[{"start":4,"end":12,"clipId":"C-used0000001-01"}]}`, two transcript rows tagged "used" and hatched, one hatched span on the timeline titled `Already used by C-used0000001-01: 00:00:04 to 00:00:12`, the overlap warning names the clip and blocks Cut until "Use it anyway". `t20-progress-and-used.cjs` |
| Calculations / formatting | 0s, 59s, 60s, 3599s, 3600s, 86399s, 86400s, 25:30:45, 100:00:00, on a 111-hour video | **No off-by-one anywhere.** Timeline end label, header chip, mark bar total, timeline `title`, segment row and the saved file all agree, including past 24h (`100:00:00 to 100:00:10`). `t16-timestamps.cjs` |
| Layout at 1440x900 / 1024x768 / 900 wide | four viewports, with 0–5 segments | Defects: B-3, B-10 |
| Accessibility | labels, tab order, live regions, keyboard-only marking and reordering | In/Out have real `<label>`s, Add and Cut carry `aria-keyshortcuts`, the segment list has an `aria-label` and an `sr-only` live region that announces moves, 5 live regions in the pane. Defects: B-15, B-18 |
| State over time | 25 seeded tabs, a seeded campaign with used ranges, a source that now fails, first run vs returning, app killed mid-cut | A failing source gives the engine's own message and keeps the marks. `settings.json` survives a SIGKILL intact. Defects: B-8, B-9 |
| Errors | engine failure, out-of-range, empty range, no clips folder, transport failure wording | Messages are plain and name the next step ("Try again. Your marked range is kept."); the footer nags "Choose a clips folder" before a cut can go wrong. Defect: B-17 |

**Scripts**: `stubroot.cjs`, `boot.cjs`, `live.cjs`, `t00-smoke`,
`t01-happy-path`, `t02-inputs`, `t03-marking`, `t04-tabs`, `t05-races`,
`t08-layout`, `t09-fold-and-overlay`, `t10-overlap`, `t11-overflow-per-segment`,
`t12-transcript`, `t13-search-crash`, `t13b-search-clear-crash`,
`t14-interruptions`, `t15-cancel-leak`, `t16-timestamps`, `t17-stories`,
`t18-midcut-mutations`, `t19-two-tab-cuts`, `t20-progress-and-used`.

### Step 4 — user stories, run

1. **Find a quote and clip it.** Search the transcript, click the matching line
   to seek, mark around it. Works until the search box is cleared → **B-1**.
2. **Select a passage by shift-clicking two transcript lines.** Works: sets
   `00:00:04–00:00:16`, snapped outward to whole caption lines.
3. **Build a three-part highlight and reorder it before cutting.** The file is
   10.01s and joins in the displayed order — but Alt+↑ only moves one place
   (**B-15**) and Add segment stops taking clicks (**B-3**).
4. **Cut the same quote twice by accident.** Silently overwritten, two history
   rows (**B-11**).
5. **A source that has been taken down.** Clear engine message, marks kept.
   Passes.
6. **A Shorts link, then a timestamped link.** Shorts loads; `?t=90` is ignored
   (**B-20**).
7. **Two videos open, cut from each in turn.** Cross-tab contamination
   (**B-2**); the two concurrent cuts themselves are correct.
8. **Cancel a long cut and start again immediately.** The UI is right, the
   engine is not (**B-6**).
9. **Change your mind mid-cut and load another video.** The old cut finishes
   under the new video's labels (**B-16**).
10. **Delete a segment while the cut runs.** The deleted segment is still in the
    file (**B-7**).
11. **Close a tab while it is downloading.** Correct: a clear confirmation
    ("This tab has a job running…"), the tab closes and no file is written.
12. **Kill the app mid-cut and relaunch.** Settings survive, no temp folder is
    orphaned, the saved-files list is intact — but the in-flight clip, the
    marks and the video are gone with no notice, and `yt-dlp` is left running
    (**B-6**, **B-8**).
13. **Come back to 25 open tabs.** Cannot see which tab is active or open a new
    one (**B-9**).
14. **Mark with the keyboard only.** Type into In, Tab, type into Out, ⌘⇧↵ to
    add, ⌘↵ to cut — the whole rhythm works, which is the only reason **B-3** is
    survivable at all.

## Not provable here

- **Real YouTube metadata, transcripts and media.** The network policy refuses
  `youtube.com`, so every `/api/info`, `/api/transcript` and `/api/download`
  answer came from the scripted stub. Real caption timing, real format ladders
  and real failure strings are unproven.
- **The video preview itself.** `useYouTubePlayer` loads
  `https://www.youtube.com/iframe_api`, which cannot be reached, so the player
  never initialises. Play/pause, scrubbing by dragging the player, looped
  selection playback, the playhead poll, `onStateChange`, and the real
  embed-blocked codes (101/150/153) are all unexercised. Everything the audit
  saw of the preview is the blocked-state branch — which is exactly why
  **B-13** and **B-14** were visible, but the working branch is untested.
- **Marking at the playhead (I / O, Set start, Set end) in the normal case.**
  These only exist while the player is alive, so their behaviour with a real
  playhead — including whether `setStartFromSeconds`'s `Math.min(value, end - 1)`
  clamp silently rewrites an in point marked after an out point — is reasoned
  about, not driven. That clamp is the one thing in this area I would have
  called a finding and could not confirm.
- **Signed-in / 1080p downloads.** No YouTube session exists here; every cut ran
  on a synthetic cookie file against the stub, so quality selection, the
  degraded-delivery retry's real trigger and the auth-failure paths are area A
  and G territory.
- **Drag-to-reorder with a real mouse.** The HTML5 drag-and-drop in
  `SegmentList` cannot be driven through Playwright's synthetic pointer events;
  only the keyboard path (Alt+arrows) and the × button were exercised.
- **Real transcript sizes and shapes.** The 6,000-line windowing test used
  uniform 4-second cues. Overlapping auto-caption cues, zero-length cues and
  non-Latin text are covered by `src/lib/transcript.ts`'s unit tests but were not
  driven through the column.
- **macOS / Windows behaviour.** Window minimums, ⌘ versus Ctrl chords and the
  native confirm dialog were exercised on Linux only.
