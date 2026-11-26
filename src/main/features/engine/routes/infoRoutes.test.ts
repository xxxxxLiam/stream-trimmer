/**
 * File: infoRoutes.test.ts
 * Path: src/main/features/engine/routes/infoRoutes.test.ts
 * Description: /api/transcript retries once when YouTube's caption endpoint refuses the request
 *   (HTTP 429 — a warning, exit code 0, same as real yt-dlp), and gives up plainly once the retry
 *   is spent too.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startHarness, type Harness } from "../testSupport/exportHarness";

async function transcript(harness: Harness) {
  const res = await fetch(`${harness.baseUrl}/api/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=lf000001" }),
  });
  return { status: res.status, body: await res.json() };
}

function startWithSubtitleFailures(failTimes: number): Promise<Harness> {
  const counterDir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-fail-counter-"));
  return startHarness({
    env: {
      FAKE_SUBTITLE_FAIL_TIMES: String(failTimes),
      FAKE_SUBTITLE_FAIL_COUNTER: path.join(counterDir, "count"),
    },
  });
}

test("a refused caption fetch (HTTP 429) is retried once and succeeds", async (t) => {
  const harness = await startWithSubtitleFailures(1);
  t.after(() => harness.stop());

  const { status, body } = await transcript(harness);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.available, true);
  assert.ok(body.lines.length > 0);
  assert.match(harness.log(), /\/api\/transcript refused, retrying once/);
});

test("a caption fetch refused on every attempt still fails plainly, not silently retried forever", async (t) => {
  const harness = await startWithSubtitleFailures(2);
  t.after(() => harness.stop());

  const { status, body } = await transcript(harness);
  assert.equal(status, 200); // the route answers 200 with failed:true, same as any other transcript failure
  assert.equal(body.available, false);
  assert.equal(body.failed, true);
  assert.equal(body.kind, "refused");
  // Retried exactly once — a second refusal is final, not a loop.
  assert.equal((harness.log().match(/\/api\/transcript refused, retrying once/g) ?? []).length, 1);
});

test("a permanent failure (private video) is not mistaken for a refusal, and is not retried", async (t) => {
  const counterDir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-fail-counter-"));
  const harness = await startHarness({
    env: {
      FAKE_SUBTITLE_FAIL_TIMES: "1",
      FAKE_SUBTITLE_FAIL_COUNTER: path.join(counterDir, "count"),
      FAKE_SUBTITLE_FAIL_MESSAGE: "Video unavailable. This video is private",
    },
  });
  t.after(() => harness.stop());

  const { status, body } = await transcript(harness);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.available, false);
  assert.equal(body.failed, true);
  assert.equal(body.kind, "private");
  assert.doesNotMatch(harness.log(), /retrying once/);
});
