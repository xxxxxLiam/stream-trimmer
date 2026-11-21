/**
 * File: g8-errors.cjs
 * Path: audit/run-2/area-G/g8-errors.cjs
 * Description: Failure-path verification.
 *   A  G-9: a damaged cached source — is it discarded and re-fetched, and does
 *      the message name the damage instead of ffmpeg's version banner?
 *   B  G-9b: every download comes back damaged — no infinite reuse.
 *   C  G-11: malformed and oversized bodies on every POST route (HTML stack
 *      traces with absolute paths?), wrong content types, a lying
 *      content-length, and a gzip bomb.
 *   D  G-16: a directory where clip.mp4 should be.
 *   E  G-17: TMPDIR on a 1 MB tmpfs (a genuinely full disk).
 *   F  G-6: a join that misses the expected length must fail rather than
 *      deliver, and must leave no clip behind.
 */
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const G = require("./glib.cjs");

const body = (segments, extra = {}) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
  ...extra,
});

const POST_ROUTES = [
  "/api/info",
  "/api/transcript",
  "/api/comments",
  "/api/download",
  "/api/auth/youtube/status",
  "/api/cache/clear",
  "/api/download/cancel",
];

async function main() {
  const out = { when: new Date().toISOString() };

  // --- A. a damaged cached source -----------------------------------------
  {
    const s = await G.startServer({
      label: "err-damaged",
      cfg: { duration: 30, failSections: true },
    });
    // one good run to learn the keyed folder
    const first = await s.post("/api/download?jobId=job_d0", body([{ start: 0, end: 4 }]), {
      timeout: 300_000,
    });
    const keyed = s
      .workFolders()
      .map((f) => path.join(s.serverTmp, f))
      .filter((f) => !/-[0-9a-f]{10}$/.test(f));
    // plant a truncated source in the shared keyed folder
    const shared = path.join(s.serverTmp, "ytclip-" + "" );
    const sharedDir = keyed[0] || null;
    let planted = null;
    if (sharedDir) {
      planted = path.join(sharedDir, "source.mp4");
      fs.writeFileSync(planted, fs.readFileSync(G.FIXTURE).subarray(0, 327152));
    }
    const attempts = [];
    for (let i = 1; i <= 3; i++) {
      const r = await s.post(`/api/download?jobId=job_d${i}`, body([{ start: 0, end: 4 }]), {
        timeout: 300_000,
      });
      attempts.push({
        status: r.status,
        error: r.json && r.json.error,
        code: r.json && r.json.code,
        cause: r.json && r.json.cause,
        action: r.json && r.json.action,
        mentionsDamaged: /damag/i.test(JSON.stringify(r.json || r.body)),
        hasFfmpegBanner: /libav(format|device|codec)/i.test(
          JSON.stringify(r.json || r.body),
        ),
        clipOk:
          r.json && r.json.path && fs.existsSync(r.json.path)
            ? G.ffprobeDuration(r.json.path)
            : null,
        filesInShared: sharedDir ? fs.readdirSync(sharedDir) : null,
      });
    }
    out.damagedCachedSource = {
      firstRun: { status: first.status, duration: first.json && first.json.path ? G.ffprobeDuration(first.json.path) : null },
      sharedDir,
      plantedBytes: planted ? fs.statSync(planted).size : null,
      plantedIsMedia: planted ? G.ffprobeDuration(planted) : null,
      attempts,
      log: s.log().split("\n").filter((l) => /readable media|damaged|discard/i.test(l)),
    };
    await s.stop();
  }

  // --- B. every download comes back damaged -------------------------------
  {
    const s = await G.startServer({
      label: "err-damaged2",
      cfg: { duration: 30, failSections: true, corruptSource: true },
    });
    const r = await s.post("/api/download?jobId=job_c1", body([{ start: 0, end: 4 }]), {
      timeout: 300_000,
    });
    const r2 = await s.post("/api/download?jobId=job_c2", body([{ start: 0, end: 4 }]), {
      timeout: 300_000,
    });
    out.alwaysDamaged = {
      first: { status: r.status, error: r.json && r.json.error, code: r.json && r.json.code, action: r.json && r.json.action },
      second: { status: r2.status, error: r2.json && r2.json.error },
      mentionsDamaged: /damag/i.test(JSON.stringify(r.json)),
      hasFfmpegBanner: /libav/i.test(JSON.stringify(r.json)),
      filesLeft: s.workFolders().map((f) => ({ f, files: fs.readdirSync(path.join(s.serverTmp, f)) })),
      downloadRuns: s.pids().length,
    };
    await s.stop();
  }

  // --- C. body shapes ------------------------------------------------------
  {
    const s = await G.startServer({ label: "err-bodies", cfg: { duration: 30 } });
    const shapes = [
      { name: "{ not json", body: "{ not json", ct: "application/json" },
      { name: "truncated object", body: '{"url":"https://www.youtube.com/watch?v=x"', ct: "application/json" },
      { name: "null", body: "null", ct: "application/json" },
      { name: '"hi"', body: '"hi"', ct: "application/json" },
      { name: "42", body: "42", ct: "application/json" },
      { name: "array", body: "[1,2,3]", ct: "application/json" },
      { name: "empty body", body: "", ct: "application/json" },
      { name: "no content-type", body: '{"url":"https://www.youtube.com/watch?v=x"}', ct: null },
      { name: "text/plain", body: '{"url":"https://www.youtube.com/watch?v=x"}', ct: "text/plain" },
      { name: "10MB", body: "x".repeat(10 * 1024 * 1024), ct: "application/json" },
      { name: "93KB valid", body: JSON.stringify({ url: "https://www.youtube.com/watch?v=" + "a".repeat(93 * 1024) }), ct: "application/json" },
      { name: "deep nesting", body: JSON.stringify(JSON.parse("[".repeat(400) + "]".repeat(400))), ct: "application/json" },
      { name: "proto pollution", body: '{"url":"https://www.youtube.com/watch?v=x","__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}', ct: "application/json" },
    ];
    out.bodies = [];
    for (const route of POST_ROUTES) {
      for (const sh of shapes) {
        const r = await G.request({
          port: s.port,
          method: "POST",
          path: route,
          headers: {
            ...(sh.ct ? { "content-type": sh.ct } : {}),
          },
          body: sh.body,
          timeout: 60_000,
        });
        const text = r.body || "";
        out.bodies.push({
          route,
          shape: sh.name,
          status: r.status,
          contentType: (r.headers && r.headers["content-type"]) || null,
          looksHtml: /^<!DOCTYPE html|<pre>/i.test(text.trim()),
          hasStack: /\bat [\w.<>]+ \(/.test(text),
          absPaths: Array.from(new Set(text.match(/\/(?:home|tmp|usr|root)\/[\w./-]+/g) || [])).slice(0, 3),
          firstBytes: text.slice(0, 120).replace(/\n/g, " "),
        });
      }
    }
    // a lying content-length and a gzip bomb
    const lying = await G.request({
      port: s.port,
      method: "POST",
      path: "/api/info",
      headers: { "content-type": "application/json", "content-length": "9999" },
      body: '{"url":"https://www.youtube.com/watch?v=x"}',
      timeout: 8000,
    });
    out.lyingContentLength = { status: lying.status || null, error: lying.error || null };
    const bomb = zlib.gzipSync(Buffer.alloc(100 * 1024 * 1024, 0x20));
    const bombRes = await G.request({
      port: s.port,
      method: "POST",
      path: "/api/info",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      body: bomb,
      timeout: 60_000,
    });
    out.gzipBomb = {
      compressedBytes: bomb.length,
      inflatesTo: 100 * 1024 * 1024,
      status: bombRes.status,
      contentType: bombRes.headers && bombRes.headers["content-type"],
      looksHtml: /^<!DOCTYPE html|<pre>/i.test((bombRes.body || "").trim()),
      firstBytes: (bombRes.body || "").slice(0, 160).replace(/\n/g, " "),
      serverStillAnswers: (await s.get("/api/cache/usage")).status,
    };
    out.htmlResponses = out.bodies.filter((b) => b.looksHtml).length;
    out.htmlWithAbsPaths = out.bodies.filter((b) => b.looksHtml && b.absPaths.length).length;
    await s.stop();
  }

  // --- D. a directory where the clip should be -----------------------------
  {
    const s = await G.startServer({
      label: "err-dir",
      cfg: { duration: 30, failSections: true, delayMs: 2500 },
    });
    const p = s.post("/api/download?jobId=job_dir", body([{ start: 0, end: 4 }]), {
      timeout: 300_000,
    });
    let swapped = false;
    for (let i = 0; i < 120; i++) {
      await G.sleep(200);
      const folders = s.workFolders().filter((f) => /-[0-9a-f]{10}$/.test(f));
      if (!folders.length) continue;
      const clip = path.join(s.serverTmp, folders[0], "clip.mp4");
      try {
        fs.rmSync(clip, { force: true });
        fs.mkdirSync(clip);
        swapped = true;
        break;
      } catch {
        /* retry */
      }
    }
    const r = await p;
    out.directoryAsClip = {
      swapped,
      status: r.status,
      body: r.json ?? (r.body || "").slice(0, 200),
      reportedSize: r.json && r.json.size,
      pathIsDirectory:
        r.json && r.json.path && fs.existsSync(r.json.path)
          ? fs.statSync(r.json.path).isDirectory()
          : null,
    };
    await s.stop();
  }

  // --- E. TMPDIR on a full filesystem --------------------------------------
  {
    const mnt = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "g2full-"));
    let mounted = false;
    try {
      execFileSync("mount", ["-t", "tmpfs", "-o", "size=1M", "tmpfs", mnt]);
      mounted = true;
    } catch (e) {
      out.diskFull = { skipped: `could not mount tmpfs: ${e.message}` };
    }
    if (mounted) {
      const s = await G.startServer({
        label: "err-full",
        cfg: { duration: 30, failSections: true },
        env: { TMPDIR: mnt, TMP: mnt, TEMP: mnt },
      });
      const r = await s.post("/api/download?jobId=job_full", body([{ start: 0, end: 4 }]), {
        timeout: 300_000,
      });
      out.diskFull = {
        status: r.status,
        body: r.json ?? (r.body || "").slice(0, 400),
        code: r.json && r.json.code,
        classifiedAsDiskFull: Boolean(r.json && r.json.code === "disk_full"),
        saysHowMuchIsNeeded: /\bMB\b/.test(JSON.stringify(r.json || r.body)),
        action: r.json && r.json.action,
        usage: (await s.get("/api/cache/usage")).json,
        log: s.log().split("\n").filter((l) => /ENOSPC|space|full/i.test(l)).slice(0, 8),
      };
      await s.stop();
      try {
        execFileSync("umount", [mnt]);
      } catch {
        /* ignore */
      }
    }
  }

  // --- F. a join the server knows is the wrong length ----------------------
  {
    const s = await G.startServer({ label: "err-join", cfg: { duration: 3600 } });
    // every piece is the whole 30 s fixture, so 3 x 5 s marks join to ~90 s
    const r = await s.post(
      "/api/download?jobId=job_join",
      body([
        { start: 0, end: 5 },
        { start: 10, end: 15 },
        { start: 20, end: 25 },
      ]),
      { timeout: 300_000 },
    );
    out.wrongLengthJoin = {
      status: r.status,
      body: r.json ?? (r.body || "").slice(0, 400),
      code: r.json && r.json.code,
      hasPath: Boolean(r.json && r.json.path),
      mentionsBothLengths: /90\.\d\ds|15\.00s/.test(JSON.stringify(r.json || "")),
      diagnostics: Boolean(r.json && r.json.diagnostics),
      foldersLeft: s.workFolders().map((f) => ({
        f,
        files: fs.readdirSync(path.join(s.serverTmp, f)),
      })),
      log: s.log().split("\n").filter((l) => /join/.test(l)),
    };
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2).slice(0, 12000));
  console.log("results:", G.saveResults("g8-errors", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
