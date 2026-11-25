/**
 * File: cutMarked.test.ts
 * Path: src/renderer/src/routes/cutMarked.test.ts
 * Description: Clip and + section stay live while a clip is making: pressing Clip queues the cut with its
 *   own copy of the sections and clears the marks at once; the segment list is no longer locked
 *   during a download (read from source: App is too large to mount here).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const ws = readFileSync(new URL("../features/workspace/hooks/WorkspaceContext.tsx", import.meta.url), "utf8");

test("pressing Clip queues the cut and clears the marks at once, not when the file is saved", () => {
  const m = app.match(/const cutMarked = \(segs: Segment\[\]\) => \{([\s\S]*?)\n  \};/);
  assert.ok(m, "cutMarked exists");
  assert.match(m[1], /cutQueue\.current\.enqueue\(\(\) => cutClip\(segs\)\)/);
  assert.match(m[1], /clearSegments\(\)/);
  assert.match(app, /cutSegments: cutMarked/);
});

test("a banked moment made while a clip is making joins the same line", () => {
  assert.match(app, /cutQueue\.current\.enqueue\(\(\) => cutBankedNow\(/);
});

test("the sections are not locked while a clip is downloading", () => {
  assert.doesNotMatch(ws, /store\.setLocked\(downloading\)/);
});

test("Clip is not dimmed by a clip being made", () => {
  const ctl = readFileSync(new URL("../features/player/hooks/useClipController.ts", import.meta.url), "utf8");
  const rule = readFileSync(new URL("../features/player/utils/clipDestination.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ctl, /downloading/);
  assert.doesNotMatch(rule, /busy/);
});
