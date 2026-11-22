# Area G — Server and jobs

Scope: the loopback Express server and the work it spawns. `server/index.ts`,
`server/segments.ts`, `server/cookieJar.ts`, `server/quality.ts`,
`server/resumeCache.ts`, `electron/settingsStore.cjs`. Not the UI (other
helpers own that) and not `channelRoutes*` / `channelExport*` (area E).

No product file was changed. Scripts live in `audit/run-1/area-G/`, captured
console output in `audit/run-1/area-G/logs/`, machine-readable results in
`audit/run-1/area-G/out-g*/results.json`.

## How this area was driven

Two ways, on purpose:

1. **The real packaged-shape app**, through `audit/harness/app.cjs` under
   `xvfb-run`, for everything that has to be true *as shipped*: where the
   server listens, what it allows cross-origin, and what a malformed body
   returns. (`g13-asshipped.cjs`.) This loads `electron/dist/server.cjs` —
   the esbuild bundle of `server/index.ts` — into the Electron main process,
   exactly as `electron/main.cjs: startBackend` does in production.
2. **The same `server/index.ts` started directly** (`srv.cjs` spawns
   `tsx server/index.ts`, the same thing `npm run dev:server` runs) for the
   bulk of the matrix. Driving it over raw HTTP rather than through the page
   is what makes it possible to send bodies a browser `fetch()` refuses to
   send (no content-type, a lying `content-length`, a 10 MB payload), to point
   `YT_CLIPPER_COOKIE_FILE` at a test jar, and to kill individual children.
   Both paths agree on every finding that was checked on both.

**Harness extensions, disclosed.** `mk-gstub.cjs` builds its stub root from the
shared `audit/harness/make-stub-root.cjs` and then adds two observation points
the shared stub does not have, because area G has to prove how arguments reach
the child and what the child does to the file it was handed:

- `argv.log` — one JSON line per invocation with the exact `argv` array. This
  is what proves spawn-array-versus-shell rather than arguing it from the code.
- **cookie write-back.** Real yt-dlp rewrites whatever file it was given as
  `--cookies` on close (`YoutubeDL.save_cookies`, from `close()`); that is the
  whole reason `server/cookieJar.ts` exists. The shared stub does not write
  anything back, so the hazard cannot be observed with it. With
  `stub.json.cookieWriteBack` set, the patched stub writes that text to the
  path it was given, optionally in two halves with a pause between
  (`cookieWriteDelayMs`), which is what an interleaved save looks like on disk.
- `failJson` / `failDownload` — the shared stub checks `cfg.exitCode` *before*
  it answers `--version`, so setting it makes the version probe fail too and
  `resolveYtDlp()` then prefers a **system** yt-dlp, which reaches the network.
  These two flags fail only the invocation a test means to fail. Anyone
  reproducing a failure case must use them, not `exitCode`.

**The cut and concat pipeline was also exercised directly**, with real ffmpeg
(`resources/bin/ffmpeg`, the build the app bundles) against
`audit/fixtures/fixture.mp4`, importing the production module
(`server/segments.ts`: `resolveSegments`, `joinSegments`, `concatCopyArgs`,
`concatReencodeArgs`, `runProcess`, `probeDurationSec`) and the exact ffmpeg
trim arguments `server/index.ts` builds. Every output's duration was asserted
with ffprobe against the expected sum, and every output was decoded end to end
(`ffmpeg -xerror -f null -`) to confirm it is playable and carries both streams.
The fixture is 30.00 s, 640x360 H.264 + AAC mono, with keyframes only at
0 s, 10 s and 20 s — a 10 s GOP, which is what makes the cut behaviour visible.

Findings: **1 blocker, 10 major, 7 minor, 1 polish** (19 in all).

---

### G-1  Two downloads of the same clip at once share one work folder and corrupt each other, and both are told they succeeded

- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g6-races.cjs` (section "same-key race: job B
     deletes job A's work in flight"), or by hand:
  2. Start the server with the stub (`delayMs: 2500`).
  3. `POST /api/download?jobId=job_key_a` with
     `{url, quality:"360", format:"mp4", deliver:"path", segments:[{0,4},{10,14},{20,24}]}`.
  4. 4 s later, `POST /api/download?jobId=job_key_b` with the **same** body.
  5. Compare the two responses and probe the file they both name.
- **Expected**: either the second request is refused or coalesced onto the
  first, or the two jobs are isolated. A response that says `size: N` must
  describe the file at the path it returns.
- **Actual**: `workDir()` keys the folder on
  `[url, format, quality, "segments", ...ranges]` only, so both jobs get
  `/tmp/ytclip-6ba298865b417666/`. Both yt-dlp runs are given the same
  `--output /tmp/ytclip-.../seg-01.mp4` … `seg-03.mp4`; job B's start deletes
  job A's in-flight `clip.mp4`, `list.txt` and segment files
  (`server/index.ts:1249`), and `dropIntermediates()` in A's `finally` deletes
  B's. Both returned `200`:
  ```
  A -> {"path":"/tmp/ytclip-6ba298865b417666/clip.mp4","size":524336,"segments":3,"joinMethod":"reencode"}
  B -> {"path":"/tmp/ytclip-6ba298865b417666/clip.mp4","size":1166252,"segments":3,"joinMethod":"reencode"}
  ```
  Same path, two different sizes — whichever client reads second gets a file
  that does not match what it was told. Job A's own join could not even read
  its output back:
  ```
  [server] job=job_key_a join: re-encode done (?s, expected 12.00s, STILL OFF)
  [server] /api/download built job=job_key_a ... join=reencode
  [server] /api/download handing off job=job_key_a bytes=524336
  ```
  `(?s)` is `probeDurationSec` failing on a file another ffmpeg was writing at
  the same time. The job still answered `200`. There is no in-flight job
  registry anywhere in `server/index.ts` — no lock, no dedupe, no refusal.
  A user double-clicking Download, or two tabs on the same video with the same
  marks, reaches this. Story 15 reproduces it from the user's side.
- **Proof**: `audit/run-1/area-G/logs/g6.console.log` (section "same-key
  race"), `out-g6/results.json`; `logs/g11.console.log` story 15,
  `out-g11/results.json`
- **Suspected file**: `server/index.ts:1229-1255` (`workDir` key and the
  pre-emptive `rmSync` of the output and segment files), `1538-1558`
  (`dropIntermediates`), `server/resumeCache.ts:30` (`workDir`)

---

### G-2  The server listens on every network interface, not loopback, and allows any origin

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-1/area-G/g13-asshipped.cjs`
     (the real Electron app, packaged-shape server).
  2. Read the app's own port from `window.__API_BASE__`.
  3. Look the socket up in `/proc/net/tcp`, then make a request from a
     non-loopback address, from outside the renderer.
- **Expected**: `app.listen(PORT, "127.0.0.1")`. `electron/main.cjs` is careful
  about this for its own port picker (`srv.listen(0, "127.0.0.1")`), the
  inventory says "loopback only", and the README calls it "one loopback Express
  server".
- **Actual**: `server/index.ts:2298` is `app.listen(PORT, () => …)` with no
  host, so Node binds `0.0.0.0`:
  ```
  apiBase: http://127.0.0.1:43489
  /proc/net/tcp listening row: 00000000:A9E1      <- 0.0.0.0, not 0100007F
  http://192.0.2.2:43489/api/cache/usage -> 200 {"folders":1,"bytes":981457}
  ```
  `app.use(cors())` with no options sets `Access-Control-Allow-Origin: *` and
  answers the preflight for every verb, so any web page the user visits can
  also reach it once it finds the port:
  ```
  OPTIONS /api/download  Origin: https://evil.example
    -> 204  allow-origin: *  allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
  POST /api/info  Origin: https://evil.example  -> 200 (full metadata body)
  ```
  What is reachable without any credential: `/api/download` (spawns yt-dlp and
  ffmpeg, writes up to 600 s of video per call into the temp dir),
  `/api/info`, `/api/transcript`, `/api/comments`,
  `/api/auth/youtube/status` (which, with `browser:"app"`, makes the server
  hand the user's cookie jar to a child — see G-5), and `/api/cache/clear`
  (destroys in-flight work — see G-8). The port is random per launch, which is
  obscurity, not a control: it is a 16-bit space and the same-origin policy
  does not stop a cross-origin POST with a simple content type from being
  *sent*.
- **Proof**: `audit/run-1/area-G/out-g13/results.json`,
  `logs/g13.console.log`; also seen from the dev-server path in
  `logs/g3.console.log`
- **Suspected file**: `server/index.ts:2298` (`app.listen`), `server/index.ts:571`
  (`app.use(cors())`)

---

### G-3  Any URL containing the text "youtube.com" anywhere is accepted and handed to yt-dlp

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g4-endpoints.cjs` (section "URL FIELD:
     INJECTION + SSRF").
  2. `POST /api/info` with each of the URLs below and read `argv.log` to see
     what the child was actually given.
- **Expected**: the host is checked. A YouTube link means the *host* is
  `youtube.com`, `www.youtube.com`, `m.youtube.com` or `youtu.be`.
- **Actual**: `urlSchema` is
  `z.string().url().refine(v => /youtube\.com|youtu\.be/.test(v))` — a
  substring test over the whole URL, so the host is never checked. All of
  these passed validation and were spawned as yt-dlp's first argument:
  ```
  https://evil.example/collect?ref=youtube.com              200
  https://evil.example/youtube.com/x                        200
  https://youtube.com@evil.example/x                        200   (userinfo)
  http://127.0.0.1:22/youtube.com                           200   (loopback)
  http://169.254.169.254/youtube.com/latest/meta-data/      200   (link-local)
  file:///etc/passwd#youtube.com                            200   (file scheme)
  ```
  `file:///etc/passwd` on its own is correctly refused
  (`"URL must be a YouTube link"`) — adding `#youtube.com` is enough to get it
  through, and the fragment is part of the string the regex sees. So the one
  check that was meant to keep the engine pointed at YouTube is bypassed by a
  fragment. Together with G-2 this is reachable by any page the user visits
  and any host on their network: it makes the app an unauthenticated fetcher
  for arbitrary URLs, including ones only that machine can reach.
- **Proof**: `audit/run-1/area-G/out-g4/results.json` (`injection.seenRows`,
  fields `sentUrl` / `argvFirst` / `urlIsExactlyOneArgv`),
  `logs/g4.console.log`
- **Suspected file**: `server/index.ts:451-454` (`urlSchema`)

---

### G-4  A multi-range clip contains footage from before the in-point and runs long, because the concat demuxer ignores the edit list the cut created

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `npx tsx audit/run-1/area-G/g14-editlist.cjs` (a 40-line reproducer), or
     `npx tsx audit/run-1/area-G/g1-pipeline.cjs` for the full matrix.
  2. Mark two ranges whose in-points are not on keyframes —
     `[{0.5, 2.25}, {10.1, 12.35}]`, total 4.00 s — against
     `audit/fixtures/fixture.mp4` (keyframes at 0 s, 10 s, 20 s).
  3. Cut each with the arguments `server/index.ts: buildSegment` builds for the
     local-trim path: `-y -ss <start> -to <end> -i <src> -c copy -movflags
     +faststart <out>`.
  4. Join with the production `joinSegments` / `concatCopyArgs`.
  5. Probe each piece twice — normally, and with `-ignore_editlist 1`.
- **Expected**: 4.00 s of exactly the marked footage.
- **Actual**: `-ss` before `-i` with `-c copy` cannot cut on a non-keyframe, so
  ffmpeg keeps the packets back to the previous keyframe and hides them behind
  an mp4 edit list (first packet pts `-0.52`). Every player honours the edit
  list, so each **piece** measures right. ffmpeg's concat *demuxer* — what
  `segments.ts` joins with — reads raw packets and ignores edit lists, so the
  hidden pre-roll comes back in the joined file:
  ```
  piece 1: marked 1.75s
    what a player sees (edit list honoured) : 1.78s, 44 frames
    what is actually in the file            : 2.28s, 57 frames   first pts=-0.520000
    hidden pre-roll                         : 0.500s
  piece 2: marked 2.25s   hidden pre-roll   : 0.108s

  marked total            : 4.00s  (100 frames at 25fps)
  joined clip handed over : 4.54s  (115 frames)
  extra footage the user never marked: 0.540s  (15 frames)
  ```
  15 frames of content from *before* the mark are in the delivered clip. For a
  tool whose whole job is "this bit, not that bit", the output is wrong, not
  merely long. The server's own check notices the length
  (`DURATION_TOLERANCE_SEC = 0.5`) and runs the re-encode fallback, which
  re-encodes the same raw packets and is just as wrong (4.56 s) — see G-6 and
  G-7. Keyframe-aligned marks are unaffected
  (`out-g2/A-aligned-2x10s`: 20.008 s for 20.000 s, A/V gap 0 s), which is why
  this is invisible in round-number tests.
  This is the **whole-file + local-trim** path — the one taken whenever the
  sectioned URLs 403, which `server/index.ts:1514-1522` and its comments treat
  as routine. The sectioned path passes `forceKeyframesAtCuts`, so yt-dlp
  re-encodes around the cut and should not have the problem; that path cannot
  be exercised here because the stub does not cut (**not provable here**).
- **Proof**: `audit/run-1/area-G/logs/g14.console.log`,
  `out-g14/` (the two pieces and the joined clip),
  `out-g1/results.json` case `12-subsecond-multi`, `out-g2/results.json`
  cases `C-subsecond-2` and `E-10x1s-subsecond`
- **Suspected file**: `server/index.ts:1630-1659` (`trimArgs`: no
  `-force_key_frames`, no re-encode, `-ss` before `-i` with `-c copy`),
  `server/segments.ts:132-150` (`concatCopyArgs`, concat demuxer)

---

### G-5  /api/info, /api/transcript, /api/comments and /api/auth/youtube/status hand the user's real cookie jar to yt-dlp, bypassing cookieJar.ts — and a bad write-back silently signs the user out

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `npx tsx audit/run-1/area-G/g5-cookiejar.cjs`.
  2. Point `YT_CLIPPER_COOKIE_FILE` at a Netscape jar holding `SID` and
     `__Secure-3PSID`.
  3. For each endpoint, send `cookiesFromBrowser:"app"` (or `browser:"app"`)
     and read `argv.log` for the `--cookies` value.
  4. Repeat with the stub doing what real yt-dlp does on close: write the jar
     back. Try three write-backs a stale session produces — empty,
     header-only, and cookies without an auth cookie.
- **Expected**: what `server/cookieJar.ts`'s own header promises — "yt-dlp
  NEVER gets the canonical path. Every run gets a private copy in its own temp
  dir, so its write-back can only land on a throwaway."
- **Actual**: that promise holds for `/api/download` and nothing else. Only
  the download route goes through `withRunCookies`; the other four call
  `resolveCookieOptions()` directly, which returns `{ cookies: appCookieFile() }`
  — the canonical path:
  ```
  /api/info                   runs=1  canonical=1  privateCopy=0
  /api/transcript             runs=1  canonical=1  privateCopy=0
  /api/comments               runs=1  canonical=1  privateCopy=0
  /api/auth/youtube/status    runs=3  canonical=3  privateCopy=0   <- once per probe URL
  /api/download               runs=2  canonical=0  privateCopy=2
  /api/download (quality best) runs=6 canonical=0  privateCopy=6
  ```
  So the protections that exist only protect the one path that was already
  safe. On the four unprotected routes there is no validation, no atomic
  rename and no single-writer mutex, and a bad write-back destroys the saved
  sign-in outright:
  ```
  write-back is empty file           (via /api/info)     signedIn true -> false
  write-back is header only          (via /api/info)     signedIn true -> false
  write-back is cookies but no SID   (via /api/info)     signedIn true -> false
  the same three write-backs via /api/download           signedIn true -> true (discarded)
  ```
  Two concurrent runs on an unprotected route both write the file (8–17 writes
  to the canonical path during one pair), and an interleaved save leaves it
  structurally wrong — the `info + info` pair ended with 6 cookie lines and
  345 bytes where the input had 4 lines and 201 bytes, i.e. two half-writes
  spliced together. `/api/info` and `/api/transcript` are what the renderer
  calls on every URL paste, and `/api/auth/youtube/status` runs at launch, so
  these are the *most frequent* yt-dlp runs in the product, not rare ones.
  This confirms the design risk that was flagged, with the scope narrowed: the
  mitigation is real and correct, it is simply not wired into four of the five
  endpoints that need it.
- **Proof**: `audit/run-1/area-G/out-g5/results.json`
  (`provenance[]`, `results[]` — `signInLost`, `overwritten`,
  `canonicalWrites`), `logs/g5.console.log`
- **Suspected file**: `server/index.ts:491-500` (`resolveCookieOptions`),
  `791-821` (`/api/info`), `823-878` (`/api/transcript`),
  `2078-2154` (`/api/comments`), `1023-1061` (`/api/auth/youtube/status`);
  contrast `1575` where `/api/download` does it correctly

---

### G-6  A joined clip the server knows is the wrong length is delivered as a plain success

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g10-interruptions.cjs` (section "a joined clip
     whose duration fails the server's own check").
  2. `POST /api/download` with three 5 s ranges — 15 s marked.
  3. Read the response body, every `X-` header, and the file's real duration.
- **Expected**: when `joinSegments` returns `durationOk: false`, the client is
  told. The product already has the vocabulary for this — `sendFailure`'s
  cause/action/preserved shape, and the `warning` field the
  low-quality-without-a-session case uses on a 200.
- **Actual**: `durationOk` is read once, logged, and dropped
  (`server/index.ts:1738-1742`). The response is an unqualified success:
  ```
  status 200
  body   {"path":"...","size":1746206,"segments":3,"joinMethod":"reencode"}
  headers x-segments: 3   x-join-method: reencode
          (no x-quality-* and no duration header; no "warning" in the body)
  delivered 90.04s for a 15.00s request — 6x over
  server log:
    join: stream copy rejected (joined file is 90.02s, expected 15.00s); re-encoding
    join: re-encode done (90.04s, expected 15.00s, STILL OFF)
    joined clip is 90.04s, expected 15.00s even after reencode
  ```
  The server states the problem three times in its own log and says nothing to
  the only consumer that could act on it. The same thing happens on the
  realistic version of this (G-4), where the overshoot is 0.5 s rather than
  75 s: `out-g1/results.json` case `12-subsecond-multi` is 4.56 s for a 4.00 s
  request, `durationOk: false`, response 200, no warning. A user has no way to
  learn their clip is wrong except by watching it.
  (The 6x figure is a stub artifact — the stub writes the whole 30 s fixture
  per segment rather than cutting. What is *not* an artifact is the server's
  response to its own verdict, which is the finding.)
- **Proof**: `audit/run-1/area-G/out-g10/results.json`
  (`hasWarningField: false`, `deliveredSec: 90.04`, `serverJoinLines`),
  `logs/g10.console.log`, `logs/g11.console.log` story 4
- **Suspected file**: `server/index.ts:1737-1742` (`joinMethod` kept,
  `durationOk` discarded), `1875-1906` (the response headers),
  `1924-1949` (the `deliver:"path"` body)

---

### G-7  The re-encode fallback join truncates the audio: the tail of the clip is silent

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `npx tsx audit/run-1/area-G/g2-reencode.cjs`.
  2. Cut the same pieces once, then join them twice — with the production
     `concatCopyArgs` and with the production `concatReencodeArgs` — and
     measure each stream separately.
- **Expected**: the fallback is the *more* reliable path. It exists because the
  copy path produced something wrong, so it must at least keep audio and video
  the same length.
- **Actual**: on pieces whose in-points are off-keyframe, the re-encode leaves
  the audio stream half a second shorter than the video, so the clip ends in
  silence and every joint after the first is slightly out of step:
  ```
  C-subsecond-2   (expected 4.00s)
    copy      : total=4.54s video=4.54s audio=4.533s  A/V gap=0.007s
    reencode  : total=4.56s video=4.56s audio=4.056s  A/V gap=0.504s
  E-10x1s-subsecond (expected 10.00s)
    copy      : total=10.55s video=10.55s audio=10.542s A/V gap=0.008s
    reencode  : total=10.56s video=10.56s audio=10.316s A/V gap=0.244s
  ```
  The copy path keeps A/V within 10 ms in every case measured; only the
  re-encode opens the gap, and it grows with the number of joints. So the
  fallback is reached *because* the length was wrong (G-4), makes the length no
  better, and adds a defect the copy path did not have. Both outputs play and
  decode clean, which is why this does not surface as an error.
- **Proof**: `audit/run-1/area-G/out-g2/results.json` (per-method
  `video` / `audio` / `avGap`), `logs/g2.console.log`
- **Suspected file**: `server/segments.ts:152-183` (`concatReencodeArgs` — no
  `-af aresample=async=1:first_pts=0`, no `-fflags +genpts`),
  `server/segments.ts:261` (where the fallback is run)

---

### G-8  Clear cache deletes the finished clip the server just told the client to collect, and destroys a running job's work folder

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g12-focused.cjs` (sections A and A2).
  2. `POST /api/download` with `deliver:"path"`; note the `path` in the 200.
  3. `POST /api/cache/clear`.
  4. Check whether that path still exists.
  5. Separately: start a download, wait until its `ytclip-*` folder appears,
     then `POST /api/cache/clear` while it runs.
- **Expected**: clearing a *resume cache* frees abandoned partials. A clip the
  server has just handed over, and a folder a live job is writing into, are
  neither abandoned nor partial.
- **Actual**: `clearCache()` removes every `ytclip-*` / `ytchan-*` directory in
  the OS temp dir unconditionally — no in-flight set, no age check, no "is
  anything using this" test:
  ```
  A2: status 200  path /tmp/ytclip-b88cd735cacd375e/clip.mp4
      existsRightAfter200 : true
      clear               : {"ok":true,"removed":1,...}
      existsAfterClear    : false        <- the clip is gone
  A : workFolder ytclip-bd98c1a6f34feea2 (live job)
      clear -> removed 1, folderGoneImmediately: true
  ```
  `server/index.ts:1917-1923` is explicit that this window exists by design —
  "`tempDir` is deliberately NOT cleaned up here; whoever moves the file
  removes it" — so between the 200 and the main process moving the file, the
  clip's only copy lives in a directory that one button empties. Clear cache
  is reachable from the settings popover at any moment, including while the
  progress bar is still up.
- **Proof**: `audit/run-1/area-G/out-g12/results.json` (sections A, A2),
  `logs/g12.console.log`, `out-g7/results.json`
  (`clipStillOnDiskAfterClear: false`)
- **Suspected file**: `server/resumeCache.ts:101-112` (`clearCache`),
  `server/index.ts:2285-2289` (`/api/cache/clear`)

---

### G-9  A damaged cached download permanently breaks that clip, and the error the user sees is ffmpeg's version banner

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g15-poisoned.cjs`.
  2. Run one download to learn the keyed folder, delete `clip.mp4`, and leave a
     truncated `source.mp4` behind (the shape an interrupted whole-file
     download that got renamed leaves — `findDownloaded()` accepts any
     `source.*` that is not `.part`/`.ytdl`).
  3. Make the sectioned run 403 (`failDownload`) so the job takes the
     whole-file + local-trim path, and request the same range three times.
- **Expected**: a source that is not readable media is discarded and
  re-fetched. If it cannot be, the message names the cause ("the cached
  download is damaged") and the action clears it.
- **Actual**: the corrupt source is used every time, forever:
  ```
  planted source: 327152 bytes, ffprobe: "moov atom not found", plays: false
  attempt 1: 500 code=unknown error="libavformat    60.  3.100 / 60.  3.100\n  libavdevice…"
             files left in the work folder: ["source.mp4"]
  attempt 2: 500  (identical)
  attempt 3: 500  (identical)
  clear: {"ok":true,"removed":1,...}
  after Clear cache: 200 {"path":"/tmp/ytclip-6dc73536eeb5353b/clip.mp4",...}
  ```
  Two separate defects meet here. `findDownloaded()` never checks the file is
  valid media, and `pruneWorkDir()` deliberately keeps every `source.*` on
  failure (it is classified as resumable data), so the poison survives each
  retry — only Clear cache, which the error does not mention, unsticks it. And
  the `error` and `cause` the UI is handed are ffmpeg's **library version
  table**, because `runStreaming`'s tail takes the last 8 non-`[download]`
  lines of stderr and ffmpeg's banner is what fills them. The offered action is
  "Try again", which is the one thing that cannot work.
- **Proof**: `audit/run-1/area-G/logs/g15.console.log`,
  `out-g12/results.json` section B (`plantedSource`, `reachedLocalTrim: true`,
  `usedTheCorruptSource: true`, the response body)
- **Suspected file**: `server/index.ts:1526-1533` (`findDownloaded`),
  `server/segments.ts:326-341` (`pruneWorkDir` keeps `source.*`),
  `server/index.ts:1498-1511` (`runStreaming`'s stderr tail → `err.tail`)

---

### G-10  Cancelling a download does not stop it: yt-dlp keeps running and there is no cancel endpoint

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g9-cancel.cjs`.
  2. Start a download with the stub at `delayMs: 3000` (so the probe and the
     section run each take 3 s).
  3. At t=4 s, with the section run in flight, hang up the HTTP request.
  4. Count matching yt-dlp children in `ps` at +0.3 s, +1.5 s, +4 s, +12 s.
  5. Also probe for a cancel route.
- **Expected**: the child is killed when the client goes away — exactly what
  `/api/auth/youtube/status` does at `server/index.ts:1047-1049`.
- **Actual**: nothing is cancelled. The child runs to completion on its own:
  ```
  [t=4s (section running)]        section-children=1
  >>> client aborted
  [t=4.3s (0.3s after abort)]     section-children=1
  [t=5.5s (1.5s after abort)]     section-children=1
  [t=8s (4s after abort)]         section-children=0   <- it finished, nobody killed it
  anything in the server log about killing it: false
  ```
  `/api/download` registers no `res.on("close")` and holds no reference it
  could kill, and there is no cancel route at all:
  ```
  POST /api/download/cancel  -> 404 (HTML)
  POST /api/download/stop    -> 404 (HTML)
  POST /api/cancel           -> 404 (HTML)
  ```
  With a real video this is a cancel that keeps consuming bandwidth and disk
  until the whole thing is downloaded. The same session then still writes to a
  work folder nobody is waiting for.
  The one place that *does* kill on close only kills the child that is live at
  that instant, and `probeYouTubeAuth` immediately starts the next probe URL:
  after the client left, three distinct `--simulate` children were seen, one of
  them still running 7.5 s later, and the log shows the loop moving to the next
  target (`out-g12` section C: `distinctChildPids: 3`,
  `stillSpawningAfterClientLeft: 5`).
- **Proof**: `audit/run-1/area-G/out-g9/results.json`,
  `logs/g9.console.log`; `out-g12/results.json` section C,
  `out-g6/results.json` (`cancelRoutes`)
- **Suspected file**: `server/index.ts:1080-2058` (`/api/download` — no
  `res.on("close")`, no child handle kept), `1000-1021`
  (`probeYouTubeAuth`'s loop vs the single-shot kill at 1047)

---

### G-11  A malformed or non-object JSON body returns an Express HTML stack trace with absolute filesystem paths

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g4-endpoints.cjs` (section "BODY SHAPES"), and
     `node audit/run-1/area-G/g13-asshipped.cjs` for the same thing in the
     real app.
  2. On the **correct verb and route**, `POST /api/info` with
     `content-type: application/json` and body `{ not json`.
  3. Repeat with `null`, `"hi"`, `42`, a truncated object, and a 10 MB body.
- **Expected**: `{"error":"..."}`, which is what every other bad body returns
  and what the UI is built to render.
- **Actual**: `express.json()` throws before any route runs, and there is no
  error handler, so Express's default one answers with an HTML page carrying
  the stack trace. In the real packaged-shape app:
  ```
  POST /api/info   content-type: application/json   body: "{ not json"
    400  content-type: text/html; charset=utf-8
    <!DOCTYPE html>…<pre>SyntaxError: Expected property name or '}' in JSON at position 2
      at JSON.parse (<anonymous>)
      at parse (/home/user/stream-trimmer/electron/dist/server.cjs:14263:23)
      …
  POST /api/download  10MB body
    413  text/html   <pre>PayloadTooLargeError: request entity too large
      at readStream (/home/user/stream-trimmer/electron/dist/server.cjs:4966:21) …
  ```
  37 responses across the six POST endpoints came back as HTML on the correct
  verb and route: six shapes each (`{ not json`, truncated JSON, `null`,
  `"hi"`, `42`, 10 MB) plus a 200 KB URL. The paths are the app's real install
  location; in a Windows install that sits under
  `C:\Users\<name>\AppData\Local\Programs\…`, so the page hands the user's
  account name to whoever asked — and after G-2 that can be any origin.
  Two notes on scope, so this is not confused with a non-issue: the HTML 404s
  from using the *wrong* verb on a route (`GET /api/cache/clear`, etc.) are
  Express's normal behaviour and are **not** part of this finding; and a
  93 KB body is fine, so the limit being hit is `express.json()`'s 100 KB
  default, never documented or raised.
- **Proof**: `audit/run-1/area-G/out-g13/results.json`
  (`malformedBody`, `tooBigBody`), `out-g4/results.json` (`rows[]` with
  `looksHtml` / `absPaths`), `logs/g4.console.log` summary block
- **Suspected file**: `server/index.ts:572` (`app.use(express.json())` with no
  limit and no `err` handler after it); no `(err, req, res, next)` middleware
  exists anywhere in the file

---

### G-12  A settings.json that fails to parse is silently replaced with an empty one; the clip bank, campaigns and folders go with no message and no backup

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `npx tsx audit/run-1/area-G/g8-state.cjs` (section 1).
  2. Write a `settings.json` holding a real `clipper.bank`,
     `clipper.campaigns`, `clipper.clipsDir` and `clipper.saveDirNames`, in
     each of twelve shapes.
  3. `createSettingsStore(file).load()`, then make one ordinary
     `set("clipper.dataDirConfirmed", true)` — the first write any session does.
  4. Read the file back and look for a backup.
- **Expected**: nothing crashes (it does not), **and** a file that cannot be
  parsed is moved aside rather than overwritten, so the user's clip library is
  recoverable.
- **Actual**: `readFile()` catches everything and returns `{}`; the next
  `persist()` merges `{...readFile(), ...cache}` — `{}` over `{}` — and renames
  it over the original. The user's data is gone and nothing is kept:
  ```
  valid object with real data      load=ok keys=6 bank=2     afterSet.bank=2      backups=[]
  invalid JSON (trailing comma)    load=ok keys=0 bank=null  afterSet.bank=null   backups=[]
  invalid JSON (truncated write)   load=ok keys=0 bank=null  afterSet.bank=null   backups=[]
  a JSON array                     load=ok keys=0 bank=null  afterSet.bank=null   backups=[]
  valid object, BOM prefixed       load=ok keys=0 bank=null  afterSet.bank=null   backups=[]
  valid object + trailing junk     load=ok keys=0 bank=null  afterSet.bank=null   backups=[]
  2MB bank (20000 rows)            load=ok keys=6 bank=20000 afterSet.bank=20000  backups=[]
  ```
  The two that matter most are mundane: a **BOM** is what a Windows text editor
  adds the moment anyone opens and saves the file, and **trailing junk** is what
  a crash mid-append leaves. In both the JSON is otherwise intact and fully
  recoverable, and in both the entire bank is discarded in silence. The
  inventory names `clipper.bank` as unbounded and growing with use, so this is
  the user's accumulated work.
  Good news in the same run: nothing throws on any shape, the 2 MB bank round
  trips, and the server itself does not read `settings.json` at all — it boots
  and answers normally with `{not json at all` sitting in the user data dir
  (`g8` section 2: `booted: true, info: 200, cache: 200`).
- **Proof**: `audit/run-1/area-G/out-g8/results.json` (section 1 rows),
  `logs/g8.console.log`
- **Suspected file**: `electron/settingsStore.cjs:58-66` (`readFile` swallows
  the parse error), `82-96` (`persist` merges over the unparsed file)

---

### G-13  Progress for an unknown or already-finished job is reported as a live download stuck at 0%, and every poll leaks a job channel

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g6-races.cjs` (section "cancel an unknown job /
     poll unknown and finished jobs").
  2. `GET /api/download/progress?jobId=job_never_existed` and read the first
     event.
  3. Run a real download to completion as `job_finished_1`, poll it
     immediately, wait 6 s, poll it again.
- **Expected**: an id with no job behind it is a 404, or at least an event that
  says so. A finished job keeps saying it finished.
- **Actual**: `getOrCreateJob()` invents a channel for any string and seeds it
  with `{phase:"downloading", percent:0}`, so a job that never existed is
  indistinguishable from one that is stuck:
  ```
  jobId=job_never_existed        200 text/event-stream  data: {"phase":"downloading","percent":0}
  jobId=../../etc/passwd         200 text/event-stream  data: {"phase":"downloading","percent":0}
  jobId=<3000 chars>             200 text/event-stream  data: {"phase":"downloading","percent":0}
  job_finished_1, right away     200                    data: {"phase":"done","percent":100}
  job_finished_1, 6 seconds on   200                    data: {"phase":"downloading","percent":0}
  ```
  The last line is the sharp one: `publishProgress` deletes the channel 5 s
  after `done`, so the same id that reported 100% starts reporting a fresh
  download at 0% and keeps doing so forever. Anything that reconnects after a
  completed download sees it restart. And because every poll creates an entry
  that is only ever deleted on `done`/`error`, `jobs` grows without bound for
  ids that never had a job — unlike `jobLogs`, which is capped at
  `JOB_LOG_MAX_JOBS`.
- **Proof**: `audit/run-1/area-G/out-g6/results.json`
  (`unknownJob`, `weirdJob`, `rightAfterDone`, `sixSecondsAfterDone`),
  `logs/g6.console.log`
- **Suspected file**: `server/index.ts:2175-2182` (`getOrCreateJob`),
  `2195-2208` (the 5 s delete), `2210-2235`
  (`/api/download/progress` never checks the job exists)

---

### G-14  `quality` is an unvalidated free string: it is pasted into yt-dlp's format selector, and a non-numeric value silently skips the sign-in requirement

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g4-endpoints.cjs` (section "/api/download
     FIELDS") and `g6-races.cjs` (section "mp3 with an unvalidated quality
     string").
  2. `POST /api/download` with `quality: "360; touch /tmp/g-pwn"`,
     `"../../etc/passwd"`, `"1000000000"`, and the same as mp3.
  3. Read `argv.log`.
- **Expected**: `z.enum(["best","1080","720","480","360"])` for mp4 and
  `z.enum(["320","192","128"])` for mp3 — the values the UI offers and the
  only ones `computeBitrates`, `estimateNeededMb` and the format ladder
  understand.
- **Actual**: `quality: z.string().default("best")` accepts anything, and it is
  interpolated verbatim eight times into the format selector:
  ```
  --format bestvideo[height=360; touch /tmp/g-pwn][ext=mp4][vcodec^=avc1]+… 200
  --format bestvideo[height=../../etc/passwd][ext=mp4]…                     200
  --audio-quality ../../etc/passwd        (mp3)                             200
  --audio-quality "320; touch /tmp/g-pwn2"                                  200
  ```
  Nothing reached a shell (see "What was cleared", below) — the canary files
  were never created — so this is not injection. It is two smaller problems.
  First, with real yt-dlp a nonsense selector matches nothing and the whole
  ladder falls through to bare `best`, which is precisely the silent-downgrade
  failure the long comment at `server/index.ts:1271-1284` was written to stop.
  Second, the sign-in gate is computed as
  `quality === "best" || Number(quality) > 360`, so any non-numeric value is
  `NaN` and **skips the gate entirely**. Measured: `quality:"1080"` returns
  `401 YOUTUBE_AUTH_REQUIRED` and `quality:"1000000000"` returns 401, while
  `quality:"360; touch …"` and `quality:"../../etc/passwd"` go straight through
  with no session probe at all — `argv.log` shows two child runs (the metadata
  probe and the download) and no `--simulate` probe. Any non-numeric string a
  caller or a future UI sends, `"1080p"` included, takes that path.
  For mp3, `quality` also lands in ffmpeg's `-b:a ${quality}k`.
- **Proof**: `audit/run-1/area-G/out-g4/results.json` (`/api/download` rows,
  `allArgv`), `out-g6/results.json` (the mp3 section,
  `pwnFileCreated: false`), `logs/g4.console.log`, `logs/g6.console.log`
- **Suspected file**: `server/index.ts:556` (`quality: z.string()`),
  `1113-1114` (`requiresVerifiedSession`), `1285-1306` (the selector),
  `1354-1356` and `1630-1645` (`--audio-quality`, `-b:a`)

---

### G-15  `GET /api/download/progress` with no jobId answers 400 with an empty body and no content type

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g4-endpoints.cjs` (section "GET endpoints +
     verbs").
  2. `GET /api/download/progress` and `GET /api/download/progress?jobId=`.
- **Expected**: `{"error":"jobId is required"}`, like every other validation
  failure on this server.
- **Actual**: `res.status(400).end()` — zero bytes, no `content-type`. A client
  doing `await r.json()` on the error path gets a parse exception rather than a
  message, which reads as a network fault rather than a bad request:
  ```
  400  no jobId   content-type: (none)  body: ""   (0 bytes)
  400  jobId=     content-type: (none)  body: ""   (0 bytes)
  ```
- **Proof**: `audit/run-1/area-G/out-g4/results.json`
  (`/api/download/progress` rows), `logs/g4.console.log`
- **Suspected file**: `server/index.ts:2212`

---

### G-16  A directory where the clip should be is reported as a successful 4096-byte clip

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g10-interruptions.cjs` (section "output file
     replaced by a directory under a live job").
  2. Start a download, wait for its work folder, and replace `clip.mp4` with a
     directory of the same name before the job finishes.
- **Expected**: "the engine produced no usable output" — the failure row that
  already exists for this.
- **Actual**: the success test is `fs.existsSync(outputPath)` followed by
  `fs.statSync(outputPath).size`, and a directory passes both:
  ```
  200 {"path":"/tmp/ytclip-0d98be4d1b6c8123/clip.mp4","size":4096,"segments":1}
  ```
  The client is handed a path to a directory and told it is a 4 KB clip. The
  same two calls are the only check anywhere that the job produced a file.
- **Proof**: `audit/run-1/area-G/out-g10/results.json` (section "output file
  replaced by a directory"), `logs/g10.console.log`
- **Suspected file**: `server/index.ts:1768` (`fs.existsSync(outputPath)`),
  `1909` (`fs.statSync(outputPath)`) — neither asks `isFile()`

---

### G-17  An out-of-space failure that leaves no output is reported as "yt-dlp produced no output — Try again"

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g10-interruptions.cjs` (section "TMPDIR on a
     FULL filesystem"). The script mounts a 1 MB tmpfs and points `TMPDIR` at
     it.
  2. `POST /api/download` for a 2 s range (the engine needs ~1 MB).
- **Expected**: the `disk_full` row, which exists and is good: it is reached
  correctly whenever the engine's stderr says ENOSPC
  (`out-g12` section D: `507 disk_full`, cause "this clip needs about 10 MB and
  58797 MB is free", action `choose_other_folder`).
- **Actual**: when the engine exits 0 but no file lands — which is what a full
  disk looks like from any tool that writes its output and swallows the write
  error — the code never asks about free space:
  ```
  500 {"error":"yt-dlp produced no output. Try again. Your marked range is kept…",
       "code":"unknown","action":{"id":"retry","label":"Try again"}}
  classifiedAsDiskFull: false     saysHowMuchIsNeeded: false
  cache usage afterwards: {"folders":1,"bytes":0}     <- a 0-byte work folder
  ```
  "Try again" on a full disk will fail identically forever, and the one row
  that would have told the user the real cause is one `statfsSync` away — the
  code already does exactly that, but only inside
  `if (failure.code === "disk_full")`, which requires the ENOSPC text.
  A 0-byte work folder with no output is a strong enough signal to check.
- **Proof**: `audit/run-1/area-G/out-g10/results.json` (section "TMPDIR on a
  FULL filesystem"), `out-g12/results.json` section D for the working case,
  `logs/g10.console.log`
- **Suspected file**: `server/index.ts:1768-1778` (the no-output branch calls
  `classifyFailure` with no context), `2034-2046` (the `statfsSync` lookup,
  gated on the ENOSPC text)

---

### G-18  Clear cache and the usage figure cover every `ytclip-*` directory in the shared temp dir, whoever made it

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `npx tsx audit/run-1/area-G/g7-cache-resume.cjs` (last section).
  2. Create `$TMPDIR/ytclip-NOT-OURS-0000/someone-elses-file` by hand.
  3. `GET /api/cache/usage`, then `POST /api/cache/clear`.
- **Expected**: the app accounts for and deletes its own work folders.
- **Actual**: `cacheDirs()` globs the OS temp root by prefix, with no marker,
  no pid and no instance id, so anything matching is counted as the user's
  cache and deleted:
  ```
  before planting the decoy : {"folders":0,"bytes":0}
  after  planting the decoy : {"folders":1,"bytes":1024}
  clear                     : {"ok":true,"removed":1,...}
  decoyStillExists          : false
  ```
  On one machine the realistic victims are a second instance of this app and
  an older version's leftovers. The reported "disk used by the temp cache" is
  also not necessarily this app's.
  Good news from the same run: `rmSync` does not follow symlinks out of the
  cache — a `ytclip-*` folder containing a symlink to a file elsewhere was
  removed and the target survived intact (`out-g8`:
  `outsideFileStillThere: true`).
- **Proof**: `audit/run-1/area-G/out-g7/results.json` (last section),
  `out-g8/results.json` (section 3), `logs/g7.console.log`
- **Suspected file**: `server/resumeCache.ts:80-92` (`cacheDirs`), `94-112`

---

### G-19  A null byte in the URL comes back as a raw Node internal error message

- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-G/g4-endpoints.cjs` (section "URL FIELD").
  2. `POST /api/info` with `{"url":"https://www.youtube.com/watch?v=a\u0000b"}`.
- **Expected**: a sentence a person can read. Every other rejected URL gets
  one ("Invalid url", "URL must be a YouTube link").
- **Actual**: the URL passes zod (the null byte survives as `%00`-adjacent
  text), `spawn` refuses it, and the exception's message is forwarded verbatim
  as the user-facing error:
  ```
  400 {"error":"The argument 'args[0]' must be a string without null bytes.
       Received 'https://www.youtube.com/watch?v=a\\x00b'"}
  ```
  It is at least JSON, it is correctly a 400, and nothing leaks — it just reads
  as an internal error rather than "that is not a valid link".
- **Proof**: `audit/run-1/area-G/out-g4/results.json`
  (`/api/info url` row "null byte"), `logs/g4.console.log`
- **Suspected file**: `server/index.ts:451-454` (`urlSchema` admits control
  characters), `695-717` (`fullErrMessage` passes the spawn error straight
  through)

---

## Step 4 — user stories, run at the server level

Sixteen stories, each run against the real server with assertions:
`node audit/run-1/area-G/g11-stories.cjs` →
`logs/g11.console.log`, `out-g11/results.json`.

| # | Story | Result |
|---|---|---|
| 1 | Pastes a URL, expects the title and length back | pass |
| 2 | Asks for that video's transcript | pass (clean `{lines:[],available:false}`; no subtitles exist in the stub) |
| 3 | Cuts one 7 s range at 360p and saves the file | pass (playable, both streams, path handed over; the stub cannot cut, so the duration is the fixture's) |
| 4 | Cuts three highlights into one file | **fail** → G-6 (90.04 s delivered for 12 s marked, 200, no warning) |
| 5 | Rips the audio as an mp3 for a cold open | pass (contract only — the stub does not transcode) |
| 6 | Watches the progress bar | pass — 19 events, phases downloading → processing → done, percent `0…45…90…99…100`, no backwards step, all six named stages present |
| 7 | Connection drops, then resumes | pass — `502 network_dropped`, action `resume`, "Resume from 0%", retry succeeded and plays. Note: the failure JSON carries `diagnostics.homeDir` verbatim (see below) |
| 8 | Marks an out point past the end | pass — `400 out_point_past_end`, `snap_out_point`, `detail.runsTo: 42` |
| 9 | Asks for 1080p with no session | pass — `401 YOUTUBE_AUTH_REQUIRED`, `import_cookies` |
| 10 | The video is members-only | pass — `403 private_video`, "Import cookies from that account" |
| 11 | YouTube changed something the engine cannot read | pass — `502 engine_behind`, `update_engine` |
| 12 | The disk fills up | pass — `507 disk_full` with real numbers: "needs about 90 MB and 58798 MB is free" |
| 13 | Checks cache usage, then clears it | pass — 0 → 2 folders → removed 2 → 0 |
| 14 | Checks whether the saved sign-in is still good | pass — no cookie file gives `signed_out` with the right message; a live verdict is **not provable here** |
| 15 | Double-clicks Download | **fail** → G-1 |
| 16 | Closes the app mid-download, comes back | pass — the retry completes and plays; the keyed folder is reused |

14 pass, 2 fail. The two failures are G-6 and G-1, filed above.

One thing worth naming that is not filed as a finding: story 7's failure
response includes `diagnostics.homeDir` (`/root` in this container) and
`stderrTail`, unredacted. `server/index.ts:192-195` says this is deliberate —
"the one redactor lives in src/lib/diagnostics.ts and runs over the finished
report" — so the server is doing what it was designed to do and the redaction
is a renderer concern (area F owns `diagnostics:*`). Recording it here so it
is not lost between areas: the path leaves the server in the clear, on an
endpoint that after G-2 any origin can call.

---

## What was cleared

Things the brief asked about that turned out to be right, with evidence, so the
action plan does not spend time on them:

- **Nothing reaches a shell.** `makeRunner` uses `spawn(binary, args)` with
  `shell: false` and `dargs` for flag building; the ffmpeg calls use
  `spawn(bin, args, {shell:false})` in both `server/index.ts:1662` and
  `server/segments.ts:289`. 21 hostile URLs — `;`, backticks, `$(...)`, `|`,
  `&&`, newline, CR, `>`, `../../etc/passwd`, `--exec=…` — plus four hostile
  `quality` values were sent; the canary directory was **empty** afterwards and
  `argv.log` shows each URL arriving as exactly one element of the argv array
  (`urlIsExactlyOneArgv: true`). The one place a shell string is built,
  `ytDlpVersion`'s `execSync("\"${binary}\" --version")`
  (`server/index.ts:321`), interpolates only a path the server resolved itself,
  never anything from a request.
- **No endpoint trusts a client-supplied file path.** `cookies`, `cookieFile`,
  `output` and `ffmpegLocation` in the request body are stripped by zod and
  never appear in `argv.log`; `cookiesFromBrowser` is an enum, so an absolute
  path is a 400 (`"Invalid input"`). The cookie file comes only from
  `YT_CLIPPER_COOKIE_FILE`, which `electron/main.cjs:190` sets from
  `youtubeSession.cookieFilePath()`. (`out-g4/results.json`, section "COOKIE
  FILE PATH PROVENANCE"; `out-g13` `cookieFileFromEnv`.)
- **`cookieJar.ts` is correct where it is used.** On `/api/download` every run
  gets a private copy under `/tmp/ytcookie-*`, a write-back that is empty,
  header-only or missing an auth cookie is discarded and the saved sign-in
  survives, a failed run never promotes, and the commit is a validated
  `rename()`. Deleting the jar mid-download does not fail the clip. The gap is
  only that four endpoints do not call it (G-5).
- **Segment validation is thorough.** 0-length, reversed, negative, `null`,
  `Infinity`, `1e308`, >20 segments, >600 s total, and an out point past the
  video's real duration (re-probed server-side so a crafted request cannot
  bypass the cap) are each refused with their own message. Overlapping and
  touching ranges are accepted deliberately and join correctly
  (`out-g1/results.json` cases 05, 06).
- **The copy-path concat is accurate.** Keyframe-aligned joins land within
  0.03 s of the marked total — one range 10.008/10.000, two non-adjacent
  10.024/10.000, three 12.029/12.000, touching 20.024/20.000, overlapping
  24.021/24.000, 20 segments 20.262/20.000 — and every output decodes clean
  end to end with both a video and an audio stream. A range starting at 0, one
  ending exactly at the end, and sub-second boundaries all work for a single
  range (0.005–0.03 s drift). Sub-second *multi*-range is where G-4 bites.
- **Resume works.** A 5 MB `.part` left in the keyed folder is found, logged
  (`resuming with 5242880 cached byte(s)`), `--continue` is passed, the partial
  is preserved, and the delivered clip plays. A *finished* `clip.mp4` left over
  is correctly **not** reused — replacing it with a text marker still produced
  a fresh playable clip. The 7-day stale sweep on boot removes an 8-day-old
  folder and keeps a fresh one.
- **The server does not crash on bad state.** It boots and answers with
  `{not json at all` as `settings.json`, and with work folders in six odd
  shapes planted in the temp dir (v3-style flat files, a *directory* named
  `clip.mp4`, 8 levels of nesting, broken `state.json`, a truncated `.jsonl`,
  a `.part` that is a complete mp4, a symlink pointing outside). All were
  cleared without touching the symlink's target. `createSettingsStore` never
  threw on any of twelve input shapes, and a 2 MB / 20 000-row bank round
  trips.
- **The failure table is good.** Five of the seven rows were driven end to end
  and each came back with the right status, `code`, single `action.id` and
  `preserved` text: `network_dropped`/502/`resume`,
  `out_point_past_end`/400/`snap_out_point`, `private_video`/403,
  `engine_behind`/502/`update_engine`, `disk_full`/507 with real free/needed
  numbers. Progress SSE is monotonic and names every stage.
- **No prototype pollution.** Bodies with `__proto__` and
  `constructor.prototype` payloads were accepted as ordinary requests and the
  next normal request behaved identically.

---

## Coverage

Driven and asserted:

- **Endpoints**, all eight this area owns, at the correct verb: `POST
  /api/info`, `POST /api/transcript`, `POST /api/comments`, `POST
  /api/download`, `POST /api/auth/youtube/status`, `POST /api/cache/clear`,
  `GET /api/download/progress`, `GET /api/cache/usage`. (`/api/comments` is
  POST in `server/index.ts:2078`, though the inventory lists it as GET.)
- **201 requests** in the body-shape and field matrix: missing body, empty
  body, non-JSON, truncated JSON, four wrong content types, JSON literals
  (`null`, string, number), array body, every field as number/null/array/object,
  a 400-deep nested object, a 20 000-deep array, unknown extra fields, a
  `__proto__` payload, 93 KB, 10 MB, and a lying `content-length`.
- **21 hostile URLs** and 4 hostile `quality` values, each cross-checked
  against the child's real argv, with a filesystem canary.
- **The cut and concat pipeline**: 20 cases through `resolveSegments` +
  real ffmpeg + production `joinSegments`, every output's duration asserted
  against the expected sum and every output decoded end to end — one range,
  two non-adjacent, three, touching, overlapping, 0-length, longer than the
  source, starting at 0, ending exactly at the end, sub-second, below the 2 dp
  rounding of `sectionArg`, 20 segments, 21 segments, negative, `Infinity`,
  reversed, over the 600 s cap. Plus 5 copy-versus-re-encode comparisons on
  identical inputs, and a dedicated edit-list reproducer.
- **Concurrency**: two downloads of the same video; two of different ranges;
  the same key with one job 4 s ahead; five repeats in a row; two concurrent
  runs on one cookie jar for five endpoint pairs (info+info, info+transcript,
  info+download, download+download, status+status), sampled every 60 ms.
- **Interruptions**: client hang-up mid-section-download with `ps` sampling at
  five points; SIGKILL of the yt-dlp child mid-download; SIGKILL of ffmpeg
  mid-concat; the work folder deleted under a live job; `clip.mp4` replaced by
  a directory; the cookie jar deleted mid-download; `TMPDIR` on a 1 MB tmpfs;
  `TMPDIR` unreachable.
- **Cache**: usage and clear on an empty cache, twice in a row, after a
  download, during a live job, between the 200 and the client collecting the
  file, and with a foreign `ytclip-*` folder planted.
- **Resume**: a 5 MB `.part`; a finished clip left behind; a truncated
  `source.mp4` retried three times; app stopped mid-download and restarted;
  the boot-time stale sweep with an 8-day-old and a fresh folder.
- **State over time**: 12 `settings.json` shapes against the real store; 6
  old/odd work-folder shapes; the server booted with a corrupt settings file.
- **Both runtimes**: the packaged-shape Electron app and `tsx server/index.ts`.
  Bind address, CORS, the HTML-error behaviour and the cookie-path provenance
  were confirmed on both.

Not covered by me, by assignment: `server/channelRoutes*.ts` and
`channelExport*.ts` (area E), the renderer's use of these endpoints and the
diagnostics redactor (areas B, D, F), the IPC bridge (areas A, D).

---

## Not provable here

- **Real yt-dlp against YouTube.** The network policy refuses `youtube.com`
  and `*.googlevideo.com`, so every yt-dlp result in this area comes from the
  stub. That bounds three things specifically:
  - **The sectioned download path's cut accuracy.** The primary path passes
    `--download-sections` with `--force-keyframes-at-cuts`, which makes yt-dlp
    re-encode around the cut. If that works as documented, G-4 affects only the
    whole-file + local-trim fallback. The fallback is not an edge case — the
    code comments treat the 403 that triggers it as routine — but the split
    cannot be measured here.
    Everything in G-4 that *is* measured (the trim arguments, the edit list,
    the concat demuxer) is production code and real ffmpeg.
  - **Real engine stderr for the failure table.** The five rows driven here
    used real yt-dlp error strings, but whether YouTube's actual current output
    matches `PATTERNS` is unverifiable.
  - **Actual cookie write-back content.** That yt-dlp writes the jar back on
    close is documented behaviour (`YoutubeDL.save_cookies`) and is what
    `cookieJar.ts` was built for; the stub reproduces it faithfully. What a
    real refreshed jar contains, and therefore how often the write-back is
    benign, cannot be observed.
- **Signed-in / 1080p behaviour.** No YouTube session exists here and the
  user's must not be used, so `sessionConfirmed`, the degraded-delivery retry
  on `PLAYER_CLIENTS_FALLBACK`, `isDegradedDelivery` against real format
  ladders, and `lowQualityWithoutSession`'s warning path were exercised only
  through their inputs, never from a real session. `/api/auth/youtube/status`
  can be proven to answer `signed_out` correctly with no cookie file; a
  `signed_in` verdict cannot be produced.
- **Whether the 0.0.0.0 bind is reachable from a real LAN.** It is reachable
  from this container's non-loopback address (192.0.2.2), which proves the bind
  itself. Whether a given user's firewall would also let a neighbour in is a
  property of their machine, not of this code. Note that on macOS and most
  Linux desktops nothing blocks it by default, and the app's own window is
  served from the same socket.
- **`TMPDIR` unreachable.** `tsx` itself needs a usable temp dir, so the
  direct-server harness cannot boot with `TMPDIR` pointing somewhere
  unopenable (`ENOTDIR … mkdir '/etc/hostname/not-a-dir/tsx-0'`). In the
  packaged app the server is `require`d into an already-running main process,
  so the failure would land inside `/api/download` instead. `workDir()`'s
  `fs.mkdirSync` at `server/resumeCache.ts:32` is called from
  `server/index.ts:1229`, outside every `try` in that handler, which suggests a
  hanging request rather than a JSON error — but that is reasoning, not a
  measurement, so it is not filed as a finding.
- **Multi-user `/tmp` collisions** for G-18: a second OS user's `ytclip-*`
  folder would be permission-protected. Only same-user collisions (a second
  instance, an older version) were reproduced.
- **Memory growth from the `jobs` leak** in G-13. That every poll of an unknown
  id creates a permanent entry is confirmed from the responses; the heap cost
  per entry was not measured.
