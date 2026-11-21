/**
 * File: downloadJobs.test.ts
 * Path: server/downloadJobs.test.ts
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
} from "./testSupport/jobHarness";
import { attribute, thumbnails } from "./testSupport/frameIdentity";

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
): Promise<T> {
  const h = await startJobHarness({ env });
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
    h.configure({ delayMs: 4000 });
    const body = { url: freshUrl(), segments: [{ start: 0, end: 4 }] };
    const a = downloadPath(h, "job_g10_a", body);
    await until(() => h.downloadPids().length >= 1, 15_000, "A's yt-dlp");
    const b = downloadPath(h, "job_g10_b", body);
    await until(() => h.downloadPids().length >= 2, 15_000, "B's yt-dlp");
    const [pidA, pidB] = h.downloadPids();

    const cancel = await h.post("/api/download/cancel", { jobId: "job_g10_a" });
    assert.equal(cancel.status, 200);
    assert.deepEqual(await cancel.json(), { ok: true, found: true });

    const ra = await a;
    assert.equal(ra.status, 499);
    assert.equal(ra.body.code, "cancelled");
    await until(() => !pidAlive(pidA), 3000, "A's yt-dlp to die");
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
