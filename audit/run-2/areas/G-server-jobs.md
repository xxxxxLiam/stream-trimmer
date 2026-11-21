# Run 2 — Area G: the loopback server and the work it spawns

Scope: `server/index.ts`, `server/segments.ts`, `server/cookieJar.ts`,
`server/resumeCache.ts`, `server/csv.ts`, `electron/settingsStore.cjs`. The
server, not the UI — except where the brief asks whether the app still works in
the packaged shape, which is checked through the real Electron app.

**No product file was changed.** Scripts are in `audit/run-2/area-G/`,
machine-readable results in `audit/run-2/area-G/out/*.json`, server consoles in
`audit/run-2/area-G/logs/*.server.log`, media and screenshots in
`audit/run-2/area-G/out/`.

Findings: **2 major, 7 minor, 3 polish** (12 in all). No blocker.

Twelve run-1 fixes re-verified — the eleven `T1.md` claims plus G-11, which the
brief lists as fixed: **9 HELD outright**, **G-1 held for isolation but
REGRESSED for resume** (G2-1), **G-3 incomplete** (bypassable, G2-2), **G-11
never applied** (G2-4).

---

## How this area was driven

Two runtimes, same as run 1, with run 1's harness traps avoided by
construction:

1. **The server itself** (`glib.cjs: startServer`) — `server/index.ts` bundled
   by esbuild exactly as `scripts/build-server.cjs` builds it for the packaged
   app, then run as a plain `node` child. **No `tsx` wrapper**, a **free port
   per server**, "up" only when that process's own `listening on` line appears,
   a **private `TMPDIR`** per server, the **real** `resources/bin/ffmpeg`
   (byte-identical to `node_modules/ffmpeg-static/ffmpeg`, checked), and
   `process.kill(-pid)` on the whole group at stop. Every number below comes
   from a server this script started.
2. **The real packaged-shape Electron app** (`g10-app.cjs`, through
   `audit/harness/app.cjs` under `xvfb-run`), which loads
   `electron/dist/server.cjs` into the main process the way
   `electron/main.cjs: startBackend` does. That bundle was rebuilt at 20:51
   from the 20:17 source and contains the fixes (`listen(PORT, "127.0.0.1"`,
   `requestAllowed`, `localTrimArgs`), so the app run tests the fixed code.

**My observation points, disclosed** (`gfake.cjs`, my own fake engine):

- `argv.log` — one JSON line per invocation (`pid`, `ppid`, `argv`), which is
  how `--cookies` provenance and format-selector contents are *measured*.
- **The fake is a grandchild.** Its shell wrapper does **not** `exec`, so the
  server's direct child is `/bin/sh` and the "engine" is one level below it.
  Real yt-dlp spawns ffmpeg the same way, and it is the only way to tell a
  process-**group** kill from `child.kill()`. Process states are read from
  `/proc/<pid>/stat`, not `kill(pid,0)`, because a just-killed grandchild
  lingers as a zombie and `kill(pid,0)` calls that alive — counting it as
  "still running" invents a regression (it did, on my first pass).
- **cookie write-back** — real yt-dlp rewrites whatever `--cookies` file it was
  given on close (`YoutubeDL.save_cookies`), which is the whole reason
  `cookieJar.ts` exists; optionally split in two halves around a pause, which
  is what an interleaved save looks like on disk.
- `failSections` (403 only the sectioned download, so the whole-file +
  local-trim path is reached), `partialBytes` / `partialOnFull` (leave a
  `.part` and fail, the shape a dropped connection leaves), `cutSections` (cut
  accurately with real ffmpeg, which emulates real yt-dlp's
  `--force-keyframes-at-cuts`), `corruptSource`, `noOutput`, per-stage delays.
- `gframes.cjs` — my own frame-identity tool (32x18 grayscale thumbnails,
  nearest-match against all 750 source frames, with the ambiguity margin
  reported). Written for this run rather than reused from
  `server/testSupport/frameIdentity.ts`, so the G-4 measurement does not
  inherit the fix author's helper.

A **1 MB / 512 KB tmpfs** was mounted for the disk-full path, and
`python3 -I -c "urllib.parse.urlsplit(...)"` was used to compare URL parsers
(it is the parser yt-dlp itself uses).

---

## Verdicts on the run-1 fixes

| Run-1 finding | Verdict | How it was shown |
|---|---|---|
| **G-1** two identical downloads share a folder | **HELD** for isolation, **REGRESSED** for resume → **G2-1** | `g3-isolation.cjs`, `g11-resume.cjs`, `g11b-partials.cjs` |
| **G-2** 0.0.0.0 bind + `Allow-Origin: *` | **HELD** (residual **G2-10**) | `g1-bind-cors.cjs`, `g10-app.cjs` |
| **G-3** substring URL check | **HELD for run 1's attacks, BYPASSABLE** → **G2-2** | `g7-urls.cjs` |
| **G-4** footage from before the in-point | **HELD** — 0 frames before, 0 after | `g2-frames.cjs` |
| **G-5** canonical cookie jar handed to children | **HELD**, both directions | `g5-cookies.cjs`, `g5b-refresh.cjs` |
| **G-6** wrong-length clip delivered as success | **HELD** | `g8-errors.cjs` |
| **G-8** Clear cache destroying live work | **HELD** (side effect **G2-7**) | `g6-cache.cjs` |
| **G-9** damaged cached download | **HELD** (message quality **G2-6**) | `g8b-damaged.cjs` |
| **G-10** cancel does nothing | **HELD** for the engine (gap **G2-5**, contract **G2-9**) | `g4-cancel.cjs`, `g4b-killtree.cjs` |
| **E-7** CSV formula injection | **HELD**, in both writers | `g9-fields.cjs` |
| **F-5** no diagnostics on pre-flight failures | **HELD** (partial **G2-11**) | `g9-fields.cjs` |
| **G-11** HTML stack trace on a malformed body | **NOT APPLIED** → **G2-4** | `g8-errors.cjs` |

### G-4, frame-accurate numbers (the brief's question)

`g2-frames.cjs`, real server, real ffmpeg, the fake 403ing the sectioned
download so the job takes the **whole-file + local-trim** path the fix changed.
Marks `[0.50–2.25] + [10.10–12.35]` = 4.00 s = 100 frames at 25 fps. Two runs,
identical numbers.

| | run 1 (before) | T1's claim | measured now |
|---|---|---|---|
| frames delivered | 115 (114 decoded) | 99 | **99** |
| frames from before an in-point | 14 | 0 | **0** |
| frames after an out-point | 0 | 0 | **0** |
| first delivered source frame | 0.04 s | 0.52 s | **0.52 s** |
| last delivered source frame | 12.32 s | 12.32 s | **12.32 s** |
| delivered duration | 4.54 s | 4.00 s | **4.06 s** (ffmpeg `Duration:`) |
| join method | reencode | copy | **copy** |
| worst frame distance / margin | — | 0.10 / 0.29 | **0.095 / 0.286** |

Every one of the 99 delivered frames is inside a marked range. The joined
container is **4.06 s**, not the 4.00 s T1's table states — the server's own log
says so too (`join: stream copy ok (2 segments, 4.06s, expected 4.00s)`); it is
well inside `DURATION_TOLERANCE_SEC`, so nothing fails, but the fix note is
0.06 s optimistic.

Controls on the same path: keyframe-aligned `[0–10]+[10–20]` → 500 frames, 0
before, 0 after, 20.02 s; one sub-second range → 43 frames, 0 before; the
sectioned path with an accurate cut → identical to the local trim; 20 x 1 s and
10 x 0.4 s → 20.02 s / 4.02 s, both joined by copy and both inside tolerance
(so the new "a bad join fails the job" rule does not misfire on many short
pieces).

**The missing frame is correct behaviour, not a defect.** The marked range
1.75 s is 43.75 frame intervals, and 0.50 s falls inside frame 12 (0.48–0.52).
The trim starts at the first whole frame at or after the in-point (0.52) and
`-t` ends the output before the frame that would run past the out point, so
range 1 delivers 43 frames (0.52–2.20) and range 2 delivers 56 (10.12–12.32).
The alternative — keeping frame 12 — is 0.02 s of footage the user did not
mark, which is exactly the defect G-4 was filed for. The only blemish is
cosmetic asymmetry: range 2's last frame (12.32–12.36) laps 0.01 s past its out
point while range 1's is dropped, because `-t` is applied to an output whose
timestamps were shifted by the sub-frame seek remainder. Net effect ≤ 1 frame
(40 ms) per range, never extra unmarked content at a cut. Filed as **G2-12
(polish)** so it is on the record, not as a defect.

---

### G2-1  A dropped single-range download throws away everything it downloaded, while the failure says it was kept

- **Severity**: major
- **Status**: confirmed (2 runs, identical)
- **Regression of**: the G-1 fix (`clipDir` / `sharedDir` split). Run 1
  explicitly cleared this behaviour: *"Resume works. A 5 MB `.part` left in the
  keyed folder is found, logged (`resuming with 5242880 cached byte(s)`),
  `--continue` is passed, the partial is preserved."*
- **Steps**:
  1. `node audit/run-2/area-G/g11b-partials.cjs`, or by hand:
  2. Start the server with an engine that writes `<output>.part` and then exits
     non-zero with a dropped-connection stderr (`gfake.cjs`,
     `{"partialBytes": 5242880}`).
  3. `POST /api/download?jobId=job_x` with **one** range,
     `deliver:"path"`.
  4. While it runs, list `$TMPDIR/ytclip-*`; then read the 502 body; then list
     again; then retry the same request against a healthy engine and look for
     `resuming with N cached byte(s)` in the server log.
- **Expected**: what the response promises — the partial is on disk and the
  retry continues from it. That is what the `network_dropped` row, its
  `resume` action and its `preserved` sentence are for.
- **Actual**: for a **single** marked range the engine's output path *is*
  `clipDir/clip.mp4` (`server/index.ts:1563,1566`: `segFiles` is `[outputPath]`
  when `!multi`), so the `.part` lands in the **per-request** folder — and
  `releaseWork(false)` deletes that folder whole (`:1592`) on every failure
  path. `resumeBytes` is measured on `tempDir` (`:1578`), which for a single
  segment never contains the partial at all:
  ```
  == single range (sectioned, the primary path)
     during the run : nothing in any shared folder
     response       : 502 network_dropped
                      "The connection dropped and the download stopped at 0%.
                       Resume from 0%. Your marked range is kept.
                       Anything already fetched is on disk."
     folders after  : []                      <- the 5 MB .part went with the folder
     partial bytes kept : 0
     retry          : 200, and NO "resuming with" line anywhere

  == two ranges (same engine, same failure)
     during the run : ytclip-a21f91994f57eb5b/seg-01.mp4.part:981457
     response       : "... The 0.9 MB already fetched is on disk."
     folders after  : ytclip-a21f91994f57eb5b/seg-01.mp4.part:981457
     partial bytes kept : 981457
     retry          : "[server] /api/download resuming with 981457 cached byte(s)"

  == whole-file fallback (sectioned 403s, then the full download drops)
     partial bytes kept : 981457   resumes: yes
  ```
  So resume survives for multi-range cuts and for the whole-file fallback, and
  is dead for the one shape the product leads with: one range, "Cut as one
  file". With a real video that is the difference between continuing a 500 MB
  download and starting it again, and the message tells the user the opposite
  of what happened — in the two-range case it even names the bytes ("The 0.9 MB
  already fetched is on disk") that it then deletes.
- **Proof**: `audit/run-2/area-G/out/g11b-partials.json`,
  `out/g11-resume.json` (`resume.keyedFolderAfterFailure: null`,
  `allFolders: []`), `logs/part-single-sectioned.server.log`
- **Suspected file**: `server/index.ts:1563-1566` (a single segment writes
  straight into `clipDir`), `:1578` (`partialBytes(tempDir)` cannot see it),
  `:1587-1592` (`releaseWork(false)` removes `clipDir` recursively),
  `:2403-2404` (the failure path: `pruneWorkDir(tempDir)` protects `.part`
  files in the *shared* folder only)

---

### G2-2  The new host allowlist is bypassed by one backslash: the engine is pointed at any host while the check reads `www.youtube.com`

- **Severity**: major
- **Status**: confirmed (2 runs; the engine's behaviour shown with the real
  bundled yt-dlp)
- **Regression of**: nothing — this is the G-3 fix being incomplete.
- **Steps**:
  1. `node audit/run-2/area-G/g7-urls.cjs` (39 URLs, mine, not run 1's).
  2. `POST /api/info` with `https://www.youtube.com\@evil.example/watch?v=x`
     (one literal backslash).
  3. Read `argv.log` for what the child was handed.
  4. Compare parsers: `new URL(u).hostname` (what `isYouTubeUrl` uses, via
     zod's `.url()`) against `urllib.parse.urlsplit(u).hostname` (what yt-dlp
     uses).
  5. `resources/bin/yt-dlp --simulate <the same URL>` and watch which
     extractor it picks.
- **Expected**: the host is checked, and the host the *engine* will use is the
  host that was checked.
- **Actual**: `isYouTubeUrl` reads `u.hostname` from the WHATWG parser, which
  treats `\` in a special-scheme URL as `/`. The authority therefore ends at
  the backslash and the rest becomes the path. Python's RFC-3986 parser does
  not: the authority runs to the first `/`, so `@evil.example` is userinfo +
  host. Three accepted URLs where the two parsers disagree:
  ```
  WRONG  200 yt=1 node=www.youtube.com  py=evil.example                "https://www.youtube.com\@evil.example/watch?v=x"
  WRONG  200 yt=1 node=www.youtube.com  py=evil.example                "https://www.youtube.com\\@evil.example/watch?v=x"
  WRONG  200 yt=1 node=www.youtube.com  py=www.youtube.com\.evil.example "https://www.youtube.com\.evil.example/x"
  ```
  and the real bundled engine confirms it does not see YouTube:
  ```
  $ resources/bin/yt-dlp --simulate 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    [youtube] Extracting URL: ...
  $ resources/bin/yt-dlp --simulate 'https://www.youtube.com\@evil.example/watch?v=dQw4w9WgXcQ'
    [generic] Extracting URL: ...        <- the arbitrary-URL extractor
  ```
  The other 36 URLs are all handled correctly, which is worth saying plainly:
  run 1's six bypasses (`#youtube.com`, `youtube.com@evil`, path, query,
  link-local, loopback) are all **400 with no child spawned**, and so are
  suffix tricks (`youtube.com.evil.example`, `youtube.com.br`), punycode and
  unicode lookalikes (`xn--yutube-dva.com`, `yoùtube.com`, Cyrillic
  `уoutube.com`), the ideographic full stop `youtube.com。evil.example`,
  IP-literal forms (decimal, hex, short, `[::1]`), `ftp:`, `file:`, `data:`,
  `youtu.be.evil.example`, and userinfo on a genuine host. Tab and newline
  inside the authority are caught too, because the WHATWG parser strips them
  and the `username` check then fires. Only `\` survives.
- **Honest bound**: that the engine then *fetches* the attacker's host is
  inference from the parser and the extractor choice. I could not observe the
  fetch: in this container even a plain `http://127.0.0.1:<port>/` fetch from
  `resources/bin/yt-dlp` times out with nothing arriving at a local listener
  (control run in `logs/ssrf-control.txt`), so the request half is **not
  provable here**. The validation bypass itself is measured. Cookies would not
  travel: yt-dlp matches jar entries by domain.
- **Severity note**: kept at major, as run 1 and slice 3 kept G-3, because this
  is the single control that keeps the engine pointed at YouTube and it is
  defeated by one character with no workaround for the user. It is *less*
  reachable than run 1's version — after the G-2 fix only the user pasting a
  link, a local process, or a page on the always-allowed `:8080` origin
  (**G2-10**) can reach `/api/info` at all.
- **Proof**: `audit/run-2/area-G/out/g7-urls.json`
  (`wrong`, `differentialsAccepted`, per-row `nodeHost` / `pythonHost` /
  `argvFirst`); `logs/extractor-choice.txt` (the real engine's `[youtube]` vs
  `[generic]` lines); `logs/ssrf-control.txt` (the control described below)
- **Suspected file**: `server/index.ts:466-481` (`isYouTubeUrl` — parses with
  `new URL`, which is not the parser the engine uses), `:483-486` (`urlSchema`)

---

### G2-3  `quality` is still an unvalidated free string, and a non-numeric value still skips the sign-in requirement

- **Severity**: minor
- **Status**: confirmed
- **Note**: this is run-1 **G-14**, unchanged and not claimed fixed. It is
  re-filed because the sign-in gate is a *security-adjacent* control and the
  numbers are now measured against the fixed tree.
- **Steps**:
  1. `node audit/run-2/area-G/g9-fields.cjs` (section A).
  2. `POST /api/download` with `quality` set to each of `1080`, `1080p`,
     `../../etc/passwd`, `NaN`, `-1`, `0`, `1000000000`, and three shell
     payloads; read the status, whether a `--simulate` session probe ran, and
     the `--format` the child got.
- **Expected**: `z.enum(["best","1080","720","480","360"])` for mp4 and
  `z.enum(["320","192","128"])` for mp3 — the only values `computeBitrates`,
  `estimateNeededMb` and the format ladder understand.
- **Actual**: `quality: z.string().default("best")` (`server/index.ts:592`), and
  `requiresVerifiedSession` is `quality === "best" || Number(quality) > 360`
  (`:1411`), so anything non-numeric is `NaN` and the gate never runs:
  ```
  quality               status  session probe  what happened
  "1080"                401     -              YOUTUBE_AUTH_REQUIRED (correct)
  "best"                401     -              correct
  "1000000000"          401     -              correct
  "1080p"               200     none           gate skipped, downloaded
  "../../etc/passwd"    200     none           gate skipped, downloaded
  "NaN" / "-1" / "0"    200     none           gate skipped, downloaded
  "360; touch <canary>" 200     none           gate skipped, downloaded
  ```
  The value is pasted verbatim into the format selector
  (`--format bestvideo[height=1080p][ext=mp4]...`), into mp3's
  `--audio-quality`, and into ffmpeg's `-b:a ${quality}k` — where a payload
  makes the trim fail with a 500 carrying ffmpeg's dump (**G2-6**).
  **Nothing reaches a shell**: the canary directory was empty after every
  payload in every field (`;`, `$(…)`, backticks, a newline plus `--exec=`),
  for `quality`, `jobId`, mp3 bitrate and the segment numbers — so run 1's
  "no shell" clearance now covers the non-URL inputs too. Unknown body fields
  (`output`, `cookies`, `ffmpegLocation`) are still stripped by zod and never
  appear in `argv.log`.
- **Proof**: `audit/run-2/area-G/out/g9-fields.json` (`quality`, `mp3`,
  `otherFields`, `canaryFilesCreated: []`)
- **Suspected file**: `server/index.ts:592`, `:1411-1412`, `:1623-1650` (the selector), `:1693` (`--audio-quality`), `:2019` (`-b:a`)

---

### G2-4  G-11 was never applied: a malformed body still answers with an Express HTML stack trace carrying absolute install paths — now on seven routes

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-G/g8-errors.cjs` (section C).
  2. On the correct verb and route, `POST /api/info` with
     `content-type: application/json` and body `{ not json`. Repeat with
     `null`, `"hi"`, `42`, a truncated object and a 10 MB body, across all
     seven POST routes.
  3. Also send a gzip bomb: `content-encoding: gzip`, 102 KB compressed,
     100 MB inflated.
- **Expected**: `{"error":"..."}`, which is what every other bad body returns.
  The brief lists G-11 as fixed; `T1.md`'s own table does not include it, and
  there is no `(err, req, res, next)` middleware anywhere in
  `server/index.ts`.
- **Actual**: **42 of 91** body-shape requests came back as HTML, every one of
  them with a stack trace and an absolute path:
  ```
  shape              status  content-type            html  stack  routes
  "{ not json"       400     text/html; charset=utf-8  yes   yes    7
  truncated object   400     text/html                 yes   yes    7
  null / "hi" / 42   400     text/html                 yes   yes    7 each
  10 MB body         413     text/html                 yes   yes    7
  93 KB valid body   200/400 application/json          no    no     -
  array / empty / no content-type / text/plain / 400-deep nesting
                     400     application/json          no    no     -
  POST /api/info  body "{ not json"
    <!DOCTYPE html> … <pre>SyntaxError: Expected property name or '}' …
      /home/user/stream-trimmer/node_modules/.cache/g2-area-G/server.cjs:…
  ```
  The new `POST /api/download/cancel` adds a seventh affected route. The limit
  is still `express.json()`'s undocumented 100 KB (93 KB passes, 10 MB is 413),
  and a 200 KB URL in an otherwise valid body is a 413 HTML page too. The gzip
  bomb is correctly bounded — 413 after inflation, the server answers 200 on
  the next request — but it answers with the same HTML page. It also reaches
  the documented `POST /api/download/cancel?jobId=<id>` form: every realistic
  body shape answers `200 {"ok":true,"found":false}`, but a literal `null` JSON
  body turns that call into the HTML page too
  (`out/g3b-cancel-query.json`).
- **Proof**: `audit/run-2/area-G/out/g8-errors.json` (`bodies[]` with
  `looksHtml` / `hasStack` / `absPaths`, `htmlResponses: 42`,
  `htmlWithAbsPaths: 42`, `gzipBomb`)
- **Suspected file**: `server/index.ts:647` (`app.use(express.json())`, no
  `limit`, no error handler after it)

---

### G2-5  Cancel does not stop the join: the request keeps re-encoding for as long as it takes, after answering the cancel

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-G/g4-cancel.cjs` (section E).
  2. Make a job whose join must be re-encoded and is long (20 ranges; each
     piece comes back as the whole 30 s fixture, so the copy join is 600 s
     against 580 s expected and the re-encode runs for tens of seconds).
  3. Once `join:` appears in the log, `POST /api/download/cancel`.
  4. Watch the process table for `ffmpeg -f concat` and time the
     `/api/download` response.
- **Expected**: what the contract says — "every yt-dlp and ffmpeg child of that
  job is killed with its process group".
- **Actual**: the join ffmpeg is started by `segments.ts: runProcess`, which is
  not `detached` and is never handed to `trackChild`, so nothing can kill it.
  The cancel POST returns `200 {"ok":true,"found":true}` immediately and the
  download request then sits for the whole re-encode:
  ```
  before cancel : 11109 … Rl  /tmp/…/bin/ffmpeg -y -f concat -safe 0 -i /tmp/…/ytclip-72d…
  cancel        : 200 {"ok":true,"found":true}
  /api/download : 499 {"error":"Cancelled"}   after 40,628 ms
  work folders after : []        usage: 0 folders, 0 bytes
  ```
  40.6 s of CPU and a 600 s file written after the user cancelled — and the
  clip folder is removed while ffmpeg still has the output open, so the space
  it keeps writing is invisible to both `du` and `/api/cache/usage` until it
  exits. With a 1080p source the re-encode is minutes (**see the cost section**).
  Everything else about cancel is correct — see the HELD rows below.
- **Proof**: `audit/run-2/area-G/out/g4-cancel.json` (`cancelDuringJoin`:
  `answeredInMs: 40628`, `concatFfmpegBefore`, `joinLog`)
- **Suspected file**: `server/segments.ts:280-299` (`runProcess` — no
  `detached`, no spawn callback), `server/index.ts:2088-2098` (the `joinSegments`
  call site passes `run:` without tracking the child)

---

### G2-6  Any ffmpeg failure in the cut is handed to the user as a wall of ffmpeg's own stream dump

- **Severity**: minor
- **Status**: confirmed
- **Note**: the sibling of run-1 G-9's "the error is ffmpeg's version banner".
  `-hide_banner` was added, but the message is still built from the last eight
  stderr lines, and the local trim now *decodes* the file, so it prints a full
  input dump before it fails.
- **Steps**:
  1. `node audit/run-2/area-G/g8-errors.cjs` (section D) — replace `clip.mp4`
     with a directory of the same name under a live job.
  2. `node audit/run-2/area-G/g9-fields.cjs` (section C) — mark a range of
     1e-9 s.
  3. `node audit/run-2/area-G/g9-fields.cjs` (section A, mp3) — `quality` with
     a payload in it, which lands in `-b:a`.
- **Expected**: a sentence. The failure table already has rows with a cause and
  one action.
- **Actual**: the `error` and `cause` the UI renders are ffmpeg's metadata
  dump, and they carry absolute paths:
  ```
  500 {"code":"unknown","error":
   "handler_name    : VideoHandler\n      vendor_id       : [0][0][0][0]\n
    encoder         : Lavc60.31.102 libx264\n  Stream #0:1[0x2](und): Audio: aac (LC) …\n
    /tmp/…/ytclip-0345afb767927b4d-84fc69c4cb/clip.mp4: Is a directory.
    Try again. …"}
  ```
  A 1e-9 s mark produces `500 "YouTube refused the media request for this
  video: handler_name : VideoHandler …"` — it blames YouTube for an empty
  ffmpeg output. An mp3 `quality` payload gives
  `500 "Stream mapping:\n Stream #0:1 -> #0:0 (aac (native) -> mp3 …"`.
  Two improvements worth recording in the same breath: the directory case is no
  longer the **false success** run-1 G-16 reported (it was `200 {"size":4096}`;
  it is now a 500), and the damaged-source message is a real sentence
  (**G-9 HELD**).
- **Proof**: `audit/run-2/area-G/out/g8-errors.json` (`directoryAsClip`),
  `out/g9-fields.json` (`segments[7]`, `mp3[1..2]`)
- **Suspected file**: `server/index.ts:1826-1850` (`runStreaming`'s eight-line
  stderr tail becomes `err.tail`), `:2424-2440` (`tail` → `classifyFailure` →
  the user-facing `error`/`cause`)

---

### G2-7  A finished clip waiting to be collected is invisible to the cache figure and cannot be cleared for 30 minutes

- **Severity**: minor
- **Status**: confirmed
- **Side effect of**: the G-8 fix (`holdFolder` + `HANDOFF_HOLD_MS`).
- **Steps**:
  1. `node audit/run-2/area-G/g6-cache.cjs` (section 2/3).
  2. Run five `deliver:"path"` downloads and do not collect them (which is what
     happens whenever the main process's move fails — run-1 D-10 — or the app
     is killed between the 200 and the move).
  3. `GET /api/cache/usage`, then `POST /api/cache/clear`, then compare with
     what is really in the temp root.
- **Expected**: the figure describes the disk, or at least says what it is
  leaving out in a way the Downloads panel can show. `cacheUsage()` does return
  `protectedFolders`, so the data exists.
- **Actual**: `cacheUsage()` skips protected folders entirely, so their bytes
  are not counted anywhere:
  ```
  five uncollected clips      : all five on disk, 319,308 bytes in the temp root
  GET /api/cache/usage        : {"folders":0,"bytes":0,"protectedFolders":5}
  POST /api/cache/clear       : {"ok":true,"removed":0,"skipped":5,"bytes":0}
  after the clear             : all five still on disk
  after a server restart      : {"folders":5,"bytes":319308}  -> clear removes them
  ```
  The user is told nothing is using the cache while five clips are, and the one
  control that frees space removes none of them for half an hour. With real
  clips that is hundreds of megabytes reported as zero. The hold itself is
  right — it is what keeps the handed-over clip alive — and it does not
  outlive a crash: the registry is per process, so after a restart the folders
  are clearable again (measured above), which answers the brief's question: a
  held folder cannot survive a crash and fill the disk, it just waits for the
  weekly sweep like any other leftover. No *unreleased* protection was found: a
  battery of success / hard failure / no-output / cancel / hang-up / stream /
  bad-body requests left exactly one protected folder, and that one was the
  deliberate hand-off hold (59,189 bytes, the one `deliver:"path"` success).
- **Proof**: `audit/run-2/area-G/out/g6-cache.json` (`handoffHold`,
  `leakDetector`)
- **Suspected file**: `server/resumeCache.ts:115-131` (`cacheUsage` drops
  protected folders from both counters), `:142` (`HANDOFF_HOLD_MS`), `:172-179`
  (`holdFolder` / `releaseHold`),
  `server/index.ts:2322` (`holdFolder(clipDir)`; `releaseHold` is exported and
  never called by any product code)

---

### G2-8  `/api/download/progress` still invents a live download for any string, and still forgets a finished job after five seconds

- **Severity**: minor
- **Status**: confirmed
- **Note**: run-1 **G-13**, unchanged (not claimed fixed). Re-measured because
  the renderer's cancel flow now depends on this channel for the `error`
  phase.
- **Steps**: `node audit/run-2/area-G/g9-fields.cjs` (section D);
  `node audit/run-2/area-G/g4-cancel.cjs` (section F).
- **Expected**: an id with no job behind it is a 404, or an event that says so;
  a finished job keeps saying it finished.
- **Actual**:
  ```
  jobId=job_never_existed      data: {"phase":"downloading","percent":0}
  jobId=../../etc/passwd       data: {"phase":"downloading","percent":0}
  jobId=<3000 chars>           data: {"phase":"downloading","percent":0}
  jobId=job_done_1 right away  data: {"phase":"done","percent":100}
  jobId=job_done_1 six s later data: {"phase":"downloading","percent":0}
  GET /api/download/progress (no jobId) -> 400, no content-type, 0 bytes
  ```
  The last two lines are run-1 G-13 and G-15 exactly. On the fixed tree the
  cancel path at least publishes a real terminal event
  (`{"phase":"error","percent":0,"message":"Cancelled"}` arrives on the channel
  before the 499), so a cancelled download is distinguishable while its channel
  lives.
- **Proof**: `audit/run-2/area-G/out/g9-fields.json` (`progress`),
  `out/g4-cancel.json` (`progressAfterCancel`)
- **Suspected file**: `server/index.ts:2581-2589` (`getOrCreateJob` invents a
  channel for any string), `:2605-2613` (the 5 s delete), `:2618`
  (`res.status(400).end()`)

---

### G2-9  The cancel contract handed to the renderer is wrong about shared job ids: one cancel cancels every job with that id

- **Severity**: polish
- **Status**: confirmed
- **Steps**: `node audit/run-2/area-G/g3-isolation.cjs` (section 3) — start two
  identical downloads **with the same `jobId`**, then cancel that id once.
- **Expected**: `T1.md`'s contract: *"Jobs are registered per request, so two
  jobs with the same jobId or the same clip are independent; cancelling one
  does not touch the other."*
- **Actual**: `cancelJob(id)` loops over every `ActiveJob` registered under the
  id, so both requests are cancelled:
  ```
  POST /api/download/cancel {"jobId":"job_same"} -> 200 {"ok":true,"found":true}
  A -> 499 cancelled      B -> 499 cancelled
  ```
  The *same clip* half of the contract does hold (two different ids, same
  video/quality/ranges: A cancelled within 600 ms, B finished 200 with its own
  12.02 s clip on disk). Filed as polish only because the renderer derives
  `job_${Date.now()}_${6 random base36}` per click
  (`src/hooks/useClipper.ts:652`), so a collision is not realistically
  reachable — but the written contract is what the next caller will trust.
- **Proof**: `audit/run-2/area-G/out/g3-isolation.json` (`sharedJobId`,
  `cancelOneOfTwo`)
- **Suspected file**: `server/index.ts:1293-1302` (`cancelJob`), and
  `audit/run-1/fixes/T1.md`'s contract section

---

### G2-10  `http://localhost:8080` and `http://127.0.0.1:8080` are allowed origins in every build, including packaged ones with no dev server

- **Severity**: minor
- **Status**: confirmed
- **Steps**: `node audit/run-2/area-G/g1-bind-cors.cjs` (the `origins` matrix),
  on a server whose own port is **not** 8080.
- **Expected**: the packaged app's allowlist is the app's own origin. The dev
  renderer's origin only exists while `npm run dev:client` is running.
- **Actual**: `ALLOWED_ORIGINS` is built from `[PORT, 8080]` unconditionally
  (`server/index.ts:617-622`), so any web content served from port 8080 on the
  user's machine can drive the whole API:
  ```
  Origin: http://localhost:8080    POST /api/info -> 200
      access-control-allow-origin: http://localhost:8080   yt-dlp runs: 1
  Origin: http://127.0.0.1:8080    POST /api/info -> 200   yt-dlp runs: 1
  ```
  Port 8080 is one of the most commonly occupied local ports (any other app's
  local UI, any other project's dev server), and anything on it inherits the
  ability to read the metadata/transcripts/comments the user is working with,
  spawn downloads, and clear the cache. Everything else about the guard is
  right — see the G-2 HELD evidence below.
- **Proof**: `audit/run-2/area-G/out/g1-bind-cors.json` (`origins[5]`,
  `origins[6]`)
- **Suspected file**: `server/index.ts:617-622`

---

### G2-11  Pre-flight diagnostics carry the job id and the engine's stderr but never any log lines

- **Severity**: polish
- **Status**: confirmed
- **Note**: the F-5 fix holds for what it was filed for; this is the remaining
  half of the bundle.
- **Steps**: `node audit/run-2/area-G/g9-fields.cjs` (section E) — drive the
  five pre-flight failures and read `diagnostics` off the wire.
- **Expected**: `T1.md`: "every pre-flight failure … carries `diagnostics`
  (job id, versions, log lines)".
- **Actual**: all five carry `diagnostics` with the right `jobId`, versions and
  an `stderrTail` — and `logLines: 0` in every one:
  ```
  probe failure            502 engine_behind         diagnostics yes  jobId ok  stderrTail 2  logLines 0
  out point past the end   400 out_point_past_end    diagnostics yes  jobId ok  stderrTail 1  logLines 0
  1080 with no session     401 YOUTUBE_AUTH_REQUIRED diagnostics yes  jobId ok  stderrTail 1  logLines 0
  rate limited             429 YOUTUBE_RATE_LIMITED  diagnostics yes  jobId ok  stderrTail 1  logLines 0
  stale session            401 YOUTUBE_AUTH_REQUIRED diagnostics yes  jobId ok  stderrTail 1  logLines 0
  ```
  `jobLogs` is keyed by a `job=<id>` token appearing in a logged line
  (`server/index.ts:135`), and the pre-flight log lines (`/api/download probe
  url=…`, `/api/download auth mode=…`) do not carry one, so the per-failure
  bundle has no log section for exactly the failures F-5 was about. Every
  bundle also carries `diagnostics.homeDir` (`/root` here) unredacted, which is
  the deliberate behaviour run 1 recorded for area F.
- **Proof**: `audit/run-2/area-G/out/g9-fields.json` (`preflightDiagnostics`)
- **Suspected file**: `server/index.ts:126-152` (the `job=` key), `:1361`
  (`/api/download auth mode=` is logged before the job id exists)

---

### G2-12  The cut is one frame short at the tail of a range whose in-point is off the frame grid, and the two ranges round differently

- **Severity**: polish
- **Status**: confirmed
- **Steps**: `node audit/run-2/area-G/g2-frames.cjs` (cases A and C), then read
  `frames.sourceTimesInOrder`.
- **Expected**: either behaviour is defensible; they should at least agree.
- **Actual**: for `[0.50–2.25]` the delivered frames are 0.52 … 2.20 (43 of the
  43.75 frame intervals marked — the frame starting at 2.24 is dropped), while
  for `[10.10–12.35]` they are 10.12 … 12.32 and the last frame runs to 12.36,
  0.01 s past the out point. Both lose at most 40 ms of marked content and
  neither adds unmarked content, which is the right trade; the asymmetry comes
  from `-t` being applied to an output whose timestamps were shifted by the
  sub-frame seek remainder. **This is not the G-4 defect returning**: 0 frames
  from before an in-point in every case measured.
- **Proof**: `audit/run-2/area-G/out/g2-frames.json` (cases
  `A-subsecond-multi-localtrim`, `C-single-subsecond`)
- **Suspected file**: `server/index.ts:1189-1219` (`localTrimArgs`: `-ss`
  before `-i` plus `-t`)

---

## The fixes that held, with the evidence

**G-2 — bind and origin. HELD, on both runtimes.**
```
direct server (g1-bind-cors):
  /proc/net/tcp LISTEN row for the port : local address 0100007F  (= 127.0.0.1)
  socket inode 3413998 -> pid 30604 = the server process
  GET http://192.0.2.2:<port>/api/cache/usage    -> connect ECONNREFUSED
  POST http://192.0.2.2:<port>/api/download      -> connect ECONNREFUSED
      (run 1 got 200 here and left a 981,457-byte file; no work folder exists now)
  CONTROL, my own 0.0.0.0 server, same probe    -> 200 via 192.0.2.2
      (so the probe discriminates; row 00000000)
  Origin https://evil.example  POST /api/info   -> 403 {"error":"Forbidden origin"}, yt-dlp runs: 0
  Origin null / https on the own port / trailing slash / uppercase host -> 403
  OPTIONS /api/download Origin evil             -> 403, no allow-origin
  text/plain POST /api/cache/clear from evil    -> 403, the decoy folder survived
  Host: evil.example | 127.0.0.1.nip.io | 127.0.0.2 | 0.0.0.0 | ""  -> 403
  Host: localhost | 127.0.0.1 | [::1] | LOCALHOST  -> 200
  no Origin at all (Electron main, curl)        -> 200   (needed, and loopback-only)

real packaged app (g10-app, xvfb):
  window URL http://127.0.0.1:40715/   apiBase the same
  /proc row 0100007F, inode 3579136 -> pid 1770 = electron main.cjs
  from the renderer: /api/info 200, /api/transcript 200, /api/comments 200,
      /api/auth/youtube/status 200, /api/cache/usage 200,
      /api/download/cancel 200, /api/download 200 (clip on disk),
      EventSource /api/download/progress -> {"phase":"downloading","percent":0}
  from outside: no Origin 200, foreign Origin 403, text/plain clear 403,
      Host rebinding 403, 192.0.2.2 ECONNREFUSED
  the UI itself: sign-in gate shown, "Continue without signing in" worked,
      a pasted link loaded and "Stub video" rendered; 0 page errors
```
So the server was secured **without** breaking the app: the renderer, its SSE
channel and its new cancel call all work in the packaged shape.

**G-1 — isolation. HELD** (resume is the regression, G2-1). Two identical
downloads 1.2 s apart: different per-request folders
(`ytclip-6ba298865b417666-8bef0543d9` / `-21c03989f5`), both files on disk,
each reported `size` equal to the file at its own path, both 12.02 s for 12.00 s
marked, and the shared keyed folder removed when empty. Cancelling one left the
other alone: A `499`, B `200` with a 348,555-byte 12.02 s clip that survived A's
cleanup. Six different clips at once: six distinct paths, every size matching
its own file, and `/api/download/cancel` and `/api/cache/usage` still answering
while they ran.

**G-5 — cookie provenance. HELD, both directions.** From the children's own
argv, with a real jar in `YT_CLIPPER_COOKIE_FILE`:
```
/api/info                    runs=1  canonical=0  privateCopy=1
/api/transcript              runs=1  canonical=0  privateCopy=1
/api/comments                runs=1  canonical=0  privateCopy=1
/api/auth/youtube/status     runs=1  canonical=0  privateCopy=1   (one copy covers the 3-URL loop)
/api/download (quality best) runs=3  canonical=0  privateCopy=3
15 route x write-back pairs (empty / header-only / no auth cookie):
   jar 215 -> 215 bytes, sha unchanged, signed in: true -> true, in every one
4 concurrent pairs with the write-back split around a 250 ms pause:
   215 -> 215 bytes, 2 cookie lines, still signed in  (run 1: 307 -> 461, spliced)
leftover /tmp/ytcookie-* copies: none
```
And it is still *refreshable*, which a protection this strict could easily have
broken: a successful download promoted a valid newer jar (215 → 158 bytes,
carrying the new `SID`), a failed one discarded it, and `/api/info` never
promotes.

**G-6 — a wrong-length join. HELD.** Three 5 s marks whose pieces join to
90.04 s: `500 {"code":"join_failed"}`, both lengths in the message ("came out
90.04s long but the marked ranges total 15.00s"), an action, `preserved` text,
`diagnostics`, **no `path`**, and no folder left behind. The server's three log
lines now match what the client is told.

**G-8 — Clear cache. HELD.** Clear while a three-segment job had already
written `seg-01.mp4`: `{"removed":1,"skipped":2}` — the planted abandoned
folder went, the job's two folders were skipped, and the job finished `200` with
a correct 12.02 s clip that also survived a second Clear. (Slice 2's A3 case,
which used to die with `join_failed`, now completes.)

**G-9 — a damaged cached download. HELD.** A truncated 327,152-byte
`source.mp4` planted in the keyed folder: `cached download … is not readable
media — discarding and fetching it again`, then a 4.00 s playable clip, three
attempts in a row. When every fetch is damaged: `500 "The downloaded video file
is damaged and was discarded, so nothing could be cut from it"` — a sentence,
no ffmpeg banner, and `Try again` now actually can work because the poison is
deleted.

**G-10 — cancel. HELD for the engine.** Measured from `/proc` state letters,
with the engine as a grandchild of a `/bin/sh` wrapper:
```
cancel route : cancel 200 in 8 ms, /api/download 499; engine Z at +0ms, gone by +1.2s
               shell wrapper gone at +0ms
hang-up      : both gone within 200 ms; "client went away … cancelling" in the log
CONTROL      : the same engine left alone is S (running) for the whole 4 s window
               and the request ends 200 with its clip
between segments: cancelled during segment 2 of 3 — no third segment ever started
auth probe   : the client left mid-probe; no further --simulate child was started
unknown id   : 200 {"ok":true,"found":false}      "../../etc/passwd" likewise
missing id   : 400 {"error":"jobId is required"}  (JSON, not HTML)
late cancel  : 200 {"found":false} and the finished clip is untouched, byte for byte
```

**E-7 — CSV. HELD, in both writers.** `server/csv.ts: csvCell` driven directly:
`=cmd|' /C calc'!A1`, `=HYPERLINK(…)`, `+1+1`, `-2-2`, `@SUM(1:1)`, `@`,
`\t=1+1`, `\r=1+1`, `=2+5+cmd|…` and a mixed emoji/RTL formula are all prefixed
`'` and still RFC 4180; `-5`, `+5.5`, `5`, numeric `-5`, `0` and `null` are left
alone; ` =1+1`, `"=1+1`, `0x3D=1+1` and `DDE('cmd';…)` are untouched and are not
formulas to a spreadsheet. `src/lib/channel.ts: rowsToCsv` now carries the same
two regexes, so the gap T1 flagged as blocked is closed.

**F-5 — diagnostics. HELD** (with G2-11): all five pre-flight failures carry
`diagnostics` with the job id and the engine's stderr.

### Also cleared this run

- **`deliver:"stream"`, the browser path, still works and still cleans up**:
  `200`, `content-type: video/mp4`, `content-length: 109953` matching the log's
  `sent job=job_stream bytes=109953`, the `X-Segments` / `X-Auth-Mode` headers
  present, and the work folder gone afterwards (`usage: 0 folders, 0 bytes`).
  (My harness decodes the body as text, so its own byte count is not evidence;
  the content-length and the server's sent-byte line are.)
- **Segment validation is intact**: 21 ranges → `400 "A clip can join at most
  20 segments"`; an out point past the real duration → `400 out_point_past_end`
  with `00:01:30` / `00:00:30` in the sentence; `Infinity`, a string start, a
  string `segments` → `400` with a readable message and no child spawned.
  A sub-frame range (0.02 s, and even 0.001 s) does **not** fail the job — it
  delivers one frame, 0.04 s.
- **Unknown body fields are still stripped**: `output`, `cookies` and
  `ffmpegLocation` sent in the body never appear in any child's argv.
- **Prototype pollution is still harmless**: `__proto__` and
  `constructor.prototype` payloads are accepted as ordinary requests and the
  next request behaves identically.
- **Nothing reaches a shell, for any input** — see G2-3's canary result.
- **The boot-time stale sweep still works**: an 8-day-old folder removed
  (`swept 1 stale work folder(s)`), a fresh one kept.
- **A finished `clip.mp4` left in a work folder is still never reused**: a
  planted text marker stayed untouched in the keyed folder and a fresh,
  playable 4.00 s clip was produced in the per-request folder.

---

## The cost of the G-4 fix, measured

Not filed as a defect — the fix's author disclosed it — but the numbers should
exist somewhere. Real bundled ffmpeg, the production argument list (asserted
present in `server/index.ts` at run time), one core of this container:

| cut | re-encode (now) | copy (before) | slower by | realtime |
|---|---|---|---|---|
| 360p, 60 s | 4.9 s | 0.11 s | 45x | 12.2x |
| 360p, 300 s | 21.4 s | 0.50 s | 43x | 14.0x |
| 1080p, 60 s | 14.1 s | 0.10 s | 140x | 4.2x |
| 1080p, 119 s | 31.0 s | 0.24 s | 132x | 3.8x |

A 600 s clip (the cap) at 1080p is therefore ~158 s of CPU on this machine,
against ~1 s before, on the path taken whenever the sectioned URLs 403.
**Nothing times out**: driven end to end, a 300 s cut on the local-trim path
finished `200` in 26 s with a 300.00 s clip, 35 progress events and a worst gap
between events of 1.5 s, so the bar keeps moving. The output is also a second
generation encode (crf 18) rather than YouTube's own bytes — no longer
bit-identical to the source, which the frame-identity margin shows as a worst
distance of 0.095 against a runner-up gap of 0.286.

Two other costs of the G-1 fix, for the record: a second identical download now
duplicates all the work (measured: 2 metadata probes, 2 sectioned runs, 2
whole-file runs for one clip) and cannot resume from the first job's partials.

---

## Run-1 findings that are still open (none were claimed fixed)

Re-measured on this tree so the action plan does not have to guess:

- **G-13 / G-15** — see G2-8 above.
- **G-14** — see G2-3 above.
- **G-17** — the ENOSPC path is **right**: TMPDIR on a 512 KB tmpfs gives
  `507 disk_full`, "this clip needs about 7 MB and 0 MB is free",
  `choose_other_folder`. The gap run 1 filed remains: an engine that exits 0
  having written nothing still gets `500 "yt-dlp produced no output. Try
  again."` with no free-space check (`out/g8c-diskfull.json`).
- **G-18** — a planted `ytclip-NOT-OURS-0000` is still counted in
  `/api/cache/usage` (1 folder, 1024 bytes) and still deleted by Clear. In the
  packaged-app run the app reported `22 folders` because other audit runs'
  folders were in `/tmp`.
- **G-19** — a null byte in the URL still answers `400 {"error":"The argument
  'args[0]' must be a string without null bytes. Received '…'"}`. `%00`, BEL
  (`\u0007`) and an RTL override (`‮`) pass validation and are handed to
  the engine as one argv element.
- **G-12** (`settings.json` silently emptied) is T2's, not re-run here.
- **G-7** (`concatReencodeArgs` has no `-af aresample`) is untouched in
  `server/segments.ts`. It now matters less: every join I measured on the fixed
  tree chose **copy**, because the trimmed pieces are already re-encoded and
  match. The re-encode join is only reached when the copy join's length is
  already wrong, and that outcome is now a hard failure (G-6), so the
  truncated-audio output is no longer delivered to anyone.

---

## Not provable here

- **Real yt-dlp against YouTube.** Everything engine-side is the fake; the
  sectioned path's real cut accuracy (`--force-keyframes-at-cuts`) is still
  unmeasurable, so G-4's HELD verdict covers the whole-file + local-trim path
  that the fix changed, plus an emulated sectioned cut that behaves identically.
- **Whether G2-2's URL is actually fetched.** The parser differential and the
  engine's extractor choice are measured; the request is not. A control proves
  why: in this container even `http://127.0.0.1:<port>/` from
  `resources/bin/yt-dlp` times out with nothing reaching a local listener.
- **Signed-in / 1080p behaviour.** No real session exists. The sign-in gate,
  the rate-limit and stale-session rows were driven through a scripted probe
  output, not a real verdict.
- **A real LAN neighbour.** The bind is proven loopback-only from the socket and
  from a refused connection on this machine's own non-loopback address; a
  given user's firewall is not this code's property.
- **Windows.** `killTree`'s `taskkill /T /F` branch and the backslash-in-path
  behaviour of the work folders were not exercised.

---

## Scripts

| Script | Covers |
|---|---|
| `glib.cjs` | free-port server launcher (esbuild bundle, no `tsx`, private TMPDIR, process-group kill), raw HTTP, `/proc/net/tcp` + inode→pid, `/proc` state letters |
| `gfake.cjs` | my fake engine: argv log, grandchild shape, cookie write-back, `failSections`, `partialBytes`, `cutSections`, `corruptSource`, `noOutput`, delays |
| `gframes.cjs` | frame identity against all 750 source frames, with the ambiguity margin |
| `g0-smoke.cjs` | proves the harness before anything is concluded from it |
| `g1-bind-cors.cjs` | G-2: bind, origin guard, Host rebinding, controls |
| `g2-frames.cjs` | G-4 / G-6 end to end, six shapes |
| `g3-isolation.cjs` | G-1, cancel isolation, unknown / missing / late cancel |
| `g3b-cancel-query.cjs` | the documented `?jobId=` form of the cancel call, five body shapes |
| `g4-cancel.cjs`, `g4b-killtree.cjs` | G-10, including the join-cancel gap and the zombie-safe kill measurement |
| `g5-cookies.cjs`, `g5b-refresh.cjs` | G-5 provenance, damage, concurrency, and the refresh path |
| `g6-cache.cjs` | G-8, the hand-off hold, the protected-folder leak detector |
| `g7-urls.cjs` | G-3: 39 hostile URLs and the parser differential |
| `g7b-ssrf-control.cjs` | the honest bound on G2-2: the parsers, the real engine, and the loopback control |
| `g8-errors.cjs`, `g8b-damaged.cjs`, `g8c-diskfull.cjs` | G-11, G-16, G-6, G-9, G-17 |
| `g9-fields.cjs` | G-14, G-13, G-19, F-5, E-7, segment edges, shell canaries |
| `g10-app.cjs` | the real packaged-shape Electron app (run under `xvfb-run`) |
| `g11-resume.cjs`, `g11b-partials.cjs` | resume, the stale sweep, and G2-1 |
| `g12-cost.cjs` | what the re-encode costs |
| `g13-extras.cjs` | stream delivery, six concurrent clips, duplicated work |

`out/` and `logs/` are gitignored like every other area's: re-run the script to
reproduce a finding.
