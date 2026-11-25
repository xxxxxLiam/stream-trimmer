/**
 * File: toolStatus.test.ts
 * Path: src/main/features/engine/services/toolStatus.test.ts
 * Description: Pins the tool states the cold start screen shows: checking until the probe lands, then
 *   ready, missing or broken, and which tools make the whole answer "broken".
 */
import assert from "node:assert/strict";
import test from "node:test";
import { probeBinary, summarize, type Probe } from "./toolStatus";

const ok = (v: string): Probe => ({ path: "/x", ok: true, version: v });
const bad: Probe = { path: "/x", ok: false };
const gone: Probe = { path: null };

test("until a probe lands the tool is checking, and so is the whole answer", () => {
  const s = summarize({ ytdlp: ok("2026.11.23") });
  assert.equal(s.tools.ffmpeg.state, "checking");
  assert.equal(s.overall, "checking");
});

test("all present and running is ready, with versions", () => {
  const s = summarize({ ytdlp: ok("2026.11.23"), ffmpeg: ok("ffmpeg 7"), deno: ok("deno 2") });
  assert.equal(s.overall, "ready");
  assert.equal(s.tools.ytdlp.version, "2026.11.23");
});

test("a missing or broken yt-dlp or ffmpeg makes the whole answer broken, even while deno is still checking", () => {
  assert.equal(summarize({ ytdlp: gone, ffmpeg: ok("f") }).tools.ytdlp.state, "missing");
  assert.equal(summarize({ ytdlp: gone, ffmpeg: ok("f") }).overall, "broken");
  assert.equal(summarize({ ytdlp: ok("y"), ffmpeg: bad }).tools.ffmpeg.state, "broken");
  assert.equal(summarize({ ytdlp: ok("y"), ffmpeg: bad }).overall, "broken");
});

test("deno on its own being missing is reported but is not fatal", () => {
  const s = summarize({ ytdlp: ok("y"), ffmpeg: ok("f"), deno: gone });
  assert.equal(s.tools.deno.state, "missing");
  assert.equal(s.overall, "ready");
});

test("probing: no file is missing, a failing run is broken, output is the version", async () => {
  assert.deepEqual(await probeBinary(null, "--version"), { path: null });
  assert.deepEqual(await probeBinary("/definitely/not/here", "--version"), { path: null });
  const run = (out: string, fail = false) => (_f: string, _a: string[], _o: object, cb: (e: Error | null, s: string) => void) =>
    cb(fail ? new Error("x") : null, out);
  assert.equal((await probeBinary(process.execPath, "--version", run("v1\n"))).path, process.execPath);
  assert.deepEqual(await probeBinary(process.execPath, "--version", run("", true)), { path: process.execPath, ok: false });
  assert.deepEqual(await probeBinary(process.execPath, "--version", run("2026.11.23\n")), { path: process.execPath, ok: true, version: "2026.11.23" });
});

// ---- E-1: a failed first probe is looked at again ----------------------------------------------

import { currentToolStatus, markToolsReady, REPROBE_BACKOFF_MS, resetToolProbesForTest, setProbeForTest } from "./toolStatus";

const settle = () => new Promise((r) => setTimeout(r, 5));

test("a failed first probe is probed again on a later ask, once the backoff has passed", async () => {
  resetToolProbesForTest();
  let ytCalls = 0;
  setProbeForTest(async (binary, arg) => {
    if (arg === "--version" && ytCalls++ === 0) return { path: "/x", ok: false }; // first yt-dlp look is slow/failed
    return { path: "/x", ok: true, version: "1" };
  });
  try {
    const t0 = Date.now();
    currentToolStatus(t0);
    await settle();
    assert.equal(currentToolStatus(t0 + 1).overall, "broken");
    // Inside the backoff nothing is re-probed.
    await settle();
    assert.equal(currentToolStatus(t0 + 2).overall, "broken");
    // After it, the ask starts a new probe and the answer turns ready.
    currentToolStatus(t0 + REPROBE_BACKOFF_MS + 10);
    await settle();
    assert.equal(currentToolStatus(t0 + REPROBE_BACKOFF_MS + 20).overall, "ready");
  } finally {
    setProbeForTest(null);
    resetToolProbesForTest();
  }
});

test("a video that opens marks a broken tool check ready", async () => {
  resetToolProbesForTest();
  setProbeForTest(async () => ({ path: "/x", ok: false }));
  try {
    currentToolStatus(Date.now());
    await settle();
    assert.equal(currentToolStatus(Date.now()).overall, "broken");
    markToolsReady();
    assert.equal(currentToolStatus(Date.now()).overall, "ready");
  } finally {
    setProbeForTest(null);
    resetToolProbesForTest();
  }
});

test("Try again (force) looks again at once, without waiting out the backoff", async () => {
  resetToolProbesForTest();
  let ytCalls = 0;
  setProbeForTest(async (_b, arg) => (arg === "--version" && ytCalls++ === 0 ? { path: "/x", ok: false } : { path: "/x", ok: true, version: "1" }));
  try {
    const t0 = Date.now();
    currentToolStatus(t0);
    await settle();
    assert.equal(currentToolStatus(t0 + 1).overall, "broken"); // inside the backoff: not looked at again
    currentToolStatus(t0 + 2, true); // Try again
    await settle();
    assert.equal(currentToolStatus(t0 + 3).overall, "ready");
  } finally {
    setProbeForTest(null);
    resetToolProbesForTest();
  }
});

import { jsRuntimeProblem } from "./toolStatus";

test("jsRuntimeProblem: a probe that found deno missing or broken is a problem, one that ran is not", async () => {
  for (const [probe, want] of [[{ path: null }, true], [{ path: "/x", ok: false }, true], [{ path: "/x", ok: true, version: "deno 2" }, false]] as const) {
    resetToolProbesForTest();
    setProbeForTest(async (_b, arg) => (arg === "--version" ? (probe as Probe) : { path: "/y", ok: true, version: "x" }));
    currentToolStatus(Date.now());
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(jsRuntimeProblem(), want, JSON.stringify(probe));
  }
  setProbeForTest(null);
  resetToolProbesForTest();
});

// ---- Mac first run: a slow first answer is "still checking", not "could not start" ----------------

import { MAX_PROBE_TIMEOUTS, refreshToolProbe, reportOf } from "./toolStatus";

test("a probe that timed out is checking, not broken; a plain failure is still broken", () => {
  assert.equal(reportOf({ path: "/x", ok: false, timedOut: true }).state, "checking");
  assert.equal(reportOf({ path: "/x", ok: false }).state, "broken");
});

test("probeBinary reports a killed-by-timeout run as timedOut, and any other failure as plain", async () => {
  const run = (err: Error) => (_f: string, _a: string[], _o: object, cb: (e: Error | null, s: string) => void) => cb(err, "");
  const slow = Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" });
  assert.deepEqual(await probeBinary(process.execPath, "--version", run(slow)), { path: process.execPath, ok: false, timedOut: true });
  assert.deepEqual(await probeBinary(process.execPath, "--version", run(new Error("x"))), { path: process.execPath, ok: false });
});

test("Liam on a Mac: a slow first run shows checking, then ready once the second run answers; the screen is never 'broken'", async () => {
  resetToolProbesForTest();
  let calls = 0;
  setProbeForTest(async (_b, arg) => {
    calls += 1;
    const slowFirst = arg === "--version" && calls <= 3;
    return slowFirst ? { path: "/x", ok: false, timedOut: true } : { path: "/x", ok: true, version: "v1" };
  });
  try {
    const seen = new Set<string>();
    let now = Date.now();
    for (let i = 0; i < 6; i += 1) {
      seen.add(currentToolStatus(now).overall);
      await new Promise((r) => setTimeout(r, 10));
      now += REPROBE_BACKOFF_MS + 1;
    }
    assert.ok(seen.has("checking"));
    assert.ok(!seen.has("broken"), [...seen].join());
    assert.equal(currentToolStatus(now).overall, "ready");
  } finally {
    setProbeForTest(null);
    resetToolProbesForTest();
  }
});

test("a tool that keeps timing out is reported broken after all, and a good answer survives one slow re-check", async () => {
  resetToolProbesForTest();
  setProbeForTest(async () => ({ path: "/x", ok: false, timedOut: true }));
  try {
    let now = Date.now();
    let last = "";
    for (let i = 0; i < MAX_PROBE_TIMEOUTS + 2; i += 1) {
      last = currentToolStatus(now).overall;
      await new Promise((r) => setTimeout(r, 10));
      now += REPROBE_BACKOFF_MS + 1;
    }
    assert.equal(currentToolStatus(now).overall, "broken", last);
  } finally {
    setProbeForTest(null);
    resetToolProbesForTest();
  }
  // After a good answer, a slow re-check (a fresh yt-dlp after the quiet update) keeps it.
  resetToolProbesForTest();
  let n = 0;
  setProbeForTest(async () => (++n <= 3 ? { path: "/x", ok: true, version: "v1" } : { path: "/x", ok: false, timedOut: true }));
  try {
    currentToolStatus(Date.now());
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(currentToolStatus(Date.now()).overall, "ready");
    refreshToolProbe();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(currentToolStatus(Date.now()).tools.ytdlp.state, "ready");
  } finally {
    setProbeForTest(null);
    resetToolProbesForTest();
  }
});
