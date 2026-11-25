/**
 * File: persist.test.ts
 * Description: E-4. A stored value of the wrong type (a number, object, true or list where a folder path goes)
 *   must fall back to that key's default and never throw, so one bad value cannot crash every launch.
 */
import assert from "node:assert/strict";
import test from "node:test";

const snapshot: Record<string, unknown> = {
  "clipper.clipsDir": 42,
  "clipper.dataDir": { a: 1 },
  "clipper.saveDir": true,
  "clipper.flag": "yes",
  "clipper.n": "7",
  "clipper.ok": "/Users/me/Clips",
  "clipper.list": ["a"],
};
(globalThis as unknown as { window: unknown }).window = { electronAPI: { settingsSnapshot: snapshot, setSetting: () => Promise.resolve() } };

test("E-4: a wrong-typed value gives the default for that key and leaves the others alone", async () => {
  const { readSetting } = await import("./persist");
  assert.equal(readSetting<string>("clipper.clipsDir", ""), "");
  assert.equal(readSetting<string>("clipper.dataDir", ""), "");
  assert.equal(readSetting<string>("clipper.saveDir", ""), "");
  assert.equal(readSetting<boolean>("clipper.flag", true), true);
  assert.equal(readSetting<number>("clipper.n", 3), 3);
  assert.equal(readSetting<string>("clipper.ok", ""), "/Users/me/Clips");
  assert.deepEqual(readSetting<unknown>("clipper.list", []), ["a"]);
});

test("E-4: the folders read at launch are strings whatever was stored", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../features/campaigns/hooks/CampaignContext.tsx", import.meta.url), "utf8");
  assert.match(src, /readSetting<string>\(KEY_CLIPS, ""\)/);
});
