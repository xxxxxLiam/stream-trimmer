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
