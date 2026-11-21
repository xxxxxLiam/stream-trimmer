# Area E — Channel data exporter and the owner gate

Scope: `src/components/ChannelExportPanel.tsx`, `src/context/ChannelExportContext.tsx`,
`src/hooks/useChannelExport.ts`, `src/lib/channel.ts`, `src/lib/ownerGate.ts`,
`server/channelRoutes.ts`, `server/channelRoutes.stub.ts`, `server/csv.ts`,
`scripts/build-server.cjs`, `vite.config.ts`. No product code was changed.

Everything below was run against the **production shape** (built renderer in
`dist/`, esbuild-bundled server in `electron/dist/server.cjs`, real Electron main
process) with a scripted `yt-dlp`. Four build shapes were produced and kept so
anyone can re-grep them:

| shape | `VITE_ENABLE_CHANNEL_DATA` | `VITE_OWNER_MACHINES` |
|---|---|---|
| `public` | unset | — |
| `owner-match` | 1 | this machine's salted hash |
| `owner-nomatch` | 1 | a hash for a different machine |
| `owner-star` | 1 | `*` |

Salt used: `audit-salt-E-2026-7f3a`. This machine's `/etc/machine-id` is
`02c0ff32d11f4f6ea20de4b2a2924cdc`, so its hash is
`9e7ecc4b1ebadc8b3bcae2d3a96c5605d4615739b41515ca16f6e4e19938e2c3`.

Scripts: `audit/run-1/area-E/scripts/`. Snapshotted builds:
`audit/run-1/area-E/builds/<shape>/`. Captured output and screenshots:
`audit/run-1/area-E/out/`.

Reproduce a shape with
`bash audit/run-1/area-E/scripts/build-shape.sh <shape>`, install it with
`use-shape.sh <shape>`, and run any `tN-*.cjs` under
`xvfb-run -a --server-args="-screen 0 1440x900x24" node …`.

---

## Findings

### E-1  The public build still tells you the channel exporter exists
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. `bash audit/run-1/area-E/scripts/build-shape.sh public` (no
     `VITE_ENABLE_CHANNEL_DATA`, no owner list, no salt).
  2. `grep -c -F 'Channel data' audit/run-1/area-E/builds/public/dist/assets/index-*.js`
  3. `grep -n -i owner electron/preload.cjs electron/machineId.cjs electron/main.cjs`
- **Expected**: a public build contains no trace of the feature. The owner's
  requirement is "I don't even want them to even know that you can download
  channel data", and the brief's rule for this area is that a leaked string in
  the public bundle is a blocker.
- **Actual**: the exporter's panel, its API URLs, the machine list and the salt
  are all genuinely gone (counts below), but its **entry point survives dead-code
  elimination** and the owner gate ships in full as plain `.cjs`:

  ```
  === PUBLIC renderer: dist/assets/index-CQ1UlzNM.js ===
  Channel data               1
  ui-channel-link            1
  Back to clipping           1
  onScreen("channel")        1
  screen==="channel"         1
  channelAvailable           2
  ```

  verbatim, from the shipped file:

  ```js
  e.channelAvailable&&e.screen==="workspace"&&c.jsxs("button",{type:"button",
  id:"ui-channel-link",className:"link-quiet",onClick:()=>e.onScreen("channel"),
  children:[c.jsx(OP,{}),c.jsx("span",{children:"Channel data"})]})
  ```
  ```js
  e.screen==="channel"&&c.jsx("button",{type:"button",className:"link-quiet",
  onClick:()=>e.onScreen("workspace"),children:"Back to clipping"})
  ```

  `AppHeader` takes `channelAvailable` as a prop, so Vite's `define` of
  `__CHANNEL_DATA__ = false` cannot fold the branch away — only `ChannelExportPanel`
  and `ownerGate`'s IPC call get dropped. `electron-builder`'s `files` list is
  `electron/**/*` with only `*.ts` and `*.map` excluded, so the packaged app also
  carries, uncompiled and commented:

  ```
  electron/preload.cjs:46:  // Owner gate. Main hashes the local machine id with the supplied salt and
  electron/preload.cjs:48:  isOwnerMachine: (list, salt) => ipcRenderer.invoke("owner:check", list, salt),
  electron/machineId.cjs:3:  // main process (to answer "is this an owner machine") and by
  electron/main.cjs:716:   // Owner gate: is this computer on the build's allowlist? Answers a boolean
  ```

  Anyone who runs `strings` on the app, or types "channel" into the devtools
  Sources search, learns that a hidden "Channel data" screen exists and that
  there is an owner allowlist. It grants no access by itself (E-4 and E-6 are
  what do), but it defeats the stated purpose of the feature flag.

  Clean, for the record — these are **0** in the public renderer *and* the public
  server: `api/channel/export`, `api/channel/export/cancel`,
  `api/channel/export/progress`, `Channel profile exporter`, `Export channel`,
  `What to export`, `Top 50 per video`, `youtube.com/@channelhandle`,
  `videos.csv`, `transcripts.csv`, `summary.csv`, `video-status.csv`,
  `subscriber_count`, `hashtags_in_title`, `includeTranscripts`, the salt and
  both machine hashes. The public `server.cjs` holds only the empty stub
  (`function registerChannelRoutes(_app, _deps) {}`) and the call site. No
  `.map` or `.ts` files reach any `dist/`. The resolve-plugin layer in
  `scripts/build-server.cjs` is solid; the `define`/DCE layer is not.
- **Proof**: `audit/run-1/area-E/out/grep-diff.txt` (full four-shape matrix),
  `audit/run-1/area-E/out/public-leak-evidence.txt`,
  `audit/run-1/area-E/out/t1-public/01-public-header.png`
- **Suspected file**: `src/App.tsx` (passes `channelAvailable` into `AppHeader`,
  so `vite.config.ts`'s `define` cannot eliminate it); `package.json` `build.files`

### E-2  "Clear cache" during an export silently empties comments.csv and transcripts.csv, then says "Export saved"
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. Owner build. Export a 10-video channel with all three parts on.
  2. While the panel reads "Comments and transcripts, video 4 of 10", clear the
     temp cache (`POST /api/cache/clear` — the Settings "Clear cache" button).
  3. Let the export finish and open the folder it saved.
- **Expected**: either the cache tool refuses to touch a live export's working
  folder, or the export notices and fails loudly. Hours of collection must not
  evaporate behind a success message.
- **Actual**: `/api/cache/usage` counts the live checkpoint folder as reclaimable
  (`{"folders":6,"bytes":4916531}`), `clear` removes it
  (`{"ok":true,"removed":6,...}`), and the export **carries on and reports
  success**:

  ```
  phaseAtClear : "Comments and transcripts, video 4 of 10"
  result       : "Export saved — 10 videos · 0 comments · 0 transcript lines"
  errorBanner  : null
  rows on disk : videos 10, comments 0, transcripts 0
  summary.csv  : exported=10, cancelled=false, included="video details; comments; transcripts"
  ```

  `appendJsonl` swallows the write errors by design ("a failed checkpoint must
  never fail the export itself"), and `writeCsvFromJsonl` treats a missing source
  as "nothing was collected for this file", so both expensive parts vanish and
  `summary.csv` — the file the UI calls "the run's receipt" — states they were
  collected. The resume point is gone too, so the only recovery is a full re-run.
- **Proof**: `audit/run-1/area-E/out/t7-resume/report.json` (`cacheClear`),
  `audit/run-1/area-E/out/t7-resume/01-after-cache-clear.png`,
  script `audit/run-1/area-E/scripts/t7-resume.cjs`
- **Suspected file**: `server/channelRoutes.ts` (checkpoint dir has no in-use
  marker), `server/resumeCache.ts` (`clearCache` sweeps every `ytchan-` folder),
  `server/csv.ts` (`writeCsvFromJsonl` cannot distinguish "empty" from "gone")

### E-3  Two exports at once corrupt each other: one gets duplicated rows, the other gets empty CSVs — both claim success
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. Owner build, stub set to 4 videos with one comment and one caption each.
  2. Fire two exports of the *same* request at the same time (two jobIds,
     identical url / contentType / limit / parts, `deliver: "path"`).
  3. Read the CSVs each response points at.
- **Expected**: the second run is refused, or queued, or given its own working
  folder. Neither result may be silently wrong.
- **Actual**: `workDir()` keys the checkpoint folder on
  `[base, contentType, limit, includeVideoDetails, includeComments, includeTranscripts]`
  — not on the jobId — so both runs append to the same `comments.jsonl` and
  `transcripts.jsonl`, and whichever finishes first calls `clearCheckpoint()`
  (`fs.rmSync`) on the folder the other is still streaming from:

  ```
  race-A: counts {videos:4, comments:7, transcripts:7}   <- 4 collected, 7 written
  race-B: counts {videos:4, comments:0, transcripts:0}   <- header-only CSVs
  checkpoint folder afterwards: ENOENT
  ```

  race-A's `comments.csv`, verbatim — every row duplicated:

  ```
  "vid0000000","c1","","false","A","UC1","hello","1","false","false","",""
  "vid0000000","c1","","false","A","UC1","hello","1","false","false","",""
  "vid0000001","c1","","false","A","UC1","hello","1","false","false","",""
  "vid0000001","c1","","false","A","UC1","hello","1","false","false","",""
  ...
  ```

  race-B's `comments.csv` is the BOM and the header line and nothing else, while
  its `summary.csv` says:

  ```
  "Stub Channel","https://…/@stubchannel","4242","…","all","10","4","false","video details; comments; transcripts"
  ```

  i.e. four videos exported, not cancelled, comments and transcripts included.
  Because the destination folder name is channel + date only (E-5), both runs
  also save into the same folder, so the empty result can overwrite the full one.
  There is no concurrency guard anywhere in `/api/channel/export`.
- **Proof**: `audit/run-1/area-E/out/t5-order/report.json`
  (`concurrentOutputs`, `concurrentCsvRows`, `concurrentCheckpointAfter`),
  script `audit/run-1/area-E/scripts/t5-order-races.cjs`
- **Suspected file**: `server/channelRoutes.ts` (`ckDir` key, `clearCheckpoint`,
  no per-folder lock)

### E-4  The owner gate has no server side: on a non-allowlisted machine the UI is hidden but the whole feature still works
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `build-shape.sh owner-nomatch` — the feature is compiled in, the allowlist
     holds a hash for a *different* computer.
  2. Launch. Confirm there is no "Channel data" entry and no panel.
  3. From the page: `POST /api/channel/export` with `deliver:"path"`, then hand
     the returned paths to `window.electronAPI.saveExport`.
- **Expected**: with the machine not on the list, the endpoints refuse. The
  inventory is explicit that both layers must hold "because either alone is
  bypassable by anyone who can open devtools".
- **Actual**: the gate is cosmetic. `registerChannelRoutes` is called whenever
  the build flag is on, and no handler ever asks who is calling:

  ```
  beforeAttack : { navHasChannel: false, visibleText: false }   <- hidden, as designed
  export call  : 200  {"jobId":"attacker-1", … "counts":{"videos":3,"comments":3,"transcripts":3}}
  saveExport   : { ok: true, path: "/tmp/area-E-save/t8-owner/stolen-channel-data" }
  on disk      : stolen-channel-data/{videos,comments,transcripts,summary,video-status}.csv
  ```

  `POST /api/channel/export/cancel` → `200 {"ok":true}` and
  `GET /api/channel/export/progress` → `200 text/event-stream` on the same
  machine. The app's own `export:save` bridge then writes the CSVs to any
  directory the caller names.

  Two attacks that **do** fail, and should be recorded as holding: writing every
  plausible owner key into `localStorage` and the settings store
  (`clipper.owner`, `clipper.ownerMachine`, `clipper.channelData`,
  `clipper.isOwner`, `owner`, `ownerAccess`, `CHANNEL_DATA`, `clipper.screen`)
  and reloading does not reveal the UI — there is no persisted owner key to
  forge; and `window.electronAPI.isOwnerMachine = async () => true` does not
  take, because `contextBridge` hands the renderer a frozen clone (the override
  reports as assigned but the function still answers `false`, and it does not
  survive a reload).
- **Proof**: `audit/run-1/area-E/out/t8-attack/report.json`
  (`owner-nomatch`: `attack1`, `attack2`, `attack4`),
  `audit/run-1/area-E/out/t2-gate/report.json`,
  `audit/run-1/area-E/out/t8-owner-nomatch/01-owner-nomatch-locked.png`
- **Suspected file**: `server/channelRoutes.ts` (`registerChannelRoutes` adds no
  authorization), `src/lib/ownerGate.ts` (documents this as an accepted limit)

### E-5  Re-exporting a channel the same day merges two runs into one folder, and summary.csv describes only the newer one
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Owner build. Export `@stubchannel` with all three parts. Note the folder.
  2. Without changing anything else, untick Video details and Comments and
     export the same channel again.
  3. Look at the folder.
- **Expected**: two runs produce two results, or the second run replaces the
  first cleanly. A folder must not mix them, and the receipt must not misdescribe
  its own contents.
- **Actual**: `buildExportFolderName()` is `<sanitised channel name>-export-YYYY-MM-DD`
  — no handle, no time, no counter — and `electron/exportSave.cjs` does
  `mkdir({recursive:true})` then renames the new files in. Files the second run
  does not produce are simply left in place:

  ```
  run 1 (everything)        -> comments.csv summary.csv transcripts.csv video-status.csv videos.csv
  run 2 (transcripts only)  -> transcripts.csv summary.csv video-status.csv
  final folder:
    comments.csv      599   mtime 18:39:48   <- run 1
    videos.csv       1383   mtime 18:39:48   <- run 1
    transcripts.csv   252   mtime 18:39:50   <- run 2
    summary.csv       242   mtime 18:39:50   <- run 2
    video-status.csv  260   mtime 18:39:50   <- run 2
  final summary.csv: exported=6, cancelled=false, included="transcripts"
  ```

  Nothing in the folder says `videos.csv` and `comments.csv` are stale. The same
  collision was reached from the other direction in the input matrix: ten
  successful exports of ten *different* channel URLs produced exactly one folder,
  each overwriting the last, because the stub reported the same channel name
  (`ls /tmp/area-E-save/t4/` → one entry). A real owner re-running a channel in
  the evening after the morning's run gets morning rows inside an evening export.
- **Proof**: `audit/run-1/area-E/out/t6-interrupt/report.json` (`mixed`),
  `audit/run-1/area-E/out/t6-interrupt/02-run2-done.png`,
  `audit/run-1/area-E/out/t11-stories/report.json` (`S6.folderFiles` vs
  `S6.summary`)
- **Suspected file**: `src/lib/channel.ts` (`buildExportFolderName`),
  `src/hooks/useChannelExport.ts` (passes that name straight to `saveExport`)

### E-6  `owner:check` is a hash oracle, and it is live in the public build
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Launch the **public** build (feature compiled out).
  2. From the page, with a salt of your own choosing:
     `window.electronAPI.isOwnerMachine([sha256("probe-salt:" + guessedMachineId)], "probe-salt")`
- **Expected**: a build without the feature has no owner gate to interrogate.
- **Actual**: `electron/main.cjs` registers `owner:check` unconditionally, and it
  hashes the local machine id with **a salt the caller supplies** and compares it
  against **a list the caller supplies**. Same answers in all four shapes:

  ```
  present:                  true     (public build included)
  withRealHash:             true     <- forged list, real salt
  withOtherHash:            false
  oracleGuessRight:         true     <- caller-chosen salt "probe-salt"
  oracleGuessWrong:         false
  withEmptyList/EmptySalt:  false
  ```

  So any page script can (a) learn an owner gate exists in a build that is
  supposed to contain no trace of the feature, and (b) confirm or brute-force the
  machine id behind it without the real salt, one guess per call. The handler is
  honest about one thing: it only ever returns a boolean — the raw machine id and
  its hash never cross the bridge, in any shape, which is the one part of the
  design that holds exactly as documented.
- **Proof**: `audit/run-1/area-E/out/t2-gate/report.json` (`bridge` block for
  every shape), `audit/run-1/area-E/out/t8-attack/report.json` (`attack3`)
- **Suspected file**: `electron/main.cjs` (`owner:check` handler takes the salt
  from the renderer and is registered regardless of the build flag)

### E-7  CSV formula injection: a comment starting with `=` is written unescaped
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Owner build, stub scripted with a comment whose text is `=cmd reply` and a
     caption whose text is `=1+1, "quoted" caption 🎬 עברית`.
  2. Export. Run `node audit/run-1/area-E/scripts/csv-check.cjs <folder>`.
  3. Open `comments.csv` in Excel, Google Sheets or LibreOffice.
- **Expected**: untrusted text that a spreadsheet would read as a formula is
  neutralised (a leading `'` or tab, or the cell prefixed) before it is written.
- **Actual**: the only defence is quoting, in both copies of the writer
  (`src/lib/channel.ts` `rowsToCsv` and `server/csv.ts` `csvCell`, both with the
  comment "Every field is quoted, so nothing in the data needs escaping beyond
  the quote character itself"). Quotes are CSV syntax and are stripped before the
  cell is evaluated, so a leading `=` `+` `-` `@` is still a formula:

  ```
  formulaCells : 6
  formulaColumns: ["comments.csv/text", "transcripts.csv/text"]
  comments.csv    row 3  column text  firstChar "="  value "=cmd reply"
  transcripts.csv row 2  column text  firstChar "="  value "=1+1, \"quoted\" caption 🎬 עברית"
  ```

  Comment text and caption text are arbitrary third-party input, so the payload
  is chosen by whoever leaves the comment, not by the owner. The classic DDE form
  (`=cmd|' /C calc'!A1`) and exfiltration forms (`=HYPERLINK(...)`,
  `=WEBSERVICE(...)`) all pass through unchanged.

  Everything *else* about the bytes is right, and the same script proves it: a
  from-scratch RFC 4180 parser read every file back with **0 round-trip failures**
  across a comma, a doubled quote, an embedded newline, emoji and RTL text —

  ```
  videos.csv:title        EXACT MATCH    ("Comma, then ""quoted"", then =SUM… 🎬 … שלום עולם")
  videos.csv:tags         EXACT MATCH
  comments.csv:text       EXACT MATCH    (embedded LF inside a quoted field)
  comments.csv:author     EXACT MATCH    ('A, "B" 😀')
  transcripts.csv:text    EXACT MATCH
  video-status.csv:title  EXACT MATCH
  ```

  — with a UTF-8 BOM, CRLF row endings and no ragged rows in any of the five files.
- **Proof**: `audit/run-1/area-E/out/csv-check.json`,
  `audit/run-1/area-E/out/csv-evidence/*.csv` (the actual bytes),
  script `audit/run-1/area-E/scripts/csv-check.cjs`
- **Suspected file**: `server/csv.ts` (`csvCell`), `src/lib/channel.ts`
  (`rowsToCsv`)

### E-8  A cancel that lands before the POST turns the next export into a silent empty success
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Owner build. `GET /api/channel/export/progress?jobId=J` (this is exactly
     what `useChannelExport.startExport` does *before* it POSTs).
  2. `POST /api/channel/export/cancel` with `{"jobId":"J"}`.
  3. `POST /api/channel/export?jobId=J` with a valid channel.
- **Expected**: a cancel for a job that has not started is either rejected or
  does not apply to a later export, and an export that collects nothing is
  reported as an error, not as a saved result.
- **Actual**: `GET /progress` calls `getOrCreateChannelJob`, so the cancel finds
  a job to mark; `POST /export` then calls `getOrCreateChannelJob` for the same
  id and inherits `cancelled: true`:

  ```
  cancel : 200 {"ok":true}
  export : 200 {"jobId":"poisoned-job-1","cancelled":true,
                "channel":{"name":"https://www.youtube.com/@stubchannel", … "exported":0},
                "videos":[],"comments":[],"transcripts":[],"statuses":[]}
  ```

  `useChannelExport` does not distinguish this from a real partial result: it
  takes the 200, writes five CSVs that contain only headers, adds a row to the
  downloads list and renders **"Partial export saved"**. The client opens the SSE
  and the POST back to back, so a Stop click (or an in-flight cancel from a
  previous attempt reusing an id) inside that window hits this path; from devtools
  it is a one-line denial of service against every subsequent export.

  Related, and correct: `cancel` with no jobId → `400 {"error":"Missing jobId"}`;
  a null body → the same; cancelling twice → `200 {"ok":true}` both times;
  cancelling an id that never existed → `200 {"ok":true}` and no side effect;
  two concurrent POSTs with one jobId both complete normally (each returns a full
  4-video result); double-clicking Export runs exactly one export, because the
  button disables on `exporting`.
- **Proof**: `audit/run-1/area-E/out/t5-order/report.json` (`poison`,
  `doubleStart`, `cancelTwice`, `doubleClick`),
  `audit/run-1/area-E/out/t5-order/02-double-click-done.png`
- **Suspected file**: `server/channelRoutes.ts` (`getOrCreateChannelJob` on the
  cancel/progress paths, no job state machine), `src/hooks/useChannelExport.ts`
  (treats `cancelled:true, exported:0` as a saved result)

### E-9  The progress endpoint invents a job for any id, and never lets it go
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build. Run an export with `jobId=finished-job-1` to completion.
  2. `GET /api/channel/export/progress?jobId=finished-job-1` immediately, then
     again after 7 s.
  3. `GET /api/channel/export/progress?jobId=pure-fiction`.
- **Expected**: a finished job reports done (or 404); an unknown job is a 404.
- **Actual**:
  ```
  progressImmediately   : 200  data: {"phase":"done","current":4,"total":4}      <- correct
  progressAfterCleanup  : 200  data: {"phase":"listing","current":0,"total":0}
  progressNeverExisted  : 200  data: {"phase":"listing","current":0,"total":0}
  ```
  Once the 5 s `cleanupTimer` has deleted the job, the same URL reports a
  *fresh listing phase* — an export that is apparently just starting. A client
  that reconnects late (sleep, laptop lid, a dropped SSE) is told the run has
  restarted. Every such request also inserts a `ChannelJob` into the
  module-level `channelJobs` map with no cleanup timer (only `publishChannel`
  arms one), so an unbounded number of entries can be created from the page and
  never collected. The stream also stays open indefinitely: a plain
  `fetch(...).then(r => r.text())` against it never resolves.
- **Proof**: `audit/run-1/area-E/out/t5-order/report.json` (`finished`),
  `audit/run-1/area-E/out/t2-gate/report.json` (`endpoints.progress` for a
  jobId that never existed)
- **Suspected file**: `server/channelRoutes.ts` (`app.get("/api/channel/export/progress")`)

### E-10  Resume works, but nothing tells the user it happened
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build, stub at 1.5 s per call, 10 videos, all parts.
  2. Export. At "Comments and transcripts, video 4 of 10", `SIGKILL` the app.
  3. Relaunch and press Export with the same settings ("Start over" unticked).
- **Expected**: the UI says what it is reusing, and the result says how much of
  it came from an earlier attempt.
- **Actual**: the **mechanism is sound** — this is the one interruption path that
  behaves. The checkpoint survives the kill intact
  (`comments.jsonl` 3 lines, `transcripts.jsonl` 3, `statuses.jsonl` 3,
  `metadata.jsonl` 10, `selection.json`), the save folder is left empty so no
  partial CSVs are stranded, and the rerun logs
  `[server] channel export resuming with 3 video(s) already collected` and
  finishes at **10 videos / 10 comments / 10 transcripts / 10 status rows with
  zero duplicate rows**. Stop-then-restart behaves the same way (2 collected,
  then 10/10/10, no duplicates).

  What is missing is any sign of it. The `Resuming — 3 of 10 already collected`
  progress event is published once and overwritten by the next per-video event
  within milliseconds, so it was never on screen in either run
  (`resumeProgressText.resuming: null`, phase already
  `"Comments and transcripts, video 4 of 10"`). Nothing in the result panel or in
  `summary.csv` records that part of the data is from an earlier attempt, and
  `exported_at` is stamped with the rerun's time. A run that silently skips 3 of
  10 videos looks identical to one that collected all 10.
- **Proof**: `audit/run-1/area-E/out/t7-resume/report.json`
  (`beforeKill`, `afterKill`, `resumeProgressText`, `resumeServerLog`,
  `afterResume`, `cancelFlow`),
  `audit/run-1/area-E/out/t7-resume/01-resume-progress.png`,
  `audit/run-1/area-E/out/t7-resume/02-resume-done.png`
- **Suspected file**: `server/channelRoutes.ts` (the resume `publishChannel`
  call), `src/components/ChannelExportPanel.tsx` (result panel)

### E-11  The exporter's main input has no accessible name, and progress is never announced
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build. Open Channel data.
  2. Tab through the panel and read the accessibility properties of each control.
  3. Start an export and look for a live region or a progressbar role.
- **Expected**: every control has a name; the running progress is announced.
- **Actual**: keyboard operation itself is fine — all nine controls are reachable
  in source order and an export can be started and completed with the keyboard
  alone (tab to the URL field, type, tab to Export, Enter →
  `ranByKeyboard: true`). Three gaps:

  - The channel URL field has **no accessible name at all**:
    `{ ariaLabel: null, ariaLabelledby: null, labelFor: false, wrappedInLabel: false, title: null }`
    — only a placeholder, which disappears as soon as the owner types. A screen
    reader announces "edit, blank". Every other control in the panel gets its
    name from a wrapping `<label>` (`"Topby views"`,
    `"Video details, Title, description, views, likes, upload date"`,
    `"Start over (ignore saved progress)"`).
  - The All / Shorts / Long-form filter is three bare `<button>`s with no
    `aria-pressed` and no radiogroup, so the chosen filter is not announced. The
    adjacent "Everything" button does set `aria-pressed`, which makes the
    omission look accidental.
  - The progress panel has no `role="progressbar"`, no `aria-valuenow` and no
    `aria-live`. Scanning the whole page while an export ran found exactly one
    live region, the footer's `"0 saved"` — nothing from the exporter. The phase
    text ("Video details 0 of 3") and the animated bar are visual only, so a
    screen-reader user gets no feedback for the whole of a multi-hour run.
- **Proof**: `audit/run-1/area-E/out/t3-export/report.json`
  (`a11y`, `tabOrder`, `progressAria`),
  `audit/run-1/area-E/out/t11-stories/report.json` (`S14`),
  `audit/run-1/area-E/out/t3-export/04-in-progress.png`
- **Suspected file**: `src/components/ChannelExportPanel.tsx`

### E-12  yt-dlp's raw stderr and its exit code are shown to the user as the error message
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build, stub scripted to exit 1 with
     `ERROR: [youtube:tab] @gone: YouTube said: This channel does not exist.`
  2. Export `https://www.youtube.com/@gone`.
- **Expected**: a plain sentence and a next step.
- **Actual**: the banner reads, verbatim:
  ```
  ERROR: [youtube:tab] @gone: YouTube said: This channel does not exist.
  exitCode=1
  ```
  The useful sentence is buried between an extractor name and a process exit
  code, and there is no next step. Nothing is lost, which is the important half:
  the URL stays in the box, the Export button comes back, and the form is
  unchanged, so a retry is one click (`urlStillInTheBox:
  "https://www.youtube.com/@gone"`, `canTryAgain: true`). The same message is
  what the API returns (`{"error":"ERROR: [youtube:tab] @gone: … \nexitCode=1"}`).
  By contrast the exporter's *own* messages are good: "Paste a channel link like
  youtube.com/@handle", `Enter how many videos to export, or choose "Everything".`,
  `Export at least 10 videos, or choose "Everything".`,
  `10,000 is the most you can ask for by number — choose "Everything" instead.`,
  "No videos matched that filter on this channel.", "Pick at least one thing to
  export — video details, comments or transcripts."
- **Proof**: `audit/run-1/area-E/out/t11-stories/report.json` (`S15`),
  `audit/run-1/area-E/out/t11-stories/10-S15-channel-gone.png`,
  `audit/run-1/area-E/out/t9-edges/03-yt-dlp-failure.png`
- **Suspected file**: `server/channelRoutes.ts` (`fullErrMessage` straight into
  the 500 body), `src/hooks/useChannelExport.ts` (shows `data.error` raw)

### E-13  A malformed channel URL is silently rewritten instead of refused, and summary.csv then records the wrong channel
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build.
  2. `POST /api/channel/export` with
     `{"url":"https://www.youtube.com/@stub\nhttps://evil.invalid","limit":10}`.
  3. And with a 10,005-character URL:
     `"https://www.youtube.com/@" + "a".repeat(9980)`.
- **Expected**: both are refused with the same "that doesn't look like a channel
  link" message the other bad inputs get.
- **Actual**: both return **200** and run a full export. `channelBaseUrl` keeps
  only the first path segment, so the embedded second URL is absorbed into the
  handle and the export's own receipt records a channel that was never asked for:

  ```
  newline inside url : 200  channel.url = "https://www.youtube.com/@stubhttps:"
  url is 10k chars   : 200  channel.url = "https://www.youtube.com/@aaaa…"   (9,980 a's, passed to yt-dlp as argv)
  ```

  Pasted into the UI the newline case behaves the same way (an `<input>` turns
  the newline into a space, `isLikelyChannelUrl` accepts it, the export runs).

  The rest of the validation matrix is correct and worth recording as a pass —
  server side: empty url `400 Invalid url`, missing url `400 Required`, a watch
  URL `400 "That doesn't look like a channel link…"`, non-YouTube
  `400 "URL must be a YouTube link"`, `limit 0`/`-1`
  `400 "Number must be greater than or equal to 1"`, `limit 1.5`
  `400 "Expected integer, received float"`, `limit 10001`
  `400 "Number must be less than or equal to 10000"`, `limit "100"` as a string
  `400`, `contentType:"livestreams"` `400`, `deliver:"ftp"` `400`,
  `cookiesFromBrowser:"../../etc/passwd"` `400 Invalid input`, all parts off
  `400` with the UI's own wording. Client side: `@handle`, `/c/name`,
  `/user/name`, `/channel/UC…`, a `/shorts` tab link and a unicode handle
  (`@канал-日本語-🎬`) are all accepted and exported; a bare `youtube.com`,
  whitespace only, a watch URL and a non-YouTube URL are all refused with one
  clear sentence. Limit boundaries behave exactly at the edge: 9 refused, 10
  accepted, 10000 accepted, 10001 refused.
- **Proof**: `audit/run-1/area-E/out/t9-edges/report.json` (`api`),
  `audit/run-1/area-E/out/t4-inputs/report.json` (`ui`, `limits`)
- **Suspected file**: `server/channelRoutes.ts` (`channelBaseUrl`),
  `src/lib/channel.ts` (`isLikelyChannelUrl`)

### E-14  The exporter's working folders and its output folder share the resume cache's prefix, so one is counted and swept with the other
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build. Start a slow export; while it runs, `GET /api/cache/usage`.
  2. `SIGKILL` the app mid-export and list `/tmp` for `ytchan-*`.
  3. Call `POST /api/channel/export` with `deliver:"path"` directly (as E-4 does)
     and list `/tmp` again afterwards.
- **Expected**: a live export's working set is not advertised as reclaimable
  disk, and temporary output is cleaned up or clearly distinguishable.
- **Actual**: three different things all live in `os.tmpdir()` under
  `EXPORT_PREFIX = "ytchan-"` and `cacheDirs()` matches the prefix: the keyed
  checkpoint folder (`ytchan-7ad01575a4e6da64`), the per-video transcript scratch
  dir (`fs.mkdtempSync(… "ytchan-")` in `fetchTranscript`), and the CSV output
  dir for `deliver:"path"` (`fs.mkdtempSync(… EXPORT_PREFIX)` in
  `buildResponse`). So:
  - a running export reported `{"folders":6,"bytes":4916531}` of "cache", which
    "Clear cache" then destroyed (that is E-2);
  - a `SIGKILL` leaves the in-flight transcript dir behind — `ytchan-0aLi3V` was
    still there after the next export completed cleanly;
  - an export whose caller never calls `saveExport` leaves its whole CSV output
    dir behind (`/tmp/ytchan-Vc5Ppt`, `/tmp/ytchan-dxf92E` after the E-3 race).
    Through the UI this is fine, because `electron/exportSave.cjs` removes the
    temp folders after moving the files.

  Nothing here is lost data on its own; it is the mechanism underneath E-2.
- **Proof**: `audit/run-1/area-E/out/t7-resume/report.json`
  (`beforeKill.tmp`, `afterResume.tmp`, `cacheClear.usageBefore`),
  `audit/run-1/area-E/out/t5-order/report.json` (`tmpYtchan`)
- **Suspected file**: `server/resumeCache.ts` (`EXPORT_PREFIX`, `cacheDirs`),
  `server/channelRoutes.ts` (`fetchTranscript`, `buildResponse`)

### E-15  Rough edges in the form's numbers and messages
- **Severity**: polish
- **Status**: confirmed
- **Steps**: owner build, open Channel data, and in turn: type 7000 in the count
  box; clear the data folder from the seed; type 5 in the count box without
  pressing Export; call the API with no url.
- **Expected**: numbers a person can read, and a reason wherever a control is
  dead.
- **Actual**, all measured:
  - 7,000 videos reads **"A run of 7,000 videos takes about 1983 minutes."** —
    33 hours, quoted in minutes. 9,999 reads "about 2833 minutes".
  - With no data folder chosen the Export button is **disabled with no
    explanation** ("Data folder / Choose folder / Not set" and a dead button).
    `useChannelExport` has the right sentence — "Choose a save folder first" —
    but `blocked` disables the button so it can never be shown.
  - An out-of-range count shows only the generic "Set how many videos to export
    above." until Export is pressed; the specific reason ("Export at least 10
    videos…") arrives one click later. The count box is `type="number"`, so
    typing `abc` leaves it empty — `parseChannelLimit`'s "That video count isn't
    a number." branch is unreachable from the UI.
  - Raw Zod strings reach the API surface: `{"error":"Invalid url"}`,
    `{"error":"Required"}`, `{"error":"Invalid input"}`. The UI validates first so
    a person does not normally see them.
  - An empty channel is reported as "No videos matched that filter on this
    channel." even with the filter set to All.
- **Proof**: `audit/run-1/area-E/out/t10-count/report.json`,
  `audit/run-1/area-E/out/t9-edges/report.json` (`noFolder`, `api`),
  `audit/run-1/area-E/out/t9-edges/01-no-data-folder.png`,
  `audit/run-1/area-E/out/t10-count/04-transcripts-only.png`
- **Suspected file**: `src/components/ChannelExportPanel.tsx`,
  `src/lib/channel.ts` (`describeChannelLimit`), `src/hooks/useChannelExport.ts`

---

## User stories, run

Fifteen stories, each driven through the real app. "Ran in" names the script.

| # | Story | Ran in | Outcome |
|---|---|---|---|
| S1 | Owner sits down at her own machine and looks for the channel tool. | t11 | **Pass.** `owner-match` and `owner-star` both show the "Channel data" entry; the panel opens. |
| S2 | She exports her top 100 by views with everything on. | t11, t3 | **Pass.** Five CSVs in `Stub Channel-export-2026-11-21`, counts match, bytes round-trip. |
| S3 | She pastes the video link instead of the channel link. | t11, t4 | **Pass.** "Paste a channel link like youtube.com/@handle". |
| S4 | She clears the count box and presses Export. | t11, t10 | **Pass.** `Enter how many videos to export, or choose "Everything".` |
| S5 | She only wants five videos. | t11, t4 | **Pass.** `Export at least 10 videos, or choose "Everything".` |
| S6 | She wants captions only, for the whole channel. | t11 | **Partly.** The run is correct and the skip-work note appears, but the folder still holds the previous run's `videos.csv` and `comments.csv` while `summary.csv` says `included="transcripts"` — **E-5**. |
| S7 | She stops a two-hour run, goes to lunch, and restarts it. | t7 | **Partly.** Resume is correct (2 collected → 10/10/10, no duplicates) but invisible — **E-10**. |
| S8 | The app dies mid-export; she relaunches and re-exports. | t7 | **Partly.** Checkpoint survives the `SIGKILL`, resume completes cleanly, no partial CSVs stranded; still silent — **E-10**. |
| S9 | Disk is tight, so she clears the cache while the export runs. | t7 | **Fail.** "Export saved — 10 videos · 0 comments · 0 transcript lines", no error, lying summary — **E-2**. |
| S10 | She kicks off two exports at once. | t5 | **Fail.** One result has every row duplicated, the other has header-only CSVs; both summaries claim completeness — **E-3**. |
| S11 | She double-clicks Export. | t5 | **Pass.** One export runs; the button disables on `exporting`. |
| S12 | She lends her build to a friend whose machine is not on the list; the friend opens devtools. | t8, t2 | **Fail.** No UI, but the endpoints serve a full export and `export:save` writes it anywhere — **E-4**. Forging settings keys and monkey-patching the bridge both fail, as designed. |
| S13 | A public-release user searches the app for "channel". | t1, grep-diff | **Fail.** `dist/assets/*.js` still contains "Channel data", `ui-channel-link` and "Back to clipping"; `electron/*.cjs` ships the owner gate and its comments — **E-1**. The endpoints are genuinely absent (all three 404). |
| S14 | A keyboard-only owner runs an export without touching the mouse. | t11, t3 | **Partly.** The export completes by keyboard, but the URL field has no accessible name and progress is never announced — **E-11**. |
| S15 | She types a channel that no longer exists. | t11, t9 | **Partly.** Nothing lost, retry is one click, but the message is raw yt-dlp stderr plus `exitCode=1` — **E-12**. |

---

## Coverage

**Proven working** (recorded so the fix list does not disturb them):

- The resolve-plugin layer of the compile-out. The public `server.cjs` holds the
  empty stub and nothing else: `POST /api/channel/export`,
  `POST /api/channel/export/cancel` and `GET /api/channel/export/progress` all
  return **404** with Express's plain HTML body, no 401, no 500, no stack trace,
  while `GET /api/cache/usage` on the same instance returns 200 — so the server
  is up and the routes simply do not exist.
- The renderer's dead-code elimination of the *panel*: 0 occurrences of the
  exporter's API URLs, UI strings, CSV filenames, column names, the salt and both
  machine hashes in the public bundle. No `.map` or `.ts` files in any `dist/`.
- The gate's one-way answer. `owner:check` returns a boolean and only a boolean,
  in every shape; the raw machine id and its hash never cross the bridge.
- Gate state transitions: `*` shows the UI, a matching hash shows the UI, a
  non-matching hash hides it completely (no entry, no panel, no message).
- `contextBridge` immutability: `window.electronAPI.isOwnerMachine` cannot be
  replaced from the page, and no forged `localStorage`/settings key reveals the UI.
- Export end to end in the desktop shape: listing → ranking → metadata →
  comments → transcripts → five CSVs moved into the campaign's data folder, with
  a result panel, a "Show folder" button and a downloads entry.
- CSV bytes: UTF-8 BOM, CRLF, full quoting, doubled inner quotes, no ragged rows,
  and a 0-failure round-trip through an independent RFC 4180 parser for a comma,
  a quote, an embedded newline, emoji and RTL text.
- Input validation at both layers (the full matrix is in E-13), limit boundaries
  exactly at 9/10 and 10000/10001, the parts checkboxes including the
  "nothing selected" guard (button disabled + "Nothing selected. Tick at least
  one."), and the `Everything` toggle (number field disabled, `aria-pressed`,
  heavy-run warning).
- Cancel: stop mid-run writes the partial CSVs, marks `cancelled=true` in
  `summary.csv`, keeps the checkpoint, and the next run resumes it with no
  duplicate rows. Cancel twice, cancel an unknown job and cancel with no jobId
  are all handled.
- Resume after `SIGKILL`: checkpoint intact, 3 of 10 reused, final counts
  10/10/10, zero duplicates, no partial CSVs stranded in the save folder.
- Keyboard-only operation of the whole panel, including starting an export with
  Enter.

**Attacked and found holding**: forged allowlist via `localStorage`/settings
(8 key names), bridge monkey-patching, `*` injected through the IPC handler,
path traversal in `cookiesFromBrowser`, unknown extra body fields, bogus
`deliver`/`contentType` enums, and every public-build endpoint call.

**Attacked and found broken**: see E-1 through E-8.

## Not provable here

- **A real channel.** Every listing, metadata, comment and caption row came from
  the scripted `yt-dlp`; the network policy refuses `youtube.com`. So the shape
  of yt-dlp's real `--flat-playlist` output, the Videos-tab-vs-Shorts-tab ranking
  asymmetry that `listChannelTab` is built around, the `max_comments=50,50,0,0`
  extractor argument, real VTT quirks and real `channel_follower_count` are all
  **not provable here**. The code paths around them were exercised; the data was
  not real.
- **Scale.** `CANDIDATE_CAP` 20,000, `DEFAULT_LISTING_DEPTH` 3,000 and the
  `limit: "all"` memory story ("the browser holds the whole export in memory")
  were tested at the *validation* boundary (10 / 10,000 / 10,001 / "all"), not at
  volume. Whether a genuine 10,000-video, millions-of-caption-lines run stays
  inside memory is **not provable here** — it needs a real channel and hours.
- **The real owner's machine list.** The gate was proven with an audit salt and
  this container's `/etc/machine-id`. Whether the shipped `.env` list is correct,
  and whether `scripts/machine-id.cjs` prints a hash the build accepts on macOS
  or Windows, is **not provable here** (`readMachineId` takes the `ioreg` and
  `reg query` branches on those platforms; only the Linux branch ran).
- **The packaged artifact.** E-1's `electron/*.cjs` leak is argued from
  `package.json`'s `build.files` globs, not from an opened `.dmg`/`.exe`/
  `.AppImage` — installers and code signing are **not provable here**. The
  renderer half of E-1 is proven directly against the built `dist/assets/*.js`
  that `files` ships verbatim.
- **Excel, Sheets and LibreOffice actually evaluating the E-7 payloads.** The
  bytes are proven (six cells beginning `=`, quoting as the only defence); the
  spreadsheets are not installed here, so the final step of the formula-injection
  chain is reasoned, not run. The byte-level finding is `confirmed`; the
  consequence in a spreadsheet is the well-known behaviour of a leading `=`.
