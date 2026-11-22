# Fix thread RC: audit run 2, server findings

Owned files only: `server/index.ts`, `server/segments.ts`, `server/resumeCache.ts`,
tests beside them, plus the shared test fakes `server/testSupport/fakeJobYtDlp.cjs`
and `jobHarness.ts` (new options only). No `src/*` or `electron/*` touched. Nothing committed.
Not verified against real YouTube (unreachable); everything below is the real server, real
ffmpeg and the scriptable fake yt-dlp.

| ID | Status | Negative control |
|---|---|---|
| G2-1 | fixed | reverted: single-range test FAILS ("the partial was deleted with the failed job: []"); restored: passes |
| G2-2 | fixed | reverted to the `new URL`-only check: both G2-2 tests FAIL; restored: pass |
| G2-4 / G-11 | fixed | handler and /api 404 removed: test FAILS; restored: passes |
| G2-5 | fixed | `trackChild` not passed to the join: test FAILS (request waits on the 47 s join); restored: passes |
| G2-7 | fixed (UI follow-up needed) | HEAD `resumeCache.ts`: both tests FAIL; restored: pass |

## G2-1
A lone range is now written to `<shared keyed folder>/seg-01.<ext>` like every other segment
and renamed to `clip.<ext>` in the per-request folder once it is complete (`buildClip`). The
`.part` therefore lands where `partialBytes(tempDir)` looks and where `pruneWorkDir` protects
it. Tests (3 shapes: one range, one range via whole-file fallback, two ranges): the 502 says
"0.1 MB already fetched is on disk", the `.part` (123,456 bytes) is on disk after the
failure, the retry logs `resuming with 123456 cached byte(s)` and finishes. The clean revert
fails only the single-range sectioned shape, exactly the audit's finding. `segments.test.ts`
"ONE segment takes today's single-range path" pinned the old `clip.mp4` output path; it now
asserts `seg-01.mp4` and that the delivered path is `clip.mp4`.

## G2-2
`isYouTubeUrl` now refuses instead of normalising: any char outside printable ASCII (controls,
DEL, whitespace, non-ASCII), any backslash, percent-encoded control (`%00-%1f`, `%7f`) or `%5c`,
a scheme not followed by exactly `//`, and an authority that is not plain `host[:port]`
(no `@`, `[`, `%`). Then the WHATWG hostname must equal the raw authority host, and be
youtube.com, a subdomain, or youtu.be. Non-ASCII hosts are refused outright, which subsumes
"valid punycode only": an `xn--` host is ASCII but is never youtube.com.

Hostile URLs tried (all 400, no child spawned, in the test): the audit's three backslash
forms; `\evil.example`; `%5c@`, `%5C.`, `%00`, `%0d%0a`, `%09@`, `%2f@`; raw tab, newline, CR,
NUL, DEL, U+2028 inside the host; U+3002, U+FF0F, U+FF3C, U+FF20, zero-width space; `youtu.be\@`;
`https:\\...`, `https:/\...`, `https:///...@`, `https:host@evil` and `https:/host` (no `//`);
leading and trailing space and tab; userinfo and `user:pw@` on a real host; `host:@evil`,
`host:80@evil`, `host:abc`, `host:99999999`; `[::1]`, `127.0.0.1`, decimal and hex IPs;
punycode lookalike; `youtube.com.evil.example`; the host in a path, `?@`, `#@`, `;@`;
`javascript:` and `data:` URLs; upper-case scheme and host with a backslash.
Still accepted: query/fragment links, `youtu.be/..?si=a%2Fb`, `:443`, upper-case, trailing dot.

Fresh fuzz (scratch only, not committed): 2 bases x 57 inserts x every position = 3,180
mutated URLs; 420 accepted (all path/query insertions); each accepted URL's host compared with
Python `urlsplit`: 0 disagreements. A test also does the Python comparison for a fixed set.
Behaviour change to be aware of: a URL with a leading/trailing space or non-ASCII anywhere
is now refused (previously `new URL` trimmed it). The renderer should already pass a trimmed
link; I did not check.

## G2-4 / G-11
`errorResponseFor` plus a final `(err, req, res, next)` handler, and a JSON 404 for unknown
`/api/*`. Every body error is `{error, code}`: `invalid_json` 400, `body_too_large` 413
(message names the 100kb limit, now the explicit `JSON_BODY_LIMIT`), `unsupported_encoding`
415, anything else `bad_request` or `server_error`. The full error goes to the server log
only. Test: 7 POST routes x 7 bodies (`{ not json`, truncated, `null`, `"hi"`, `42`, 200 KB,
10 MB) all JSON, correct status and code, and no `<!DOCTYPE`, `<pre>`, stack frame, `/home/`,
`/Users/` or `.cjs`/`.ts:` anywhere; server still answers afterwards. Not changed: a literal
`null` body on `/api/download/cancel?jobId=` is now a clean 400 rather than HTML (strict
parser rejects it before the route); the renderer sends an object, so this is not reachable.

## G2-5
`runProcess` takes an optional `onSpawn` (and then spawns detached); the join passes
`trackChild`, so cancel's group-kill reaches the concat ffmpeg. Once cancelled, `run` returns
at once so the copy-join failing does not start the re-encode, and `throwIfCancelled()`
follows `joinSegments`. Test uses a harness option `slowConcatSec` (an ffmpeg wrapper that
sleeps before concat): cancel during the join answers 499 within 10 s, the wrapper process is
gone (read from `/proc/<pid>/cmdline`, not `kill(pid,0)`), no folders left.

## G2-7
`cacheUsage()` now reports everything on disk: `folders`/`bytes` are the totals, with
`clearableFolders`/`clearableBytes` and `protectedFolders`/`protectedBytes` broken out.
Five uncollected clips no longer read as `0 folders, 0 bytes`. The 30-minute hold is
unchanged (it is what keeps a handed-over clip alive). Existing test "item 11" asserted the
old semantics and was rewritten to the new ones.

## Suite
- `tsc --noEmit`: 0 errors.
- Full renderer+server suite: 635 tests, 634 pass, 1 fail. `npm test`: 206, same single
  failure. The failure is `server/updater.test.ts` "the download links point at the artifacts
  the build produces": `package.json` `build.publish.repo` is `clipr`, the test expects
  `stream-trimmer`. Neither file is modified in the working tree, so it is not caused by this
  work; I did not touch it (the 609/609 baseline predates it, or someone else's change did).
- I started two full runs at once by mistake early on; the numbers above are from a clean
  final run.

## Needed from others
- Renderer (`src/components/DownloadsPanel.tsx`): `/api/cache/usage` fields changed meaning.
  `folders`/`bytes` are now totals; show `clearableBytes` as what Clear frees and
  `protectedBytes` as "in use or waiting to be collected", otherwise Clear will look like it
  failed when it leaves held folders.
- Whoever owns `package.json`/`updater.test.ts`: the `clipr` vs `stream-trimmer` mismatch.
