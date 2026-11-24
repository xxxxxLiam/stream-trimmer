/**
 * File: useClipperController.test.ts
 * Path: src/renderer/src/modules/clipper/hooks/useClipperController.test.ts
 * Description: B-5 (a link with no video id is not a source) and B-6 (Cancel tells the engine).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import {
  DownloadCancelledError,
  isCancelledResponse,
  isQuietCancel,
  requestEngineCancel,
  videoUrlProblem,
} from "./useClipperController";

test("B-5: channel, playlist and handle links are refused with a reason; video links pass", () => {
  for (const u of [
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/channel/UC123",
    "https://example.com/",
  ]) {
    assert.match(videoUrlProblem(u) ?? "", /not a single video/, u);
  }
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/abc123",
    "",
  ]) {
    assert.equal(videoUrlProblem(u), null, u);
  }
});

test("B-6: Cancel posts the job id to the engine's cancel route", async () => {
  const calls: Array<[string, unknown]> = [];
  await requestEngineCancel("job_1", async (path, body) => {
    calls.push([path, body]);
  });
  assert.deepEqual(calls, [["/api/download/cancel", { jobId: "job_1" }]]);
});

test("B-6: an engine that refuses or is gone does not break Cancel", async () => {
  await assert.doesNotReject(
    requestEngineCancel("job_1", async () => {
      throw new Error("404");
    }),
  );
});


/** The clipper hook's source: the composing file plus the hooks it was split into. */
function clipperSource(): string {
  const dirs = [new URL("./", import.meta.url), new URL("../utils/", import.meta.url)];
  return dirs
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".ts") && !/\.test\./.test(f))
        .sort()
        .map((f) => readFileSync(new URL(f, dir), "utf8")),
    )
    .join("\n");
}

test("B-5/B-6 wiring: cancelDownload calls the engine, loadInfo and download refuse non-video links", () => {
  const src = clipperSource();
  const cancel = src.slice(src.indexOf("const cancelDownload"), src.indexOf("const cancelDownload") + 600);
  assert.match(cancel, /requestEngineCancel\(/);
  const load = src.slice(src.indexOf("const loadInfo"), src.indexOf("const loadInfo") + 400);
  assert.match(load, /videoUrlProblem\(url\)/);
  const dl = src.slice(src.indexOf("const download = useCallback"), src.indexOf("const download = useCallback") + 500);
  assert.match(dl, /videoUrlProblem\(url\)/);
});

test("item 12: a 499 cancelled answer is quiet, an ordinary failure is not", () => {
  const body = { error: "Cancelled", code: "cancelled", cancelled: true };
  assert.equal(isCancelledResponse(499, body), true);
  assert.equal(isCancelledResponse(499, undefined), true);
  assert.equal(isCancelledResponse(200, body), true, "the code alone is enough");
  assert.equal(isCancelledResponse(500, { code: "unknown" }), false);
  assert.equal(isCancelledResponse(500, {}), false);
  assert.equal(isCancelledResponse(502, null), false);
  assert.equal(isQuietCancel(new DownloadCancelledError()), true);
  assert.equal(isQuietCancel(new DOMException("x", "AbortError")), true);
  assert.equal(isQuietCancel(new Error("Download failed")), false);
});

test("item 12: the download handler routes a cancelled answer to the quiet path, before it can raise an error", () => {
  const src = clipperSource();
  const check = src.indexOf("if (isCancelledResponse(res.status, data)) throw new DownloadCancelledError();");
  const raise = src.indexOf("throw new DownloadFailureError(", check);
  assert.ok(check > 0 && check < raise, "cancel check must precede the failure throw");
  const quiet = src.indexOf("if (isQuietCancel(e)) {");
  assert.ok(quiet > 0);
  const branch = src.slice(quiet, src.indexOf("} else {", quiet));
  assert.match(branch, /setDownloadPhase\("idle"\)/);
  assert.doesNotMatch(branch, /setError|setFailure/);
});
