/**
 * File: downloadJobs.test.ts
 * Path: src/main/features/engine/services/download/downloadJobs.test.ts
 * Description: End-to-end tests for /api/download and the routes around it,
 * against the real server, the REAL ffmpeg and a scriptable fake yt-dlp. Each
 * test names the audit finding it pins (G-1 … G-10, F-5). The fake "media" is
 * audit/fixtures/fixture.mp4: 30 s, 25 fps, 750 frames each unique, keyframes
 * only at 0 / 10 / 20 s, which is what makes a non-keyframe cut visible.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FIXTURE,
  REAL_FFMPEG,
  SKIP_REASON,
  YT_URL,
  pidAlive,
  startJobHarness,
  type JobHarness,
} from "../../testSupport/jobHarness";
import { attribute, thumbnails } from "../../testSupport/frameIdentity";

const SLOW = { timeout: 180_000, skip: SKIP_REASON };
const FPS = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 15_000, what = "condition") {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

let nextUrl = 0;
/** A distinct YouTube URL per call, so tests never share a keyed work folder by accident. */
const freshUrl = () => `${YT_URL}&n=${++nextUrl}`;

async function withHarness<T>(
  fn: (h: JobHarness) => Promise<T>,
  env?: Record<string, string>,
  extra: { slowConcatSec?: number } = {},
): Promise<T> {
  const h = await startJobHarness({ env, ...extra });
  try {
    return await fn(h);
  } finally {
    await h.stop();
  }
}

interface PathResult {
  status: number;
  body: any;
}
async function downloadPath(
  h: JobHarness,
  jobId: string,
  body: Record<string, unknown>,
  init?: RequestInit,
): Promise<PathResult> {
  const res = await h.post(
    `/api/download?jobId=${jobId}`,
    { quality: "360", format: "mp4", deliver: "path", ...body },
    init,
  );
  return { status: res.status, body: await res.json() };
}

function workFolders(h: JobHarness): string[] {
  return fs.readdirSync(h.serverTmp).filter((n) => n.startsWith("ytclip-"));
}

// --- G-1 ----------------------------------------------------------------------

test("G-1: two identical downloads at once each get their own folder and their own intact clip", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ delayMs: 1200 });
    const url = freshUrl();
    const body = { url, segments: [{ start: 0, end: 4 }] };
    const [a, b] = await Promise.all([
      downloadPath(h, "job_g1_a", body),
      downloadPath(h, "job_g1_b", body),
    ]);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.notEqual(a.body.path, b.body.path, "both jobs were handed the same path");
    // Whatever size a response reports must describe the file at its path.
    for (const r of [a, b]) {
      assert.equal(fs.statSync(r.body.path).size, r.body.size);
    }
  }));

// --- G-10 (and G-1 + G-10: cancelling one must not disturb the other) -----------

test("G-10: the cancel route kills that job's yt-dlp; an identical job running beside it finishes", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ delayMs: 8000 });
    const body = { url: freshUrl(), segments: [{ start: 0, end: 4 }] };
    const a = downloadPath(h, "job_g10_a", body);
    await until(() => h.downloadPids().length >= 1, 15_000, "A's yt-dlp");
    const b = downloadPath(h, "job_g10_b", body);
    await until(() => h.downloadPids().length >= 2, 15_000, "B's yt-dlp");
    const [pidA, pidB] = h.downloadPids();

    const cancel = await h.post("/api/download/cancel", { jobId: "job_g10_a" });
    assert.equal(cancel.status, 200);
    assert.deepEqual(await cancel.json(), { ok: true, found: true });

    // yt-dlp would sleep 8 s; a real kill makes A answer almost at once.
    const ra = await Promise.race([a, sleep(3000).then(() => null)]);
    assert.ok(ra, "A was still running 3 s after Cancel: yt-dlp was not killed");
    assert.equal(ra.status, 499);
    assert.equal(ra.body.code, "cancelled");
    assert.ok(!pidAlive(pidA), "A's yt-dlp is still running");
    assert.ok(pidAlive(pidB), "cancelling A killed B's yt-dlp");

    const rb = await b;
    assert.equal(rb.status, 200, JSON.stringify(rb.body));
    assert.ok(fs.existsSync(rb.body.path), "B's clip was lost");
  }));

test("G-10: hanging up the request also kills yt-dlp", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ delayMs: 6000 });
    const ac = new AbortController();
    const pending = downloadPath(
      h,
      "job_g10_hangup",
      { url: freshUrl(), segments: [{ start: 0, end: 4 }] },
      { signal: ac.signal },
    ).catch(() => null);
    await until(() => h.downloadPids().length >= 1, 15_000, "yt-dlp to start");
    const [pid] = h.downloadPids();
    ac.abort();
    await pending;
    await until(() => !pidAlive(pid), 3000, "yt-dlp to die after the hang-up");
  }));

test("G-10: cancelling an unknown or finished job is a harmless 200 found:false", SLOW, () =>
  withHarness(async (h) => {
    const unknown = await h.post("/api/download/cancel", { jobId: "job_never" });
    assert.equal(unknown.status, 200);
    assert.deepEqual(await unknown.json(), { ok: true, found: false });

    const done = await downloadPath(h, "job_g10_done", {
      url: freshUrl(),
      segments: [{ start: 0, end: 4 }],
    });
    assert.equal(done.status, 200);
    const late = await h.post("/api/download/cancel", { jobId: "job_g10_done" });
    assert.deepEqual(await late.json(), { ok: true, found: false });
    assert.ok(fs.existsSync(done.body.path), "a late cancel removed a finished clip");

    const bad = await h.post("/api/download/cancel", {});
    assert.equal(bad.status, 400);
  }));

// --- G-8 ----------------------------------------------------------------------

test("G-8: Clear cache leaves a running multi-segment job and a finished, uncollected clip alone", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ failSections: true, delayMs: 1500 });
    const job = downloadPath(h, "job_g8", {
      url: freshUrl(),
      segments: [
        { start: 0.5, end: 2.25 },
        { start: 10.1, end: 12.35 },
      ],
    });
    await until(() => h.downloadPids().length >= 1, 15_000, "the whole-file download");
    // An abandoned folder: nothing is using it, so this one SHOULD go.
    const orphan = path.join(h.serverTmp, "ytclip-0000000000000000-orphan");
    fs.mkdirSync(orphan);
    fs.writeFileSync(path.join(orphan, "x.part"), "partial");

    const cleared = await (await h.post("/api/cache/clear", {})).json();
    assert.ok(cleared.skipped >= 1, `nothing was skipped: ${JSON.stringify(cleared)}`);
    assert.ok(!fs.existsSync(orphan), "the abandoned folder was not cleared");

    const r = await job;
    assert.equal(r.status, 200, `the job died after Clear cache: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.segments, 2);

    // The 200 has been sent; the app has not moved the clip yet.
    await h.post("/api/cache/clear", {});
    assert.ok(fs.existsSync(r.body.path), "Clear cache deleted a finished clip awaiting collection");
  }));

// --- G-4 / G-6 -----------------------------------------------------------------

test("G-4: a multi-range cut off keyframes holds exactly the marked frames, none from before an in-point", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ failSections: true }); // force the whole-file + local-trim path
    const marks = [
      { start: 0.5, end: 2.25 },
      { start: 10.1, end: 12.35 },
    ];
    const r = await downloadPath(h, "job_g4", { url: freshUrl(), segments: marks });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.joinMethod, "copy", "the join needed the re-encode fallback");

    const source = thumbnails(REAL_FFMPEG, FIXTURE);
    const clip = thumbnails(REAL_FFMPEG, r.body.path);
    const { indices, worstDistance } = attribute(source, clip);
    assert.ok(worstDistance < 3, `a frame matches no source frame (distance ${worstDistance})`);

    const inside = (i: number) =>
      marks.some((m) => i / FPS >= m.start - 1e-6 && i / FPS <= m.end + 1e-6);
    const stray = indices.filter((i) => !inside(i)).map((i) => (i / FPS).toFixed(2));
    assert.deepEqual(stray, [], `frames from outside the marked ranges: ${stray.join(" ")}`);

    // 4.00 s marked = 100 frames; a sub-frame mark edge may cost one frame.
    assert.ok(clip.length >= 98 && clip.length <= 100, `clip has ${clip.length} frames`);
    assert.ok(indices[0] / FPS >= 0.5 - 1e-6, `opens at ${indices[0] / FPS}s, before the 0.50s in-point`);
    // In source order, no frame repeated.
    for (let k = 1; k < indices.length; k++) assert.ok(indices[k] > indices[k - 1]);
  }));

test("G-6: a joined clip whose length fails the server's own check is not reported as a success", SLOW, () =>
  withHarness(async (h) => {
    // Without failSections the fake writes the whole 30 s fixture per segment,
    // so three 5 s marks join into ~90 s: exactly the 'STILL OFF' case.
    const r = await downloadPath(h, "job_g6", {
      url: freshUrl(),
      segments: [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
        { start: 10, end: 15 },
      ],
    });
    assert.notEqual(r.status, 200, "a clip of the wrong length was delivered as a success");
    assert.equal(r.body.code, "join_failed");
    assert.ok(r.body.diagnostics, "no diagnostics on the failure");
    assert.equal(r.body.path, undefined);
    assert.deepEqual(
      workFolders(h).filter((n) => fs.existsSync(path.join(h.serverTmp, n, "clip.mp4"))),
      [],
      "the wrong clip was left on disk",
    );
  }));

// --- G-9 -----------------------------------------------------------------------

test("G-9: a damaged whole-file download is discarded and named, not kept to break every retry", SLOW, () =>
  withHarness(async (h) => {
    const url = freshUrl();
    const body = { url, segments: [{ start: 0.5, end: 3 }] };
    h.configure({ failSections: true, corruptSource: true });
    const first = await downloadPath(h, "job_g9_1", body);
    assert.equal(first.status, 500);
    assert.match(first.body.error, /damaged/i);
    assert.doesNotMatch(first.body.error, /libavformat|libavutil|configuration:/);

    // The next attempt gets a healthy download. Before the fix the truncated
    // file was kept as `source.mp4` and fed to ffmpeg again, forever.
    h.configure({ failSections: true });
    const second = await downloadPath(h, "job_g9_2", body);
    assert.equal(second.status, 200, JSON.stringify(second.body));
  }));

test("G-9: a damaged file already in the cache is replaced by a fresh download", SLOW, () =>
  withHarness(async (h) => {
    const url = freshUrl();
    // The shared, resumable folder for this clip (same key as the server's).
    const key = crypto
      .createHash("sha1")
      .update([url, "mp4", "360", "0.50", "3.00"].join("\u0000"))
      .digest("hex")
      .slice(0, 16);
    const dir = path.join(h.serverTmp, `ytclip-${key}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "source.mp4"), fs.readFileSync(FIXTURE).subarray(0, 4000));

    h.configure({ failSections: true });
    const r = await downloadPath(h, "job_g9_planted", { url, segments: [{ start: 0.5, end: 3 }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(h.log(), /not readable media/);
    assert.ok(h.downloadPids().length >= 2, "the damaged copy was not re-fetched");
  }));

// --- G-2 / G-3 -----------------------------------------------------------------

function rawRequest(
  h: JobHarness,
  opts: { method: string; path: string; headers?: Record<string, string>; body?: string; host?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: opts.host ?? "127.0.0.1", port: h.port, method: opts.method, path: opts.path, headers: opts.headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

test("G-2: a foreign origin cannot reach the API, with or without a preflight", SLOW, () =>
  withHarness(async (h) => {
    const orphan = path.join(h.serverTmp, "ytclip-1111111111111111");
    fs.mkdirSync(orphan);

    // The no-preflight attack: a simple text/plain POST that a browser sends.
    const wipe = await rawRequest(h, {
      method: "POST",
      path: "/api/cache/clear",
      headers: { Origin: "https://evil.example", "Content-Type": "text/plain" },
      body: "{}",
    });
    assert.equal(wipe.status, 403);
    assert.ok(fs.existsSync(orphan), "a foreign-origin POST cleared the cache");

    const preflight = await rawRequest(h, {
      method: "OPTIONS",
      path: "/api/download",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(preflight.status, 403);
    assert.equal(preflight.headers["access-control-allow-origin"], undefined);

    const info = await rawRequest(h, {
      method: "POST",
      path: "/api/info",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ url: YT_URL }),
    });
    assert.equal(info.status, 403);
    assert.equal(h.calls().length, 0, "yt-dlp ran for a foreign origin");
  }));

test("G-2: the app's own origin still works, and a non-loopback Host is refused", SLOW, () =>
  withHarness(async (h) => {
    const own = `http://127.0.0.1:${h.port}`;
    const ok = await rawRequest(h, {
      method: "POST",
      path: "/api/cache/clear",
      headers: { Origin: own, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["access-control-allow-origin"], own);

    const dev = await rawRequest(h, {
      method: "OPTIONS",
      path: "/api/info",
      headers: { Origin: "http://localhost:8080", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(dev.status, 204);
    assert.equal(dev.headers["access-control-allow-origin"], "http://localhost:8080");

    const rebinding = await rawRequest(h, {
      method: "GET",
      path: "/api/cache/usage",
      headers: { Host: `rebind.evil.example:${h.port}` },
    });
    assert.equal(rebinding.status, 403);
  }));

test("G-2: the server does not listen on a non-loopback address", SLOW, () =>
  withHarness(async (h) => {
    assert.match(h.log(), /listening on http:\/\/127\.0\.0\.1:/);
    const external = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal);
    if (!external) return; // no second interface here; the log line above is the check
    await assert.rejects(
      rawRequest(h, { method: "GET", path: "/api/cache/usage", host: external.address }),
      /ECONNREFUSED/,
    );
  }));

test("G-3: only real YouTube hosts reach yt-dlp", SLOW, () =>
  withHarness(async (h) => {
    const bad = [
      "https://youtube.com@evil.example/x",
      "https://evil.example/youtube.com/x",
      "https://evil.example/collect?ref=youtube.com",
      "http://169.254.169.254/youtube.com/latest/meta-data/",
      "http://127.0.0.1:22/youtube.com",
      "file:///etc/passwd#youtube.com",
      "https://youtube.com.evil.example/watch?v=x",
      "https://notyoutube.com/watch?v=x",
      "ftp://youtube.com/x",
    ];
    for (const url of bad) {
      const res = await h.post("/api/info", { url });
      assert.equal(res.status, 400, `${url} was accepted`);
    }
    assert.equal(h.calls().length, 0, "yt-dlp was run for a non-YouTube URL");

    for (const url of [
      "https://www.youtube.com/watch?v=abc",
      "https://youtube.com/watch?v=abc",
      "https://m.youtube.com/watch?v=abc",
      "https://music.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
    ]) {
      const res = await h.post("/api/info", { url });
      assert.equal(res.status, 200, `${url} was refused`);
    }
  }));

// --- G-5 -----------------------------------------------------------------------

test("G-5: info, transcript, comments and sign-in status never hand yt-dlp the canonical cookie file", SLOW, async () => {
  const jarDir = fs.mkdtempSync(path.join(os.tmpdir(), "jar-"));
  const jar = path.join(jarDir, "yt-cookies.txt");
  const original =
    "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tabc\n" +
    ".youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-3PSID\tdef\n";
  fs.writeFileSync(jar, original);
  try {
    await withHarness(
      async (h) => {
        // What a stale-session yt-dlp does on exit: rewrite the jar it was given.
        h.configure({ cookieWriteBack: "" });
        const url = freshUrl();
        await h.post("/api/info", { url, cookiesFromBrowser: "app" });
        await h.post("/api/transcript", { url, cookiesFromBrowser: "app" });
        await h.post("/api/comments", { url, cookiesFromBrowser: "app" });
        await h.post("/api/auth/youtube/status", { browser: "app" });

        const withCookies = h.calls().filter((c) => c.argv.includes("--cookies"));
        assert.ok(withCookies.length >= 4, `only ${withCookies.length} runs carried cookies`);
        for (const c of withCookies) {
          assert.notEqual(c.argv[c.argv.indexOf("--cookies") + 1], jar, "yt-dlp was handed the canonical jar");
        }
        assert.equal(fs.readFileSync(jar, "utf8"), original, "the saved sign-in was overwritten");
      },
      { YT_CLIPPER_COOKIE_FILE: jar },
    );
  } finally {
    fs.rmSync(jarDir, { recursive: true, force: true });
  }
});

// --- F-5 -----------------------------------------------------------------------

test("F-5: a metadata pre-flight failure carries diagnostics", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ failProbe: true, stderr: "ERROR: [youtube] stub0000001: Video unavailable" });
    const r = await downloadPath(h, "job_f5_probe", { url: freshUrl(), segments: [{ start: 0, end: 4 }] });
    assert.notEqual(r.status, 200);
    assert.ok(r.body.diagnostics, `no diagnostics key: ${Object.keys(r.body)}`);
    assert.equal(r.body.diagnostics.jobId, "job_f5_probe");
    assert.match(r.body.diagnostics.stderrTail.join("\n"), /Video unavailable/);

    h.configure({ duration: 5 });
    const past = await downloadPath(h, "job_f5_past", { url: freshUrl(), segments: [{ start: 0, end: 100 }] });
    assert.equal(past.body.code, "out_point_past_end");
    assert.equal(past.body.diagnostics?.jobId, "job_f5_past");
  }));

// =============================================================================
// Audit run 2, server findings G2-1 / G2-2 / G2-4 / G2-5 / G2-7
// =============================================================================

/** Every `.part` file under the server's work folders, as "folder/name:size". */
function partFiles(h: JobHarness): string[] {
  const out: string[] = [];
  for (const f of workFolders(h)) {
    const dir = path.join(h.serverTmp, f);
    for (const n of fs.readdirSync(dir)) {
      if (n.endsWith(".part")) out.push(`${f}/${n}:${fs.statSync(path.join(dir, n)).size}`);
    }
  }
  return out;
}

for (const shape of [
  { name: "one range", segments: [{ start: 0, end: 4 }], full: false },
  {
    name: "one range, whole-file fallback",
    segments: [{ start: 0, end: 4 }],
    full: true,
  },
  {
    name: "two ranges",
    segments: [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ],
    full: false,
  },
]) {
  test(`G2-1: a dropped download keeps its bytes and the retry resumes from them (${shape.name})`, SLOW, () =>
    withHarness(async (h) => {
      const body = { url: freshUrl(), segments: shape.segments };
      // sectioned run (or, with failSections, the whole-file run) drops mid-way
      h.configure(
        shape.full
          ? { failSections: true, partialBytes: 123_456, partialOnFull: true }
          : { partialBytes: 123_456 },
      );
      const failed = await downloadPath(h, "job_rc_g21", body);
      assert.equal(failed.status, 502, JSON.stringify(failed.body));
      assert.equal(failed.body.code, "network_dropped");
      // The response says the partial is on disk; it must be.
      const parts = partFiles(h);
      assert.equal(parts.length, 1, `the partial was deleted with the failed job: ${JSON.stringify(parts)}`);
      assert.match(parts[0], /:123456$/);
      assert.match(failed.body.error, /already fetched is on disk/);
      assert.match(failed.body.error, /0\.1 MB/, "the message should name the bytes it kept");

      // The retry finds it, says so, and finishes.
      // (the fake cannot cut a section itself, so the retry trims locally)
      h.configure({ failSections: true });
      const again = await downloadPath(h, "job_rc_g21_retry", body);
      assert.equal(again.status, 200, JSON.stringify(again.body));
      assert.match(h.log(), /resuming with 123456 cached byte\(s\)/);
      assert.ok(fs.existsSync(again.body.path), "the retried clip is missing");
      // (a sectioned partial is consumed by yt-dlp itself; this fake retries by
      // the whole-file path, so only that shape can show the partial go away)
      if (shape.full) assert.deepEqual(partFiles(h), [], "a finished download left its partial behind");
    }));
}

test("G2-2: a backslash, control character or userinfo cannot move the host the engine reads", SLOW, () =>
  withHarness(async (h) => {
    const bad = [
      // the audit's three differentials
      "https://www.youtube.com\\@evil.example/watch?v=x",
      "https://www.youtube.com\\\\@evil.example/watch?v=x",
      "https://www.youtube.com\\.evil.example/x",
      // fresh ones: the same idea with other terminators and encodings
      "https://www.youtube.com\\evil.example/x",
      "https://www.youtube.com%5c@evil.example/x",
      "https://www.youtube.com%5C.evil.example/x",
      "https://www.youtube.com%00.evil.example/x",
      "https://www.youtube.com%0d%0a.evil.example/x",
      "https://www.youtube.com%09@evil.example/x",
      "https://www.youtube.com%2f@evil.example/x",
      "https://www.youtube.com\t@evil.example/x",
      "https://www.youtube.com\n@evil.example/x",
      "https://www.youtube.com\r.evil.example/x",
      "https://www.youtube.com\u0000.evil.example/x",
      "https://www.youtube.com\u007f.evil.example/x",
      "https://www.youtube.com @evil.example/x",
      "https://www.youtube.com。evil.example/x",
      "https://www.youtube.com／@evil.example/x",
      "https://www.youtube.com＼@evil.example/x",
      "https://www.youtube.com＠evil.example/x",
      "https://www.youtu​e.com/x",
      "https://youtu.be\\@evil.example/x",
      "https:\\\\www.youtube.com\\@evil.example/x",
      "https:/\\www.youtube.com/x",
      "https:///www.youtube.com@evil.example/x",
      "https:www.youtube.com@evil.example/x",
      "https:/www.youtube.com/x",
      " https://www.youtube.com/x",
      "https://www.youtube.com/x ",
      "\thttps://www.youtube.com/x",
      "https://user@www.youtube.com/x",
      "https://user:pw@www.youtube.com/x",
      "https://www.youtube.com:@evil.example/x",
      "https://www.youtube.com:80@evil.example/x",
      "https://www.youtube.com:abc/x",
      "https://www.youtube.com:99999999/x",
      "https://[::1]/youtube.com",
      "https://127.0.0.1/",
      "https://2130706433/",
      "https://0x7f.1/",
      "https://xn--yutube-dva.com/",
      "https://youtube.com.evil.example/",
      "https://evil.example/https://www.youtube.com/",
      "https://evil.example?@www.youtube.com/",
      "https://evil.example#@www.youtube.com/",
      "https://evil.example;@www.youtube.com/",
      "javascript://www.youtube.com/%0aalert(1)",
      "data:text/html,www.youtube.com",
      "HTTPS://WWW.YOUTUBE.COM\\@evil.example/x",
    ];
    for (const url of bad) {
      const res = await h.post("/api/info", { url });
      assert.equal(res.status, 400, `${JSON.stringify(url)} was accepted (${res.status})`);
    }
    assert.equal(h.calls().length, 0, "yt-dlp was run for a URL one of the two parsers reads as another host");

    // Still fine: ordinary links, with ports, trailing dots, queries and fragments.
    for (const url of [
      "https://www.youtube.com/watch?v=abc&t=10s#x",
      "https://youtu.be/abc?si=a%2Fb",
      "http://m.youtube.com:443/watch?v=abc",
      "HTTPS://WWW.YOUTUBE.COM/watch?v=abc",
      "https://www.youtube.com./watch?v=abc",
    ]) {
      const res = await h.post("/api/info", { url });
      assert.equal(res.status, 200, `${url} was refused`);
    }
  }));

test("G2-2: every URL that is accepted has the same host in Python's urlsplit (yt-dlp's parser)", SLOW, async () => {
  const { spawnSync } = await import("node:child_process");
  if (spawnSync("python3", ["-I", "-c", "pass"]).status !== 0) return; // no python here
  const candidates = [
    "https://www.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "http://m.youtube.com:8080/x",
    "https://www.youtube.com./x",
    "https://www.youtube.com\\@evil.example/x",
    "https://www.youtube.com%5c@evil.example/x",
    "https://www.youtube.com\t@evil.example/x",
    "https://youtube.com@evil.example/x",
    "https://evil.example\\@www.youtube.com/x",
  ];
  await withHarness(async (h) => {
    for (const url of candidates) {
      const status = (await h.post("/api/info", { url })).status;
      if (status !== 200) continue;
      const py = spawnSync(
        "python3",
        ["-I", "-c", "import sys,urllib.parse;print(urllib.parse.urlsplit(sys.argv[1]).hostname)", url],
        { encoding: "utf8" },
      ).stdout.trim();
      const node = new URL(url).hostname.replace(/\.$/, "");
      assert.equal(py.replace(/\.$/, ""), node, `parsers disagree about ${JSON.stringify(url)}`);
    }
  });
});

test("G2-4: a malformed or oversized body is answered with JSON, never an HTML stack trace", SLOW, () =>
  withHarness(async (h) => {
    const routes = [
      "/api/info",
      "/api/transcript",
      "/api/comments",
      "/api/download",
      "/api/download/cancel",
      "/api/auth/youtube/status",
      "/api/cache/clear",
    ];
    const bodies: Array<[string, string, number]> = [
      ["{ not json", "invalid_json", 400],
      ['{"url": "https://www.youtube.com/watch?v=x"', "invalid_json", 400],
      ["null", "invalid_json", 400],
      ['"hi"', "invalid_json", 400],
      ["42", "invalid_json", 400],
      [JSON.stringify({ url: "x".repeat(200_000) }), "body_too_large", 413],
      ["x".repeat(10_000_000), "body_too_large", 413],
    ];
    for (const route of routes) {
      for (const [body, code, status] of bodies) {
        const res = await fetch(`${h.baseUrl}${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const text = await res.text();
        assert.match(res.headers.get("content-type") ?? "", /application\/json/, `${route}: ${text.slice(0, 120)}`);
        const json = JSON.parse(text);
        assert.equal(res.status, status, `${route} ${body.slice(0, 20)}: ${text}`);
        assert.equal(json.code, code);
        assert.equal(typeof json.error, "string");
        // nothing from the stack, no absolute path, no user name
        assert.doesNotMatch(text, /<!DOCTYPE|<pre>|node_modules|\bat \S+ \(|\/home\/|\/Users\/|\.cjs|\.ts:/);
      }
    }
    assert.match((await (await fetch(`${h.baseUrl}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(200_000),
    })).json()).error, /100kb/, "the limit is not named");

    // an unknown API path is JSON too
    const missing = await fetch(`${h.baseUrl}/api/nope`, { method: "POST" });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, "not_found");
    // and the server is still answering
    assert.equal((await fetch(`${h.baseUrl}/api/cache/usage`)).status, 200);
  }));

function procsWithCmdline(needle: string): number[] {
  const hits: number[] = [];
  for (const pid of fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
      if (cmd.includes(needle)) hits.push(Number(pid));
    } catch {
      /* gone */
    }
  }
  return hits;
}

test("G2-5: cancelling during the join stops the join ffmpeg too", SLOW, () =>
  withHarness(
    async (h) => {
      const body = {
        url: freshUrl(),
        segments: [
          { start: 0, end: 2 },
          { start: 5, end: 7 },
        ],
      };
      const t0 = Date.now();
      const job = downloadPath(h, "job_rc_g25", body);
      // the join is running once its (slow) ffmpeg wrapper is sleeping
      await until(() => procsWithCmdline("sleep 47").length > 0, 30_000, "the join ffmpeg");
      const cancel = await h.post("/api/download/cancel", { jobId: "job_rc_g25" });
      assert.deepEqual(await cancel.json(), { ok: true, found: true });
      const r = await Promise.race([job, sleep(10_000).then(() => null)]);
      assert.ok(r, "the download request was still waiting on the join 10 s after Cancel");
      assert.equal(r.status, 499);
      assert.equal(r.body.code, "cancelled");
      assert.ok(Date.now() - t0 < 30_000);
      await until(() => procsWithCmdline("sleep 47").length === 0, 5_000, "the join to die");
      assert.deepEqual(workFolders(h), [], "the cancelled job left its folders");
    },
    undefined,
    { slowConcatSec: 47 },
  ));

test("G2-7: uncollected clips are counted in the cache figure, and broken out as protected", SLOW, () =>
  withHarness(async (h) => {
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await downloadPath(h, `job_rc_g27_${i}`, {
        url: freshUrl(),
        segments: [{ start: 0, end: 2 }],
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      sizes.push(r.body.size);
    }
    const total = sizes.reduce((a, b) => a + b, 0);
    const usage = await (await fetch(`${h.baseUrl}/api/cache/usage`)).json();
    assert.equal(usage.folders, 3, JSON.stringify(usage));
    assert.ok(usage.bytes >= total, `reports ${usage.bytes} bytes for ${total} bytes of clips on disk`);
    assert.equal(usage.protectedFolders, 3);
    assert.equal(usage.protectedBytes, usage.bytes);
    assert.equal(usage.clearableBytes, 0);
    // Clear leaves them (the hold is deliberate) and the figure does not pretend otherwise.
    const cleared = await (await h.post("/api/cache/clear", {})).json();
    assert.equal(cleared.removed, 0);
    assert.equal(cleared.skipped, 3);
    assert.equal(cleared.bytes, usage.bytes);
  }));

// --- flow 7: failed clip rows ----------------------------------------------------

test("flow 7: a tool-out-of-date failure with no newer tools is final on its row, tried once, nothing shown to retry", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ failDownload: "ERROR: unable to extract player response; please report this issue" });
    const res = await downloadPath(h, "job_f7_tools", { url: freshUrl(), segments: [{ start: 0.5, end: 3 }] });
    assert.notEqual(res.status, 200);
    assert.equal(res.body.row.state, "failed-final");
    assert.match(res.body.row.reason, /YouTube/);
  }));

test("flow 7: disk full and private videos get their own row states and never retry the tools", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ failDownload: "ERROR: Video unavailable: This video is private" });
    const priv = await downloadPath(h, "job_f7_private", { url: freshUrl(), segments: [{ start: 0.5, end: 3 }] });
    assert.equal(priv.body.row.state, "cannot-download");
    assert.equal(priv.body.row.kind, "private");
    h.configure({ failDownload: "OSError: [Errno 28] No space left on device" });
    const disk = await downloadPath(h, "job_f7_disk", { url: freshUrl(), segments: [{ start: 0.5, end: 3 }] });
    assert.equal(disk.body.row.state, "no-space");
  }));

test("flow 7: any other failure is a plain failed row, final like the rest (E2-1: never promises a retry that is not coming)", SLOW, () =>
  withHarness(async (h) => {
    h.configure({ failDownload: "ERROR: unable to download video data: Connection reset by peer" });
    const res = await downloadPath(h, "job_f7_net", { url: freshUrl(), segments: [{ start: 0.5, end: 3 }] });
    assert.equal(res.body.row.state, "failed-final");
    assert.equal(res.body.row.retrying, undefined);
  }));
