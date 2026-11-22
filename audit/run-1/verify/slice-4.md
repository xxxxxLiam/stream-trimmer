# Slice 4 verification — sign-in (A), channel exporter (E), help (F)

Independent re-run of 16 findings. Every defect below was reproduced from a
**cold start** with a **fresh user-data dir**, at least **twice**, from scripts
I wrote myself out of each finding's Steps. I did not run the original
authors' scripts as primary evidence; where I cross-checked against theirs it
is said so.

## How I ran things

- **Frozen builds, not the repo's `dist/`.** Other helpers rebuild
  `dist/` and `electron/dist/server.cjs` mid-run (the repo's `dist/` was an
  *owner* build when I started). `mkmirror.cjs` builds four shapes into
  `/tmp/s4-<shape>` — `public`, `owner-star`, `owner-hash`, `owner-other` —
  by running the real `vite build` and the real `scripts/build-server.cjs`
  and snapshotting their artefacts. All app runs point `electron/main.cjs` at
  a mirror.
- **My own scriptable `yt-dlp`** (`mkstub.cjs`): logs every invocation's argv
  to `<root>/calls.log` (so processes can be counted), and scripts the auth
  probe (per `--cookies-from-browser` value), the `/api/info` probe, the
  download stage and the exporter's four call shapes independently. ffmpeg and
  deno stay real.
- **Harness substitutions, disclosed.** (1) For the cookies.txt *picker*
  route, Electron's `dialog.showOpenDialog` is replaced from the main process
  with one that resolves to a chosen path — Electron's dialog, not product
  code; `youtube:importCookies`, `importCookieFile`, `validateCookieText`, the
  atomic commit, `verifyImported` and the UI all run for real, and I ran the
  drag-and-drop route as well, which converges on the same `verifyImported()`.
  (2) `updater:status` payloads are sent over the real IPC channel with
  `app.evaluate` from the main process.
- **No product file was changed.** `git diff --name-only` and
  `git diff --cached --name-only` are both empty; everything I wrote is new
  under `audit/run-1/verify/slice-4/`. The only repo paths the builds touch
  are `dist/` and `electron/dist/server.cjs`, which are the real build
  scripts' own outputs and are gitignored.

Scripts: `audit/run-1/verify/slice-4/*.cjs`. Output, screenshots and logs:
`audit/run-1/verify/slice-4/out/`.

---

## Verdicts

| ID | Verdict | Severity (orig → mine) |
|---|---|---|
| A-1 | CONFIRMED | blocker → blocker |
| A-2 | CONFIRMED | major → major |
| A-3 | DOWNGRADED | major → minor |
| A-4 | DOWNGRADED | major → minor |
| A-5 | DOWNGRADED | major → minor |
| A-6 | DOWNGRADED | major → minor |
| E-1 | DOWNGRADED | blocker → minor |
| E-2 | CONFIRMED | blocker → blocker |
| E-3 | CONFIRMED | blocker → blocker |
| E-5 | CONFIRMED | major → major |
| E-8 | DOWNGRADED | major → minor |
| F-1 | DOWNGRADED | blocker → major |
| F-2 | DOWNGRADED | major → minor |
| F-3 | CONFIRMED | major → major |
| F-4 | DOWNGRADED | major → minor |
| F-9 | DOWNGRADED | major → minor |

**6 confirmed as written, 10 downgraded, 0 refuted, 0 flaky.** Every one of
the 16 reproduced on every attempt; nothing here is a phantom. What the
downgrades say is that ten of them were filed at the wrong severity, and three
of those (A-5, E-8, F-4) also carry a factual over-claim in the finding text.

---

### A-1 — The connect modal is an undismissable gate: a user with no cookies.txt cannot reach the app at all
- **Verdict**: CONFIRMED
- **Severity**: blocker
- **Runs**: 4 attempts (2 runs × 2 sweep verdicts), 4 reproduced
- **What I did**: cold start of the public mirror with no `yt-cookies.txt`,
  twice over, with two different sweep outcomes a real machine can produce —
  `inconclusive` (yt-dlp prints nothing the classifier knows) and a hard
  `signed_out` (yt-dlp's real "Sign in to confirm you're a human…" text). For
  each I let the sweep finish, then tried every exit a user has: enumerated
  every control in the dialog looking for close / skip / "not now" / "continue
  without"; pressed `Escape` twice on the window and dispatched a third
  `keydown` at the dialog element; clicked the backdrop; reloaded the window;
  and ran real Playwright clicks at the URL field, the Help button, the
  Settings button and the footer format chip, with an `elementFromPoint`
  hit-test for each. Then, for the second half, I called the engine signed out.
- **Proof**: `audit/run-1/verify/slice-4/v-a1.cjs`;
  `out/a1-run1.json`, `out/a1-run2.json`;
  `out/a1-1-quiet/01-01-cold-boot.png`, `out/a1-1-quiet/02-02-after-escape.png`.
  Identical in both runs and both verdicts:
  - `dialog.anyCloseLike: false` — buttons are only *Choose cookies.txt*,
    *Check browsers again*, *Pick a browser*, *Diagnostics*.
  - `afterEsc1 / afterEsc2 / afterEscOnDialog / afterBackdropClick /
    afterReload` — all `1` (the dialog is still there).
  - every covered control: `BLOCKED: TimeoutError: page.click`, and
    `elementFromPoint` returns
    `DIV.fixed inset-0 z-50 flex items-center justify-cen…` with
    `isSelfOrInside: false`. Including `#ui-footer-format`, which is where the
    quality is chosen — so a signed-out user cannot even select 360p.
  - **the second half holds**: with no session on disk,
    `POST /api/info` → `200 "Stub video"`;
    `POST /api/download {quality:"360", format:"mp4"}` → `200`, a real
    **981,457-byte** file whose first bytes are `000000206674797069736f6d`
    (`ftyp isom`), i.e. a genuine MP4 cut by real ffmpeg;
    `POST /api/download {quality:"best"}` → `401 YOUTUBE_AUTH_REQUIRED`.
    `server/index.ts:1114` gates only on
    `format === "mp4" && (quality === "best" || Number(quality) > 360)`, so
    360p never needs a session.
  Both halves hold, so the blocker stands: the product is usable signed out and
  the modal is the only thing preventing it.
- **Duplicate note (H-2)**: **not one defect.** A-1's fix is a dismissal path
  (a close/skip/"continue without" control, `Escape`, and an `onClose`);
  H-2's fix is focus containment (`inert`/`aria-hidden` on the background and a
  focus trap). They touch the same file but pull in opposite directions — a
  focus trap on its own would *close* the keyboard crack that is currently the
  only way to reach anything, making A-1 strictly worse. Fix A-1 first.

---

### A-2 — A cookies.txt imported while the automatic sweep is running is thrown away when the sweep finishes
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: cold start, no session, sweep scripted slow (1.2 s per probe)
  and `inconclusive`; the imported file scripted to probe `signed_in`. As soon
  as the modal showed "Checking chrome…" I confirmed the picker was unusable,
  then dropped a valid Netscape cookies.txt on the window with a real
  `DragEvent` carrying a `File` in its `DataTransfer`, and sampled the UI once
  a second until the sweep ended.
- **Proof**: `audit/run-1/verify/slice-4/v-a2-a3-a4.cjs`;
  `out/a2-a3-a4-run1.json`, `out/a2-a3-a4-run2.json`;
  `out/a2-1/01-signed-in-after-drop.png`, `out/a2-1/02-after-sweep-finished.png`.
  - during the sweep the primary button is
    `{"text":"Checking…","disabled":true}` — the drop is the only route, as
    the finding says;
  - `t+1s … t+22s`: `{"modal":false,"chip":"Signed in","alert":null}` (22 of
    23 samples);
  - `t+23s`: `{"modal":true,"chip":"Not signed in","alert":"None of your
    browsers would hand over a YouTube session."}`;
  - `cookieFileStillOnDisk: true`, `clipper.authSource: "app"`.
  A completed, successful user action is silently undone and reported as a
  failure, while the evidence that it worked is still on disk. There is no
  generation check or cancellation token on `sweepBrowsers`.

---

### A-3 — An already-expired cookies.txt imports as a success and the app reports "Signed in"
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 4 attempts (2 runs × 2 import routes), 4 reproduced
- **What I did**: cold start with no session, then imported a Netscape file
  whose `SID` expires at epoch `1000000000` (Sun 9 Sep 2001) — once through the
  picker (with Electron's dialog stubbed to that path) and once by dropping it,
  because both converge on `verifyImported()`.
- **Proof**: `v-a2-a3-a4.cjs`; `out/a2-a3-a4-run{1,2}.json`
  (`a3_picker`, `a3_drop`); `out/a3-1-picker/01-imported-expired-picker.png`.
  Identical on both routes, both runs: the import is accepted, the modal
  closes (`importAccepted: true`), `clipper.authSource: "app"` is persisted,
  and at the same instant
  `window.electronAPI.probeYouTube()` → `{"connected":false,
  "expiresAt":1000000000000,"expired":true}` and the chip reads
  **"Sign-in expired"** with
  `title="This sign-in ran out on Sun, Sep 9, 2001. … Import a fresh
  cookies.txt."`. So the gate (`connected`) and the chip
  (`deriveSessionStatus`) genuinely state opposite things about the same file.
- **Why the original was wrong**: only about severity. (a) Nothing is lost and
  the job is not blocked — if anything the user is let *in* rather than out.
  (b) The app does tell them: the status chip says "Sign-in expired" with the
  date, and the setup checklist's sign-in row stays unticked; the workaround
  (export a fresh cookies.txt) is the one the chip names. (c) The first 1080p
  download re-probes and returns `401 YOUTUBE_AUTH_REQUIRED`, so the bad state
  self-corrects at the point of use. That is "wrong but survivable, with a
  workaround" = minor, not major.
- **Caveat on the premise**: for `markConnected` to run, the yt-dlp probe must
  answer `signed_in` for an expired jar. My stub was scripted to do so, as the
  original's was. Whether real yt-dlp does (it loads cookie files with
  `ignore_expires=True`, so it very likely does) is **not provable here**. The
  part that *is* proven without any scripting is that `verifyImported` reads
  `expired: true` and then lets `markConnected` clear it.

---

### A-4 — The expired-session message is wiped by the sweep that starts a split second later
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: put an expired cookies.txt (`SID` expires 2001) in userData,
  launched as a returning user, and sampled the modal's `[role=alert]`,
  heading, subtitle, working status and chip every 300 ms from the first frame
  until the sweep ended.
- **Proof**: `v-a2-a3-a4.cjs`; `out/a2-a3-a4-run{1,2}.json` (`a4.samples`);
  `out/a4-1/01-a4-expired-returning.png`. 57 samples per run, both runs:
  `expiryMessageSamples: 0` — the `EXPIRED_MESSAGE` with the date is on screen
  in **none** of them. The alert is `null` throughout the sweep (status reads
  "Checking chrome…" → … → "Checking chromium…") and then becomes
  "None of your browsers would hand over a YouTube session." The date exists
  (`probeYouTube` → `expiresAt: 1000000000000`) and is in the shipped bundle
  (`messageExistsInBundle: true`); it is simply never rendered.
- **Why the original was wrong**: its Expected/Actual overstate the loss. The
  finding says that message is "the only place the user is told *when* it
  expired **and that a fresh export is the fix**". The second half is false:
  in all 57 samples of both runs the modal's heading reads **"YouTube sign-in
  expired"** and its subtitle, visible the whole time, reads **"Without a valid
  sign-in YouTube gives 360p. Import a fresh cookies.txt to get 1080p back."**
  — the right next step, with the primary *Choose cookies.txt* button directly
  under it. What is actually lost is the **date**, plus a misleading extra
  alert pointing at browsers. (The chip's tooltip also carries the date, but
  the chip is under the scrim, so hovering it is impossible — that part of the
  finding holds.) Losing a date while the fix stays on screen is minor.

---

### A-5 — Every sweep spawns 18 yt-dlp processes, cannot be cancelled, and blocks the import button while it runs
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts × 3 scripted verdicts + 2 disconnect runs; all reproduced
- **What I did**: counted the processes myself from my stub's argv log, keeping
  only invocations carrying `--cookies-from-browser` so the sweep is separated
  from `--version` and `/api/info`. Then — the disproof angle the original did
  not try — I ran the same cold boot against **three** stub verdicts, because
  `probeYouTubeAuth` only retries the next probe video on `inconclusive` /
  `probe_unavailable`:

  | stub output | classifier verdict | processes per sweep | three presses |
  |---|---|---|---|
  | progress lines only | `inconclusive` | **18** (6 browsers × 3 URLs) | **54** |
  | real signed-out text | `signed_out` | **6** (6 × 1) | **18** |
  | "could not find chrome cookies database" | `profile_missing` | **6** | **18** |

  Identical in both runs.
- **Proof**: `audit/run-1/verify/slice-4/v-a5-a6.cjs`;
  `out/a5-a6-run1.json`, `out/a5-a6-run2.json`;
  `out/a5-1-quiet/01-sweep-quiet.png`.
  `perBrowser` for the inconclusive case is
  `{"chrome":3,"safari":3,"edge":3,"firefox":3,"brave":3,"chromium":3}`.
  The rest of the finding holds exactly: no cancel control anywhere in the
  dialog (`anyCancel: false`), the picker is a disabled "Checking…" for the
  duration (`BLOCKED: TimeoutError` on a real click), and "Forget this sign-in"
  starts a whole fresh sweep that ends in "None of your browsers would hand
  over a YouTube session." — an error nobody asked for (18 processes measured,
  both runs).
- **Why the original was wrong**: the headline number is a property of **one**
  verdict, not of "every sweep". On the ordinary machine the finding describes
  — "any machine with no signed-in browser profile" — real yt-dlp says it
  cannot find the cookie database, which classifies as `profile_missing`, and
  the sweep costs **6** processes, not 18. The 18 figure comes from the stub's
  default output (progress lines, exit 0), which classifies as `inconclusive`.
  18 is the worst case, reachable and worth fixing, but the claim as written is
  an over-generalisation from a stub artefact. With the real number a third of
  the claim, a documented workaround for the blocked picker (the drop route,
  which the finding itself names) and nothing lost, this is minor.

---

### A-6 — "inconclusive" is treated by the renderer as a failed sign-in
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: scripted every browser probe to produce output with no marker
  the classifier recognises, cold-booted, and read the modal; then separately
  booted with a valid cookies.txt on disk against the same output and asked the
  server directly what it thought, and whether it would allow a 1080p download.
- **Proof**: `v-a5-a6.cjs`; `out/a5-a6-run{1,2}.json` (`a6`);
  `out/a6-1-restored/01-a6-restored-inconclusive.png`.
  Both runs identical:
  - sweep: alert "None of your browsers would hand over a YouTube session.",
    chip "Not signed in", and "Technical details" reads
    `chrome: inconclusive / safari: inconclusive / … / chromium: inconclusive`
    — six non-verdicts rendered as a hard refusal;
  - the server on the same output: `POST /api/auth/youtube/status` →
    `{"status":"inconclusive"}`, and `POST /api/download {quality:"1080"}` →
    **200** with a real file. `authProbeVerdict("inconclusive")` is `"ok"`, so
    the two halves of the product genuinely disagree;
  - a *restored* session survives it (`chip: "Signed in"`, modal closed), which
    is what the finding also says.
- **Why the original was wrong**: severity only. The mismatch is a wrong
  *message* about one route. The route it breaks (automatic browser sweep) has
  the product's own primary route as its workaround — the modal's three-step
  cookies.txt import is right there — and the engine lets the download through
  regardless, so nothing is blocked and nothing is lost. "Wrong but survivable,
  with a workaround" = minor. It stays worth fixing because it is one of the
  two ingredients of A-1's lockout; the other is the modal itself.

---

### E-1 — The public build still tells you the channel exporter exists
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 full builds of the public shape, both grepped; byte-identical results
- **What I did**: built all three shapes myself with the real `vite build` and
  the real `scripts/build-server.cjs` (`mkmirror.cjs`), then counted 29 needles
  in the renderer bundle, the bundled server and `electron/preload.cjs`,
  `machineId.cjs`, `main.cjs`, in each shape, so a leak can be told from a
  string every build has. Rebuilt the public shape from scratch and re-grepped
  to check determinism.
- **Proof**: `audit/run-1/verify/slice-4/v-e1.cjs`;
  `out/e1/e1-grep.txt`, `out/e1/e1-grep.json` (full three-shape matrix).

  **Public renderer — `dist/assets/index-CQ1UlzNM.js` (same hash both builds):**

  | string | public | owner-star | owner-hash |
  |---|---|---|---|
  | `Channel data` | **1** | 2 | 2 |
  | `ui-channel-link` | **1** | 2 | 2 |
  | `Back to clipping` | **1** | 1 | 1 |
  | `onScreen("channel")` | **1** | 1 | 1 |
  | `screen==="channel"` | **1** | 1 | 1 |
  | `channelAvailable` | **2** | 2 | 2 |

  **7 leaked occurrences across 6 distinct strings.** Everything else is clean
  in the public renderer, exactly as the finding records: `0` for
  `api/channel/export`, `…/cancel`, `…/progress`, `Channel profile exporter`,
  `Export channel`, `What to export`, `Top 50 per video`, `videos.csv`,
  `transcripts.csv`, `summary.csv`, `video-status.csv`, `subscriber_count`,
  `hashtags_in_title`, `includeTranscripts`, `Export a channel's data`,
  `help-anchor-channel-start/stop`, `isOwnerMachine`, the salt and every
  machine hash. No `.map` in any `dist/assets`.

  **Public `electron/dist/server.cjs`**: clean except `registerChannelRoutes`
  ×2 — the empty stub and its call site, which is the designed shape.

  **Public `electron/*.cjs`** (shipped verbatim; `package.json` `build.files`
  is `["electron/**/*","dist/**/*","package.json","!**/*.map","!**/*.ts"]`):
  `isOwnerMachine` ×1, `owner:check` ×2, plus six "owner"-naming comment lines
  in `preload.cjs:46,48`, `machineId.cjs:3,4,7`, `main.cjs:716,720`.

  **The stated mechanism is correct and I verified it**, because the fix hangs
  on it. From the shipped public bundle, verbatim:

  ```js
  e.channelAvailable&&e.screen==="workspace"&&c.jsxs("button",{type:"button",
  id:"ui-channel-link",className:"link-quiet",onClick:()=>e.onScreen("channel"),
  children:[c.jsx(OP,{}),c.jsx("span",{children:"Channel data"})]})
  ```

  `AppHeader.tsx:141` tests `p.channelAvailable`, a **runtime prop** passed
  from `App.tsx:366`, not `__CHANNEL_DATA__`. Vite's `define` rewrote
  `__CHANNEL_DATA__` to `false` (it does not appear in the public bundle at
  all) and that *did* drop `ChannelExportPanel`, `ownerGate`'s IPC call and the
  two channel help tasks — but it cannot reach inside `AppHeader`, so the
  branch and its strings survive. `Back to clipping` survives the same way, on
  `p.screen === "channel"`. So the fix is to gate on the compile-time constant
  inside `AppHeader` (or to not render the nav item from a prop), exactly as
  the finding says.
- **Why the original was wrong**: severity. It cites "the brief's rule for this
  area is that a leaked string in the public bundle is a blocker" — there is no
  such rule in `audit/harness/README.md`, `audit/inventory.md` or
  `audit/STATUS.md`; the only rule stated anywhere is the README's
  "blocker = the user cannot complete the job or loses data". Seven strings in
  a minified bundle block no job and lose no data, and grant no access: the
  routes are genuinely absent from the public server (the finding proves this
  and my grep agrees), the panel is gone, and the gate returns `false`. It
  defeats the stated purpose of the feature flag, which is a real miss, but it
  is a minor one. (E-6 — `owner:check` live and interrogable in the public
  build — is the part of this area with actual teeth, and it is not mine to
  judge.)

---

### E-2 — "Clear cache" during an export silently empties comments.csv and transcripts.csv, then says "Export saved"
- **Verdict**: CONFIRMED
- **Severity**: blocker
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: owner build, through the real UI — opened Channel data,
  pasted the channel, left all three parts ticked, limit 10, pressed Export;
  waited for the per-video phase; called `POST /api/cache/clear` (the endpoint
  behind Settings → Clear cache) while it ran; let the run finish and then read
  the result card and every byte of the saved folder.
- **Proof**: `audit/run-1/verify/slice-4/v-e2-e3-e5-e8.cjs`;
  `out/e2-e3-e5-e8-run{1,2}.json` (`e2`);
  `out/e2-1/01-after-cache-clear.png`, `out/e2-1/02-e2-done.png`.
  - `phaseAtClear: "Comments and transcripts, video 1 of 10"`
  - `usageBefore: {"folders":4,"bytes":2560120}` — the live export's working
    folder is advertised as reclaimable; `clear: {"ok":true,"removed":4,…}`
  - result card: **"Export saved"**, `"10 videos · 0 comments · 0 transcript
    lines"`, `errorBanner: null`
  - on disk: `videos.csv` 10 data rows; `comments.csv` **0** data rows
    (header only, 155 bytes); `transcripts.csv` **0** data rows (36 bytes)
  - `summary.csv`, the file the UI calls the receipt:
    `"Stub Channel",…,"all","10","10","false","video details; comments; transcripts"`
    — ten videos exported, not cancelled, comments and transcripts included.
  The two expensive parts are destroyed, the checkpoint with them, and the run
  signs a receipt saying it collected them. Lost work, reported as success:
  blocker stands.

---

### E-3 — Two exports at once corrupt each other: one gets duplicated rows, the other gets empty CSVs — both claim success
- **Verdict**: CONFIRMED
- **Severity**: blocker
- **Runs**: 2 attempts, 2 reproduced (plus a UI-only reachability check)
- **What I did**: owner build; fired two identical `POST /api/channel/export`
  with different jobIds at the same moment (`Promise.all`), `deliver:"path"`,
  then read the CSVs each response pointed at and listed the checkpoint
  folders afterwards. Stub: 4 videos per tab (8 in the `all` pool), one comment
  and one caption line each, so the correct answer is 8 rows per file.
- **Proof**: same script; `out/e2-e3-e5-e8-run{1,2}.json` (`e3`).
  Both runs, both 200, both `cancelled: false`, both `exported: 8`, both
  `summary.csv` reading `included="video details; comments; transcripts"`:

  ```
  s4-race-A  videos 8  comments  0  transcripts  0   <- header-only CSVs
  s4-race-B  videos 8  comments 15  transcripts 15   <- 8 expected, every row duplicated
  ```

  race-B's `comments.csv`, verbatim — each video's single comment written twice:

  ```
  "vid0000000","c0","","false","A","UC1","hello","1","false","false","","0"
  "vid0000000","c0","","false","A","UC1","hello","1","false","false","","0"
  "vid0000001","c0","","false","A","UC1","hello","1","false","false","","0"
  "vid0000001","c0","","false","A","UC1","hello","1","false","false","","0"
  ```

  (15 not 16 because the winner's `clearCheckpoint()` `rmSync` landed on the
  folder the loser was still appending to.) `workDir()` keys the checkpoint on
  `[base, contentType, limit, parts…]` and not on the jobId, so both runs share
  one folder; there is no lock anywhere in `/api/channel/export`.
- **Extra, and it makes this worse than filed: no devtools are needed, and the
  end state is total loss.** `ChannelExportProvider` is mounted per workspace
  tab (`App.tsx:455 ChannelBoundary` inside the tab map), so two tabs give two
  independent exporters and the panel's "button disables while exporting"
  guard does not apply across them. I drove the whole thing through the
  shipped UI — `audit/run-1/verify/slice-4/v-e3-tabs.cjs`,
  `out/e3-tabs-run1.json`, `out/e3-tabs-run2.json`,
  `out/e3tabs-1/01-both-running.png`, `out/e3tabs-1/02-both-done.png` —
  2 attempts, 2 identical:

  ```
  bothExporting : [true, true]        <- two panels running at once, no guard
  tab A card    : "Export saved"  "8 videos · 14 comments · 14 transcript lines"
  tab B card    : "Export saved"  "8 videos ·  0 comments ·  0 transcript lines"
  folders saved : ["Stub Channel-export-2026-11-21"]      <- one, shared (E-5)
  on disk       : videos.csv 8 rows, comments.csv 0 rows, transcripts.csv 0 rows
  ```

  Two green "Export saved" cards, 14 duplicated rows reported in one of them,
  and because both runs save into the same date-named folder the **empty
  result overwrites the full one**, so what survives on disk is nothing at all
  for the two expensive parts. Silent corruption, then silent loss, from two
  clicks in the shipped UI, reported twice as success: blocker stands.

---

### E-5 — Re-exporting a channel the same day merges two runs into one folder, and summary.csv describes only the newer one
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: owner build, through the UI. Exported `@stubchannel` with all
  three parts; then, changing nothing else, unticked Video details and
  Comments and exported the same channel again; then listed the folder with
  per-file mtimes and read `summary.csv`.
- **Proof**: same script; `out/e2-e3-e5-e8-run{1,2}.json` (`e5`);
  `out/e5-1/01-e5-run1.png`, `out/e5-1/02-e5-run2.png`.

  ```
  run 1 (everything)       -> "Export saved — 10 videos · 10 comments · 10 transcript lines"
  run 2 (transcripts only) -> "Export saved — 10 videos · 10 transcript lines"
  one folder for both: Stub Channel-export-2026-11-21   (oneFolderForTwoRuns: true)
    comments.csv      905  mtime 19:40:11.552   <- run 1
    videos.csv       1811  mtime 19:40:11.552   <- run 1
    transcripts.csv   426  mtime 19:40:15.374   <- run 2
    summary.csv       243  mtime 19:40:15.374   <- run 2
    video-status.csv  412  mtime 19:40:15.374   <- run 2
  final summary.csv: …,"10","10","false","transcripts"
  ```

  Nothing in the folder says `videos.csv` and `comments.csv` are from an
  earlier run; the receipt says the run included transcripts only.
  `buildExportFolderName()` is `<channel>-export-YYYY-MM-DD` with no handle, no
  time and no counter, and `electron/exportSave.cjs` does
  `mkdir({recursive:true})` then renames the new files in over the old.
  Silently mixed research data with a receipt that misdescribes the folder, no
  warning and no in-product workaround: major stands.
- **One correction to the evidence, not the verdict**: the finding's second
  strand — "ten successful exports of ten *different* channel URLs produced
  exactly one folder" — is a **stub artefact**, not a product defect. I
  reproduced it (three different URLs → one folder,
  `foldersAfterThreeDifferentChannels: ["Stub Channel-export-2026-11-21"]`),
  but only because the stub reports the same `channel` name for every URL. Real
  channels have different names and would get different folders. The
  same-channel-same-day collision, which is the finding's primary claim, is
  genuine.

---

### E-8 — A cancel that lands before the POST turns the next export into a silent empty success
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: owner build. Opened `GET /api/channel/export/progress?jobId=J`
  and waited for the stream to open (this is exactly what
  `useChannelExport.startExport` does before it POSTs), then
  `POST /api/channel/export/cancel {"jobId":"J"}`, then
  `POST /api/channel/export?jobId=J` with a valid channel. Then — the control
  the original did not run — the same export with a fresh jobId immediately
  afterwards.
- **Proof**: same script; `out/e2-e3-e5-e8-run{1,2}.json` (`e8`). Both runs:

  ```
  sse        : "open"
  cancel     : 200 {"ok":true}
  export     : 200 {"cancelled":true, "channel":{"exported":0},
                    "videos":[], "comments":[], "transcripts":[], "statuses":[]}
  the UI branch this takes: "Partial export saved"
  control (fresh jobId s4-clean-1): 200 {"cancelled":false,"exported":8}
  ```

  The mechanism is exactly as described: `GET /progress` runs
  `getOrCreateChannelJob`, so the cancel finds a job to mark, and the POST for
  the same id inherits `cancelled: true`; `useChannelExport` does not
  distinguish a 200 with `cancelled:true, exported:0` from a real partial
  result and writes five header-only CSVs under "Partial export saved".
- **Why the original was wrong**: the impact claim is false and the severity
  follows from it. It says "from devtools it is a one-line denial of service
  against **every subsequent export**". It is not: `startExport` mints a fresh
  `chan_${Date.now()}_${random}` for every run, so poisoning one id affects
  only that id — my control proves it, exporting 8 videos normally one call
  later. The only non-devtools way in is a Stop click landing in the
  milliseconds between the `EventSource` construction and the `fetch` on the
  next line, and the result of that race ("nothing was exported") is what the
  user asked for anyway. The result card also shows `0 videos`, so it is not
  silent to the user. A one-shot, self-inflicted, visible, per-job race =
  minor.

---

### F-1 — Every `help-anchor-*` id in the help catalogue is absent from the app, so 24 of 32 tutorial steps highlight nothing
- **Verdict**: DOWNGRADED
- **Severity**: major
- **Runs**: 2 attempts × 2 passes (empty / loaded), 4 reproduced, all four identical
- **What I did**: enumerated the catalogue programmatically — `helpTasks.ts`
  transpiled with esbuild and `require`d, never transcribed — giving 26
  declared `ANCHORS`, 14 public tasks, 32 public steps. Then, for **each step**,
  I first performed what that step's own **preceding steps** tell the user to
  do before probing, which is the point the original could have got wrong:
  loaded a video and a real transcript, opened Copy blocks before probing
  `help-anchor-copy-transcript` and `-copy-script`, opened Symbols before
  `help-anchor-symbol-list`, opened the campaign menu before
  `help-anchor-campaign-list`, opened the All saved tab (with a seeded saved
  clip) before `help-anchor-clips-tabs` and `-saved-clip`, opened the chip menu
  before `help-anchor-cookies-import`, pressed Ctrl+F before
  `help-anchor-transcript-search`, and marked a range before the timeline and
  segment anchors. Each probe records `getElementById`, the rect, whether a
  `[data-help-spotlight]` rendered, and whether the drawer showed the
  "not on screen" notice. Separately I dumped every `[id]` in the live DOM
  across nine states and cross-checked against the source for any element ever
  given one of these ids.
- **Proof**: `audit/run-1/verify/slice-4/v-f1.cjs`;
  `out/f1-run1.json`, `out/f1-run2.json`;
  `out/f1-1-loaded/01-00-loaded.png` and one screenshot per failing step.

  **My counts, identical in all four passes:**
  - **19 of the 26 declared anchors do not exist in any state I could build** —
    all 18 `help-anchor-*` ids plus `ui-primary-action`.
  - The 7 that do exist: `ui-source-chip`, `ui-campaign-chip`, `ui-copy-blocks`,
    `ui-symbols`, `ui-footer-clips`, `ui-footer-data`, `ui-footer-format`.
    (Five declared anchors are used by no public step at all —
    `ui-source-chip`, `ui-footer-format`, `help-anchor-mark-in`,
    `help-anchor-mark-out`, `help-anchor-symbol-search` — so the 32 steps draw
    on 21 distinct ids.)
  - **24 of 32 steps have no anchor**, render no spotlight, and show
    "That control is not on screen right now…" — which is untrue; the control
    is on screen under a different id.
  - **8 steps work**, every one of them a `ui-*` id:
    `switch-campaign#1`, `change-clips-folder#1`, `#2`,
    `change-data-folder#1`, `#2`, `copy-transcript#1`,
    `copy-script-lines#1`, `insert-symbol#1`.
  - **8 of 14 tasks are dead end to end**: `cut-clip`, `stitch-two-moments`,
    `find-by-words`, `nudge-edge`, `check-unused`, `reorder-segments`,
    `fix-360p`, `recut-saved`.
  - Source cross-check: **19 of 26 ids are never assigned to any element
    anywhere in `src/`** (the only two source hits for `help-anchor-*` are
    *consumers* — `SetupChecklist.tsx:136` and `:163` call
    `getElementById` on ids nothing ever sets). The real ids are `ui-cut` (not
    `ui-primary-action`), `ui-add-segment`, `ui-mark-in` / `ui-mark-out`,
    `clips-tab-all` / `-bank` / `-video`.

  **The original did not over-count.** Opening the panel each tutorial tells
  the user to open changes nothing, because the ids are never emitted at all:
  `HelpDrawer` has no code that opens anything, and my preparations are
  recorded as having succeeded (`prep: [["openCopyBlocks",true]]` etc.).
- **Why the original was wrong**: two things, neither of them the counts.
  (a) a detail: it says "All **sixteen** `help-anchor-*` ids"; there are
  **18** (the 19 missing ones are those 18 plus `ui-primary-action`). The
  headline 19/26 and 24/32 are right.
  (b) severity. The drawer still renders every step's "do" and "why" line, and
  those lines name the control in words ("Press Cut as one file", "press Add
  segment"), so a user can still complete the task — nothing is blocked and
  nothing is lost. What is broken is the spotlight, i.e. three quarters of a
  feature, plus a notice that actively lies about why. A core function badly
  broken with no workaround inside the feature = major, not blocker.

---

### F-2 — With a second workspace tab open, duplicate ids make `getElementById` return the hidden tab's copy
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: launched signed in, measured the ids with one tab, pressed
  the tab strip's `+`, measured again, then ran the four tutorials whose first
  anchor exists from the second tab.
- **Proof**: `audit/run-1/verify/slice-4/v-f2-f3-f4.cjs`;
  `out/f2-f3-f4-run{1,2}.json` (`f2`); `out/f2-1/01-two-tabs.png`,
  `out/f2-1/02-two-tabs-tutorial.png`.
  With one tab every id is unique. With two tabs, seven ids exist twice —
  `ui-campaign-chip`, `ui-footer-clips`, `ui-footer-data`, `ui-copy-blocks`,
  `ui-symbols`, `ui-source-chip`, `ui-help-button` — and in every case
  `copies: 2, firstVisible: false (0×0), anyVisible: true`: the first in
  document order is the hidden first tab's copy, which is what
  `Spotlight.measure()`'s `document.getElementById` returns and what its
  `r.width === 0` check then rejects. All four tutorials run from the second
  tab (run 2, where my script's own re-listing bug is fixed):
  `spotlight: false, notice: true`. So with F-1 there is no working tutorial at
  all on any tab but the first.
- **Why the original was wrong**: severity only; the measurements are right.
  The user-visible outcome is identical to F-1's (no ring, plus the false
  "not on screen" notice), it only occurs with a second tab open, nothing is
  lost or blocked, and there is a workaround (the first tab). Measured against
  F-1 — which breaks 24 of 32 steps on every install in every state — this
  narrower, same-symptom case is minor. It is a genuinely separate defect from
  F-1 with a separate fix (scope the lookup to the active tab, or stop
  rendering a `Layout` per tab).

---

### F-3 — The help button is covered and unclickable whenever Copy blocks or Symbols is open, and during the first-run sign-in modal
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: real Playwright clicks on `#ui-help-button` plus an
  `elementFromPoint` hit-test and full geometry in each state; then the ⌘/
  route, checking whether the drawer it opens is actually usable.
- **Proof**: same script; `out/f2-f3-f4-run{1,2}.json`
  (`f3_overlays`, `f3_signin`); `out/f3-1-overlays/01-copyBlocks-help-blocked.png`,
  `out/f3-1-signin/01-signin-modal-help-blocked.png`,
  `out/f3-1-signin/02-after-escape.png`.
  Both runs:
  - baseline (nothing open): `fromRight: 10, fromTop: 39`, last header child,
    `hitIsSelf: true`, click **succeeds**;
  - Copy blocks open: same coordinates, but `elementFromPoint` returns
    `DIV.surface-panel fixed right-4 top-14 z-50 …` and the click
    **times out**. Symbols open: identical;
  - with either panel open, the drawer reached by ⌘/ is itself covered —
    `drawerContainsHit: false` at its own midpoint — so a user following
    "Copy a transcript for a chat" cannot read step 2 while the panel they
    were told to open is up;
  - first-run sign-in modal: covered by
    `DIV.fixed inset-0 z-50 … bg-bg-deep/90`, click **times out**; ⌘/ does
    mount the drawer (400×649) but it renders *behind* the scrim —
    `drawerIsHit: false`, `searchFieldClickable: "no, hit DIV.fixed inset-0
    z-50 …"` — dimmed and inert to the pointer (visible in the screenshot).
    The shortcut is advertised in exactly one place: `title="Help (⌘/)"` on
    the button the user cannot reach. `mentionedInModal: false`.
  Help is unreachable by pointer in the one state a brand-new user is in, with
  no discoverable workaround: major stands.
- **Duplicate note (F-4)**: **two defects, not one.** F-3 is a z-order problem
  — the button stays exactly where it belongs and something is painted on top
  of it, so the click is swallowed. F-4 is a layout problem — the button moves
  and **remains clickable** (`clickAfter: "clicked"` at every width I tested).
  Different causes (overlay stacking vs. a `flex-wrap` header), different
  fixes, and fixing either leaves the other.

---

### F-4 — An update error at 1024px or narrower wraps the header and moves the help button out of the top-right corner
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts × 4 viewport widths, 8 reproduced
- **What I did**: signed in, measured `#ui-help-button` at 1440, 1024, 900 and
  760 px before and after sending a real
  `{state:"error", message:"ENOENT: …"}` on the real `updater:status` IPC
  channel from the main process, and clicked it afterwards each time.
- **Proof**: same script; `out/f2-f3-f4-run{1,2}.json` (`f4`);
  `out/f4-1/02-update-error-1024.png`. Both runs identical:

  | width | before (right, top, header h) | after | clickable after |
  |---|---|---|---|
  | 1440 | 10, 39, 48 | 10, 39, 48 | yes |
  | 1024 | 10, 39, 48 | **634, 77, 82** | yes |
  | 900 | **858, 77, 82** | 510, 77, 82 | yes |
  | 760 | **537, 77, 82** | 282, 77, 82 | yes |

  The header is `flex-wrap` with `min-h-header` (`AppHeader.tsx:101`), so the
  update label pushes the Tools nav onto a second row.
- **Why the original was wrong**: two things.
  (a) It says "Reproduced at 1024, 900 and 760px", implying the updater causes
  it at all three. At 900 and 760 the header is **already** wrapped with no
  update state at all (`fromTop: 77` before the error is sent); the update
  error only changes where on row two the button sits. The updater is the
  trigger at 1024 only.
  (b) severity. The button never stops working: it remains the last header
  child, remains visible, and a real click lands on it in all eight
  measurements. This is a discoverability and layout-contract failure
  ("ALWAYS the last item top right"), not a loss of function, and it is
  survivable — the button is still in the header, a row lower. Minor.

---

### F-9 — "Check for updates" says "Up to date" when the check never happened
- **Verdict**: DOWNGRADED
- **Severity**: minor
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: pressed the header's **Check** and also called the real
  `updater:check` over IPC so I could see the handler's own answer, sampled the
  strip every 500 ms for 20 s, and read `<userData>/logs/main.log`.
- **Proof**: `audit/run-1/verify/slice-4/v-f9.cjs`;
  `out/f9-run1.json`, `out/f9-run2.json`; `out/f9-1/01-after-check.png`.
  Both runs identical:

  ```
  strip over 20s : ["Up to date", ""]      (shown 3.5s, then self-clears)
  saidFailed     : false
  updater:check  : {"ok": true, "version": null}
  main.log       : [updater] manual check requested
                   [warn] APPIMAGE env is not defined, current application is not an AppImage
                   (no update-not-available, no [updater] error:)
  ```

  So `autoUpdater.checkForUpdates()` resolved **without any update info**, and
  `electron/main.cjs:640` — `if (!version || version === app.getVersion())
  sendUpdateStatus({state:"none"})` — turns that into "Up to date". "The check
  could not run" and "you are on the newest version" are the same message. The
  defect is in the handler, not in the container: the two cases are
  indistinguishable by construction.
- **Why the original was wrong**: severity. A false "Up to date" on an
  auxiliary status strip blocks no job and loses no data; the user stays on
  their current version, which is also what happens when an update genuinely
  is not available. Nothing the user is doing fails. Minor. (It is still worth
  fixing — `result === null` should say "Couldn't check" — and the finding's
  own "not provable here" caveat about a packaged build is right.)

---

## Notes for the action plan

- **A-1 and H-2 are not one fix.** See A-1. Do A-1 (a dismissal path) before
  any focus-trap work, or the trap will remove the only remaining escape.
- **F-3 and F-4 are not one fix.** See F-3. One is stacking order, one is
  header wrapping; F-4's button still works.
- **F-1 and F-2 are two fixes for one feature.** F-1 is "the ids were never
  put on the controls" (`helpTasks.ts` `ANCHORS` vs. the real `ui-cut`,
  `ui-add-segment`, `ui-mark-in/out`, `clips-tab-*`); F-2 is "the lookup is not
  scoped to the active tab" (`Spotlight.measure`). Fixing F-1 alone leaves
  every tutorial broken on tab 2+; fixing F-2 alone leaves 24 of 32 steps dead.
  F-18's two dead checklist anchors are the same root cause as F-1.
- **A-1 + A-6 together** are what produce the lockout observed in every
  cold-boot run: the sweep's six `inconclusive` non-verdicts become a hard
  refusal, and the refusal has no exit.
- **E-2, E-3 and E-5 are three faces of one missing idea**: the exporter has no
  notion of a run owning its working folder or its output folder
  (`workDir()` keys on the request, not the job; `clearCache()` sweeps every
  `ytchan-`; `buildExportFolderName()` keys on channel + date). All three are
  worth fixing together.

## Not provable here

- **A-3's premise** that real yt-dlp answers `signed_in` for an expired cookie
  jar. Scripted, as it was in the original. What is proven unscripted is that
  the app reads `expired: true` and then discards it.
- **E-1's packaged artefact.** The `electron/*.cjs` leak is argued from
  `package.json`'s `build.files` globs plus the files as they exist on disk;
  no `.dmg`/`.exe`/`.AppImage` was built. The renderer half is proven directly
  against the built `dist/assets/*.js`.
- **F-9 in a packaged build with a real feed.** Here `checkForUpdates()`
  resolves quietly because the app is not an AppImage. The handler's
  "no version means up to date" logic holds either way, but the exact trigger
  in a signed, packaged build is unverified.
- Everything the area files already marked not provable here (real YouTube,
  1080p behaviour, macOS/Windows specifics, installers) still is.
