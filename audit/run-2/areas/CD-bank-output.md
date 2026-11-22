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

**Counts: 1 blocker · 2 major · 11 minor · 3 polish (17 findings, CD2-1 … CD2-17).**
All 17 are `confirmed` in the running app or by driving a product module
unchanged; none is code-reading only.

**Fix verdicts**

| Fix | Verdict |
|---|---|
| C-2 (deleted campaign's bank adopted by a same-named new one) | **HELD** — migration, mixed old/new ids, delete+recreate in both styles, orphans unadoptable |
| C-5 (duplicate campaign names) | **HELD** |
| Campaign isolation (run 1: 24 of 24) | **HELD** — 24 of 24 again, with a slug campaign and an opaque campaign side by side |
| D-2 (a save destroying a same-named file) | **HELD** for `clip:save` and `file:save`; **the one write path it did not reach still overwrites** (CD2-4), and the message names the wrong file (CD2-5) |
| D-6 / D-7 (writes outside the chosen folder) | **HELD** — 46 fresh hostile calls across all four write paths, nothing escaped; one residual, CD2-6 |
| D-3 (Copy blocks dead) | **HELD** — all seven blocks byte-exact against a real transcript |
| D-4 (silent automatic send) | **HELD** |
| D-5 (a later cut shrinking the document) | **HELD** on the document, **REGRESSED into a cross-campaign leak** (CD2-1) |
| D-9 (a sub-frame clip losing the batch) | **HELD** |
| FCPXML: 1.10 DTD validity, `<import-options>`, never `<library>`, fail closed | **HELD** — 34 documents, all DTD-valid |
| D-1 (drag-out) | guard **HELD**; the real drag freeze is **not provable here** — not passed |

**No product code was changed by this area.** The only files I wrote are
`audit/run-2/area-CD/*` and this report (both were swept into another actor's
`chore(audit): run 2 helper output in progress` snapshot commit while I worked;
I committed nothing). One product file did change mid-run, by someone else and
not for this area: `package.json` gained a `license` field, a packaged `LICENSE`
file and `build.publish.repo` renamed from `stream-trimmer` to `clipr`. It does
not affect anything measured here, but whoever owns the updater should know.

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
| `d8-clipsave-dest.cjs` | the `clip:save` destination matrix the first pass could not reach | `out/d8-clipsave-dest.txt` |
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
  folder** (`EditorHandoff.tsx:242-251`), and `resetSessionHandoff()` exists but
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
- **Suspected file**: `src/components/EditorHandoff.tsx:242-251` (`sessionBatch`
  keyed by `ctx.clipsDir`, `rememberClips`), `:253-258` (`resetSessionHandoff`,
  uncalled); `src/App.tsx:252` (`sessionClips`, never reset on a campaign change); `src/App.tsx:300-321` (`afterSaved`)

---

### CD2-2  Cutting a banked clip and switching campaign while it runs records the range against the wrong client
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start with two campaigns, each with its own clips folder and its own
     banked row: Client A has `A01` at 00:00:02 to 00:00:08, Client B has `B01`.
  2. With **Client A** active, open the Bank tab and press **Cut** on `A01`.
  3. While the download is still running, switch to **Client B** in the header
     popover (the "am I in the right campaign?" check the brief describes).
  4. Wait for the clip to save, then read `clipper.campaigns`.
  Control: the identical sequence with no switch, in the same run.
- **Expected**: what the main Cut button does. `App.tsx:324-332` captures
  `cutCampaignId` before the download and passes it to `recordUse`, so a switch
  mid-cut cannot move the record (verified: PART B of the same script).
- **Actual**: the no-reuse record is written against whichever campaign is
  active when the cut **finishes**:
  ```
  after — used ranges per campaign:
    [["Client A","{}"],
     ["Client B","{\"stub0000001\":[{\"start\":2,\"end\":8,\"clipId\":\"A01\"}]}"]]
  ```
  Client A — whose clip it is, whose bank row flipped to `cut`, whose folder the
  6.01 s file landed in — ends with **no record of the range at all**, so the
  same six seconds can be cut again for that client with no warning. Client B
  gains a used range for a clip it has never cut, which will warn on and block
  that range for the wrong client. The control run records it against Client A
  correctly, which isolates the switch as the cause.
  `ClipsColumn.tsx:171` calls `recordUse(vid, res.ranges, clip.id)` with no
  campaign id, so `CampaignContext.recordUse` falls back to
  `activeIdRef.current`. The bank side of the same handler does use the id it
  captured (`bankStore.markCut(campaignId, …)`), which is why the two records
  end up on different clients.
  There is no way back: `forgetUse` exists on the context but **no component
  calls it**, and a bank row's **Remove** only calls `bankStore.remove`, so a
  used range can never be taken out once written. The only escape is the "Use
  it anyway" button on the next overlap warning.
- **Proof**: `audit/run-2/area-CD/out/r2-cross-campaign.txt`, PART A switch
  (`VERDICT: Client A's clip was recorded against CLIENT B (data crossed)`) and
  PART A control (`[["Client A","{…A01…}"],["Client B","{}"]]`), PART B
  (the main Cut button, correct); the clip's duration measured with ffprobe as
  6.010998 s in both arms; script `audit/run-2/area-CD/r2-cross-campaign.cjs`
- **Suspected file**: `src/components/ClipsColumn.tsx:163-182` (`cut`);
  `src/context/CampaignContext.tsx:262-276` (`recordUse` default),
  `:278-285` (`forgetUse`, uncalled)

---

### CD2-3  "Copy file path" and "Send all" hand the previous client's files to the next one
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start with Client A and Client B, each with its own clips folder.
  2. With Client A active, cut one clip.
  3. Switch to Client B. Expand "Hand off to an editor".
  4. Read the panel's own note, then press **Copy file path** and read the
     clipboard.
- **Expected**: with no clip cut for Client B, the panel has nothing to offer —
  the buttons are disabled with `title="No clips yet"`, which is what run 1
  recorded for a fresh session (D-PASS-9).
- **Actual**: the panel says "Send all puts every clip from this session into
  one file **(1)**" while Client B is active, **Copy file path** is enabled, and
  the clipboard comes back with
  `…/Client A clips/AAA-stub0000001-01.mp4` — the other client's delivery path.
  `App.tsx`'s `sessionClips` is session-scoped but not campaign-scoped, and
  nothing resets it on a switch.
  This is the same root cause as CD2-1 and is filed separately only because it
  is reachable with **no** automatic send configured and with the two campaigns
  in **different** folders: CD2-1 needs the shared folder, this does not.
- **Proof**: `audit/run-2/area-CD/out/r2-cross-campaign.txt`, PART C
  (`with Client B active … "(1)"`, `copyPathDisabled:[false]`,
  `Copy file path while CLIENT B is active returns: …/Client A clips/AAA-stub0000001-01.mp4`)
- **Suspected file**: `src/App.tsx:252` (`sessionClips`), `:415-419` (passed
  straight to `EditorHandoff`)

---

### CD2-4  The one write path the D-2 fix did not reach still destroys a file of that name, and says `ok`
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
  with a plain `fsp.writeFile` (`electron/main.cjs:586`) and
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
- **Suspected file**: `electron/main.cjs:583-588` (`file:saveFiles`, the plain `fsp.writeFile` at `:586`);
  `electron/exportSave.cjs:78-88`

---

### CD2-5  After a collision the app names the file it did not write
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

### CD2-6  The containment check is only as narrow as `clipper.saveDirs`, which keeps every folder ever picked
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
  D-6 and D-7 themselves are closed (CD2-6 is not a reopening of them: 36
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

### CD2-7  Deleting a campaign leaves the client's library and drop-folder paths on disk for ever
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

### CD2-8  Banks orphaned before the fix can never be removed, and they double the settings file
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

### CD2-9  A folder lost mid-save still answers with a raw Node stack, now pointing inside the new save helper
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
- **Suspected file**: `electron/main.cjs:519-520` (`clip:save` returns
  `logger.describe(err)`), with `electron/pathSafety.cjs:105-136`

---

### CD2-10  "Export comments" cannot be reached: the function, the CSV path and the overlay all exist, and nothing calls them
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
  asked to re-check for D-2, and it can only be exercised over the bridge —
  which is how it was checked here: `file:save` does add " 2" and leaves the
  earlier file byte-identical (`out/d2-containment.txt`, B2).
- **Proof**: `audit/run-2/area-CD/out/d1-overwrite.txt`, section 3
  (`comment buttons on screen: []`, the planted CSV untouched because nothing
  ran); `audit/run-2/area-CD/out/d2-containment.txt`, B2 (`file:save` over an
  existing name gives `mine 2.txt` and leaves `mine.txt` byte-identical)
- **Suspected file**: `src/hooks/useClipper.ts:284-366`, `src/App.tsx:258`

---

### CD2-11  The Copy blocks panel covers the Cut button and swallows the click
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
  "topElement":"LI","coveredByCopyBlocks":true}`), which is a hit test on the
  live page; a first pass of the same script had its `#ui-cut` click refused for
  30 s by Playwright with "subtree intercepts pointer events", which is how the
  measurement came to be added
- **Suspected file**: `src/components/CopyBlocks.tsx:79-86`;
  `src/components/useDrawerClearance.ts`

---

### CD2-12  Raw Node errno text reaches the UI from the save handlers for a name the filesystem will not take
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
  Received '/…/nul\x00byte.txt…'`. Reached here over the bridge. A route
  without the bridge looks likely — the clip filename is built from the
  campaign's clip-id pattern and prefix, both free text, so a very long prefix
  should produce the same message from a Cut — but that was **not driven**, so
  only the bridge path is claimed.
- **Proof**: `audit/run-2/area-CD/out/d2-containment.txt` (the three rows
  `file:save 300-char filename inside chosen`, `saveFiles 300-char folder`,
  `file:save NUL in filename`)
- **Suspected file**: `electron/main.cjs:546-550`, `:589-593`

---

### CD2-13  `file:saveFiles` turns a traversal attempt into a real folder called `.._..`
- **Severity**: polish
- **Status**: confirmed
- **Steps**: `saveFiles({ dirPath: <clips>, folder: "../..", files: [...] })`,
  then `folder: "../outside"`, then a file name of `../../../esc4.csv`.
- **Expected**: refused, the way the bare `..` now is.
- **Actual**: all three are contained but materialise as directories and files
  with the separators turned into underscores — `chosen/.._../esc2.csv`,
  `chosen/.._outside/esc3.csv`, `chosen/ok/.._.._.._esc4.csv` — and each
  answers `{"ok":true}`. A folder name containing a newline is likewise
  created (`chosen/two\nlines/`), and `clip:save` does the same with a clip
  filename of `../../outside/trav.mp4`, which lands as
  `chosen/.._.._outside_trav.mp4` and is logged as
  `[clip] saved .._.._outside_trav.mp4`. Containment is intact; the result is
  litter in the user's delivery folder with a success message.
- **Proof**: `audit/run-2/area-CD/out/d2-containment.txt`
  (`paths created anywhere in the sandbox:` …, `CREATED OUTSIDE the chosen and
  data folders: none`); `audit/run-2/area-CD/out/d8-clipsave-dest.txt`
  (the `filename traversal` row)
- **Suspected file**: `electron/pathSafety.cjs:66` (the `[\\/]` → `_` rule)

---

### CD2-14  A campaign entry the loader cannot read is written out of existence by the next unrelated campaign edit
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Cold start with three stored campaigns, one of which has no `id` and one
     of which repeats an id already used — the shapes `normalizeCampaigns`
     drops (run 1 confirmed a malformed list loads without crashing, which it
     does).
  2. Note that the popover offers only the valid ones, and that all three rows
     are still in `settings.json`.
  3. Rename an unrelated campaign. Any campaign create, edit or delete does the
     same, and so does **cutting a clip**, because `recordUse` commits the list
     too (`CampaignContext.tsx:262-276`); only switching does not.
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

### CD2-15  When every clip in a send is unusable, only the first reason is reported
- **Severity**: minor
- **Status**: confirmed
- **Steps**: run `buildSessionFcpxml` (the product module, unchanged) with two
  clips, one shorter than a timeline frame and one whose file cannot be probed,
  with "create a project" on.
- **Expected**: both are named, the way they are when one good clip survives
  (`skipped` then lists each with its reason, and D-9's fix makes that work).
- **Actual**: it throws with `M-SUBFRAME: the file is shorter than one timeline
  frame` and never mentions `M-BROKEN`, because the empty-`ready` branch uses
  `skipped[0]?.reason` (`fcpxml.ts:850`). The user sees one clip named and
  has to guess at the rest. With at least one good clip the behaviour is
  correct, which is what D-9 was about, so this is the remaining edge.
- **Proof**: `audit/run-2/area-CD/out/d6-fcpxml.txt`, case F
  (`{"ok":false,"threw":"M-SUBFRAME: the file is shorter than one timeline frame"}`)
- **Suspected file**: `src/lib/fcpxml.ts:848-852`

---

### CD2-16  Looking at a campaign rewrites what it had stored
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
  campaign form has **no Quality field** at all — its labels are exactly
  `["Name","Target min (s)","Target max (s)","Hard cap (s)","Clip id prefix","Clip id pattern","Format"]` —
  so `create` stores whatever quality the clipper happens to be on, and a new
  MP3 campaign is stored as `320` only because the same snap-and-write-back
  runs the moment it becomes active. Nothing is lost and the corrected
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

### CD2-17  The footer reads "Data data" on a fresh install, and the campaign's own data folder stays empty
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

## Did the fixes hold? One section per fix, with its negative control

### C-2 — campaign identity: **HELD**, on all four questions the brief asked

**The migration.** A `settings.json` in today's shape — two slug-id campaigns
(`acme-q4`, `beta-launch`) with non-default bands, prefixes, patterns,
qualities, formats and folders; two banks across two videos with categories,
tiers, a note, a `cut` row and a `published` row; used ranges for two videos;
`clipper.editorHandoff` keyed by slug id; `downloads`, `saveDirs`,
`saveDirNames`, `workspaces`, `authSource`, `cookieBrowser` — boots with
**nothing lost**. Both campaigns load with every field intact, both banks show
in the UI under their own campaign (3 rows and 2 rows), the slug-keyed handoff
record is read back into the panel (Library `/Volumes/Work/Acme.fcpbundle`,
"Event for the projects" `Acme projects`, the project pattern, the checkbox),
and after the app itself writes (one import) every seeded key is still present,
`clipper.campaigns` is byte-identical except for the one write described in
CD2-16, the other campaign's bank is byte-identical, and the `cut`/`published`
statuses, categories, tiers and the note survive.

**Old-style delete and recreate.** Removing the slug campaign deletes its bank
key from disk (`acme-q4` gone, `beta-launch` untouched). Recreating the same
name gives id `c-c05c639be6fd4301` and a bank view of `0 clips` /
"Nothing banked for this video."

**The mixed world.** A slug campaign and a UI-created opaque campaign
(`c-44982064dc1b4b0d`) side by side; delete and recreate the opaque one (new id
`c-bbd0ab06feb44ee1`, empty); then delete and recreate the slug one with the
opaque one still present (new id `c-ab6f80ad45e44828`, **not** `acme-q4`,
empty). No adoption in either style, and each delete left the other campaign's
bank exactly as it was.

**T5's choice not to prune old orphans** is safe for adoption and for speed and
is a permanent retention leak; that is CD2-8, with the measured numbers.

Negative control for the identity half: the whole point of the fix is that no
newly minted id can equal a stored slug. `newCampaignId` returns `c-` + 16 hex
(`crypto.randomUUID`), and the only `create` call site in the product is
`CampaignMenu.tsx:84`; every id minted in these runs matched
`/^c-[0-9a-f]{16}$/`. The control that proves the *test* can fail is the run-1
behaviour itself, which is on record in `audit/run-1/verify/slice-5.md`
(`campaigns after recreating 'Acme Q4': [{"id":"acme-q4", …}]`,
`bank view after recreate: rowCount 2`) against the identical steps.

Proof: `audit/run-2/area-CD/out/c1-identity.txt` (all four parts),
screenshots under `out/c1-A-migration/`, `out/c1-B-slug-recreate/`,
`out/c1-C-mixed/`, `out/c1-D-orphans/`.

### C-5 — duplicate campaign names: **HELD** (12 of 12 assertions)

"New campaign" with a name already in use keeps the form open and shows
**"Another campaign already has that name."**; so does the same name in a
different case with padding (`  acme q4 `); so does run 1's exact route,
Edit → rename to `Acme Q4` → Save. A genuinely new name is accepted, and
editing a campaign while keeping its own name is accepted. No campaign was
created or renamed in any refused case.

One thing worth recording for whoever reads the fix report: the model's
`uniqueName` suffix ("Acme Q4 2") is **not reachable from the UI**, because
`campaignFormProblems` refuses the clash before `create`/`update` is called and
`CampaignMenu.tsx` is the only caller of either. The brief's two expectations
are both implemented; the form's message is the one a user sees.

Proof: `audit/run-2/area-CD/out/c2-names-isolation.txt`, PART A;
screenshot `out/c2-A-names/*-A-name-clash.png`.

### Campaign isolation: **HELD, 24 of 24**

Deliberately re-run across the identity change with **one slug-id campaign and
one opaque-id campaign**, each with its own imported rows, switched back and
forth four times: on every view the rows were exactly that campaign's
(`["L01","L02"]` / `["O01"]`), no row of the other campaign was present, and
the filter chips carried no other campaign's categories or tiers
(`["legacyhook","legacypay","Tier 1","Tier 2"]` / `["opaquehook","Tier 5"]`).
The count line agreed with the rows every time. 24 assertions, 0 failures.

What does cross campaigns is not the bank: it is the session handoff list and
the used-ranges record (CD2-1, CD2-2, CD2-3).

Proof: `audit/run-2/area-CD/out/c2-names-isolation.txt`, PART B
(`ASSERTIONS: 36 passed, 0 failed` for the file as a whole, of which 24 are the
isolation rounds).

### D-2 — a save destroying a same-named file: **HELD** where it was applied

`clip:save`: the planted 48-byte file came through a real cut untouched —
`ino 1188637 size 48 sha df41a9663c8b` before **and** after — and the new 6.01 s
clip was written beside it as `ACM-stub0000001-01 2.mp4`. A second collision on
the same id produced ` 3` and left both earlier files byte-identical.
`file:save`: `mine.txt` survived (`sha cc5f16644b` before and after) and the
write landed as `mine 2.txt`.
The comments CSV is the same handler, and it is the only D-2 path that cannot be
driven from the UI at all (CD2-10).
What is still open: `file:saveFiles` / `export:save` (CD2-4) and the message
naming the wrong file (CD2-5).

Proof: `out/d1-overwrite.txt` sections 1, 2 and 4; `out/d2-containment.txt` B2;
`out/d7-clipid-and-toast.txt`; screenshots in `out/d1-clip-collision/`.

### D-6 / D-7 — writes outside the chosen folder: **HELD**

46 calls made from the renderer through the product's own preload bridge, all
fresh for this run (36 in `d2-containment.cjs` plus 10 for `clip:save` in
`d8-clipsave-dest.cjs`). Refused with `Unexpected save location`: a dotfile canary
outside the chosen folder, an absolute path outside, `/etc`, `chosen/..`,
`chosen/../..`, a **symlink inside the chosen folder pointing outside**, a
relative `dirPath`, a filename of `..`, a 300-character `dirPath`, a unicode
directory outside, a `dirPath` that is a **plain file**, `saveFiles` with
`folder: ".."`, `folder: "."`, a `dirPath` outside, a `dirPath` that is a file,
and `saveFiles` through the symlink.

`clip:save` needed a second pass: in the first matrix both hostile calls were
refused by its **source** check ("Unexpected clip location") before the
destination check could run, so `d8-clipsave-dest.cjs` gives it a real file
inside a real `ytclip-` folder under the OS temp dir — the only source shape it
accepts — and then attacks the destination. All six are refused with
`Unexpected save location` and logged as "refused save outside the chosen
folders": a `dirPath` outside, the canary folder with a `.bashrc` name,
`chosen/..`, a symlink out of `chosen`, `/etc`, and a relative `dirPath`; a
filename of `..` is refused too. The two controls (inside the clips folder,
inside the data folder) save normally. Nothing was created outside the chosen
and data folders and the canary is byte-identical.
Contained but accepted (litter, CD2-13): `folder: "../.."`, `folder: "../outside"`,
a traversing file name, a folder or file name containing a newline, unicode
names. Controls that must work still work: a file inside the chosen folder, a
subfolder of it, a file in the data folder, `folder: "ok-folder"`.

**Filesystem proof, not answer proof**: the canary `.bashrc` was
`ino 1198231 size 9` before and after, still reading `original`, and a diff of
the whole sandbox tree before and after the 36 calls lists
`CREATED OUTSIDE the chosen and data folders: none`.

The export path is owner-gated, so in a public build the bridge answers
`Could not save.` before containment is reached; `electron/exportSave.cjs` was
therefore **required unchanged** and driven directly with real `ytchan-` temp
sources: `folder: ".."`, a `dirPath` outside and a canary dotfile are all
`Unexpected save location`, and the good export wrote only inside the chosen
folder.

**The behaviour change does not block legitimate use.** A brand-new folder is
refused before it is chosen (`Unexpected save location`) and accepted the moment
it is picked through the product's own footer chip and the native dialog
(`{"ok":true,"path":".../Brand New Folder/after-pick.txt"}`). Switching to a
campaign whose clips folder was **never** the global one and cutting works: the
clip landed in `Client B clips` (`[clip] saved CLB-stub0000001-01.mp4`), because
`App.tsx:267-271` mirrors the campaign's folder into `saveDir`, which adds it to
`saveDirs`. The residual is CD2-6: the fence is only as narrow as that list.

Proof: `out/d2-containment.txt` (all 36 rows, the canary, the tree diff, parts
C1 and C2), `out/d8-clipsave-dest.txt` (the 10 `clip:save` rows and its own
tree diff), `out/d3-containment-tail.txt` (parts A and C).

### D-3 — Copy blocks: **HELD**, against a real transcript

The stub serves a real six-cue WebVTT through the product's own
`/api/transcript` (`{"status":200,"available":true,"lines":6,...}`), so the panel
is reading lines the product parsed. All seven blocks were clicked and the
**system clipboard read back** and compared against text computed from the cues
and the marked segments, not taken from the product:

- with a video + transcript and no segment: 3 of 7 available (source, whole
  transcript, clip id), and both available texts exact;
- with one segment 00:00:04–00:00:12: **7 of 7 available and all seven exact**,
  including the segment transcript (2 lines), the script lines
  (`[SPEAKER, 00:00:04] …`), `00:00:04 to 00:00:12`, and
  `stub0000001 (video): 00:00:04 to 00:00:12 (ACM-stub0000001-01)`;
- with two segments: the segment transcript, script lines, ranges
  (`…; 00:00:18 to 00:00:22`) and used-material line all exact;
- after a completed cut the clip id block advances to `ACM-stub0000001-02` and
  the used-material line follows it;
- focus on open lands on `BUTTON#ui-copy-block-source`, not on `document.body`.

With nothing loaded all seven are correctly disabled; block 7's reason is now
"No value for {videoId}." rather than run 1's misleading "This campaign has no
clip id pattern."

14 of 15 clipboard assertions passed in the panel run; the one failure was my
driver (the open panel blocks the Cut button, CD2-11, so the cut in that step
never completed) and is settled in `d7-clipid-and-toast.cjs`, where the cut
happens first and the id does advance.

Proof: `out/d4-copyblocks.txt`, `out/d7-clipid-and-toast.txt`, screenshots in
`out/d4-copyblocks/`.

### D-4 — the automatic send's failure: **HELD**

With `afterCutting: "finalcut"` and a library that does not exist, a real cut
now puts the sentence on screen:
"There is no library at …/this-library-does-not-exist.fcpbundle. Final Cut would
create a new one there, so nothing was sent. Check the path, or clear the
Library field." The handoff panel opens itself (`expanded: "true"`) and carries
the message in its own status area. Fail-closed is unchanged: no library
directory was created at the bad path and no `.fcpxml` was written.

Proof: `out/d5-handoff.txt`, PART A; screenshot `out/d5-A-silent/*-A-missing-library.png`.

### D-5 — a later cut shrinking the document: **HELD** on the document

Two clips cut, then Send all with a real library, `Raw clips تجربة` as the media
event, "Also create a project" on and `Acme projects` as the project event: the
document holds 2 assets, 4 `asset-clip`s (2 in the event, 2 in the projects'
spines), 2 events, 2 projects, DTD OK. Then "After cutting" switched to Final
Cut and a third clip cut: the file at the **same path and the same inode**
(`1286501`) grew from 2,791 to 3,885 bytes and now holds **3 assets, 6
asset-clips, 3 projects**, with all three clip ids present, `count(//library)`
= 0 and one `<import-options><option key="library location">`. Still DTD-valid.

So the document is no longer reduced — and the same mechanism now carries the
previous campaign's clips into the next campaign's file, which is CD2-1.

Proof: `out/d5-handoff.txt`, PART B; the two documents are kept side by side as
`out/d5-B-batch/B-before.fcpxml` and `out/d5-B-batch/B-after.fcpxml`.

### D-9 — a sub-frame clip losing the batch: **HELD**

`src/lib/fcpxml.ts` imported unchanged, driven with media made by real ffmpeg
and probed with the real ffprobe invocation `editorOpen.cjs: probeMedia` uses:

| case | before (run 1) | now |
|---|---|---|
| 3 good + an unprobeable 0-byte file, project on | 3 included, 1 skipped | 3 included, 1 skipped `M-BROKEN` |
| 3 good + a 0.001 s 1000 fps file, project on | **threw, no document** | 3 included, skipped `M-SUBFRAME: the file is shorter than one timeline frame`, DTD OK |
| the same clip, project off | included | included (unchanged) |
| 2 good + **one frame of ordinary 60 fps** (slice-2's case D), project on | **threw** | 2 included, skipped `M-60FPS: …shorter than one timeline frame`, DTD OK |
| sub-frame with a "match source" timeline | included | included (unchanged) |
| a missing file among good ones | — | 2 included, skipped with a plain reason |

The remaining edge is CD2-15 (every clip unusable → only the first reason).

Proof: `out/d6-fcpxml.txt`, cases A–I and the four verdict assertions.

### The FCPXML work that held in run 1: **still holds after D-5's change**

**34 documents** in this run — 31 written by `src/lib/fcpxml.ts` driven
unchanged, and 3 written by the running app — every one re-validated with
`xmllint --noout` and `xmllint --noout --dtdvalid FCPXMLv1_10.dtd` against
Apple's real FCPXML 1.10 DTD (which enforces element order through its content
models): **0 invalid**. Re-check with

```
for f in audit/run-2/area-CD/out/d6/*.fcpxml; do xmllint --noout --dtdvalid <dtd> "$f"; done
```

and the three the app wrote are `out/d5-B-batch/B-before.fcpxml`,
`out/d5-B-batch/B-after.fcpxml` and `out/d5-C-cross/C-Client B.fcpxml`, all
DTD OK (re-validated after the fact as well as in the run).

The hostile matrix was rebuilt for this run, not re-run from run 1's script:
clip names containing `& < > " '`, emoji with RTL text, a newline, 500
characters; event names empty, whitespace, 500 characters,
`a/b\c:d*e?f"g<h>i|j`, `& < > " '` with NUL and BEL control characters, and one
equal to the project event (which correctly merges into a single `<event>`);
library paths with spaces and Arabic, a **symlinked** library, one containing
`..`, one with a newline, one that is a file, a relative one, a 300-character
one and one that does not exist; mixed frame rates (25 and 30000/1001) in one
document; duplicate project names; several segments in one clip.

- `count(//library)` is **0** in every document, and every document with a
  library carries exactly one
  `<import-options><option key="library location" value="file://…"/>` as the
  **first child of `<fcpxml>`** (`name(/fcpxml/*[1])` = `import-options`).
- A library that is missing, a file, relative, 300 characters or newline-bearing
  is refused with the plain sentence, and **no stray library directory was
  created** by any refused send.
- Structure: two events, the raw clips as `asset-clip` in the first, one
  `project` per clip in the second, each project's `spine/asset-clip/@ref`
  pointing at the **same** asset (`ref="a1"`, `ref="a2"` against
  `id="a1"`, `id="a2"`), the timeline format (1080x1920 at 1/30 s) separate
  from the source format.

Run 1's two cosmetic FCPXML findings are unchanged and still visible in these
documents: the `<note>` / `</asset-clip>` indentation (D-23) and the dangling
separator in a project name from an empty token (D-16:
`<project name="H-24 - - Audit CD">`).

Proof: `out/d6-fcpxml.txt`, `out/d6/*.fcpxml` (31 files).

### D-1 — the drag-out: the guard **HELD**; the freeze is **not provable here**

`file:startDrag` with no gesture in progress never reaches the main process:
the preload only forwards it within 1 s of a genuine `isTrusted` `dragstart`
(`preload.cjs:54-57`). Called from the renderer with a real file inside the
clips folder and with a file outside every known folder, both returned
immediately and the **next IPC call answered in 0 ms** in both cases
(`{"answered":true,"ms":0}` — run 1 saw `*** NO ANSWER after 8s ***`), and the
main log contains **no `[drag]` lines at all**, which is what proves the call
was stopped in the preload rather than handled.

The main-side half cannot be reached without a real gesture, so `dragTarget`
was required unchanged and driven directly: a file inside a known folder
resolves, and `REFUSED` for a file outside every known folder, a **symlink
inside the folder pointing out**, a missing file, the folder itself, a relative
path, a path with a newline and a non-string.

**The real drag freeze is not provable here** — this container has no window
manager and no real pointer — so D-1 is **not passed**. A genuine drag gesture
reaching `event.sender.startDrag` still needs macOS/Windows verification, as
T2's own report says.

Proof: `out/d2-containment.txt`, parts C3/C4 and the empty drag log;
`out/d3-containment-tail.txt`, PART B.

---

## The regression hunt

| attack | result |
|---|---|
| Switching campaign **mid-download** (main Cut button) | **Safe.** The clip landed in Client A's folder with Client A's prefix and Client A's used range, although Client B was active when it finished (`out/r1-regressions.txt` PART A). |
| Switching campaign **mid-cut of a banked row** | **CD2-2** — the used range goes to the wrong client. |
| A campaign **deleted while its clip is cutting** | **Safe.** The clip still saved, the bank key was pruned, no used range was written anywhere, no page error, no crash (`out/d5-handoff.txt` PART D). |
| Saving into a folder **removed mid-save** | **CD2-9** — still a raw stack, now naming the new helper; containment did not misfire. |
| The **bank at scale** after the identity change | **No regression.** 2,000 live rows: boot 1,486 ms, one search keystroke 162 ms (49 ms at 20 rows — run 1's C-6, unfixed). Adding 40 orphaned banks: boot 1,256 ms, keystroke 183 ms, switch 1,619 ms, no page errors — but `settings.json` doubles to 1.1 MB (CD2-8). |
| The **sticky primary-action row** (T10 item 4) | **No regression.** At 1100x760 and 1440x900, with 0 and 3 segments and with the handoff panel open, Cut, Add segment and the In field are all on screen and hit-test `OK`, and `document.documentElement.scrollWidth` equals the viewport (no sideways scroll). At the 900x600 minimum Cut is still below the fold, exactly as T10 documented and accepted. |
| The **Copy blocks** panel over the new sticky row | **CD2-11** — the panel (`z-20`) covers Cut (`z-10`). |
| **Folder naming** after the exporter rename | **CD2-17** — the suggested folder is now `data`, so the footer reads "Data data"; the campaign's own `dataDir` stays empty. |
| A **malformed campaign list** plus the identity change | **CD2-14** — unreadable entries are written out of existence by the next campaign edit (or the next cut), orphaning their banks. |

---

## Coverage: what was exercised and passed

- **Bulk timestamp import** through the product's own importer (the real
  textarea and the real "Import N clips" button), with ids, categories and
  tiers, in nine separate launches, each time with the stored rows, the rows on
  screen, the filter chips and the count line asserted afterwards. Run 1's
  import-shape work (39 pastes) was not repeated — nothing in the fix list
  touched `src/lib/bankImport.ts`.
- **Delete and recreate** in both id styles, in four combinations, with the
  other campaign's bank asserted untouched each time.
- **Per-campaign banks** across a slug/opaque mix, four switch rounds.
- **A real clip, end to end**, more than a dozen times across these suites: paste → mark →
  Add segment → Cut → real yt-dlp-shaped invocation
  (`--download-sections *2.00-8.00 --force-keyframes-at-cuts`) → real ffmpeg →
  `clip:save` → a 6.01 s file in the campaign's folder, measured with ffprobe.
- **Collision handling** at ` 2` and ` 3`, with inode/size/sha256 on both sides.
- **46 hostile bridge calls** across `file:save`, `file:saveFiles`, `clip:save`
  and `export:save`, with whole-tree diffs and a dotfile canary.
- **The editor handoff** end to end: library, media event, "create a project",
  project event, Send all, the automatic send, and the document re-read from
  disk and DTD-validated after each.
- **34 FCPXML documents** against Apple's 1.10 DTD, including the full hostile
  matrix.
- **All 58 symbols** were NOT re-checked: run 1 proved them byte-exact and
  nothing in the fix list touched `src/lib/symbols.ts`.

## Not provable here

- **The real drag-out freeze** (D-1): no window manager, no real pointer. Not
  passed.
- **Final Cut Pro, CapCut (and the removed Premiere path) actually opening**:
  macOS only. Every send in these runs stopped at the platform guard with
  "Opening Final Cut Pro from here is macOS only. The file is saved at …", which
  is the right message and the right path. Whether Final Cut honours
  `<option key="library location">`, creates the project in the second event, or
  asks about a duplicate project name is **not provable here**.
- **The native directory dialog itself**: it cannot be opened or photographed
  here, so `dialog.showOpenDialog` was replaced inside Electron where a pick was
  needed. Run 1's D-22 (every picker titled "Choose download folder") therefore
  stays `likely`.
- **Real YouTube**: no claim is made about real clip lengths, chosen formats,
  1080p or signed-in behaviour. The stub stands in, and the cut lengths above
  are the stub's real ffmpeg cuts of the local fixture.
- **`export:save` end to end in an owner build**: the handler is owner-gated and
  these runs are the public shape, so its containment was proved at the module
  level instead (`electron/exportSave.cjs`, required unchanged).
- **A read-only target folder**: the container runs as root, so `chmod` does not
  produce one. Unwritability was produced with a target that is a plain file and
  with a folder deleted mid-save instead.
- **Two app windows over one settings file**: Electron's single-instance lock is
  per `--user-data-dir` and every launch gets its own.
- **The packaged build**: everything above ran against `electron/main.cjs` in
  dev shape with the built renderer from `dist/`. Installers, signing and
  auto-update are outside this area.
