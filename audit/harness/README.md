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
