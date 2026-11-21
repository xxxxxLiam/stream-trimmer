#!/usr/bin/env node
/**
 * G area, audit-only. Every endpoint area G owns, against every malformed
 * request the brief asks for, plus the bind-address and CORS checks.
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *        node audit/run-1/area-G/g3-validation.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./lib.cjs");

const OUT = path.join(__dirname, "out-g3");
const rows = [];
let a, stub, W;

function rec(group, name, r, extra = {}) {
  const row = {
    group, name,
    status: r.status, contentType: r.contentType,
    isJson: /application\/json/.test(r.contentType || ""),
    looksHtml: /^\s*(<!DOCTYPE|<html|<pre>)/i.test(r.body || ""),
    leaksPath: /\/home\/[\w.-]+\//.test(r.body || "") ? (r.body.match(/\/home\/[\w./-]+/g) || []).slice(0, 3) : null,
    bodyLen: r.bodyLen,
    body: (r.body || "").slice(0, 400),
    fetchError: r.fetchError,
    ...extra,
  };
  rows.push(row);
  const flag = [
    row.looksHtml ? "HTML!" : "",
    row.leaksPath ? "PATH-LEAK!" : "",
    !row.isJson && !row.fetchError ? "non-json" : "",
  ].filter(Boolean).join(" ");
  console.log(`  ${String(row.status ?? "-").padEnd(4)} ${name.padEnd(42)} ${flag}  ${row.body.replace(/\n/g, "\\n").slice(0, 150)}`);
  return row;
}

const POSTS = ["/api/info", "/api/transcript", "/api/comments", "/api/download", "/api/auth/youtube/status", "/api/cache/clear"];

async function bindCheck() {
  console.log("\n=== BIND ADDRESS / REACHABILITY ===");
  const base = await (await W()).evaluate(() => window.__API_BASE__);
  const port = Number(String(base).split(":").pop());
  console.log(`  API_BASE=${base} port=${port}`);
  const hex = port.toString(16).padStart(4, "0").toUpperCase();
  const scan = (f) => {
    try {
      return fs.readFileSync(f, "utf8").split("\n").slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter((c) => c[1] && c[1].endsWith(":" + hex) && c[3] === "0A")
        .map((c) => ({ file: path.basename(f), local: c[1], state: "LISTEN" }));
    } catch { return []; }
  };
  const listening = [...scan("/proc/net/tcp"), ...scan("/proc/net/tcp6")];
  console.log(`  /proc/net listening rows: ${JSON.stringify(listening)}`);
  const loopbackOnly = listening.length > 0 && listening.every(
    (r) => r.local.startsWith("0100007F:") || r.local.startsWith("00000000000000000000000001000000:"),
  );
  console.log(`  loopback-only by kernel table: ${loopbackOnly}`);

  // Then actually connect from off-loopback.
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`  non-loopback IPv4 on this host: ${JSON.stringify(ips)}`);
  const reach = [];
  for (const ip of ips) {
    const r = await fetch(`http://${ip}:${port}/api/cache/usage`).then(
      async (x) => ({ ip, status: x.status, body: (await x.text()).slice(0, 120) }),
      (e) => ({ ip, error: String(e.message || e).slice(0, 120) }));
    reach.push(r);
    console.log(`  http://${ip}:${port}/api/cache/usage -> ${JSON.stringify(r)}`);
  }
  // And a cross-origin request with a foreign Origin header.
  const xo = await fetch(`http://127.0.0.1:${port}/api/info`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ url: L.YT }),
  }).then(async (x) => ({ status: x.status, acao: x.headers.get("access-control-allow-origin"), body: (await x.text()).slice(0, 160) }),
    (e) => ({ error: String(e.message) }));
  console.log(`  cross-origin POST /api/info with Origin: https://evil.example -> ${JSON.stringify(xo)}`);
  return { base, port, listening, loopbackOnly, ips, reach, crossOrigin: xo };
}

async function shapes() {
  console.log("\n=== BODY SHAPES (each POST endpoint) ===");
  const deep = (n) => { let o = { v: 1 }; for (let i = 0; i < n; i++) o = { v: o }; return o; };
  for (const route of POSTS) {
    console.log(` -- ${route}`);
    rec(route, "no body, no content-type", await L.api(W, "POST", route));
    rec(route, "empty string body, ct=json", await L.api(W, "POST", route, { raw: "", headers: { "content-type": "application/json" } }));
    rec(route, "not JSON, ct=json", await L.api(W, "POST", route, { raw: "this is not json {", headers: { "content-type": "application/json" } }));
    rec(route, "valid JSON, ct=text/plain", await L.api(W, "POST", route, { raw: JSON.stringify({ url: L.YT }), headers: { "content-type": "text/plain" } }));
    rec(route, "JSON array as body", await L.api(W, "POST", route, { body: [1, 2, 3] }));
    rec(route, "JSON null as body", await L.api(W, "POST", route, { raw: "null", headers: { "content-type": "application/json" } }));
    rec(route, "JSON string as body", await L.api(W, "POST", route, { raw: '"hello"', headers: { "content-type": "application/json" } }));
    rec(route, "url: number", await L.api(W, "POST", route, { body: { url: 12345, browser: 12345 } }));
    rec(route, "url: null", await L.api(W, "POST", route, { body: { url: null, browser: null } }));
    rec(route, "url: array", await L.api(W, "POST", route, { body: { url: [L.YT], browser: ["chrome"] } }));
    rec(route, "url: deep nested object x200", await L.api(W, "POST", route, { body: { url: deep(200), browser: deep(200) } }));
    rec(route, "extra unknown fields", await L.api(W, "POST", route, { body: { url: L.YT, browser: "chrome", __proto__x: 1, evil: { a: [1] }, start: 0, end: 2 } }));
    rec(route, "10MB body", await L.api(W, "POST", route, { raw: JSON.stringify({ url: L.YT, pad: "A".repeat(10 * 1024 * 1024) }), headers: { "content-type": "application/json" } }));
  }
}

async function injection() {
  console.log("\n=== URL / INJECTION (does anything reach a shell?) ===");
  const canary = path.join(OUT, "canary");
  fs.rmSync(canary, { recursive: true, force: true });
  fs.mkdirSync(canary, { recursive: true });
  const marks = [];
  const mk = (label, url) => ({ label, url });
  const cases = [
    mk("semicolon + touch", `https://www.youtube.com/watch?v=a;touch ${canary}/semi`),
    mk("backticks", "https://www.youtube.com/watch?v=a`touch " + canary + "/tick`"),
    mk("dollar-paren", `https://www.youtube.com/watch?v=a$(touch ${canary}/dollar)`),
    mk("pipe to sh", `https://www.youtube.com/watch?v=a|touch ${canady(canary)}`),
    mk("ampersand", `https://www.youtube.com/watch?v=a&&touch ${canary}/amp`),
    mk("newline", "https://www.youtube.com/watch?v=a\ntouch " + canary + "/nl"),
    mk("null byte", "https://www.youtube.com/watch?v=a\u0000b"),
    mk("traversal", "https://www.youtube.com/watch?v=../../etc/passwd"),
    mk("file scheme + youtube.com", "file:///etc/passwd#youtube.com"),
    mk("file scheme plain", "file:///etc/passwd"),
    mk("non-youtube host, youtube.com in query", "https://evil.example/collect?ref=youtube.com"),
    mk("non-youtube host, youtube.com in path", "https://evil.example/youtube.com/x"),
    mk("userinfo trick", "https://youtube.com@evil.example/x"),
    mk("http (not https) loopback", "http://127.0.0.1:1/youtube.com"),
    mk("flag injection as url", "--exec=touch " + canary + "/exec youtube.com"),
    mk("flag injection, valid url + flag", `https://www.youtube.com/watch?v=a --exec touch ${canary}/exec2`),
  ];
  function canady(d) { return d + "/pipe"; }
  for (const c of cases) {
    L.resetLogs(stub);
    const r = await L.api(W, "POST", "/api/info", { body: { url: c.url } });
    const seen = L.argvLog(stub).filter((x) => !x.argv.includes("--version"));
    const row = rec("/api/info url", c.label, r, {
      sentUrl: c.url,
      reachedChild: seen.length > 0,
      childArgv0: seen[0] ? seen[0].argv[0] : null,
      argvIsSingleToken: seen[0] ? seen[0].argv[0] === c.url : null,
      childArgvLen: seen[0] ? seen[0].argv.length : 0,
    });
    marks.push(row);
  }
  const created = fs.readdirSync(canary);
  console.log(`\n  canary dir after all injection attempts: ${JSON.stringify(created)} (empty = nothing reached a shell)`);
  return { marks, created };
}

async function downloadValidation() {
  console.log("\n=== /api/download SEGMENT + FIELD VALIDATION ===");
  const base = { url: L.YT, deliver: "path", quality: "360", format: "mp4" };
  const cases = [
    ["no segments, no start/end", { ...base }],
    ["segments: []", { ...base, segments: [] }],
    ["segments: {}", { ...base, segments: {} }],
    ["segments: [{}]", { ...base, segments: [{}] }],
    ["segments string times", { ...base, segments: [{ start: "0", end: "2" }] }],
    ["segments 21 items", { ...base, segments: Array.from({ length: 21 }, (_, i) => ({ start: i, end: i + 1 })) }],
    ["zero length range", { ...base, segments: [{ start: 5, end: 5 }] }],
    ["reversed range", { ...base, segments: [{ start: 9, end: 2 }] }],
    ["negative start", { ...base, segments: [{ start: -1, end: 5 }] }],
    ["NaN start", { ...base, segments: [{ start: null, end: 5 }] }],
    ["over 600s total", { ...base, segments: [{ start: 0, end: 601 }] }],
    ["past end of video", { ...base, segments: [{ start: 0, end: 5 }], url: L.YT }],
    ["format: avi", { ...base, format: "avi", segments: [{ start: 0, end: 2 }] }],
    ["quality: injection", { ...base, quality: "360; rm -rf /", segments: [{ start: 0, end: 2 }] }],
    ["quality: ../../etc", { ...base, quality: "../../etc/passwd", segments: [{ start: 0, end: 2 }] }],
    ["deliver: wat", { ...base, deliver: "wat", segments: [{ start: 0, end: 2 }] }],
    ["cookiesFromBrowser: /etc/passwd", { ...base, cookiesFromBrowser: "/etc/passwd", segments: [{ start: 0, end: 2 }] }],
    ["cookiesFromBrowser: nonsense", { ...base, cookiesFromBrowser: "netscape", segments: [{ start: 0, end: 2 }] }],
    ["client-supplied cookies field", { ...base, cookies: "/etc/passwd", segments: [{ start: 0, end: 2 }] }],
    ["client-supplied output field", { ...base, output: "/etc/cron.d/pwn", segments: [{ start: 0, end: 2 }] }],
    ["client-supplied ffmpegLocation", { ...base, ffmpegLocation: "/bin/sh", segments: [{ start: 0, end: 2 }] }],
  ];
  for (const [name, body] of cases) {
    L.resetLogs(stub);
    const r = await L.api(W, "POST", "/api/download", { body });
    const seen = L.argvLog(stub).filter((x) => !x.argv.includes("--version"));
    const flat = seen.map((s) => s.argv.join(" ")).join(" ### ");
    rec("/api/download", name, r, {
      childRuns: seen.length,
      childSawCookies: /--cookies\b/.test(flat) ? (flat.match(/--cookies (\S+)/) || [])[1] : null,
      childSawOutput: (flat.match(/(?:^| )-o (\S+)|--output (\S+)/) || []).filter(Boolean)[1] || null,
      childSawFfmpegLocation: (flat.match(/--ffmpeg-location (\S+)/) || [])[1] || null,
      childSawAudioQuality: (flat.match(/--audio-quality (\S+)/) || [])[1] || null,
    });
  }
}

async function progressValidation() {
  console.log("\n=== GET /api/download/progress + /api/cache/* ===");
  rec("/api/download/progress", "no jobId", await L.api(W, "GET", "/api/download/progress"));
  rec("/api/download/progress", "empty jobId", await L.api(W, "GET", "/api/download/progress?jobId="));
  console.log(`  unknown jobId SSE snapshot: ${JSON.stringify(await L.progressOnce(W, "job_does_not_exist"))}`);
  console.log(`  weird jobId SSE snapshot  : ${JSON.stringify(await L.progressOnce(W, "../../etc/passwd"))}`);
  console.log(`  2000-char jobId snapshot  : ${JSON.stringify(await L.progressOnce(W, "x".repeat(2000)))}`);
  rec("/api/cache/usage", "GET", await L.api(W, "GET", "/api/cache/usage"));
  rec("/api/cache/usage", "POST (wrong verb)", await L.api(W, "POST", "/api/cache/usage", { body: {} }));
  rec("/api/cache/clear", "GET (wrong verb)", await L.api(W, "GET", "/api/cache/clear"));
  rec("/api/info", "GET (wrong verb)", await L.api(W, "GET", "/api/info"));
  rec("/api/nope", "unknown api route", await L.api(W, "GET", "/api/nope"));
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  stub = L.makeStub("validation");
  L.setStub(stub, { info: { id: "stub0000001", title: "Stub video", duration: 30, uploader: "Stub" } });
  a = await L.launchApp({ label: "G-validation", cwd: stub, seed: { "clipper.dataDirConfirmed": true } });
  W = L.livePage(a);
  const out = {};
  try {
    out.bind = await bindCheck();
    await shapes();
    out.injection = await injection();
    await downloadValidation();
    await progressValidation();
  } finally {
    out.rows = rows;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(OUT, "server-log.txt"), (a.logs.stdout.join("") + "\n==STDERR==\n" + a.logs.stderr.join("")));
    await a.close();
  }
  const html = rows.filter((r) => r.looksHtml);
  const leaks = rows.filter((r) => r.leaksPath);
  console.log(`\n===== SUMMARY =====`);
  console.log(`  ${rows.length} requests`);
  console.log(`  HTML (not JSON) responses : ${html.length}  ${JSON.stringify(html.map((r) => `${r.group} ${r.name} [${r.status}]`))}`);
  console.log(`  responses leaking /home/<user>/ : ${leaks.length}  ${JSON.stringify(leaks.map((r) => `${r.group} ${r.name} [${r.status}] ${JSON.stringify(r.leaksPath)}`))}`);
  console.log(`  results: ${path.join(OUT, "results.json")}`);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
