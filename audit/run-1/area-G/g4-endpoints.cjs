#!/usr/bin/env node
/**
 * G area, audit-only. Full validation matrix against the REAL server
 * (server/index.ts), driven over raw HTTP so bodies a browser will not send can
 * be sent too. yt-dlp is the harness stub (patched to log its argv); ffmpeg is
 * real.
 *
 * Run: node audit/run-1/area-G/g4-endpoints.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g4");
const rows = [];
let s, stub, COOKIE;

function rec(group, name, r, extra = {}) {
  const body = r.body || "";
  const row = {
    group, name,
    status: r.status ?? null,
    contentType: r.contentType || null,
    isJson: /application\/json/.test(r.contentType || ""),
    looksHtml: /^\s*(<!DOCTYPE|<html|<pre>)/i.test(body),
    absPaths: (body.match(/\/(?:home|Users|root)\/[\w./@-]+/g) || []).slice(0, 4),
    bodyLen: r.bytes,
    body: body.slice(0, 300).replace(/\n/g, "\\n"),
    error: r.error,
    ...extra,
  };
  rows.push(row);
  const flags = [row.looksHtml && "HTML", row.absPaths.length && "ABS-PATH", !row.isJson && !row.error && "non-json"].filter(Boolean).join("/");
  console.log(`  ${String(row.status ?? "ERR").padEnd(4)} ${name.padEnd(44)} ${String(flags).padEnd(18)} ${row.body.slice(0, 120)}`);
  return row;
}

const deep = (n) => { let o = { v: 1 }; for (let i = 0; i < n; i++) o = { v: o }; return o; };
const deepRaw = (n) => `{"url":${"[".repeat(n)}1${"]".repeat(n)}}`;

const POSTS = ["/api/info", "/api/transcript", "/api/comments", "/api/download", "/api/auth/youtube/status", "/api/cache/clear"];

async function shapes() {
  console.log("\n=== BODY SHAPES ===");
  for (const route of POSTS) {
    console.log(` -- POST ${route}`);
    rec(route, "no body, no content-type", await s.req("POST", route));
    rec(route, "no body, ct=json", await s.req("POST", route, { headers: { "content-type": "application/json" } }));
    rec(route, "empty string, ct=json", await s.req("POST", route, { body: "", headers: { "content-type": "application/json" } }));
    rec(route, "not JSON, ct=json", await s.req("POST", route, { body: "this is not json {", headers: { "content-type": "application/json" } }));
    rec(route, "truncated JSON, ct=json", await s.req("POST", route, { body: '{"url":"https://youtu', headers: { "content-type": "application/json" } }));
    rec(route, "valid JSON, ct=text/plain", await s.req("POST", route, { body: JSON.stringify({ url: S.YT }), headers: { "content-type": "text/plain" } }));
    rec(route, "valid JSON, no content-type", await s.req("POST", route, { body: JSON.stringify({ url: S.YT }) }));
    rec(route, "valid JSON, ct=application/xml", await s.req("POST", route, { body: JSON.stringify({ url: S.YT }), headers: { "content-type": "application/xml" } }));
    rec(route, "literal null", await s.req("POST", route, { body: "null", headers: { "content-type": "application/json" } }));
    rec(route, "literal string", await s.req("POST", route, { body: '"hi"', headers: { "content-type": "application/json" } }));
    rec(route, "literal number", await s.req("POST", route, { body: "42", headers: { "content-type": "application/json" } }));
    rec(route, "array body", await s.json("POST", route, [1, 2, 3]));
    rec(route, "url:number browser:number", await s.json("POST", route, { url: 12345, browser: 12345 }));
    rec(route, "url:null browser:null", await s.json("POST", route, { url: null, browser: null }));
    rec(route, "url:array browser:array", await s.json("POST", route, { url: [S.YT], browser: ["chrome"] }));
    rec(route, "url:object browser:object", await s.json("POST", route, { url: { href: S.YT }, browser: { name: "chrome" } }));
    rec(route, "url deep-nested x400", await s.json("POST", route, { url: deep(400), browser: deep(400) }));
    rec(route, "deep array x20000 (raw)", await s.req("POST", route, { body: deepRaw(20000), headers: { "content-type": "application/json" } }));
    rec(route, "extra unknown fields", await s.json("POST", route, { url: S.YT, browser: "chrome", start: 0, end: 2, evil: { a: [1] }, cookies: "/etc/passwd", output: "/etc/x" }));
    rec(route, "__proto__ pollution attempt", await s.req("POST", route, { body: '{"url":"' + S.YT + '","browser":"chrome","__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}', headers: { "content-type": "application/json" } }));
    rec(route, "10MB body", await s.req("POST", route, { body: JSON.stringify({ url: S.YT, browser: "chrome", pad: "A".repeat(10 * 1024 * 1024) }), headers: { "content-type": "application/json" } }));
    rec(route, "99KB body (under express limit)", await s.req("POST", route, { body: JSON.stringify({ url: S.YT, browser: "chrome", pad: "A".repeat(90 * 1024) }), headers: { "content-type": "application/json" } }));
    rec(route, "content-length lies (too big)", await s.req("POST", route, { body: JSON.stringify({ url: S.YT }), headers: { "content-type": "application/json", "content-length": "9999" }, timeoutMs: 6000 }));
  }
  // prototype pollution check
  const poll = await s.json("POST", "/api/info", { url: S.YT });
  rec("pollution", "normal request still works after __proto__ bodies", poll);
}

async function injection() {
  console.log("\n=== URL FIELD: INJECTION + SSRF ===");
  const canary = path.join(OUT, "canary");
  fs.rmSync(canary, { recursive: true, force: true });
  fs.mkdirSync(canary, { recursive: true });
  const cases = [
    ["semicolon + touch", `https://www.youtube.com/watch?v=a;touch ${canary}/semi`],
    ["backticks", "https://www.youtube.com/watch?v=a`touch " + canary + "/tick`"],
    ["$(...)", `https://www.youtube.com/watch?v=a$(touch ${canary}/dollar)`],
    ["pipe", `https://www.youtube.com/watch?v=a|touch ${canary}/pipe`],
    ["&& chain", `https://www.youtube.com/watch?v=a&&touch ${canary}/amp`],
    ["newline + command", "https://www.youtube.com/watch?v=a\ntouch " + canary + "/nl"],
    ["CR + command", "https://www.youtube.com/watch?v=a\rtouch " + canary + "/cr"],
    ["null byte", "https://www.youtube.com/watch?v=a\u0000b"],
    ["glob / redirect", `https://www.youtube.com/watch?v=a>${canary}/redir`],
    ["path traversal in v", "https://www.youtube.com/watch?v=../../etc/passwd"],
    ["traversal as whole url", "../../etc/passwd"],
    ["file:// + youtube.com in fragment", "file:///etc/passwd#youtube.com"],
    ["file:// plain", "file:///etc/passwd"],
    ["foreign host, youtube.com in query", "https://evil.example/collect?ref=youtube.com"],
    ["foreign host, youtube.com in path", "https://evil.example/youtube.com/x"],
    ["userinfo youtube.com@evil", "https://youtube.com@evil.example/x"],
    ["loopback scan (youtube.com in path)", "http://127.0.0.1:22/youtube.com"],
    ["metadata ip (youtube.com in path)", "http://169.254.169.254/youtube.com/latest/meta-data/"],
    ["flag-looking url", `--exec=touch ${canary}/exec https://youtube.com/x`],
    ["url then separate flag text", `https://www.youtube.com/watch?v=a --exec touch ${canary}/exec2`],
    ["very long url 200KB", "https://www.youtube.com/watch?v=" + "a".repeat(200000)],
  ];
  const seenRows = [];
  for (const [label, url] of cases) {
    s.resetLogs();
    const r = await s.json("POST", "/api/info", { url });
    const seen = s.argvLog().filter((x) => !x.argv.includes("--version"));
    seenRows.push(rec("/api/info url", label, r, {
      sentUrl: url.length > 120 ? url.slice(0, 80) + `...(${url.length} chars)` : url,
      reachedYtDlp: seen.length,
      argvFirst: seen[0] ? (seen[0].argv[0].length > 120 ? seen[0].argv[0].slice(0, 80) + "..." : seen[0].argv[0]) : null,
      urlIsExactlyOneArgv: seen[0] ? seen[0].argv[0] === url : null,
      argvCount: seen[0] ? seen[0].argv.length : 0,
      argvRest: seen[0] ? seen[0].argv.slice(1) : null,
    }));
  }
  const created = fs.readdirSync(canary);
  console.log(`\n  canary dir after every injection attempt: ${JSON.stringify(created)}  <- empty means nothing reached a shell`);
  return { created, seenRows };
}

async function downloadFields() {
  console.log("\n=== /api/download FIELDS ===");
  const base = { url: S.YT, deliver: "path", quality: "360", format: "mp4" };
  const cases = [
    ["no segments / no start+end", { ...base }],
    ["segments: []", { ...base, segments: [] }],
    ["segments: {}", { ...base, segments: {} }],
    ["segments: [{}]", { ...base, segments: [{}] }],
    ["segments string times", { ...base, segments: [{ start: "0", end: "2" }] }],
    ["segments 21 items", { ...base, segments: Array.from({ length: 21 }, (_, i) => ({ start: i, end: i + 1 })) }],
    ["zero-length range", { ...base, segments: [{ start: 5, end: 5 }] }],
    ["reversed range", { ...base, segments: [{ start: 9, end: 2 }] }],
    ["negative start", { ...base, segments: [{ start: -1, end: 5 }] }],
    ["null start", { ...base, segments: [{ start: null, end: 5 }] }],
    ["1e308 end", { ...base, segments: [{ start: 0, end: 1e308 }] }],
    ["total over 600s", { ...base, segments: [{ start: 0, end: 601 }] }],
    ["end past video duration", { ...base, segments: [{ start: 0, end: 500 }] }],
    ["legacy start/end only", { ...base, start: 1, end: 3 }],
    ["legacy end missing", { ...base, start: 1 }],
    ["format: avi", { ...base, format: "avi", segments: [{ start: 0, end: 2 }] }],
    ["quality shell metachars", { ...base, quality: "360; touch /tmp/g-pwn", segments: [{ start: 0, end: 2 }] }],
    ["quality traversal", { ...base, quality: "../../etc/passwd", segments: [{ start: 0, end: 2 }] }],
    ["quality 1e9", { ...base, quality: "1000000000", segments: [{ start: 0, end: 2 }] }],
    ["deliver: wat", { ...base, deliver: "wat", segments: [{ start: 0, end: 2 }] }],
    ["cookiesFromBrowser: abs path", { ...base, cookiesFromBrowser: "/etc/passwd", segments: [{ start: 0, end: 2 }] }],
    ["cookiesFromBrowser: unknown name", { ...base, cookiesFromBrowser: "netscape", segments: [{ start: 0, end: 2 }] }],
    ["client supplies cookies/output/ffmpegLocation", { ...base, cookies: "/etc/passwd", output: "/etc/cron.d/pwn", ffmpegLocation: "/bin/sh", segments: [{ start: 0, end: 2 }] }],
    ["jobId in query is client-chosen", { ...base, segments: [{ start: 0, end: 2 }] }, "?jobId=" + encodeURIComponent("../../etc/passwd")],
  ];
  for (const [name, body, qs] of cases) {
    s.resetLogs();
    const r = await s.json("POST", "/api/download" + (qs || ""), body);
    const seen = s.argvLog().filter((x) => !x.argv.includes("--version"));
    const flat = seen.map((x) => x.argv.join(" ")).join(" ### ");
    rec("/api/download", name, r, {
      childRuns: seen.length,
      sawCookiesFlag: (flat.match(/--cookies (\S+)/) || [])[1] || null,
      sawOutputFlag: (flat.match(/(?:--output|-o) (\S+)/) || [])[1] || null,
      sawFfmpegLocation: (flat.match(/--ffmpeg-location (\S+)/) || [])[1] || null,
      sawAudioQuality: (flat.match(/--audio-quality (\S+)/) || [])[1] || null,
      sawDownloadSections: (flat.match(/--download-sections (\S+)/) || [])[1] || null,
      allArgv: seen.map((x) => x.argv),
    });
  }
}

async function getEndpoints() {
  console.log("\n=== GET endpoints + verbs ===");
  rec("/api/download/progress", "no jobId", await s.req("GET", "/api/download/progress"));
  rec("/api/download/progress", "jobId=", await s.req("GET", "/api/download/progress?jobId="));
  // SSE: read the first event then hang up.
  const sse = async (jobId) => {
    const st = s.open("GET", "/api/download/progress?jobId=" + encodeURIComponent(jobId));
    await new Promise((r) => setTimeout(r, 700));
    st.abort();
    await new Promise((r) => setTimeout(r, 200));
    return st.result || { note: "no result captured" };
  };
  for (const id of ["job_unknown_0001", "../../etc/passwd", "x".repeat(3000), "<script>alert(1)</script>"]) {
    console.log(`  SSE jobId=${JSON.stringify(id.slice(0, 40))} -> ${JSON.stringify(await sse(id)).slice(0, 260)}`);
  }
  rec("/api/cache/usage", "GET", await s.req("GET", "/api/cache/usage"));
  rec("/api/cache/usage", "POST (wrong verb)", await s.json("POST", "/api/cache/usage", {}));
  rec("/api/cache/clear", "GET (wrong verb)", await s.req("GET", "/api/cache/clear"));
  rec("/api/info", "GET (wrong verb)", await s.req("GET", "/api/info"));
  rec("/api/info", "DELETE", await s.req("DELETE", "/api/info"));
  rec("/api/nope", "unknown route", await s.req("GET", "/api/nope"));
  rec("/api/channel/export", "owner route in public build", await s.json("POST", "/api/channel/export", { url: "https://www.youtube.com/@x" }));
  rec("/api/channel/export/progress", "owner route in public build", await s.req("GET", "/api/channel/export/progress"));
  rec("/", "root", await s.req("GET", "/"));
  rec("/../..", "traversal on static", await s.req("GET", "/../../etc/passwd"));
}

async function cookiePathNeverFromClient() {
  console.log("\n=== COOKIE FILE PATH PROVENANCE ===");
  const other = path.join(OUT, "attacker-cookies.txt");
  fs.writeFileSync(other, "# attacker\n");
  const tries = [
    ["cookiesFromBrowser = abs path", { url: S.YT, cookiesFromBrowser: other }],
    ["cookies = abs path", { url: S.YT, cookies: other }],
    ["cookieFile = abs path", { url: S.YT, cookieFile: other }],
    ["browser = abs path (auth status)", { browser: other }],
  ];
  for (const [name, body] of tries) {
    s.resetLogs();
    const route = name.includes("auth status") ? "/api/auth/youtube/status" : "/api/info";
    const r = await s.json("POST", route, body);
    const flat = s.argvLog().map((x) => x.argv.join(" ")).join(" ### ");
    rec("cookie provenance", name, r, {
      attackerPathReachedChild: flat.includes(other),
      cookieFlagSeen: (flat.match(/--cookies(?:-from-browser)? (\S+)/) || [])[1] || null,
    });
  }
  // the legitimate path: env var only
  s.resetLogs();
  const ok = await s.json("POST", "/api/info", { url: S.YT, cookiesFromBrowser: "app" });
  const flat = s.argvLog().map((x) => x.argv.join(" ")).join(" ### ");
  rec("cookie provenance", 'cookiesFromBrowser:"app" uses env file', ok, {
    cookieFlag: (flat.match(/--cookies (\S+)/) || [])[1] || null,
    envCookieFile: COOKIE,
    handedCanonicalFileToChild: flat.includes(COOKIE),
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  stub = S.makeStub("g4");
  S.setStub(stub, { info: { id: "stub0000001", title: "Stub video", duration: 30, uploader: "Stub" } });
  COOKIE = path.join(OUT, "yt-cookies.txt");
  fs.writeFileSync(COOKIE,
    "# Netscape HTTP Cookie File\n" +
    ".youtube.com\tTRUE\t/\tTRUE\t9999999999\tSID\toriginal-sid-value\n" +
    ".youtube.com\tTRUE\t/\tTRUE\t9999999999\t__Secure-3PSID\toriginal-3psid\n");
  s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: COOKIE } });
  console.log(`server on 127.0.0.1:${s.port}, cookie file ${COOKIE}`);
  const out = {};
  try {
    await shapes();
    out.injection = await injection();
    await downloadFields();
    await getEndpoints();
    await cookiePathNeverFromClient();
  } finally {
    out.rows = rows;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(OUT, "server-log.txt"), s.log());
    await s.stop();
  }
  const html = rows.filter((r) => r.looksHtml);
  const leaks = rows.filter((r) => r.absPaths.length);
  const nonjson = rows.filter((r) => !r.isJson && !r.error && r.status !== 200 && !/^\/\.\.|^\/$/.test(r.group));
  console.log("\n===== SUMMARY =====");
  console.log(`  requests: ${rows.length}`);
  console.log(`  HTML error pages: ${html.length}`);
  for (const r of html) console.log(`     [${r.status}] ${r.group} :: ${r.name}`);
  console.log(`  responses containing an absolute home path: ${leaks.length}`);
  for (const r of leaks) console.log(`     [${r.status}] ${r.group} :: ${r.name} -> ${JSON.stringify(r.absPaths)}`);
  console.log(`  non-JSON non-200 responses: ${nonjson.length}`);
  for (const r of nonjson) console.log(`     [${r.status}] ${r.group} :: ${r.name} ct=${r.contentType}`);
  console.log(`  results: ${path.join(OUT, "results.json")}`);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
