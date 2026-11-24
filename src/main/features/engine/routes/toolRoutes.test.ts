/**
 * File: toolRoutes.test.ts
 * Path: src/main/features/engine/routes/toolRoutes.test.ts
 * Description: Drives the real server: /api/tools answers with the three tools and an overall state,
 *   and settles from "checking" to a final answer once the background probe lands.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { startHarness } from "../testSupport/exportHarness";

test("GET /api/tools reports the three tools and settles out of checking", async (t) => {
  const harness = await startHarness();
  t.after(() => harness.stop());
  let body: any;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${harness.baseUrl}/api/tools`);
    assert.equal(res.status, 200);
    body = await res.json();
    if (body.overall !== "checking") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(Object.keys(body.tools).sort(), ["deno", "ffmpeg", "ytdlp"]);
  assert.notEqual(body.overall, "checking");
  assert.ok(["ready", "broken"].includes(body.overall));
});
