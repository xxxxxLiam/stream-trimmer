/**
 * File: ClipsColumn.test.ts
 * Path: src/renderer/src/features/clips/components/ClipsColumn.test.ts
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

test("CD2-2: a banked cut records its used range against the campaign it started in", async () => {
  const { finishBankedCut } = await import("./ClipsColumn");
  // A stand-in for CampaignContext.recordUse: no campaign id means "whoever is active now".
  const activeNow = "client-b";
  const used: Record<string, string[]> = { "client-a": [], "client-b": [] };
  const recordUse = (_v: string, _r: unknown, clipId: string, campaignId?: string) => {
    used[campaignId ?? activeNow].push(clipId);
  };
  const marked: string[] = [];
  const markCut = (campaignId: string, _v: string, clipId: string) => {
    marked.push(`${campaignId}:${clipId}`);
    return { ranges: [{ start: 2, end: 8 }] };
  };
  // The cut started under Client A; the user switched to Client B while it downloaded.
  finishBankedCut({ campaignId: "client-a", videoId: "vid", clipId: "A01", markCut, recordUse });
  assert.deepEqual(marked, ["client-a:A01"]);
  assert.deepEqual(used, { "client-a": ["A01"], "client-b": [] });
  // A row that vanished from the bank records nothing.
  finishBankedCut({ campaignId: "client-a", videoId: "vid", clipId: "gone", markCut: () => null, recordUse });
  assert.deepEqual(used["client-a"], ["A01"]);
});
