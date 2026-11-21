/**
 * File: ClipsColumn.test.ts
 * Path: src/components/ClipsColumn.test.ts
 * Description: C-1 guard. The column must paint the bank plan through its own tab's store
 *   (`seg.setBanked`), never the module-level `setBankedRanges`, which writes to whichever tab
 *   is active and ping-pongs between two tabs (React error #185). A source check, because
 *   the repo has no DOM renderer; the behaviour itself was exercised in the real app.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ClipsColumn.tsx"), "utf8");

test("ClipsColumn writes the planned ranges through the per-tab setter", () => {
  assert.doesNotMatch(src, /\bsetBankedRanges\b/);
  assert.match(src, /seg\.setBanked\(planned\)/);
});
