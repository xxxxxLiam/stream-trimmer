/**
 * v-g1-g3-g11.cjs — VERIFY three server findings in one cold start.
 *
 *  G-1  two downloads of the same clip at once share one work folder and
 *       corrupt each other, and both are told they succeeded.
 *  G-3  any URL containing the text "youtube.com" anywhere is accepted and
 *       handed to yt-dlp.
 *  G-11 a malformed or non-object JSON body returns an Express HTML stack
 *       trace with absolute filesystem paths.
 *
 * All three are driven against the REAL app (frozen production-shape mirror,
 * fresh user-data dir), over raw HTTP from this process so bodies a browser
 * fetch() refuses to send can be sent. Written from the findings' Steps.
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-g1-g3-g11.cjs [runLabel]
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const L = require("./v-lib.cjs");

const T0 = Date.now();
const step = (m) => process.stderr.write(`[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);

function probeDuration(file) {
  try {
    const ff = path.join(L.REPO, "resources", "bin", "ffmpeg");
    const out = execFileSync(ff, ["-hide_banner", "-i", file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return out;
  } catch (e) {
    const t = String(e.stderr || "");
    const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(t);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }
}

(async () => {
  const runLabel = process.argv[2] || "r1";
  const out = { runLabel, startedAt: new Date().toISOString() };

  const stubRoot = L.makeStub(`g1311-${runLabel}`);
  const a = await L.launchMirror({ shape: "public", label: `v-g1311-${runLabel}`, stubRoot, seed: { "clipper.dataDirConfirmed": true } });
  await a.win.waitForSelector("header", { timeout: 20000 });
  out.apiBase = a.apiBase;

  // ===================== G-3 =============================================
  step("G-3: URL validation");
  const URLS = [
    { label: "plain youtube (control)", url: "https://www.youtube.com/watch?v=stub0000001", shouldPass: true },
    { label: "query param only", url: "https://evil.example/collect?ref=youtube.com" },
    { label: "path segment", url: "https://evil.example/youtube.com/x" },
    { label: "userinfo", url: "https://youtube.com@evil.example/x" },
    { label: "loopback + path", url: "http://127.0.0.1:22/youtube.com" },
    { label: "link-local metadata", url: "http://169.254.169.254/youtube.com/latest/meta-data/" },
    { label: "file scheme + fragment", url: "file:///etc/passwd#youtube.com" },
    { label: "file scheme alone (control: must be refused)", url: "file:///etc/passwd", shouldFail: true },
    { label: "not youtube at all (control: must be refused)", url: "https://evil.example/x", shouldFail: true },
  ];
  out.G3 = [];
  for (const u of URLS) {
    L.clearArgvLog(stubRoot);
    const r = await L.jsonReq({ port: a.port, path: "/api/info", body: { url: u.url } });
    const argv = L.argvLog(stubRoot);
    const spawned = argv.filter((x) => x.argv[0] === u.url);
    out.G3.push({
      label: u.label,
      sentUrl: u.url,
      status: r.status,
      body: (r.body || "").slice(0, 120),
      childSpawnedWithThisUrl: spawned.length > 0,
      argvFirst: argv.length ? argv[argv.length - 1].argv[0] : null,
      urlIsExactlyOneArgvElement: spawned.length > 0 && spawned[0].argv[0] === u.url,
      expectation: u.shouldFail ? "must be refused" : u.shouldPass ? "must pass" : "should be refused (host is not youtube)",
    });
  }

  // ===================== G-11 ============================================
  step("G-11: body shapes");
  const BODIES = [
    { label: "{ not json", body: "{ not json" },
    { label: "truncated object", body: '{"url":"https://www.youtube.com/watch?v=a"' },
    { label: "literal null", body: "null" },
    { label: "literal string", body: '"hi"' },
    { label: "literal number", body: "42" },
    { label: "10 MB body", body: "x".repeat(10 * 1024 * 1024) },
    { label: "93 KB valid object", body: JSON.stringify({ url: "https://www.youtube.com/watch?v=stub0000001", pad: "p".repeat(93 * 1024) }) },
  ];
  const POSTS = ["/api/info", "/api/transcript", "/api/comments", "/api/download", "/api/auth/youtube/status", "/api/cache/clear"];
  out.G11 = [];
  for (const p of POSTS) {
    for (const b of BODIES) {
      const r = await L.req({ port: a.port, method: "POST", path: p, headers: { "content-type": "application/json" }, body: b.body, timeout: 20000 });
      const body = r.body || "";
      const looksHtml = /^<!DOCTYPE html>/i.test(body.trim()) || /<pre>/.test(body);
      const absPaths = [...new Set((body.match(/\/(?:home|root|tmp|usr)\/[^\s<>")]+/g) || []))].slice(0, 4);
      out.G11.push({
        path: p,
        shape: b.label,
        status: r.status,
        contentType: r.headers && r.headers["content-type"],
        looksHtml,
        absPaths,
        firstLine: body.split("\n").slice(0, 1).join("").slice(0, 120),
        stackLine: (body.match(/at [^\n<]{0,120}/) || [null])[0],
      });
    }
  }
  // Control: a WRONG VERB 404 is Express's normal behaviour and must not be
  // counted as this finding.
  const wrongVerb = await L.req({ port: a.port, method: "GET", path: "/api/cache/clear" });
  out.G11_wrongVerbControl = {
    status: wrongVerb.status,
    contentType: wrongVerb.headers && wrongVerb.headers["content-type"],
    looksHtml: /<pre>/.test(wrongVerb.body || ""),
    hasStackTrace: /\sat\s/.test(wrongVerb.body || ""),
    absPaths: [...new Set(((wrongVerb.body || "").match(/\/(?:home|root|tmp|usr)\/[^\s<>")]+/g) || []))].slice(0, 3),
  };
  // Control: a well-formed body with a bad value must be clean JSON.
  const goodShape = await L.jsonReq({ port: a.port, path: "/api/info", body: { url: "not a url" } });
  out.G11_validationControl = { status: goodShape.status, contentType: goodShape.headers["content-type"], body: goodShape.body.slice(0, 120) };

  // ===================== G-1 =============================================
  step("G-1: same-key race");
  await L.req({ port: a.port, method: "POST", path: "/api/cache/clear", headers: { "content-type": "application/json" }, body: "{}" });
  L.stub(stubRoot, { delayMs: 2500 });
  const RACE_BODY = {
    url: "https://www.youtube.com/watch?v=stub0000001",
    quality: "360", format: "mp4", deliver: "path",
    segments: [{ start: 0, end: 4 }, { start: 10, end: 14 }, { start: 20, end: 24 }],
  };
  const jobA = L.jsonReq({ port: a.port, path: "/api/download?jobId=job_key_a", body: RACE_BODY, timeout: 180000 });
  await new Promise((r) => setTimeout(r, 4000));
  const jobB = L.jsonReq({ port: a.port, path: "/api/download?jobId=job_key_b", body: RACE_BODY, timeout: 180000 });
  const [rA, rB] = await Promise.all([jobA, jobB]);
  const parse = (r) => { try { return JSON.parse(r.body); } catch { return { raw: (r.body || "").slice(0, 200) }; } };
  const bA = parse(rA), bB = parse(rB);
  out.G1 = {
    A: { status: rA.status, body: bA },
    B: { status: rB.status, body: bB },
    samePath: bA.path && bA.path === bB.path,
    sizesDiffer: bA.size !== bB.size,
    bothReported200: rA.status === 200 && rB.status === 200,
  };
  if (bA.path) {
    out.G1.fileOnDiskNow = fs.existsSync(bA.path) ? fs.statSync(bA.path).size : null;
    out.G1.fileMatchesWhatAWasTold = out.G1.fileOnDiskNow === bA.size;
    out.G1.fileMatchesWhatBWasTold = out.G1.fileOnDiskNow === bB.size;
    out.G1.realDurationSec = probeDuration(bA.path);
  }
  // Control: two downloads of DIFFERENT ranges should get different folders.
  L.stub(stubRoot, { delayMs: 0 });
  const c1 = await L.jsonReq({ port: a.port, path: "/api/download?jobId=ctl1", body: { ...RACE_BODY, segments: [{ start: 0, end: 4 }] }, timeout: 180000 });
  const c2 = await L.jsonReq({ port: a.port, path: "/api/download?jobId=ctl2", body: { ...RACE_BODY, segments: [{ start: 5, end: 9 }] }, timeout: 180000 });
  out.G1_differentRangesControl = {
    p1: parse(c1).path, p2: parse(c2).path,
    differentFolders: parse(c1).path !== parse(c2).path,
  };
  out.G1_serverLogLines = a.logs.stdout.join("").split("\n").filter((l) => /job_key_a|job_key_b|STILL OFF|join:/.test(l)).slice(0, 25);
  // is there any in-flight registry / cancel route?
  out.G1_cancelRoutes = {};
  for (const p of ["/api/download/cancel", "/api/download/stop", "/api/cancel"]) {
    const r = await L.req({ port: a.port, method: "POST", path: p, headers: { "content-type": "application/json" }, body: "{}" });
    out.G1_cancelRoutes[p] = r.status;
  }

  step("done");
  out.shot = await a.shot("end");
  await a.close();

  out.summary = {
    G3_nonYouTubeHostsAccepted: out.G3.filter((r) => r.expectation.startsWith("should be refused") && r.status === 200).length,
    G3_nonYouTubeHostsTried: out.G3.filter((r) => r.expectation.startsWith("should be refused")).length,
    G3_controlsRefused: out.G3.filter((r) => r.expectation === "must be refused" && r.status !== 200).length,
    G11_htmlResponsesOnCorrectVerb: out.G11.filter((r) => r.looksHtml).length,
    G11_withAbsolutePaths: out.G11.filter((r) => r.looksHtml && r.absPaths.length).length,
    G11_total: out.G11.length,
    G11_wrongVerbIsAlsoHtmlButNoStack: out.G11_wrongVerbControl,
    G1_samePath: out.G1.samePath,
    G1_sizesDiffer: out.G1.sizesDiffer,
    G1_bothReported200: out.G1.bothReported200,
    G1_fileMatchesA: out.G1.fileMatchesWhatAWasTold,
    G1_fileMatchesB: out.G1.fileMatchesWhatBWasTold,
  };
  console.log(JSON.stringify(out.summary, null, 2));
  console.log(L.save(`v-g1311-${runLabel}.json`, out));
})();
