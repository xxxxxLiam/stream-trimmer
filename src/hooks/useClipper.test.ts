/**
 * File: useClipper.test.ts
 * Path: src/hooks/useClipper.test.ts
 * Description: B-5 (a link with no video id is not a source) and B-6 (Cancel tells the engine).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { requestEngineCancel, videoUrlProblem } from "./useClipper";

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

import { readFileSync } from "node:fs";

test("B-5/B-6 wiring: cancelDownload calls the engine, loadInfo and download refuse non-video links", () => {
  const src = readFileSync(new URL("./useClipper.ts", import.meta.url), "utf8");
  const cancel = src.slice(src.indexOf("const cancelDownload"), src.indexOf("const cancelDownload") + 600);
  assert.match(cancel, /requestEngineCancel\(/);
  const load = src.slice(src.indexOf("const loadInfo"), src.indexOf("const loadInfo") + 400);
  assert.match(load, /videoUrlProblem\(url\)/);
  const dl = src.slice(src.indexOf("const download = useCallback"), src.indexOf("const download = useCallback") + 500);
  assert.match(dl, /videoUrlProblem\(url\)/);
});
