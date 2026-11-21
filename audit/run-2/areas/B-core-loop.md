# Area B — Core clipping loop (run 2)

Everything below was produced by driving the **real Electron app** through
`audit/run-2/area-B/lib.cjs` with real clicks, real keystrokes and real mouse
coordinates, with a scriptable `yt-dlp` and the **real** ffmpeg cutting and concat
pipeline. Scripts are in `audit/run-2/area-B/`, their captured console output beside
them as `out-NN-*.txt`, screenshots and renderer logs in
`audit/run-2/area-B/out/<label>/`. **No product code was changed.**

Three app trees were built and driven, so that every "it is fixed" claim has a control:

| tree | what it is | where |
|---|---|---|
| `LIVE` | the real tree, as it stands | `/home/user/stream-trimmer` |
| `ctrlA` | **run 1's code** (commit `26ea7ab`, before any fix thread) | scratch copy, built with its own `dist/` + `electron/dist/server.cjs` |
| `ctrlB` | the fixed tree with **only** `ClipsColumn.tsx`'s call site reverted (`seg.setBanked(planned)` → `setBankedRanges(planned)`) | scratch copy |

A pristine build of `HEAD` in a scratch copy produced
`dist/assets/index-D6lcmMXu.js` with md5 `8803569c6265ce60dc0607c4877abb55` — the same
name **and the same bytes** as the live tree's bundle. So the live `dist/` really is the
current source, and a `LIVE` run is a run of the code in the repo.

Run with:

```
node audit/run-2/area-B/stubroot.cjs /tmp/.../b2/stub2
ROOT=/home/user/stream-trimmer TAG=LIVE \
  xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-B/b01-c1-negative-control.cjs
```

`stubroot.cjs` is run 1's area-B stub plus two audit-only additions this run needed:
`infoFromUrl` (answer each probe about the video it was actually asked about — without
it every tab in a restored workspace gets the same metadata, which fakes both a
cross-tab leak and a failed restore) and `section403` (make the sectioned download 403
so the server takes the whole-file + local-trim path T1 changed).

**13 findings (B2-1 … B2-13): 0 blockers, 6 major, 6 minor, 1 polish.** B2-13 is one
entry grouping eight run-1 minors that were never assigned a fix and are unchanged.
Nine of the thirteen are new; four (B2-10 … B2-13) are run-1 findings re-driven here.
The fix verdicts are in their own table below.

---

## The negative control, stated plainly

### C-1 — **HELD. Crash reproduced on demand in the control; absent on the real tree.**

- **The control crashes, every time.** `ctrlA` (run 1's code), with one campaign, one
  bank row still `banked` for video AAA and AAA loaded into tab 1: clicking **+** blanks
  the window. Reproduced on every run of the script.
  `#root` drops to 0 children, `document.body.innerText.length` is 0, and the renderer
  throws `Minified React error #185` twice. Exactly run 1's C-1.
  `out-01-c1-ctrlA.txt`, `out/b01-c1-ctrlA-prefix/02-two-tabs-second-empty.png`.
- **The real tree does not crash** through the same script *and* through harder steps
  than C-1 asked for: two tabs **both showing the same video** with a planned bank row,
  four fast tab switches, a segment added with the bank live in both tabs, a **third**
  tab on the same video, and six seconds of idle afterwards. `#root` keeps its child,
  2–3 panes stay mounted, no React error, no ErrorBoundary fallback.
  `out-01-c1-live.txt`, `out/b01-c1-LIVE/*.png`.
- **The crash check is honest about the new error boundary.** T3 added a top-level
  `ErrorBoundary`, so a render throw no longer necessarily blanks `#root` — it paints
  "Something went wrong" with `#ui-error-retry`. `crashState()` in `lib.cjs` treats an
  empty `#root`, the boundary fallback, a React error in the console **and** a renderer
  that stops answering as a crash. A check that only looked for an empty `#root` would
  now call a caught crash a pass.
- **What actually fixes it:** the per-tab store, not the call site. Reverting **only**
  `ClipsColumn`'s `seg.setBanked(planned)` back to the module-level `setBankedRanges`
  (`ctrlB`) does **not** bring the crash back — no React error, no blank, through the
  same script (`out-01-c1-ctrlB.txt`). The two-writer loop run 1 diagnosed needs both
  `ClipsColumn`s to *read* the same store as well as write it, and `useSegments()` now
  reads the tab's own store whatever the call site does.
- **The call site is still load-bearing, for a different defect.** With two tabs
  restored at launch (AAA with a two-row bank, BBB active), `ctrlB` paints **no** banked
  span on the hidden AAA tab — its plan went to the active tab's store and was
  overwritten there — while `LIVE` correctly shows AAA's two `Banked:` spans on AAA and
  none on BBB. That is T4's own admitted gap, and it is closed.
  `out-12-bank-ctrlB.txt` vs `out-12-bank-live.txt`,
  `out/b12-ctrlB-restored/01-restored-bbb-active.png`,
  `out/b12-LIVE-restored/01-restored-bbb-active.png`.

### B-2 — **HELD. Reproduced run 1's finished file in the control; gone on the real tree.**

- **The control reproduces run 1's smoking gun exactly.** `ctrlA`: tab 1 marks two
  ranges on video AAA (`00:00:10–13`, `00:00:20–24`); opening tab 2 wipes them
  (`total 00:00:00, rows []` on tab 1 while tab 1 is not on screen); a segment marked in
  tab 2 on video BBB appears in **both** panes; cutting in tab 1 writes
  **`Video AAA [00-00-02-00-00-05].mp4`, decoded 2.99s** — video AAA cut at a range only
  ever marked on BBB — and tab 2's own cut then produces nothing at all.
  `out-02-b2-ctrlA.txt`, `out/b02-ctrlA-prefix/03-tab1-after-switch-back.png`.
- **The real tree keeps the tabs apart, through to the files.** Tab 1 still holds its two
  segments after tab 2 is opened, after BBB loads in it, after a segment is marked there,
  and after switching back. Cutting in each tab produces
  `Video AAA [00-00-10-00-00-24].mp4` at **7.01s** (3s + 4s) and
  `Video BBB [00-00-02-00-00-05].mp4` at **2.99s**, and the engine is asked only for its
  own tab's sections. `out-02-b2-live.txt`,
  `out/b02-LIVE/03-tab1-after-switch-back.png`.
- Eight tabs with eight clips survived **24 fast switches** (60 ms apart) with every tab
  keeping exactly its own rows, and a cut in tab 2 while tab 1 was downloading produced
  both correct files. `out-11-regressions-live.txt`.

---

## Did each run-1 area-B fix hold?

| run-1 finding | verdict | evidence |
|---|---|---|
| **B-1** transcript search blanks the app | **HELD** | control blanks at `needles` (`bodyLen=0`, segments gone); LIVE reads `0/0` and keeps both segments through typing-to-empty, clearing, Escape, stepping past the end with Enter/Shift+Enter, and character-by-character typing and deleting, over 12 and 6,000 cues. `out-03-b1-ctrlA.txt`, `out-03-b1-live.txt` |
| **B-2** segments shared across tabs | **HELD** (control above) | `out-02-*.txt` |
| **B-3** preview covers In/Out and Add | **HELD** | `elementFromPoint` + a real click on `#ui-add-segment` and `#ui-mark-in` at 1440x900, 1280x800, 1100x760, 1024x768 and 900x600 with 0–5 segments: `OK` in every cell, `addClick=clicked` every time. The video box stays inside its column (e.g. 86–343 at 1024x768 instead of spilling to 543). `#ui-cut` also hit-tests `OK` at the four three-column widths; at 900x600 it is `OFFSCREEN` for the separate reason in **B2-12**. `out-05-layout-live.txt` |
| **B-5** channel/playlist URL loads then Cut does nothing | **HELD** (but over-reaches: **B2-3**) | channel, `/c/`, `/channel/`, playlist, `results?search_query=`, a bare word and a non-YouTube link are all refused with one plain message, mark fields disabled, Cut disabled. Control: all of them loaded and Cut wrote nothing and said nothing. `out-04-urls-ctrlA.txt`, `out-04-urls-live.txt` |
| **B-6** Cancel does not stop the engine | **HELD** | the engine child is gone **within 2s** of Cancel (run 1: still running at 15s); `POST /api/download/cancel` answers `200 {"ok":true,"found":true}` and the cancelled `/api/download` answers **`499 {"code":"cancelled"}`**; unknown job → `200 found:false`; no jobId → `400`. SIGKILL mid-cut left **0** orphans (run 1: 2). `out-07-cancel-live.txt`. This also settles the brief's **item 12** for the download path |
| **B-7** deleting a segment mid-cut still ships it | **HELD** | mid-cut every x is `disabled` with `title="Segments are locked while the cut runs"`, rows are `draggable="false"`, Add and Cut are disabled, Delete and Alt+Up do nothing, and the file is 10.01s of exactly the three ranges that were on screen. `out-08-midcut-live.txt` |
| **B-8** a tab remembers nothing | **PARTIAL — two halves failed: B2-4, B2-5** | the record now carries `url` **and** `segments`, closing a tab with work asks first, and Ctrl+Shift+T brings the tab back **with the right video**. But the reopened tab comes back **without its segments**, a relaunch restores the URL and **loses every tab's segments**, and there is still no visible reopen control. `out-09-tabmemory-live.txt` |
| **B-10** primary action below the fold | **PARTIAL** | fixed at three-column widths by the new sticky Cut row (Cut hit-tests `OK` with 0–5 segments at 1440, 1280, 1100 and 1024) — but that row causes **B2-1**, and at the app's own 900x600 minimum Cut is still `OFFSCREEN` (**B2-12**) |
| **B-11** same range twice overwrites silently | **HELD** (new wrinkle: **B2-6**) | the second cut writes `Recheck [00-00-01-00-00-04] 2.mp4`; both files exist at 2.99s |
| **the headline assertion** | **HELD, frame-perfect** | see below |

### The headline assertion, re-proved with frames

Mark `00:00:02–00:00:07` (5s) and `00:00:20–00:00:28` (8s), Add each, **Cut as one file**:
exactly **one** file, decoded by real ffmpeg at **13.01s** (container 13.02s).
`out-10-headline-live.txt`.

Then every delivered frame was identified against all 750 source frames
(`frames.cjs`, the nearest-16x16-grey-thumbnail method T1 used, because both paths
re-encode so a checksum is impossible):

| | sectioned path | whole-file + **local trim** (T1's G-4 change) |
|---|---|---|
| marked frames | 325 | 325 |
| delivered frames | 326 | 326 |
| distinct source frames delivered | 325 | 325 |
| frames from before an in-point | **0** | **0** |
| frames outside any mark | **0** | **0** |
| first / last matched source time | 2.000 / 27.96 | 2.000 / 27.96 |
| worst distance vs smallest runner-up margin | 0.05 vs 0.27 | 0.12 vs 0.25 |

So T1's removal of the 14 frames of pre-roll **cost no marked content**: every marked
source frame is still delivered, on both the sectioned path and the local-trim path the
change actually touched (reached here by making the sectioned download 403).

---

## New findings

### B2-1  At the app's default window the sticky Cut row hides the segment list and swallows clicks on Remove
- **Severity**: major
- **Status**: confirmed
- **Steps**: from a cold start, at the window the app itself opens at (1100x760),
  1. Load a video.
  2. Mark `00:00:10–00:00:20` and click **Add segment**. Look at the segment list.
  3. Add three more segments. Look again.
  4. Click segment 1's **×** where it is drawn (do not scroll first).
- **Expected**: the clip you are building is visible and editable. Removing a segment is
  one click.
- **Actual**: the Cut row (`#ui-cut-row`, `position: sticky; bottom: 0; z-index: 10`,
  opaque `rgb(22,22,24)`), added to keep Cut on screen, is drawn **over** the mark bar's
  own content. With one segment the row's box is 606–658 and the sticky row starts at
  631, so the bottom 27px of the row — including its **×**, whose centre is at y=632 —
  is behind it. A **real mouse click at (793, 632)**, where the × is drawn, does not
  reach it: the segment count stays at 4. `document.elementFromPoint` there returns
  `DIV#ui-cut-row`. With four segments the screenshot shows a sliver of row 1 and
  nothing else of the list: row 2 (664–717) is wholly behind the sticky row, row 3
  (723–775) is behind the footer, row 4 (782–834) is below a 760px viewport — while the
  panel covering them reads "Stitched total, 4 segments". Playwright's own click
  succeeds **only because it scrolls the row into view first** — which is the workaround
  a user would have to find on their own, in a scroller with no visible scrollbar.

  | segments | row 1 behind the sticky row | row 2 | top element at row 1's × |
  |---|---|---|---|
  | 1 | 27px | – | `DIV#ui-cut-row` |
  | 2 | 27px | 52px (all of it) | `DIV#ui-cut-row` |
  | 4 | 27px | 52px | `DIV#ui-cut-row` |

  Measured again at 1280x800 (`lastRowX = COVERED by OUTPUT#ui-stitched-total` with two
  segments) and 1440x900 (covered with three).
- **Proof**: `audit/run-2/area-B/out-06-sticky-live.txt`,
  `out/b06-LIVE/01-default-window-4-segments.png` (the list is gone behind the panel),
  `out/b06-LIVE/02-after-real-mouse-click-on-remove.png`;
  `out-05-layout-live.txt` for the other viewports.
- **Suspected file**: `src/styles.css` (`@container (min-width: 960px) { .cut-row {
  position: sticky; bottom: 0 } }`) with `src/components/MarkBar.tsx` (the row is the
  last child of the mark bar, so it sticks over the segment list it belongs to, and
  carries `z-10` and an opaque background).

### B2-2  Opening the help drawer at the default window pushes In, Out, Add and Cut off screen
- **Severity**: minor
- **Status**: confirmed
- **Steps**: at 1100x760 (the default window), load a video, add a segment, press ⌘/ (or
  click the help button).
- **Expected**: the drawer is explicitly a sibling of the columns "so it can stay open
  while you work" (`ThreeColumnLayout.tsx`). The controls the help describes should stay
  usable.
- **Actual**: the drawer takes 400px, `.cols-host` drops to 700px, the container query
  falls below its 960px breakpoint and the columns **wrap**. In/Out, Add segment and Cut
  move to y=824, 869 and 1142 in a 760px viewport — all three `OFFSCREEN`, measured
  before and after in the same run (`before: {markIn:"OK", add:"OK", cut:"OK"}` →
  `after: {markIn:"OFFSCREEN (824)", add:"OFFSCREEN (869)", cut:"OFFSCREEN (1142)"}`).
  The drawer's own first topic is "Cut a clip". T3's H-3 note says the container query
  means the drawer "no longer crushes three columns into what is left"; it wraps them
  instead, and at the default window the whole MARK column lands below the fold.
  Closing the drawer restores everything, which is why this is minor and not major.
- **Proof**: `out-06-sticky-live.txt` (the "help drawer" block),
  `out/b06-LIVE/03-help-drawer-open-default-window.png`.
- **Suspected file**: `src/components/shell/ThreeColumnLayout.tsx` +
  `src/styles.css` (`@container (min-width: 960px)`), with `src/components/HelpDrawer.tsx`'s
  400px width.

### B2-3  A `youtube.com/live/<id>` link — the canonical link for a stream — is refused as "not a single video"
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Paste `https://www.youtube.com/live/mmmmmmmmmmm` and press Enter.
  2. Paste `https://www.youtube.com/watch?v=mmmmmmmmmmm` — the same video.
- **Expected**: both load. `/live/<id>` is what YouTube hands you for a live or
  just-ended stream, and this app is a stream trimmer.
- **Actual**: the `/live/` link is refused before any request is made, with
  `That link is not a single video (a channel, playlist or other page). Paste a link to
  one video.`, the mark fields stay disabled and Cut stays disabled. The `watch?v=` form
  of the **same** video loads normally. `extractVideoId` (`src/lib/clip.ts`) recognises
  `embed`, `shorts` and `v` path segments but not `live`, and B-5's new guard
  (`videoUrlProblem`) turns that gap into a hard refusal in both `loadInfo` **and**
  `download`. This is a regression introduced by the B-5 fix: in `ctrlA` the same link
  loaded and marked normally (`[live/] markDisabled=false`, transcript loaded).
  `/embed/<id>` and `/shorts/<id>` still work, so the inconsistency is visible.
- **Proof**: `out-14-urlchip-live.txt` (section A), `out-04-urls-live.txt` (`[live/]`
  line) vs `out-04-urls-ctrlA.txt` (`[live/]` line).
- **Suspected file**: `src/lib/clip.ts` (`extractVideoId`: `["embed","shorts","v"]`),
  `src/hooks/useClipper.ts` (`videoUrlProblem`).

### B2-4  Ctrl+Shift+T brings the tab back without the work, after promising it would
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Open two tabs, load a video in each, mark a segment in tab 2.
  2. Close tab 2. The app asks: *"This tab has 1 marked segment that have not been cut.
     Close it anyway? **Ctrl+Shift+T brings it back.**"* Confirm.
  3. Press Ctrl+Shift+T.
- **Expected**: what the dialog says — the tab comes back with its marked segment.
- **Actual**: the tab returns in the right position with the right video (Memory BBB),
  but with **no segments**: the pane reads `rows: [], total 00:10:00`, and the workspace
  record for that tab is rewritten as `{id, name, url}` with the `segments` key gone —
  the saved copy of the work is destroyed as well. The record held
  `"segments":[{"start":120,"end":150}]` immediately before the close.
- **Proof**: `out-09-tabmemory-live.txt` — `persisted after close` still has the
  segment, `the reopened tab's pane: {"rows":[] ...}`, `persisted after reopen` has no
  `segments`. `out/b09-LIVE/02-after-reopen.png`.
- **Suspected file**: `src/components/MarkBar.tsx` (`useEffect(() =>
  store.syncVideo(videoId ?? null), [videoId])` runs on mount with `videoId` still
  `null`, which clears the segments `TabBridge.restore` has just put back), with
  `src/context/WorkspaceContext.tsx` (`TabBridge`, whose report effect then writes the
  now-empty list over the saved one).

### B2-5  A relaunch restores each tab's video and silently discards every tab's unsaved marks — and overwrites them on disk
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Open two tabs, load a video in each, mark segments in both. The record on disk now
     holds `url` **and** `segments` per tab (verified).
  2. Quit and relaunch.
- **Expected**: what T4's fix says it does — "TabBridge restores them on mount (sets the
  url, restores segments with their video id so `syncVideo` does not wipe them)".
- **Actual**: both tabs come back pointing at the right videos — and **empty**. Seeded
  with `tab1.segments = [{10,20},{60,90}]`, after the relaunch every pane reads
  `rows: []`, and `clipper.workspaces` is immediately rewritten with **no `segments` key
  on either tab**, so the saved marks are gone from disk too. The second run of this
  check used a per-URL stub so each tab really did get its own metadata; the restore
  still loses the work.
- **Proof**: `out-09-tabmemory-live.txt` — `persisted before quitting` carries
  `"segments":[{"start":10,"end":20},{"start":60,"end":90}]`; after the relaunch
  `every pane after relaunch: [...rows:[]...]` and `persisted after relaunch` has only
  `id/name/url`. `out/b09-LIVE-relaunch/01-relaunched.png`.
- **Suspected file**: same as B2-4 — `src/components/MarkBar.tsx`'s mount-time
  `syncVideo(null)` beats `TabBridge`'s restore, then `TabBridge`'s report effect
  persists the empty list.
- **On the severity**: this does destroy saved state, which the rubric lists under
  blocker. It is filed as major because what is lost is unsaved marks rather than a
  finished clip, nothing on disk outside the workspace record is touched, and run 1
  rated the same loss (B-8) major. Re-rate it upward if "loses data" is read literally.

### B2-6  A collision-renamed clip is listed under the name of the file it did not overwrite
- **Severity**: minor
- **Status**: confirmed
- **Steps**: cut `00:00:01–00:00:04`, wait for "Clip saved", mark and cut the same range
  again, then read the saved-files list.
- **Expected**: the second row names the file that was actually written.
- **Actual**: the files are `Recheck [00-00-01-00-00-04].mp4` and
  `Recheck [00-00-01-00-00-04] 2.mp4` (B-11's fix — no overwrite), but **both rows carry
  the label `Recheck [00-00-01-00-00-04].mp4`** while their stored paths differ
  (`... 2.mp4` for the newer one). The history claims two files with one name. Reveal
  and drag-out follow the path, so they still open the right file; it is the list that
  lies.
- **Proof**: `out-13-recheck-live.txt`, section 4 (the two rows and
  `path on disk? true -> Recheck [00-00-01-00-00-04] 2.mp4`).
- **Suspected file**: `src/hooks/useClipper.ts` — `buildClipFilename` is used for the
  record's `label` while the server returns the de-duplicated name in `path`.

### B2-7  Loading a link that resolves to the video already open leaves the URL bar stuck open and the title gone
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Load `https://www.youtube.com/watch?v=mmmmmmmmmmm`. The bar collapses to the chip
     `Stream M 00:00:30 Change`.
  2. Click **Change** and paste `https://youtu.be/mmmmmmmmmmm` — the same video — or the
     identical link again. Press Enter.
- **Expected**: the chip comes back, as it does for any other successful load.
- **Actual**: the URL input stays open for good; there is no source chip, so the header
  no longer shows the title or the duration. The video *is* loaded (the mark fields are
  enabled, the transcript is there). Loading a **different** video brings the chip back.
  `SourceChip` collapses on `useEffect(..., [info?.id])`, and the id did not change.
- **Proof**: `out-14-urlchip-live.txt` (section B),
  `out/b14-LIVE/01-same-id-url-bar-stuck.png`, `02-different-video-chip-back.png`.
  Also visible in `out-04-urls-live.txt` for `[shorts]`, `[youtu.be]` and `[10k chars]`.
- **Suspected file**: `src/components/shell/AppHeader.tsx` (`SourceChip`: `showInput =
  !info || changing || loadingInfo`, and `setChanging(false)` only on `[info?.id]`).
- **Note**: pre-existing, not a regression — the same code is in `26ea7ab`. Run 1 missed it.

### B2-8  The close-with-work confirmation does not agree with itself
- **Severity**: polish
- **Status**: confirmed
- **Actual**: *"This tab has 1 marked segment that **have** not been cut."* (should be
  "has"). The sentence is built with a singular/plural noun but a fixed verb.
- **Proof**: `out-09-tabmemory-live.txt` — `dialogs so far: [{"type":"confirm",...}]`.
- **Suspected file**: `src/context/WorkspaceContext.tsx` (`closeTab`).

### B2-9  The blocking "Use it anyway" sits below the fold while Cut is disabled with no hint that anything is below
- **Severity**: minor
- **Status**: confirmed
- **Steps**: at 1100x760 with a campaign that has a used range, build five segments, the
  last of which overlaps the used range.
- **Expected**: the control that unblocks Cut is reachable.
- **Actual**: `#ui-cut` is `disabled` (title "Resolve the overlap warning first") and
  hit-tests `OK`, so the user can see the thing they cannot press — while
  `#ui-overlap-warning`'s **Use it anyway** is `OFFSCREEN` below the sticky row, in a
  scroller with no visible scrollbar. Scrolling reaches it (Playwright's auto-scrolling
  click succeeds), so it is survivable.
- **Proof**: `out-05-layout-live.txt` (the overlap block: `hits: {... "cut":"OK",
  "overlapBtn":"OFFSCREEN"}`, `cutDisabled: true`),
  `out/b05-LIVE/06-overlap-warning-with-sticky-row.png`.
- **Suspected file**: `src/components/MarkBar.tsx` (the warning is above the sticky row
  in document order, so it scrolls away while the row stays).

---

## Run-1 findings that were not fixed, re-driven against this tree

These were confirmed again in the running app; none of them is a regression, and none
had a fix thread assigned. They are filed with fresh IDs so run 2 can track them.

### B2-10  A sub-second, lettered or negative mark still becomes the whole video
- **Severity**: major
- **Status**: confirmed
- **Actual**, on a 30-minute video: `10.5` / `20.25` → Length **00:30:00**,
  `aria-invalid=false` on both fields, Add enabled, and it produces one row
  `00:00:00 to 00:30:00 · 30:00`. `abc` / `def` → the same, with `aria-invalid=true` on
  both fields and Add **still enabled**. `-5` → the segment silently starts at
  `00:00:00`. An empty In with a valid Out also adds a segment starting at 0.
  Improved since run 1: out-before-in, zero-length and an out past the end now disable
  Add.
- **Proof**: `out-13-recheck-live.txt` section 1, `out/b13-LIVE/01-bad-marks.png`.
- **Suspected file**: `src/hooks/useClipper.ts` + `src/lib/clip.ts` `parseTimestamp`
  (`/^\d+$/`) disagreeing with `src/lib/segments.ts` `parseTimecode`; the looser one
  gates the button. (Run 1's B-4.)

### B2-11  With 25 tabs the strip still never scrolls to the active tab, the + button is still off screen, and all 25 tabs are still fully mounted
- **Severity**: major
- **Status**: confirmed
- **Actual**: seeded with 25 tabs and `activeId` on the last one,
  `{"activeInView":false,"scrollLeft":0,"scrollWidth":2592,"clientWidth":1421,
  "newTabButtonInView":false}`, and every id exists 25 times
  (`ui-mark-in`, `ui-cut`, `ui-cut-row`, `ui-stitched-total`, `ui-col-centre`,
  `ui-source-chip`). Unchanged from run 1's B-9 and B-18. The per-tab store means 25
  live stores as well as 25 transcript columns.
- **Proof**: `out-11-regressions-live.txt` section 1, `out/b11-LIVE-25tabs/01-25-tabs.png`.
- **Suspected file**: `src/components/WorkspaceTabs.tsx`, `src/App.tsx` (`tabs.map`).

### B2-12  At the app's own minimum window the primary action is still off screen
- **Severity**: minor
- **Status**: confirmed
- **Actual**: at 900x600 the columns wrap, `.cut-row` computes to `position: static`
  (the sticky rule is inside the 960px container query, deliberately — stuck there it
  would cover In and Add), and `#ui-cut` is `OFFSCREEN` at y≈654 with **no** segments,
  staying off screen as segments are added. Reachable by scrolling. T3 documented this
  honestly; it is logged here so it is not lost.
- **Proof**: `out-05-layout-live.txt`, the 900x600 block.

### B2-13  Still open, unchanged — re-confirmed in this tree

| run-1 id | what | severity | evidence in this run |
|---|---|---|---|
| B-13 | the advertised **I** / **O** keys do nothing while the player is unavailable; the hints (`In I`, `Out O`) stay, and Set start / Play are absent | minor | `out-13-recheck-live.txt` §2: `before I/O: in=00:00:10 out=00:00:10` → `after: in=00:00:10 out=00:00:10` |
| B-14 | an unreachable player is reported as "The owner blocks playback here" | minor | same line: `previewMessage: "The owner blocks playback here"` in a container where the failure is a refused network request |
| B-15 | Alt+↑ moves a segment one place and drops focus to `BODY`, so the second press does nothing | minor | `out-13-recheck-live.txt` §3 |
| B-17 | a blank link is still answered with the validator's own `Invalid url` | minor | `out-04-urls-live.txt` `[whitespace]` |
| B-20 | `?t=90s` is still preserved and then ignored | minor | `out-13-recheck-live.txt` §5 |
| B-21 | every section is still downloaded **twice** (`*2.00-7.00, *20.00-28.00, *2.00-7.00, *20.00-28.00`) — area G's `isDegradedDelivery` retry | minor | `out-10-headline-live.txt`, `out-08-midcut-live.txt` |
| B-12 | the file is still named for a range it does not contain (`Headline [00-00-02-00-00-28].mp4` is 13.01s of two ranges) and the history row still says only "Downloaded at 360p." | minor | `out-10-headline-live.txt` |
| B-8 (part) | still **no visible** reopen control anywhere — no "reopen", "recently closed" or "undo close" text, no such button title; Ctrl+Shift+T is the only way, and it is only discoverable from the close dialog | minor | `out-09-tabmemory-live.txt` (`reopen: false, recentlyClosed: false, undoClose: false, title: []`) |

---

## What was driven, and what it did

| Function | Driven | Result |
|---|---|---|
| URL handling | 15 shapes + a clean isolation run: channel/@handle//c///channel/, playlist, watch+list, Shorts, youtu.be, `/live/`, `/embed/`, `results?search_query=`, bare word, whitespace, non-YouTube, `?t=`+tracking, 10k chars | B-5 held; **B2-3** (`/live/` refused), **B2-7** (chip stuck), B-17 and B-20 still open |
| Tabs: open, switch, close, reopen, many, relaunch | 1, 2, 3, 8 and 25 tabs; 24 switches at 60 ms; close with work; close the active tab mid-cut; Ctrl+Shift+T; relaunch from the app's own record | isolation **holds** everywhere; **B2-4**, **B2-5**, **B2-11** |
| Transcript load, search, windowing | 12 and 6,000 cues; search to empty, clear, Escape, Enter/Shift+Enter past the end, char-by-char in and out | **B-1 held**; 6,000 lines still window to 40 drawn |
| Marking in / out | 7 bad-time cases, typed marks, shift-click range select, ⌘⇧↵ | shift-click selects `00:00:04–00:00:20`; ⌘⇧↵ adds; **B2-10** |
| Several segments → one file | 2, 3 and 5 segments, reordered, and mid-cut mutation attempts | one file, 13.01s, **frame-perfect**; B-7 held |
| Preview and scrub | hit tests at five viewports with 0–5 segments, with and without the help drawer | B-3 held; **B2-1**, **B2-2**, **B2-9**, **B2-12** |
| Download, progress, cancel | Cancel mid-cut, the cancel route directly, an unknown job, no jobId, SIGKILL mid-cut, two tabs cutting at once, a 403 fallback | **B-6 held**, 499 confirmed, 0 orphans; B-21 still open |
| Used ranges / bank | a campaign with a used range; a two-row bank across 2, 3, 7 and 8 tabs; a bank restored at launch | the overlap warning still names the clip and blocks Cut; per-tab plans correct (**C-1** section) |
| State over time | 25 seeded tabs, a seeded campaign + bank, a seeded workspace record, relaunch | **B2-5**, **B2-11** |

## Not provable here

- **Real YouTube** metadata, transcripts and media: the network policy refuses
  `youtube.com`. Every `/api/info`, `/api/transcript` and `/api/download` answer came
  from the scripted stub, so real caption timing, real format ladders and real failure
  strings are unproven. In particular **B2-3** is proven as a client-side refusal (no
  request is made); that a real `/live/` link would otherwise download is not provable
  here.
- **The video preview itself.** `https://www.youtube.com/iframe_api` is unreachable, so
  the player never initialises and every preview reading is the blocked-state branch.
  Play/pause, the playhead poll, looped selection playback and the real embed-blocked
  codes are unexercised — which is also why B-13's I/O keys cannot be judged in the
  normal case.
- **Signed-in / 1080p.** No session exists; every cut ran on a synthetic cookie file.
- **Drag-to-reorder with a real mouse** (HTML5 DnD is not drivable through Playwright's
  synthetic pointer events) — only the keyboard path and the × were exercised.
- **macOS / Windows.** ⌘ versus Ctrl chords, the native confirm dialog and the window
  minimum were exercised on Linux only.
- **The exact React commit order that C-1 depended on.** The crash is reproduced and its
  absence is demonstrated, but that no *other* interleaving can still produce an update
  loop is not something a black-box run can prove.

## Scripts

`lib.cjs` (launcher for any app tree + `crashState`), `stubroot.cjs` (per-URL info,
403-on-sections), `frames.cjs` (frame identification), `b01-c1-negative-control`,
`b02-b2-crosstab-segments`, `b03-b1-transcript-search`, `b04-b5-urls-and-cut`,
`b05-layout-and-sticky`, `b06-sticky-covers-rows`, `b07-b6-cancel`,
`b08-b7-midcut-edits`, `b09-b8-tab-memory`, `b10-headline-and-frames`,
`b11-tab-regressions`, `b12-bank-callsite`, `b13-recheck-and-hunt`,
`b14-url-chip-and-live`.

`audit/run-2/area-B/` also still holds `c1-negative-control.cjs`,
`b2-negative-control.cjs`, `v1-search.cjs`, `v2-layout.cjs` and the output folders
`out/c1-*`, `out/b2-*`, `out/v1-head` from an **earlier attempt at this area that was
stopped part-way**. Its C-1 result was a false pass — the second tab never loaded a
video, so no bank row ever became a planned range and nothing was being controlled for.
Nothing in this report depends on them; ignore or delete them.
