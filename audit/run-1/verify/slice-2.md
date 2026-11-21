# Verification — slice 2 (files written, paths, output correctness)

Independent re-run of 13 findings: D-2, D-4, D-5, D-6, D-7, D-8, D-9, D-10
(`audit/run-1/areas/D-output-handoff.md`) and G-4, G-6, G-8, G-9, G-12
(`audit/run-1/areas/G-server-jobs.md`).

**No product file was changed.** Everything here is new: my scripts live in
`audit/run-1/verify/slice-2/`, captured output in
`audit/run-1/verify/slice-2/out/`. I did not run the original authors'
scripts at all — not even as a cross-check — because the point of this pass is
that the evidence must not inherit their harness or their assumptions. Where I
needed something their harness has (a yt-dlp stub that can 403 only the
sectioned download), I wrote my own
(`audit/run-1/verify/slice-2/vlib.cjs: makeStubRoot`).

## How this pass was driven

- **Cold start every time.** Every app run gets its own `--user-data-dir`, its
  own clips/data folders and its own stub root
  (`audit/run-1/verify/slice-2/vapp.cjs: launch`). Every server run gets its
  own stub root **and its own private `TMPDIR`**, so `removed: N` from
  `/api/cache/clear` counts only that run's folders and no other helper's work
  is touched.
- **Filesystem proof, not UI proof.** Every "overwritten / destroyed / written
  outside the folder" claim is settled with inode + size + mtime + sha256
  before and after (`vapp.cjs: fsSnapshot / fsCompare`). A toast saying "Clip
  saved" is recorded as a UI fact and never as evidence that bytes survived.
- **Product code is imported, never reimplemented.** `src/lib/fcpxml.ts`,
  `server/segments.ts` and `electron/settingsStore.cjs` are loaded unchanged
  (tsx / require) and driven with real files and real `ffmpeg`/`ffprobe`.
- **Two runs minimum, three where a run was invalidated.**

### One harness trap worth recording, because it invalidated a run

`tsx` is a wrapper: it spawns the real node process. Killing the wrapper
orphans the server. My first `v-g89-cache.cjs` run used fixed ports, so run b
connected to run a's **orphaned** servers and reported run a's temp paths back
to me. I found it because the paths in the results did not match the private
`TMPDIR` I had just created (`clipPathInsideTmpdir: false`). The harness now
picks a free port per server, waits for *its own* "listening on" line, and
kills the process group (`vlib.cjs: startServer`). `out/g89-b/results.json`
and `out/g6-b/results.json` are kept but are **not** counted as runs. Anyone
re-running area G's own scripts should know the same trap applies to a fixed
`PORT`.

---

### D-2 — Saving a clip silently overwrites a file of the same name, and still says "Clip saved"
- **Verdict**: CONFIRMED
- **Severity**: blocker (same as the original — it loses data)
- **Runs**: 3 attempts (`d2-a`, `d2-b`, `d2-c`), 3 reproduced
- **What I did**: put a 48-byte file called `AUD-stub0000001-01.mp4` — the name
  the next clip of this campaign gets — into a fresh clips folder, recorded its
  inode/size/mtime/sha256, then booted the real app cold with that campaign and
  cut a clip through the product's own UI (paste, mark, Add segment, Cut as one
  file). Re-snapshotted the same path. A control run (part 1) cut into an empty
  folder first, to show the same drive sequence produces a normal save.
- **Proof**: `audit/run-1/verify/slice-2/v-d2-overwrite.cjs` (part 2);
  `out/d2-{a,b,c}/results.json`, screenshots in `out/d2-*/collision/`.
  Run c:
  ```
  before: ino 967648  size 48      sha df41a966…  "the user's own earlier clip - do not destroy me"
  after : ino 959527  size 981457  sha 27902d56…
  sameInode false   sameBytes false   usersBytesStillThere false
  madeASecondFile false            (no "… 2.mp4" was produced)
  anyMessageMentionsReplacing false
  messages: ["Clip length capped at 10 minutes",
             "Clip saved AUD-stub0000001-01.mp4 Downloaded at 360p. Open folder"]
  ```
  The user's bytes are gone from the filesystem, the inode is a new one
  (`fsp.rename` over the target), and nothing on screen mentions a replacement.
  Reachability needs no trickery: my seed was an ordinary campaign with an
  empty `clipper.downloads`, i.e. a settings file that has lost its download
  history while the files are still in the folder.

---

### D-4 — "After cutting: Send to Final Cut Pro" fails in complete silence
- **Verdict**: CONFIRMED
- **Severity**: major (same as the original)
- **Runs**: 3 attempts (`d458-a`, `d458-b`, `d458-d`), 3 reproduced
- **What I did**: cold start with the campaign's handoff settings seeded to
  `afterCutting: "finalcut"` and `fcpLibrary` pointing at a `.fcpbundle` that
  does not exist, then cut one clip through the UI. Collected **every**
  `role="alert"` and `role="status"` string on screen, listed the clips folder,
  and checked the bad library path. Then — the step the original did not do —
  clicked the panel's own **Send all to Final Cut Pro** with the *same*
  settings, to find out whether the message exists at all.
- **Proof**: `audit/run-1/verify/slice-2/v-d458-handoff.cjs` (part 4);
  `out/d458-{a,b,d}/results.json`, `out/d458-d/d4/*.png`.
  ```
  messages on screen        : ["Clip length capped at 10 minutes",
                               "Clip saved AUD-stub0000001-01.mp4 …"]
  anyMessageMentionsFinalCutOrLibrary : false
  fcpxmlWritten             : []            (nothing was written)
  strayLibraryCreated       : false         (the fail-closed part is correct)
  manual Send all, same settings ->
    "There is no library at /tmp/this-library-does-not-exist-….fcpbundle.
     Final Cut would create a new one there, so nothing was sent.
     Check the path, or clear the Library field."
  ```
  That last line is the isolation the finding needed: the sentence is produced
  by the same code path, and only `src/App.tsx:288`'s
  `void runAfterCutting(...).catch(() => {})` throws it away. The user is left
  believing the clip reached Final Cut.

---

### D-5 — Cutting another clip replaces the session's editor file with a one-clip version
- **Verdict**: CONFIRMED
- **Severity**: major (same as the original)
- **Runs**: 3 attempts (`d458-a`, `d458-b`, `d458-c`), 3 reproduced
- **What I did**: cold start, cut two clips (paced on the filesystem, not on a
  toast), opened the handoff panel, set a Library that really exists, set
  "Event for the raw clip" to `Raw clips تجربة`, ticked "Also create a
  project", set "Event for the projects", clicked **Send all to Final Cut
  Pro**. Snapshotted the written document (inode/size/sha256 + element counts),
  set "After cutting" to Final Cut, cut a third clip, snapshotted the same path
  again.
- **Proof**: `audit/run-1/verify/slice-2/v-d458-handoff.cjs` (part 5);
  `out/d458-c/results.json`, and the two documents side by side:
  `out/d458-c/d5-BEFORE.fcpxml` vs `out/d458-c/d5-AFTER.fcpxml`.
  ```
  before : 2 assets, 2 event asset-clips, 2 projects   2520 bytes  ino 1016209
  after  : 1 asset,  1 event asset-clip,  1 project    1504 bytes  ino 1016209
  fileReplaced true   sameInode true   secondDocumentWritten ["Raw clips تجربة.fcpxml"]
  anyMessageAboutReplacing false
  ```
  BEFORE holds `AUD-stub0000001-01` and `-02`; AFTER holds only `-03`. Same
  path, same inode (`fsp.writeFile` truncating in place), no second file beside
  it, and no message. In runs a and b the projects count was 0 because my
  driver did not get "Event for the projects" into React state — that is my
  driver, not the product; the replacement itself reproduced in all three.

---

### D-6 — `file:save` writes to any absolute path: it overwrote a file outside the chosen folder
- **Verdict**: CONFIRMED
- **Severity**: major (same as the original), with the caveat below
- **Runs**: 2 attempts (`d67-a`, `d67-b`), 2 reproduced
- **What I did**: built a sandbox with `chosen/` (the folder the app is
  configured with), `outside/` and `home-canary/.bashrc` containing
  `original\n`; snapshotted the canary; booted the app cold with `chosen/` as
  the clips folder; made the calls from the renderer through the product's own
  preload bridge; snapshotted the canary again and diffed the tree.
- **Proof**: `audit/run-1/verify/slice-2/v-d67-paths.cjs`;
  `out/d67-{a,b}/results.json`.
  ```
  saveFile({dirPath:"<sand>/home-canary", filename:".bashrc", data:"PWNED"})
      -> {"ok":true,"path":"<sand>/home-canary/.bashrc"}
  canary: ino 1000147 -> 1000147 (same inode, rewritten in place)
          sha 25718360… -> 2b848254…   contents now "PWNED"
  saveFile({dirPath:"<sand>/outside", filename:"pwned-abs.txt"})  -> ok
  control, filename traversal: filename "../../outside/pwned-save.txt"
      -> landed at chosen/.._.._outside_pwned-save.txt   (correctly neutralised)
  createdOutsideChosen: ["esc.csv","outside/pwned-abs.txt","outside/sf/","outside/sf/pwned-sf.csv"]
  ```
  `dirPath` is never checked against anything; the filename sanitiser is fine.
  Two corrections to the write-up, neither of which changes the verdict:
  1. **The precedent it cites is wrong.** `export:save`'s "Unexpected export
     location" (`electron/exportSave.cjs:62-68`) checks where the file is being
     moved **from** (a `ytchan-` folder in the temp dir), not where it is being
     written **to**. `saveExportFiles` joins `dirPath` + `folder` and
     `mkdir`s it with no containment either, so `export:save` is not the good
     example — it has the same destination hole.
  2. `file:save` does **not** create missing directories: `dirPath`
     `<sand>/made/up/deep` returned `{"ok":false,"error":"ENOENT …"}`. The
     `mkdir -p` behaviour belongs to `editor:writeFcpxml` (D-12).
  Severity caveat: this is an IPC-hardening hole, not a broken user function.
  It needs renderer-side code that the user did not write, and no such route
  was demonstrated. The inventory declares the bridge an attack surface, and
  "silently overwrite any file the user can write" is the strongest outcome in
  this slice, so I leave it at major.

---

### D-7 — `file:saveFiles` with `folder: ".."` writes outside the chosen folder and reports success
- **Verdict**: DOWNGRADED (the behaviour is real and is a **distinct** hole from D-6 — see below — but it is narrower than the write-up says)
- **Severity**: minor (the original says major)
- **Runs**: 2 attempts (`d67-a`, `d67-b`), 2 reproduced
- **What I did**: same cold-start sandbox, calling `saveFiles` from the
  renderer with `folder` set to `..`, `../..`, `../outside` and `ok`.
- **Proof**: `audit/run-1/verify/slice-2/v-d67-paths.cjs`;
  `out/d67-{a,b}/results.json`.
  ```
  folder ".."         -> {"ok":true,"path":"<sand>"}        esc.csv IS in the parent
  folder "../.."      -> {"ok":true,"path":"<sand>/chosen/.._.."}   contained
  folder "../outside" -> {"ok":true,"path":"<sand>/chosen/.._outside"} contained
  folder "ok"         -> {"ok":true,"path":"<sand>/chosen/ok"}
  escCsvInSandboxRoot true   escCsvOneLevelUp false
  ```
- **Why the original's severity is wrong**: two things. First, a factual
  correction: it says "`../..`, `..` repeated" also escapes. They do not —
  `path.join(chosen, "../..")` is not what happens, because the separators are
  replaced first, so `../..` becomes the literal directory name `.._..` inside
  the chosen folder. **Only a bare `..` escapes, and only by exactly one
  level.** My run shows `escCsvOneLevelUp: false`. Second, reachability: the
  only caller of `saveFiles`/`export:save` is the channel exporter
  (`src/hooks/useChannelExport.ts:169,184`), and it builds `folder` with
  `buildExportFolderName` (`src/lib/channel.ts:318-321`), which always appends
  `-export-YYYY-MM-DD` — so through the product the value can never be the bare
  `..` that escapes. It needs a direct bridge call, and such a caller already
  has the strictly stronger D-6 hole in the same handler (I proved that too:
  `saveFiles` with `dirPath: "<sand>/outside"` succeeds and writes there). So
  D-7 adds "one level up" to a handler that is already unconstrained. Real and
  worth fixing, but survivable and strictly weaker than D-6: minor.
- **D-6 / D-7: one defect or two?** Two holes, one fix. They are different
  inputs in different handlers (`electron/main.cjs:502-522` vs `525-554`): D-6
  is "`dirPath` is never checked", D-7 is "the `folder` sanitiser strips
  separators but leaves `..`". Fixing one does not fix the other — containing
  `dirPath` to the chosen root still lets `folder:".."` leave it, because the
  escape happens after the join. But a single containment helper applied to the
  **resolved final target** closes both, and the same helper is needed at a
  third site, `electron/exportSave.cjs:41-43`, which carries both holes. Fix it
  once, apply it three times; do not file them as one.

---

### D-8 — With no campaign selected, the whole handoff panel is inert and says nothing
- **Verdict**: DOWNGRADED (the behaviour is exactly as described; the severity is not)
- **Severity**: minor (the original says major)
- **Runs**: 2 attempts (`d458-a`, `d458-b`), 2 reproduced
- **What I did**: cold start with a clips folder and `clipper.campaigns: []`,
  `clipper.activeCampaign: null` — which is a genuine fresh install
  (`CampaignProvider` creates no campaign; I checked). Expanded "Hand off to an
  editor", typed a library path, chose "Send to Final Cut Pro", ticked "Also
  create a project", then read every control back and read the settings store.
- **Proof**: `audit/run-1/verify/slice-2/v-d458-handoff.cjs` (part 8);
  `out/d458-{a,b}/results.json`, `out/d458-a/d8/*.png`.
  ```
  libraryValueAfterTyping          : ""
  afterCuttingValueAfterChoosing   : "nothing"
  checkedNow                       : false
  projectEventFieldPresent         : false
  summaryRow                       : "Hand off to an editor  After cutting: Nothing"
  messagesOnScreen                 : [] (nothing about campaigns)
  persisted clipper.editorHandoff  : undefined
  ```
- **Why the original's severity is wrong**: nothing is lost or corrupted, and
  the failure is *visible* rather than silent — the field you typed into
  empties in front of you and the select snaps back, so the user is not misled
  about an outcome the way D-4 misleads them. The state ends the moment a
  campaign exists, which is the app's normal first step (header chip, footer
  chips and the setup checklist all push towards it). "Wrong but survivable,
  with a workaround" is the minor row. It is still a real defect: the panel
  should say the settings belong to a campaign, or disable itself.

---

### D-9 — One clip shorter than a timeline frame throws away the whole batch
- **Verdict**: DOWNGRADED (reproduced exactly; severity overstated)
- **Severity**: minor (the original says major)
- **Runs**: 2 attempts (`d9-a`, `d9-b`), 2 reproduced, identical
- **What I did**: imported `src/lib/fcpxml.ts` unchanged and called
  `buildSessionFcpxml` with real media and the real ffprobe invocation
  `electron/editorOpen.cjs: probeMedia` uses. Three good clips really cut from
  the fixture, plus: a 0-byte `.mp4` (case A), a real 1-frame 1000 fps file of
  0.001 s (cases B and C), and — my own additions — a real 0.0333 s 60 fps clip
  (case D) and case B against a "match source" timeline (case E).
- **Proof**: `audit/run-1/verify/slice-2/v-d9-batch.ts`;
  `out/d9-{a,b}/report.json` and the documents it writes.
  ```
  A unprobeable, project on : included 3, projects 3, skipped [M-BROKEN]   document written
  B subframe,    project on : THREW "M-SUBFRAME: the file is shorter than one timeline frame"
                              no document at all
  C subframe,    project off: included 4, 4 assets, DTD-shaped document written
  D 0.0333s 60fps clip, project on : THREW "M-60FPS: …shorter than one timeline frame"
  E subframe, timeline "match source" : included 4, projects 4
  ```
  So the original's A/B/C are right, and the two code paths really do disagree
  (C and E accept what B rejects). My case D makes the defect **more**
  reachable than the write-up suggests: it needs no exotic 1000 fps file, only
  a clip shorter than 1/30 s, which one or two frames of ordinary 60 fps
  footage is.
- **Why the original's severity is wrong**: nothing is lost. The clips are
  already saved in the clips folder; what fails is one export, with a message
  naming the offending clip, and there are two workarounds that both work in
  the same session (untick "Also create a project" — case C — or set the
  timeline to "match source" — case E). That is the minor row ("wrong but
  survivable or has a workaround"), not the major one ("no workaround"). The
  contract violation in the doc comment is real and worth fixing.

---

### D-10 — Losing the target folder mid-download surfaces a raw Node stack trace
- **Verdict**: DOWNGRADED (the stack trace is exactly as quoted; severity overstated)
- **Severity**: minor (the original says major)
- **Runs**: 3 attempts (`d2-a`, `d2-b`, `d2-c`), 3 reproduced
- **What I did**: cold start, stub stalled 4 s so the download is genuinely in
  flight, marked 00:00:20 to 00:00:26 (verified the marks stuck), cut, deleted
  the clips folder 2.5 s in, then collected the on-screen text, looked for
  leftovers in the temp dir, and — the step the original did not take —
  recreated the folder and cut the same range again.
- **Proof**: `audit/run-1/verify/slice-2/v-d2-overwrite.cjs` (part 3);
  `out/d2-{a,b,c}/results.json`, `out/d2-c/folder-lost/*.png`. Verbatim, in a
  `role="alert"` beside a "Copy diagnostics" button:
  ```
  Error: ENOENT: no such file or directory, rename '/tmp/ytclip-a453005ea7f80c8d/clip.mp4'
    -> '/tmp/v-d2-folderlost-IqjPL2/Clips/AUD-stub0000001-01.mp4'
    | at async Object.rename (node:internal/fs/promises:782:10)
    | at async /home/user/stream-trimmer/electron/main.cjs:486:9
    | at async WebContents.<anonymous> (node:electron/js2c/browser_init:2:87023)
  ```
  The temp folder is left behind with `clip.mp4` still in it, and the UI offers
  no route to that file — both as described.
- **Why the original's severity is wrong**: the app detects the failure, loses
  nothing on disk and stays usable. Run c proves recovery: after the error I
  recreated the folder, marked the same range and cut again, and the clip saved
  normally (`recoveredAfterRecreatingFolder: true`, clips folder
  `["AUD-stub0000001-01.mp4"]`). What is wrong is the *message* — an errno and
  a Node stack where a sentence belongs — which is the minor row. (It is the
  same class as D-19, which the same area filed as minor.)

---

### G-4 — A multi-range clip contains footage from before the in-point, because the concat demuxer ignores the edit list the cut created
- **Verdict**: CONFIRMED — and it is wrong content, not merely a long clip
- **Severity**: major (same as the original)
- **Runs**: 2 pipeline runs (`g4-a`, `g4-b`) + 3 end-to-end runs through the
  real server (`g6-a`, `g6-c`, `g6-d`); all 5 reproduced, byte-for-byte
  identical numbers
- **What I did**:
  1. Transcribed the trim arguments from `server/index.ts:1628-1657` myself and
     asserted the source still contains that exact sequence
     (`trimArgsMatchSource: true`), so my reproduction cannot drift from the
     product.
  2. Cut the two pieces with the ffmpeg the app bundles
     (`resources/bin/ffmpeg`).
  3. Read the `elst` box out of each piece **with my own mp4 box walker**, so
     the edit list is read from the bytes rather than inferred from a duration.
  4. Joined with the production `joinSegments` / `concatCopyArgs` /
     `concatReencodeArgs`, imported unchanged from `server/segments.ts`.
  5. Identified every delivered frame by decoded-frame md5 (`ffmpeg -f
     framemd5`) against a map of all 750 source frames, so each frame in the
     output is attributed to an exact source timestamp. That is what decides
     "wrong content" versus "slightly long".
  6. Ran the same marks end to end through the real server, with my stub 403ing
     only the sectioned download so the job takes the whole-file + local-trim
     path with real ffmpeg.
- **Proof**: `audit/run-1/verify/slice-2/v-g4-editlist.ts`,
  `out/g4-{a,b}/report.json` and the media in `out/g4-a/`;
  `audit/run-1/verify/slice-2/v-g6-duration.cjs`, `out/g6-{a,c,d}/results.json`.

  Fixture: 30.000 s, 25 fps, 750 frames, keyframes at 0 / 10 / 20 s; all 750
  frame fingerprints unique.
  Marks `[0.50–2.25]` + `[10.10–12.35]` = **4.00 s = 100 frames**.

  ```
  piece 1 (marked 1.75s)  player sees 1.78s / 44 frames
                          bytes hold  2.28s / 57 frames   first packet pts -0.520000
                          elst (video trak): media_time 6400 /12800 = 0.500s skipped
  piece 2 (marked 2.25s)  player sees 2.26s / 56 frames
                          bytes hold  2.368435s / 59 frames  first packet pts -0.120000
                          elst (video trak): media_time 1280 /12800 = 0.100s skipped
  each piece ON ITS OWN   : every decoded frame is inside its marked range
                            (44 frames from 0.52s; 56 frames from 10.12s) — 0 pre-roll
  concat-copy join        : 4.540000s, 115 frames (ffprobe), 116 raw
                            the joined file's own elst hides only 256/12800 = 0.020s
  production joinSegments : copy rejected ("joined file is 4.54s, expected 4.00s")
                            -> re-encode 4.56s / 114 frames, durationOk false
  ```

  Frame identity of the delivered clip (copy join, 114 decoded frames):

  ```
  frames from inside the marked ranges     : 100   (exactly the 100 marked)
  frames from BEFORE an in-point           :  14
       0.04 0.08 0.12 0.16 0.20 0.24 0.28 0.32 0.36 0.40 0.44 0.48   (in-point 0.50)
       10.00 10.08                                                   (in-point 10.10)
  frames from after an out-point           :   0
  frames not uniquely identified           :   0
  first delivered frame                    : source 0.04s
  i.e. the clip starts 0.46s BEFORE the user's in-point
  ```

  End to end through the real server, three runs, identical every time:
  ```
  POST /api/download  segments [{0.5,2.25},{10.1,12.35}]  quality 360  deliver path
    -> 200  {"path":…,"size":108452,"segments":2,"joinMethod":"reencode"}
       delivered 4.56s / 114 frames for a 4.00s request
       server log: stream copy rejected (joined file is 4.54s, expected 4.00s); re-encoding
                   re-encode done (4.56s, expected 4.00s, STILL OFF)
                   joined clip is 4.56s, expected 4.00s even after reencode
  control, keyframe-aligned marks [0-10]+[10-20] on the same path:
    -> 200  joinMethod "copy", 20.0238s for 20.00s, no overshoot of consequence
  ```

- **Precise answer to "how many frames and seconds are wrong"**: **14 frames /
  0.56 s of footage the user never marked, every one of it from before an
  in-point** — 12 frames (0.48 s) at the head of the clip and 2 frames (0.08 s)
  at the seam. The delivered file measures 4.54 s (copy) or 4.56 s (the
  re-encode the server actually ships) against 4.00 s marked, and ffprobe
  counts 115 frames in it against 100 marked. **A user would see wrong
  content**, not just a slightly long clip: the clip opens on half a second of
  the shot before the one they marked, and the cut between the two ranges
  arrives 0.08 s early.
- **Disproof attempts that failed to disprove it**: the numbers are identical
  on the bundled ffmpeg 6.0 and the system ffmpeg 6.1.1, so it is not a build
  artefact; each piece in isolation is correct, so it is not a bad cut; the
  frames are uniquely identified against the source, so it is not rounding or a
  duplicated frame; and the keyframe-aligned control on the same code path is
  clean, which isolates the cause to a non-keyframe in-point with `-ss` before
  `-i` and `-c copy`.
- **Scope, as the original says**: this is the whole-file + local-trim path.
  The primary sectioned path passes `--force-keyframes-at-cuts`
  (`server/index.ts:1375-1376`) and cannot be exercised here — **not provable
  here**. The fallback is reached whenever the sectioned URLs 403, which
  `server/index.ts:1514-1522` treats as routine.
- **Original's numbers**: "4.54 s / 115 frames / 15 frames / 0.540 s". The
  4.54 s and 115 are exactly right. The "15 frames / 0.540 s" is the
  duration-arithmetic version; by frame identity the unmarked footage is 14
  frames / 0.56 s. A one-frame difference, in the same direction — the
  write-up's conclusion stands.

---

### G-6 — A joined clip the server knows is the wrong length is delivered as a plain success
- **Verdict**: CONFIRMED
- **Severity**: major (same as the original)
- **Runs**: 3 valid attempts (`g6-a`, `g6-c`, `g6-d`), 3 reproduced (`g6-b` was
  invalidated by the orphaned-server trap described above and is not counted)
- **What I did**: drove `POST /api/download` against the real server in three
  shapes and read the status, the whole body, every `X-` header and the file's
  real duration: (R) the realistic one — two sub-second ranges on the
  local-trim path, 4.00 s marked; (S) the original's shape — three 5 s ranges
  with the stub writing the whole fixture per segment; (C) a keyframe-aligned
  control.
- **Proof**: `audit/run-1/verify/slice-2/v-g6-duration.cjs`;
  `out/g6-{a,c,d}/results.json`, delivered media in `out/g6-*/`.
  ```
  R  200  {"path":…,"size":108452,"segments":2,"joinMethod":"reencode"}
         bodyHasWarningField false   anyDurationHeader false
         x-headers: x-auth-mode, x-available-heights, x-delivered-audio-kbps,
                    x-delivered-height, x-join-method, x-segments   (no duration, no warning)
         delivered 4.56s for 4.00s marked
  S  200  delivered 90.04s for 15.00s marked, same body shape, no warning
  C  200  joinMethod "copy", 20.02s for 20.00s — the server is right to say nothing
  ```
  The server states the problem three times in its own log in both R and S and
  says nothing to the client. I also checked the other direction: nothing in
  the renderer reads `X-Join-Method` or `X-Segments`, and nothing re-probes the
  delivered file (`grep` over `src/` finds no reader), so there is no second
  chance for the user to be told. `durationOk` is read once at
  `server/index.ts:1738` and dropped; `warning` in the body is only ever the
  low-quality case.
  The original flags its own 6x figure as a stub artefact, and that is correct
  — but run R shows the defect on a realistic 0.56 s overshoot produced by real
  ffmpeg, so the finding does not rest on the artefact.
- **Note for the action plan**: G-6 is the reporting half of G-4. Fixing G-4
  removes most occurrences; G-6 is still a separate fix, because the re-encode
  can miss the expected length for other reasons and the client is told nothing
  then either.

---

### G-8 — Clear cache deletes the finished clip the server just told the client to collect, and destroys a running job's work folder
- **Verdict**: CONFIRMED
- **Severity**: major (same as the original)
- **Runs**: 3 valid attempts (`g89-a`, `g89-c`, `g89-d`), 3 reproduced
  (`g89-b` invalidated by the orphaned-server trap, not counted)
- **What I did**: every section on its own server with its own private
  `TMPDIR`, so the counts mean something and no other helper's folders are in
  scope. (A2) downloaded with `deliver:"path"`, snapshotted the returned file,
  called `/api/cache/clear`, snapshotted again. (A) cleared while a
  single-segment job was in flight. (A3, mine) cleared while a **three**-segment
  job had already written `seg-01.mp4` — the case that decides whether the
  live-job half costs the user anything. Plus a decoy control.
- **Proof**: `audit/run-1/verify/slice-2/v-g89-cache.cjs`;
  `out/g89-{a,c,d}/results.json`.
  ```
  A2  200 path /tmp/<private>/ytclip-63655478d9384cdb/clip.mp4
      existsRightAfter200 : ino 1016956, 981457 bytes, sha 27902d56…
      /api/cache/clear    : {"ok":true,"removed":1,"folders":0,"bytes":0}
      existsAfterClear    : ENOENT            <- the handed-over clip is gone
  A   single-segment job, folder removed mid-flight: folderGoneImmediately true,
      but the job re-created it and still returned 200 with a playable clip
  A3  three-segment job, cleared with seg-01.mp4 on disk:
      folderGoneImmediately true
      -> 500 {"code":"join_failed","error":"The segments downloaded but could not be
              joined: …/list.txt: No such file or directory. Try again. …"}
      the whole download is lost
  control: a foreign ytclip-NOT-OURS-0000 is counted and deleted; a non-matching
           folder in the same temp dir is left alone
  ```
- **Two corrections, neither changing the verdict**:
  1. The write-up says "Clear cache is reachable from the settings popover".
     It is not: the only caller is the Downloads panel in the clips column
     (`src/components/DownloadsPanel.tsx:73-78`), and the button is labelled
     **"Clear partials"** above the line "<N> of partial downloads kept so a
     failed cut or export can resume." That makes the finding slightly worse,
     not better — the control promises partials and deletes finished clips.
  2. "Destroys a running job's work folder" is literally true in both of my
     live cases, but the consequence differs: a single-segment job silently
     re-creates the folder and still succeeds (A); a multi-segment job dies with
     `join_failed` and the user gets nothing (A3). Worth saying in the action
     plan so the fix is tested on the multi-segment path.
- **Shared root cause with E-2?** Yes, for half of it. Both are
  `server/resumeCache.ts: clearCache` (`cacheDirs()` globs the temp root by
  prefix with no in-use marker, no pid, no age check) deleting a folder
  something is actively using — `ytclip-` here, `ytchan-` there. One fix (an
  in-flight registry, or at minimum an age/marker check) closes the deletion in
  both. It does **not** close all of E-2: that finding's second half is
  `appendJsonl` swallowing the write errors and `writeCsvFromJsonl` reading
  "gone" as "empty", so the export still claims success. Fix `clearCache` once;
  E-2 needs its own second fix.

---

### G-9 — A damaged cached download permanently breaks that clip, and the error the user sees is ffmpeg's version banner
- **Verdict**: CONFIRMED
- **Severity**: major (same as the original)
- **Runs**: 3 valid attempts (`g89-a`, `g89-c`, `g89-d`), 3 reproduced
- **What I did**: ran one download to learn the keyed folder, deleted
  `clip.mp4`, planted a truncated `source.mp4` (the first third of the fixture
  — the shape an interrupted whole-file download that got renamed leaves),
  confirmed with ffprobe that it is not readable media, then asked for the same
  range three times with the sectioned run 403ing so the job takes the
  local-trim path. Then cleared the cache and asked once more.
- **Proof**: `audit/run-1/verify/slice-2/v-g89-cache.cjs` (section G-9);
  `out/g89-{a,c,d}/results.json`.
  ```
  planted source.mp4 : 327152 bytes, ffprobe "moov atom not found"
  attempt 1 : 500   files left in the folder: ["source.mp4"]
  attempt 2 : 500   identical (identical after stripping ffmpeg's memory addresses)
  attempt 3 : 500   identical
  error / cause seen by the UI, verbatim first line:
      "libavformat    60.  3.100 / 60.  3.100\n  libavdevice …"
  action offered    : {"id":"retry","label":"Try again"}
  mentions cache or damage : false
  after POST /api/cache/clear : 200, a fresh playable clip
  ```
  The corrupt source survives every retry (`pruneWorkDir` keeps `source.*` as
  resumable data), `findDownloaded()` never checks it is media, and the only
  thing that unsticks it is the one control the message does not mention. The
  offered action, "Try again", is the one thing that cannot work.

---

### G-12 — A settings.json that fails to parse is silently replaced with an empty one
- **Verdict**: CONFIRMED — and it is worse than the write-up says
- **Severity**: blocker (the original says major; by the audit's own bar,
  "loses data" is the blocker row, and this loses the entire clip bank)
- **Runs**: 2 attempts (`g12-a`, `g12-b`), 2 reproduced, identical
- **What I did**: part 1 drove `electron/settingsStore.cjs` directly over twelve
  file shapes holding a real `clipper.bank`, `clipper.campaigns`,
  `clipper.clipsDir` and `clipper.saveDirNames`, recording inode/size/sha256
  before and after and listing the whole directory afterwards so "no backup" is
  a measurement. Part 2 is the step the original did not take: put a
  BOM-prefixed (otherwise perfectly valid, fully recoverable) settings.json in
  front of the **real app** at a cold start and watch what a session does to it.
- **Proof**: `audit/run-1/verify/slice-2/v-g12-settings.cjs`;
  `out/g12-{a,b}/results.json`, `out/g12-a/*.png`.

  Part 1, module level (every row: `load` did not throw, no backup written):
  ```
  valid object with real data    keys 8  bank 2      -> on disk after one set(): bank 2
  invalid JSON (trailing comma)  keys 0  bank null   -> bank null
  invalid JSON (truncated)       keys 0  bank null   -> bank null
  a JSON array                   keys 0  bank null   -> bank null
  valid object, BOM prefixed     keys 0  bank null   -> bank null
  valid object + trailing junk   keys 0  bank null   -> bank null
  empty / whitespace / null / "hi" / 42              -> bank null
  2MB bank (20000 rows)          keys 8  bank 20000  -> bank 20000   (round trips)
  backups, every row: []
  ```

  Part 2, the real app, cold start, BOM-prefixed file with a 2-row bank,
  campaigns, clipsDir and saveDirNames:
  ```
  seeded 733 bytes, bank 2 rows
  right after boot, BEFORE I touched anything:
      file is 160 bytes, new sha, bank null, still the user's file: false
  after one ordinary settings:set through the product's own bridge:
      196 bytes, keys ["clipper.workspaces","clipper.dataDirConfirmed"]
  after close: unchanged; bank null
  backups anywhere in the user data dir: []
  ```
  So the user's bank, campaigns, folders and folder nicknames are gone **before
  the user does anything at all** — the renderer's own first `writeSetting`
  during boot is enough, so the "make one ordinary set()" step in the original
  is not even needed. Nothing is moved aside, nothing is said, and the original
  file was recoverable by hand (a BOM is what a Windows editor adds on save).
  Severity note: the trigger is a file damaged by something outside this app —
  `persist()` is an atomic temp+rename, so the app does not produce the state
  itself. But the destruction is the app's own act, it is automatic, and the
  data is unrecoverable, which is the blocker row.

---

## Summary

| ID | Verdict | Severity (mine) | Original | Runs |
|---|---|---|---|---|
| D-2 | CONFIRMED | blocker | blocker | 3/3 |
| D-4 | CONFIRMED | major | major | 3/3 |
| D-5 | CONFIRMED | major | major | 3/3 |
| D-6 | CONFIRMED | major | major | 2/2 |
| D-7 | DOWNGRADED | **minor** | major | 2/2 |
| D-8 | DOWNGRADED | **minor** | major | 2/2 |
| D-9 | DOWNGRADED | **minor** | major | 2/2 |
| D-10 | DOWNGRADED | **minor** | major | 3/3 |
| G-4 | CONFIRMED | major | major | 5/5 |
| G-6 | CONFIRMED | major | major | 3/3 |
| G-8 | CONFIRMED | major | major | 3/3 |
| G-9 | CONFIRMED | major | major | 3/3 |
| G-12 | CONFIRMED | **blocker** | major | 2/2 |

**13 findings: 9 confirmed, 4 downgraded, 0 refuted, 0 flaky, 0 duplicates.**
Every one of the 13 is a real defect; none was an artefact of the harness, the
stub or Linux. Four severities move: D-7, D-8, D-9 and D-10 down to minor,
G-12 up to blocker.

**Duplicate questions, answered.** D-6 and D-7 are two distinct holes that one
containment helper closes, applied at three sites
(`electron/main.cjs:502-522`, `:525-554`, `electron/exportSave.cjs:41-43`) —
file them separately, fix them together. G-8 and E-2 share the deletion half of
their root cause (`server/resumeCache.ts: clearCache` has no in-use marker);
one fix there closes both deletions, but E-2 keeps a second defect of its own.

## Scripts

| Script | Covers |
|---|---|
| `audit/run-1/verify/slice-2/vlib.cjs` | my yt-dlp stub (with `failSectioned`), server launcher (free port, process-group kill) |
| `audit/run-1/verify/slice-2/vapp.cjs` | app launcher (raw settings.json, synthetic cookie file, inode/sha snapshots, UI driving) |
| `audit/run-1/verify/slice-2/v-g4-editlist.ts` | G-4 pipeline: elst box walk + frame-identity attribution |
| `audit/run-1/verify/slice-2/v-g6-duration.cjs` | G-6 and G-4 end to end through the real server |
| `audit/run-1/verify/slice-2/v-d2-overwrite.cjs` | D-2, D-10 |
| `audit/run-1/verify/slice-2/v-d458-handoff.cjs` | D-4, D-5, D-8 |
| `audit/run-1/verify/slice-2/v-d67-paths.cjs` | D-6, D-7 |
| `audit/run-1/verify/slice-2/v-d9-batch.ts` | D-9 |
| `audit/run-1/verify/slice-2/v-g89-cache.cjs` | G-8, G-9 |
| `audit/run-1/verify/slice-2/v-g12-settings.cjs` | G-12 |

Media, screenshots and `results.json` are under
`audit/run-1/verify/slice-2/out/` (gitignored like every other area's `out/`,
so read them in place or re-run the script).
