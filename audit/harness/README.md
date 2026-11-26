# Audit harness

Everything here is audit scaffolding. **No helper changes product code** — not
to make a test pass, not to "quickly fix" a bug you find. You report; fixing
happens later from the action plan.

## Driving the real app

```js
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const a = await launchApp({
  label: "onboarding-01",        // names the screenshot folder
  cwd: STUB_ROOT,                // where yt-dlp/ffmpeg are resolved from
  seed: { "clipper.dataDirConfirmed": true },   // boots in this state
});

await a.win.waitForSelector("header");
await a.win.click("#ui-settings");
const proof = await a.shot("settings-open");   // returns the file path
const state = a.readState();                   // what actually persisted
await a.close();
```

Run it under a virtual display:

```
xvfb-run -a --server-args="-screen 0 1440x900x24" node yourscript.cjs
```

`a.win` is an ordinary Playwright `Page`: `click`, `fill`, `keyboard`,
`locator`, `evaluate`, `setViewportSize` all work. `a.logs` collects main-process
stdout/stderr, renderer console and page errors — attach them to bug reports.

### Why it is isolated

Every launch gets a fresh `--user-data-dir`, and Electron's single-instance
lock is per user-data dir. **Without that, a second helper's launch silently
drives the first helper's window.** The app picks its own free HTTP port, so
helpers never collide and no ports need assigning.

## Faking yt-dlp

YouTube is unreachable from this container (the network policy refuses it), so
`yt-dlp` is replaced by a scriptable stub. ffmpeg and deno stay real, so the
cutting and concat pipeline is genuinely exercised.

```
node audit/harness/make-stub-root.cjs /tmp/mystub
cp audit/fixtures/fixture.mp4 /tmp/mystub/fixture.mp4
```

Then pass `cwd: "/tmp/mystub"`. Rewrite `/tmp/mystub/stub.json` between calls —
no relaunch needed — to script behaviour:

| Key | Does |
|---|---|
| `info` | the JSON metadata returned for a probe (`id`, `title`, `duration`, …) |
| `exitCode` | non-zero makes yt-dlp fail |
| `stderr` | the text it fails with — use real yt-dlp error strings |
| `delayMs` | stalls, for slow-network, cancel and double-submit tests |
| `progress` | the percentages it reports |
| `writeMedia` | whether it places `fixture.mp4` at the output path |

The stub reports version `2099.12.31` on purpose: the server prefers whichever
of the bundled and system yt-dlp reports the newer version, and a real yt-dlp
on PATH would otherwise win and try to reach the network.

`audit/fixtures/fixture.mp4` is a real 30s 640x360 H.264 + AAC file, so cuts,
concat and duration checks are meaningful.

## Hitting the server directly

From inside the page, so you reach that instance's own port:

```js
await a.win.evaluate(async () => {
  const r = await fetch(`${window.__API_BASE__}/api/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=stub0000001" }),
  });
  return { status: r.status, body: await r.text() };
});
```

`/api/info`, `/api/transcript`, `/api/download`, `/api/auth/youtube/status`,
`/api/cache/clear` and `/api/channel/export` + `/api/channel/export/cancel`
are **POST**. Only `/api/download/progress`, `/api/cache/usage` and
`/api/channel/export/progress` are **GET**. Sending the wrong verb gets you
Express's HTML 404, which looks like a missing route rather than a wrong
method — check here before reporting an endpoint as absent.

## Seeding state

State is `<userData>/settings.json`; `seed` writes it before launch. The
fifteen keys are listed in `audit/inventory.md`. Use this for "state over
time": a bank with 2,000 rows, a campaign list from an older shape, a
half-finished setup, a tab set pointing at videos that no longer load.

## Evidence rules

Every bug needs proof. A screenshot path, a failing script, or captured
output. **Reading the code is not proof** — a finding you only reasoned about
is labelled `likely`, never `confirmed`.

Log each finding in your area file with exactly these fields:

```
### <AREA>-<n>  <one-line title>
- **Severity**: blocker | major | minor | polish
- **Status**: confirmed | likely
- **Steps**: numbered, from a cold start, reproducible by someone else
- **Expected**:
- **Actual**:
- **Proof**: path to a screenshot / script / captured output
- **Suspected file**:
```

Severity means: **blocker** = the user cannot complete the job or loses data;
**major** = a core function is wrong or badly broken, with no workaround;
**minor** = wrong but survivable or has a workaround; **polish** = cosmetic.

## What cannot be proven here

Say **not provable here** rather than passing these:

- real YouTube info, transcripts and media downloads (network policy)
- signed-in / 1080p behaviour (no session, and the user's must not be used)
- Final Cut, Premiere and CapCut actually opening (macOS-only; this is Linux)
- installers, code signing and auto-update (needs the packaged app per OS)

Everything else — the whole UI, all persistence, all server endpoints and
validation, the ffmpeg cutting pipeline, the owner gate, accessibility — is
testable here, so test it rather than reasoning about it.

## Parity against the canvas

`npm run parity -- <Screen> [--fixture name] [--threshold 0.1] [--board-only]`

1. Renders `<Screen>.dc.html` from the canvas snapshot (`PARITY_SNAPSHOT` overrides the folder, default
   `/mnt/project-files/design/canvas-snapshot-2026-11-24/project`). The snapshot has no `support.js`,
   so `scripts/parity/boardRender.cjs` stands in for it: it expands `<sc-for>`, `<sc-if>` and `{{path}}`
   from the board's own `renderVals()` and screenshots at the frame size in `canvas.json`. Boards that
   call `setState` render their initial state.
2. Launches the real app through `app.cjs` with `fixtures/<fixture>.json` (default: the screen name):
   `{ "seed": {settings.json}, "waitFor": "css selector", "steps": [{"click":sel},{"fill":[sel,text]},{"press":key},{"waitFor":sel},{"wait":ms},{"eval":"js"}] }`.
   Seed campaigns, videos, transcript, markers and bank rows through the settings keys in `audit/inventory.md`.
3. Writes `board.png`, `app.png`, `diff.png` and `side-by-side.png` (board | app | diff) to
   `audit/out/parity/<Screen>/`. pixelmatch ignores anti-aliasing; exit code 1 when pixels differ.

Needs a built app and a display: `node node_modules/electron/install.js` once, `npm run build:electron:dev`,
then `xvfb-run -a npm run parity -- Start`. `--board-only` needs neither. `build:electron:dev` keeps main and the
engine readable (no minifying or scrambling, see plans/code-protection-plan.md); plain `npm run build:electron`
ships the hardened code an install would get, which is harder to debug from logs and stack traces.

### Per-board crops, the pending snapshot and the workspace fixture

- `--snapshot pending` reads the one-board-per-state set (Main01Layout … Main14Notes, Segments, FirstClip,
  Settings, Help) from `design/canvas-pending`; `snapshot` (default) is the frozen 24 Nov canvas; or pass a folder.
- `--window [n]` crops the board to the n-th app window it draws (the 14px-radius frame, usually 1360 by 760)
  and sizes the real window's content to match, so the comparison skips the heading and margin. Output goes to
  `audit/out/parity/<Screen>-window<n>/`.
- `fixtures/Workspace.json` is the shared workspace: an open video, two campaigns, a bank, three open videos, and
  `"stub"`: the fake yt-dlp answers the info call (`info`) and the transcript call from `podcast214.vtt`
  (`vttFile`). The stub answers every link the same way, so other rows share the title. Add a step to a fixture to
  reach a state (`{"click": "#sel"}`), e.g. open a menu before the shot.
- A stubbed run links the stub root into `node_modules/electron/dist/resources/bin` for its duration, because the
  packaged-shape app reads binaries there. Run one stubbed parity at a time. If ffmpeg or deno are not on PATH, point
  `STUB_BIN_DIR` at a folder holding them.

Example: `STUB_BIN_DIR=/path/to/bin xvfb-run -a npm run parity -- Main01Layout --snapshot pending --window 0 --fixture Workspace`
