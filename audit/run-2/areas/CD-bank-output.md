# Run 2 — Areas C and D: the clip bank and campaigns; where files land and how they reach the next tool

Scope. **C**: `src/lib/bank.ts`, `src/lib/bankImport.ts`, `src/lib/campaigns.ts`,
`src/context/CampaignContext.tsx`, `src/components/ClipsColumn.tsx`,
`src/components/ImportTimestamps.tsx`, `src/components/CampaignMenu.tsx`.
**D**: `electron/main.cjs` (`clip:save`, `file:save`, `file:saveFiles`,
`export:save`, `file:startDrag`, `dialog:pickDirectory`), `electron/pathSafety.cjs`,
`electron/exportSave.cjs`, `electron/editorOpen.cjs`, `src/lib/fcpxml.ts`,
`src/lib/handoff.ts`, `src/components/EditorHandoff.tsx`,
`src/components/CopyBlocks.tsx`, `src/components/shell/copyBlocksInput.ts`,
`src/hooks/useClipper.ts`, `src/App.tsx`.

**Counts: 1 blocker · 2 major · 10 minor · 3 polish (16 findings, CD2-1 … CD2-16).**
All 16 are `confirmed` in the running app or by driving a product module
unchanged; none is code-reading only.

**Fix verdicts**

| Fix | Verdict |
|---|---|
| C-2 (deleted campaign's bank adopted by a same-named new one) | **HELD** — migration, mixed old/new ids, delete+recreate in both styles, orphans unadoptable |
| C-5 (duplicate campaign names) | **HELD** |
| Campaign isolation (run 1: 24 of 24) | **HELD** — 24 of 24 again, with a slug campaign and an opaque campaign side by side |
| D-2 (a save destroying a same-named file) | **HELD** for `clip:save` and `file:save`; **the one write path it did not reach still overwrites** (CD2-3), and the message names the wrong file (CD2-4) |
| D-6 / D-7 (writes outside the chosen folder) | **HELD** — 36 fresh hostile calls, nothing escaped; one residual, CD2-5 |
| D-3 (Copy blocks dead) | **HELD** — all seven blocks byte-exact against a real transcript |
| D-4 (silent automatic send) | **HELD** |
| D-5 (a later cut shrinking the document) | **HELD** on the document, **REGRESSED into a cross-campaign leak** (CD2-1) |
| D-9 (a sub-frame clip losing the batch) | **HELD** |
| FCPXML: 1.10 DTD validity, `<import-options>`, never `<library>`, fail closed | **HELD** — 31 documents, all DTD-valid |
| D-1 (drag-out) | guard **HELD**; the real drag freeze is **not provable here** — not passed |

**No product code was changed.** `git status` shows only new files under
`audit/run-2/area-CD/` and this file.

---

## How this was run

Everything is the real Electron app (`electron/main.cjs`, the real preload, the
built renderer in `dist/`), launched with a **fresh `--user-data-dir` per
launch** so Electron's single-instance lock cannot hand my work to another
helper's window, and with a **scripted `yt-dlp`** in a stub root that is always
an explicit directory (`make-stub-root.cjs` with no argument overwrites the
repo's own binary). ffmpeg, ffprobe, xmllint and the clipboard are real.

My harness is `audit/run-2/area-CD/cdlib.cjs`, written for this run rather than
inherited from run 1, so the evidence does not carry run 1's stub or its
assumptions. It differs from `audit/harness/app.cjs` in three ways this area
needs:

- the stub answers yt-dlp's `--simulate` auth probe with yt-dlp's own
  `Found YouTube account cookies` marker, writes a **real six-cue WebVTT** when
  the server asks for subtitles, and **cuts the fixture with real ffmpeg** when
  `--download-sections` is passed, so a saved clip is the length that was asked
  for (6.01 s measured by ffprobe, not the whole 30 s fixture);
- the sign-in gate is passed by the product's own cookie path (a synthetic
  Netscape `yt-cookies.txt` in the fresh user-data dir), with the product's own
  "Continue without signing in (360p)" button as the fallback. **Nothing is
  hidden in the DOM**, so every layout and focus measurement is on the real page;
- `fsSnap`/`fsDiff` record inode + size + mtime + sha256, because "Clip saved"
  is a UI fact and never evidence that bytes survived.

Suites were run **one at a time**. Where a matrix was too large to click, or
owner-gated out of reach, the product's own module was **required unchanged**
and driven directly (`electron/exportSave.cjs`, `electron/pathSafety.cjs`,
`src/lib/fcpxml.ts` via `tsx`); no logic was reimplemented. The native directory
dialog cannot be clicked in this container (no window manager, no `xdotool`), so
where a pick was needed `dialog.showOpenDialog` was replaced **inside Electron**
and everything downstream is the product's own code, driven through the
product's own buttons.

| script | what it drives | captured output |
|---|---|---|
| `cdlib.cjs` | the harness (stub, launcher, snapshots) | — |
| `00-smoke.cjs` | proves the harness: gate, real transcript, one real 6 s clip | `out/00-smoke.txt` |
| `c1-identity.cjs` | C-2: migration, old-style recreate, mixed world, orphans | `out/c1-identity.txt` |
| `c2-names-isolation.cjs` | C-5, the 24 isolation assertions, what a delete leaves behind | `out/c2-names-isolation.txt` |
| `d1-overwrite.cjs` | D-2 on `clip:save`, the comments CSV path, `file:saveFiles` | `out/d1-overwrite.txt` |
| `d2-containment.cjs` | D-6/D-7: 36 hostile bridge calls, and the behaviour change | `out/d2-containment.txt` |
| `d3-containment-tail.cjs` | `exportSave.cjs` and `dragTarget` unchanged; the allow-list's width; a folder deleted mid-save | `out/d3-containment-tail.txt` |
| `d4-copyblocks.cjs` | D-3 with a REAL transcript, all seven blocks, clipboard read back | `out/d4-copyblocks.txt` |
| `d5-handoff.cjs` | D-4, D-5, the cross-campaign document, delete mid-cut | `out/d5-handoff.txt` |
| `d6-fcpxml.ts` | D-9 and the hostile FCPXML matrix against Apple's 1.10 DTD | `out/d6-fcpxml.txt`, `out/d6/*.fcpxml` |
| `d7-clipid-and-toast.cjs` | what the app says after a collision; Copy block 7 after a cut | `out/d7-clipid-and-toast.txt` |
| `r1-regressions.cjs` | switch mid-download, the bank at scale, the data folder, the sticky row | `out/r1-regressions.txt` |
| `r2-cross-campaign.cjs` | cutting a banked clip across a switch; the session list across a switch | `out/r2-cross-campaign.txt` |
| `r3-dropped-and-quality.cjs` | a dropped campaign entry; what looking at a campaign writes back | `out/r3-dropped-and-quality.txt` |

`out/` is gitignored like every other area's, so it is read in place; re-run the
script named in a finding to reproduce it.

---

## Findings

### CD2-1  The session batch crosses campaigns: one client's clips are sent into another client's Final Cut library
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. Cold start with two campaigns that share a clips folder — which is what
     the app produces by itself, because a new campaign inherits the previous
     one's folders (run 1's C-13, not fixed). Client A has "After cutting:
     Nothing"; Client B has "After cutting: Send to Final Cut Pro" and a
     library that exists.
  2. With **Client A** active, cut two clips.
  3. Switch to **Client B** in the header popover.
  4. Cut one clip for Client B.
  5. Read the `.fcpxml` the automatic send wrote.
- **Expected**: the document Client B's cut produces contains Client B's clip.
  Nothing of Client A's may reach a document named after, and imported into,
  Client B's library and event.
- **Actual**: `Client B.fcpxml` holds **three** assets —
  `AAA-stub0000001-01`, `AAA-stub0000001-02` (Client A's) and
  `BBB-stub0000001-01` — and three `asset-clip`s in Client B's event. The
  panel's own note had already said "Send all puts every clip from this session
  into one file **(2)**" while Client B was active and before B's first cut:
  the two clips it was offering to send were Client A's.
  Two independent session stores do this. `runAfterCutting` remembers every
  clip it is ever called with in `sessionBatch`, keyed **only by the clips
  folder** (`EditorHandoff.tsx:239-251`), and `resetSessionHandoff()` exists but
  **no product code calls it** (only its own test does). `App.tsx`'s
  `sessionClips` state, which feeds the panel's Export / Send all / Copy file
  path, is likewise never cleared when the campaign changes.
  This is a regression introduced by the D-5 fix: before it, each cut sent
  `clips: [clip]`, so a Client B cut produced a Client B-only document (the
  defect was the opposite one — the document was shrunk). The fix made the
  document complete and made it span clients.
  Nothing on screen says whose clips are in the file; the status line reads
  "Opening Final Cut Pro from here is macOS only. The file is saved at …".
- **Proof**: `audit/run-2/area-CD/out/d5-handoff.txt`, PART C:
  `VERDICT: Client B's document holds Client A's clips: YES — AAA-stub0000001-01, AAA-stub0000001-02`,
  with the document summary `{"assets":"3", … "clipIds":["AAA-stub0000001-01","AAA-stub0000001-02","BBB-stub0000001-01", …]}`;
  the document itself is kept at `audit/run-2/area-CD/out/d5-C-cross/C-Client B.fcpxml`;
  screenshot `audit/run-2/area-CD/out/d5-C-cross/*-C-cross-campaign.png`;
  script `audit/run-2/area-CD/d5-handoff.cjs` (PART C).
- **Suspected file**: `src/components/EditorHandoff.tsx:236-251` (`sessionBatch`
  keyed by `ctx.clipsDir`, `rememberClips`), `:254` (`resetSessionHandoff`,
  uncalled); `src/App.tsx:252` (`sessionClips`, never reset on a campaign change)

---

### CD2-3  The one write path the D-2 fix did not reach still destroys a file of that name, and says `ok`
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with a clips folder that already holds
     `an-export-folder/videos.csv` — the shape an export run leaves behind.
  2. From the renderer, through the product's own bridge:
     `window.electronAPI.saveFiles({ dirPath: <clips>, folder: "an-export-folder",
     files: [{ name: "videos.csv", contents: "…" }] })` — the same call
     `useChannelExport.ts:169` makes, with the folder name the exporter itself
     builds (`buildExportFolderName` appends `-export-YYYY-MM-DD`, so a second
     run on the same day lands in the same folder with the same file names).
- **Expected**: the same rule the rest of the save handlers now follow — add
  " 2" rather than replace. `clip:save` and `file:save` both do.
- **Actual**: `{"ok":true,"path":"<clips>/an-export-folder"}` and the earlier
  CSV is gone: same inode (`1189065` before and after), 42 bytes of
  "the export I did yesterday and still need" replaced by 27 bytes of the new
  run, sha `90443e463487` → `29eee89b9fda`. `file:saveFiles` writes each file
  with a plain `fsp.writeFile` (`electron/main.cjs:573-575`) and
  `electron/exportSave.cjs:82` moves each file with `fsp.rename`; neither goes
  through `writeWithoutOverwrite`. T2's own report records this as "not
  changed, noticed"; it is the one half of D-2 that is still open.
  Severity is minor rather than blocker because an export is derived data that
  can be produced again, unlike a cut clip.
- **Proof**: `audit/run-2/area-CD/out/d1-overwrite.txt`, section 4
  (`VERDICT yesterday's CSV survived: NO — overwritten`);
  `audit/run-2/area-CD/out/d3-containment-tail.txt`, PART A
  (`SAME folder again (second run of the day) -> {"ok":true,...}`, then
  `content at the same CSV name after the second run: a,b / 3,4`);
  scripts `d1-overwrite.cjs` (section 4), `d3-containment-tail.cjs` (PART A)
- **Suspected file**: `electron/main.cjs:567-576` (`file:saveFiles`);
  `electron/exportSave.cjs:78-88`

---

### CD2-4  After a collision the app names the file it did not write
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Put a file called `ACM-stub0000001-01.mp4` — the name this campaign's next
     clip gets — in the clips folder.
  2. Cold start, load the video, mark 00:00:02 to 00:00:08, Add segment, Cut.
  3. Read the toast, the Downloads row and the clips folder.
- **Expected**: the message names the file that now exists, because that is the
  file the user has to find, hand over or drag.
- **Actual**: the file written is `ACM-stub0000001-01 2.mp4` (D-2's fix working
  — the original's inode, size and sha256 are untouched), but the toast says
  "Clip saved / **ACM-stub0000001-01.mp4** / Downloaded at 360p." and the
  Downloads row is labelled `ACM-stub0000001-01.mp4` while its `path` points at
  the " 2" file. "Open folder" opens the right folder, and the drag grip uses
  the path, so nothing is broken — the user is simply told the wrong name, and
  the Downloads list now disagrees with the disk. `useClipper.ts:770-786` sets
  `label: filename` (what was asked for) instead of
  `path.basename(result.path)` (what was written).
  It also feeds the id search: `nextClipId` is given the Downloads labels, so
  the next clip is numbered from a name that is not on disk.
- **Proof**: `audit/run-2/area-CD/out/d1-overwrite.txt`, section 2
  (`' 2' file exists: true 264478 bytes, 6.010998s` /
  `the toast names the file that was actually written: false`);
  `audit/run-2/area-CD/out/d7-clipid-and-toast.txt`;
  screenshot `audit/run-2/area-CD/out/d1-clip-collision/*-clip-collision.png`
- **Suspected file**: `src/hooks/useClipper.ts:770-790` (`setSavedNotice`,
  `addDownload`)

---

### CD2-5  The containment check is only as narrow as `clipper.saveDirs`, which keeps every folder ever picked
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with `clipper.saveDirs` holding the clips folder **and its
     parent** — the state D-25 produces by itself, since `setSaveDir` appends
     every folder the user picks and nothing ever prunes the list.
  2. From the renderer: `saveFile({ dirPath: "<parent>/home-canary",
     filename: ".bashrc", data: "PWNED" })`.
  3. Repeat with `clipper.saveDirs` holding the user's home directory, which is
     a folder a person can and does choose in a folder picker, and
     `dirPath: os.homedir()`.
- **Expected**: a write is contained to the folder the user chose for clips or
  data, not to anything beneath a folder they once visited.
- **Actual**: both are accepted. With the parent remembered, the canary write
  returns `{"ok":true,"path":"…/home-canary/.bashrc 2"}` — the existing
  `.bashrc` survives only because of D-2's no-overwrite rule (same inode, still
  `original`), and a file that does **not** yet exist is simply created. With
  the home directory remembered, `saveFile` created `/root/audit-run2-canary.txt`
  outright. `allowedRoots` (`electron/pathSafety.cjs:44-54`) takes
  `clipper.saveDir`, `clipper.clipsDir`, `clipper.dataDir` and every entry of
  `clipper.saveDirs`, and `resolveTarget` only asks that the target be inside
  one of them.
  D-6 and D-7 themselves are closed (CD2-5 is not a reopening of them: 36
  hostile calls in `d2-containment.cjs` escaped nothing). What is left is that
  the fence follows a list that grows with junk and is never pruned, so one
  ordinary pick of a parent or home folder re-opens arbitrary file creation to
  renderer code for ever.
- **Proof**: `audit/run-2/area-CD/out/d3-containment-tail.txt`, PART C
  (`canary write while the parent folder sits in saveDirs: {"ok":true,"path":"…/.bashrc 2"}`,
  `with the home directory remembered, a write straight into $HOME: {"ok":true,"path":"/root/audit-run2-canary.txt"}`);
  script `d3-containment-tail.cjs` (PART C; the canary file it created was removed again)
- **Suspected file**: `electron/pathSafety.cjs:44-54` (`allowedRoots`);
  `src/hooks/useClipper.ts:198-215` (`setSaveDir` appends unconditionally)

---

### CD2-6  Deleting a campaign leaves the client's library and drop-folder paths on disk for ever
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with campaign **Acme Q4** whose handoff settings name a
     library (`/Volumes/Clients/Acme Confidential.fcpbundle`) and a CapCut drop
     folder (`/Volumes/Clients/Acme drop`), plus a banked row.
  2. Campaign popover → Remove on Acme Q4 → Confirm.
  3. Read `settings.json`.
- **Expected**: the same disposal the bank now gets. C-2's fix was about a
  deleted client's data not being retained; the handoff record is the same kind
  of data and names the client in a path.
- **Actual**: `clipper.bank` is correctly emptied of the campaign, but
  `clipper.editorHandoff` still holds the whole `acme` entry verbatim,
  including both paths, and nothing in the UI can reach or clear it. The
  Remove button's own confirm tooltip still says it "Removes the campaign and
  its used-ranges record. Cut clips stay in their folder." — it does not
  mention the bank (which it now does remove) or the handoff record (which it
  does not). `clipper.saveDirNames` keeps the nickname "Acme deliverables" and
  `clipper.saveDirs` keeps the folder too.
- **Proof**: `audit/run-2/area-CD/out/c2-names-isolation.txt`, PART C
  (`bank keys left: []`, `editorHandoff keys left: ["acme"]`,
  `the deleted client's handoff record: {…"fcpLibrary":"/Volumes/Clients/Acme Confidential.fcpbundle"…}`,
  and the tooltip text); script `c2-names-isolation.cjs` (PART C)
- **Suspected file**: `src/context/CampaignContext.tsx:186-193` (`remove`);
  `src/App.tsx:64-83` (`useEditorSettings`, no delete path);
  `src/components/CampaignMenu.tsx:283` (the tooltip)

---

### CD2-7  Banks orphaned before the fix can never be removed, and they double the settings file
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with `clipper.bank` holding keys for campaigns that no longer
     exist — what every user who deleted a campaign before this fix now has
     (T5 deliberately did not prune them).
  2. Create a campaign with exactly the dead campaign's name and open its Bank
     tab.
  3. Look for any control that can clear a bank.
  4. Boot again with 40 orphaned campaigns of 50 rows each beside a live
     2,000-row bank, and measure against a control with neither.
- **Expected**: either the orphans are prunable, or carrying them costs
  nothing. T5's note says pruning at load could wipe a real bank, which is a
  fair call; the question is what the residue costs.
- **Actual**: the choice is **safe for adoption and for speed, but permanent**.
  A new campaign named "Acme Q4" gets an opaque id and an empty bank (`0 clips`),
  so nothing can be adopted. Carrying 40 orphans costs nothing measurable: one
  keystroke in the bank search took 183 ms with them and 162 ms without (both
  dominated by the 2,000 live rows — 49 ms with 20 rows, run 1's C-6, not
  fixed), and boot was 1256 ms with them against 1486 ms without. What they do
  cost is disk and retention: `settings.json` went from 560,197 to 1,116,687
  bytes, and a scan of every button on screen for `clear|prune|forget|clean|storage`
  returns only the word "Bank" (the tab). A deleted client's banked list from
  before the fix stays on the machine for ever with no route to remove it.
- **Proof**: `audit/run-2/area-CD/out/c1-identity.txt`, PART D
  (`VERDICT orphan adoption: cannot be adopted (PASS)`,
  `buttons anywhere that mention clearing a bank: ["Bank"]`,
  `orphans still on disk: 42 keys`);
  `audit/run-2/area-CD/out/r1-regressions.txt`, PART B (the three measured rows)
- **Suspected file**: `src/lib/bank.ts:93-98` (`removeCampaignBank` exists but
  only the live delete path calls it); no UI surface owns stored-data cleanup

---

### CD2-8  A folder lost mid-save still answers with a raw Node stack, now pointing inside the new save helper
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with a clips folder; set the stub to stall so the download is
     genuinely in flight.
  2. Mark 00:00:02 to 00:00:08, Add segment, Cut.
  3. Delete the clips folder while it runs (an unplugged drive, a sync client
     moving a folder).
- **Expected**: a plain sentence naming the folder and one next step, e.g.
  "The clips folder is no longer there. Choose a folder and cut again." The cut
  media is still in the temp directory, so the message could also say the work
  is not lost. This is run 1's D-10, which was never on a fix list; it is
  recorded again because the D-2 fix changed what the user sees.
- **Actual**, verbatim in a `role="alert"`:
  ```
  Error: ENOENT: no such file or directory, copyfile '/tmp/ytclip-…/clip.mp4' ->
  '…/Clips/ACM-stub0000001-01.mp4' | at async Object.copyFile (node:internal/fs/promises:623:10)
  | at async ~/stream-trimmer/electron/pathSafety.cjs:131:7
  | at async createWithoutOverwrite (~/stream-trimmer/electron/pathSafety.cjs:109:7)
  ```
  Still a raw errno and stack, and the stack now names two frames inside
  `electron/pathSafety.cjs` — the audit fix's own helper — where run 1 saw
  `rename` at `main.cjs:486`. No next step, no folder recreated, and the temp
  folder is left behind (one `ytclip-` directory remained) with no way in the
  UI to recover the cut media. Containment did **not** misfire: the message is
  ENOENT, not "Unexpected save location", so a folder that disappears is not
  mistaken for an attack.
- **Proof**: `audit/run-2/area-CD/out/d3-containment-tail.txt`, PART D
  (the full alert text, `raw errno/stack shown: YES`,
  `Unexpected save location shown: no`, `ytclip- temp folders left behind: 1`);
  screenshot `audit/run-2/area-CD/out/d3-vanish/*-folder-vanished.png`
- **Suspected file**: `electron/main.cjs:513-517` (`clip:save` returns
  `logger.describe(err)`), with `electron/pathSafety.cjs:105-136`

---

### CD2-9  "Export comments" cannot be reached: the function, the CSV path and the overlay all exist, and nothing calls them
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with a campaign and a clips folder; load the video.
  2. Look for any control that exports comments. The server route
     (`POST /api/comments`), the CSV builder (`commentsToCsv`), the save path
     (`file:save` with `<title>-comments.csv`), the Downloads entry kind
     `comments`, the saved-notice branch and a full-screen
     "Exporting comments" overlay all exist.
- **Expected**: a control, since every other piece of the feature is wired.
- **Actual**: there is none. A scan of every button on screen for `comment`
  returns `[]`, and `exportComments` — exposed on the clipper context like
  everything else — has **no caller anywhere in `src/`**
  (`grep -rn exportComments src` matches only its definition in
  `useClipper.ts:284` and its export at `:941`). `exportingComments` is read by
  `App.tsx:258` to show an overlay that can therefore never appear. This is the
  same shape of defect as D-3 (a built panel with nothing feeding it), in a
  feature run 1 did not look for.
  Consequence for this run: the comments CSV is one of the two paths the brief
  asked to re-check for D-2, and it can only be exercised over the bridge,
  which is how CD2-5's `file:save` checks were done — there `file:save` does add
  " 2" and does not destroy the earlier file.
- **Proof**: `audit/run-2/area-CD/out/d1-overwrite.txt`, section 3
  (`comment buttons on screen: []`, the planted CSV untouched because nothing
  ran); `audit/run-2/area-CD/out/d2-containment.txt`, B2 (`file:save` over an
  existing name gives `mine 2.txt` and leaves `mine.txt` byte-identical)
- **Suspected file**: `src/hooks/useClipper.ts:284-366`, `src/App.tsx:258`

---

### CD2-10  The Copy blocks panel covers the Cut button and swallows the click
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start at 1440x900, load a video, mark two segments.
  2. Open **Copy blocks** in the header.
  3. Try to click **Cut as one file**.
- **Expected**: the screen's one primary action is not underneath a panel, or
  the panel is narrow enough to leave it clear. `CLAUDE.md`: "The test any
  change has to pass is whether it gets more clips out of one long video per
  hour."
- **Actual**: the panel is `position: fixed`, 560 px wide, and lands on top of
  the Cut button. `document.elementFromPoint` at the centre of `#ui-cut`
  (rect 674,673 139x36) returns an `LI` inside
  `[role="dialog"][aria-label="Copy blocks"]`, and Playwright's click is
  refused for 30 s with "subtree intercepts pointer events". For a person the
  first click lands on the panel's own outside-mousedown handler, which closes
  it, so Cut needs two clicks whenever the panel is open. Nothing is lost and
  Escape or the close button clears it, so this is minor.
  (T10 made the Cut row sticky at `z-10` inside the centre column; the panel is
  `z-20`, so the sticky row is below it.)
- **Proof**: `audit/run-2/area-CD/out/d4-copyblocks.txt`
  (`does the open panel cover the Cut button? {"cutRect":[674,673,139,36],
  "topElement":"LI","coveredByCopyBlocks":true}`); the first run's Playwright
  refusal is in `audit/run-2/area-CD/out/d4-copyblocks/` logs
- **Suspected file**: `src/components/CopyBlocks.tsx:79-86`;
  `src/components/useDrawerClearance.ts`

---

### CD2-11  Raw Node errno text reaches the UI from the save handlers for a name the filesystem will not take
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with a clips folder.
  2. `saveFile({ dirPath: <clips>, filename: "L".repeat(300) + ".txt", data: "x" })`
     and `saveFiles({ dirPath: <clips>, folder: "L".repeat(300), … })`, and
     `saveFile({ …, filename: "nul\u0000byte.txt" })`.
- **Expected**: one plain sentence — the module's own header promises "Every
  failure returns { ok:false, error } in plain words" for the editor handlers,
  and the save handlers are the same surface.
- **Actual**: the errno, the syscall and the whole 300-character path come back
  to the renderer and into the alert:
  `ENAMETOOLONG: name too long, open '/…/LLLL…L.txt'`,
  `ENAMETOOLONG: name too long, mkdir '/…/LLLL…'`, and for the NUL byte
  `The argument 'path' must be a string, Uint8Array, or URL without null bytes.
  Received '/…/nul\x00byte.txt…'`. Reachable without the bridge: the clip
  filename comes from the campaign's clip-id pattern and prefix, both free
  text, so a long prefix produces the same message from a Cut.
- **Proof**: `audit/run-2/area-CD/out/d2-containment.txt` (the three rows
  `file:save 300-char filename inside chosen`, `saveFiles 300-char folder`,
  `file:save NUL in filename`)
- **Suspected file**: `electron/main.cjs:541-545`, `:578-582`

---

### CD2-12  `file:saveFiles` turns a traversal attempt into a real folder called `.._..`
- **Severity**: polish
- **Status**: confirmed
- **Steps**: `saveFiles({ dirPath: <clips>, folder: "../..", files: [...] })`,
  then `folder: "../outside"`, then a file name of `../../../esc4.csv`.
- **Expected**: refused, the way the bare `..` now is.
- **Actual**: all three are contained but materialise as directories and files
  with the separators turned into underscores — `chosen/.._../esc2.csv`,
  `chosen/.._outside/esc3.csv`, `chosen/ok/.._.._.._esc4.csv` — and each
  answers `{"ok":true}`. A folder name containing a newline is likewise
  created (`chosen/two\nlines/`). Containment is intact; the result is litter
  in the user's delivery folder with a success message.
- **Proof**: `audit/run-2/area-CD/out/d2-containment.txt`
  (`paths created anywhere in the sandbox:` …, `CREATED OUTSIDE the chosen and
  data folders: none`)
- **Suspected file**: `electron/pathSafety.cjs:66` (the `[\\/]` → `_` rule)

---

### CD2-13  A campaign entry the loader cannot read is written out of existence by the next unrelated campaign edit
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with three stored campaigns, one of which has no `id` and one
     of which repeats an id already used — the shapes `normalizeCampaigns`
     drops (run 1 confirmed a malformed list loads without crashing, which it
     does).
  2. Note that the popover offers only the valid ones, and that all three rows
     are still in `settings.json`.
  3. Rename an unrelated campaign — any campaign create, edit, delete or
     switch does the same, because they all go through `commit`.
  4. Read `settings.json` again.
- **Expected**: an entry the app cannot read is left alone, or the user is told
  it was dropped. It still holds a name, both folders and a used-ranges record.
- **Actual**: `commit` writes the **normalised** list back
  (`CampaignContext.tsx:131-141`), so the two unreadable entries disappear from
  disk permanently, taking their folders and used ranges with them, with no
  message. Their banks stay in `clipper.bank` under keys nothing can reach any
  more — the one route that still creates a fresh orphan after T5's fix.
- **Proof**: `audit/run-2/area-CD/out/r3-dropped-and-quality.txt`, PART A;
  `audit/run-2/area-CD/out/c2-names-isolation.txt`, C2 (the same seed, before
  any edit: `campaigns written back to disk` still holds all three)
- **Suspected file**: `src/context/CampaignContext.tsx:112-141`;
  `src/lib/campaigns.ts:311-350` (`normalizeCampaigns`)

---

### CD2-14  When every clip in a send is unusable, only the first reason is reported
- **Severity**: minor
- **Status**: confirmed
- **Steps**: run `buildSessionFcpxml` (the product module, unchanged) with two
  clips, one shorter than a timeline frame and one whose file cannot be probed,
  with "create a project" on.
- **Expected**: both are named, the way they are when one good clip survives
  (`skipped` then lists each with its reason, and D-9's fix makes that work).
- **Actual**: it throws with `M-SUBFRAME: the file is shorter than one timeline
  frame` and never mentions `M-BROKEN`, because the empty-`ready` branch uses
  `skipped[0]?.reason` (`fcpxml.ts:846-849`). The user sees one clip named and
  has to guess at the rest. With at least one good clip the behaviour is
  correct, which is what D-9 was about, so this is the remaining edge.
- **Proof**: `audit/run-2/area-CD/out/d6-fcpxml.txt`, case F
  (`{"ok":false,"threw":"M-SUBFRAME: the file is shorter than one timeline frame"}`)
- **Suspected file**: `src/lib/fcpxml.ts:845-849`

---

### CD2-15  Looking at a campaign rewrites what it had stored
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. Cold start with three campaigns: an MP4 one at quality `best`, an **MP3**
     one at quality `best`, and an MP4 one at `1080`.
  2. Switch to the MP3 campaign and nothing else. Switch back.
  3. Separately: open **New campaign**, set Format to MP3, create it, and read
     what was stored.
- **Expected**: switching campaign to check you are in the right one does not
  change the campaign.
- **Actual**: the MP3 campaign's stored `quality` changes from `best` to `320`
  the moment it becomes active, and the new value is persisted. The quality
  select has no `best` option while the format is MP3, so an effect
  (`useClipper.ts:400-402`) snaps the value to the first allowed one and the
  write-back effect in `App.tsx:285-295` saves it onto the campaign. The New
  campaign form has **no Quality field** at all (its labels are Name, Target
  length, Hard max, Clip id pattern, Prefix, Format, Clips folder, Data
  folder), so `create` stores whatever quality the clipper happens to be on —
  an MP3 campaign created while the clipper is on MP4 is stored with a video
  quality until the first visit corrects it. Nothing is lost and the corrected
  value is the sensible one, hence polish; it is listed because "switch
  campaign mid-task" is a function of this area and this is a silent write
  during it.
- **Proof**: `audit/run-2/area-CD/out/r3-dropped-and-quality.txt`, PART B;
  `audit/run-2/area-CD/out/c1-identity.txt`, PART A (the same effect caught by
  accident: the seeded `"quality":"best"` of the MP3 campaign reads back
  `"320"` after it was merely opened)
- **Suspected file**: `src/hooks/useClipper.ts:398-403`; `src/App.tsx:285-295`;
  `src/components/CampaignMenu.tsx` (no quality field)

---

### CD2-16  The footer reads "Data data" on a fresh install, and the campaign's own data folder stays empty
- **Severity**: polish
- **Status**: confirmed
- **Steps**: fresh install, create a campaign, click the footer's **Clips** chip
  and choose a folder.
- **Expected**: a suggested folder with a name that reads as a name.
- **Actual**: the suggested sibling is now called `data` (it was `channel-data`;
  `DATA_FOLDER_NAME` is gated on the build so the exporter's name cannot leak
  into a public bundle, which is right), and the footer renders
  "Fresh Client uses MP4 Best Clips My Clips **Data data** 0 saved 0 ranges
  used". The folder does not exist on disk and `clipper.dataDirConfirmed` is
  already `true`, so neither confirm UI appears (run 1's D-21, not fixed).
  Separately, `clipper.dataDir` is set while the **campaign's own** `dataDir`
  stays `""`, so the two records disagree until the user picks a data folder.
- **Proof**: `audit/run-2/area-CD/out/r1-regressions.txt`, PART C
  (`dataDir: …/C/data`, `dataDirConfirmed: true`,
  `does the suggested data folder exist on disk? false`,
  `campaign record: [["Fresh Client","…/My Clips",""]]`, and the footer text);
  screenshot `audit/run-2/area-CD/out/r1-C-datafolder/*-C-data-folder.png`
- **Suspected file**: `src/lib/campaigns.ts:99-109`;
  `src/components/shell/AppFooter.tsx`;
  `src/context/CampaignContext.tsx:209-221` (`setClipsDir` does not set the
  campaign's `dataDir`)

---
