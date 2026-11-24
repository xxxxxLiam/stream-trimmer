import assert from "node:assert/strict";
import test from "node:test";
import { finishBankedCut } from "./finishBankedCut";

test("CD2-2: a banked cut records its used range against the campaign it started in", () => {
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
