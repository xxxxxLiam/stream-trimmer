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

test("C-14: a Clip range that is a waiting moment's range finds that moment; other ranges and cut moments do not", async () => {
  const { matchingMoment } = await import("./finishBankedCut");
  const waiting = { id: "b1", status: "banked", segments: [{ start: 4324, end: 4366 }] };
  const cut = { id: "b2", status: "cut", segments: [{ start: 100, end: 140 }] };
  assert.equal(matchingMoment([waiting, cut], [{ start: 4324.2, end: 4365.9 }])?.id, "b1");
  assert.equal(matchingMoment([waiting, cut], [{ start: 100, end: 140 }]), undefined, "already cut");
  assert.equal(matchingMoment([waiting], [{ start: 4324, end: 4400 }]), undefined, "a different range");
  assert.equal(matchingMoment([waiting], [{ start: 4324, end: 4366 }, { start: 5000, end: 5010 }]), undefined, "joined with more");
});

test("Liam 26 Nov: a made clip leaves the bank only after the cut succeeded; Undo brings it back, a failure leaves it", async () => {
  const { readFileSync } = await import("node:fs");
  const mut = readFileSync("src/renderer/src/features/clips/hooks/useExportMutations.ts", "utf8");
  assert.match(mut, /if \(ok\) \{\s*finishBankedCut\(/, "only a successful cut marks it made");
  assert.match(mut, /bankStore\.restoreCut\(c, v, id\)/, "Undo restores the moment");
  const app = readFileSync("src/renderer/src/routes/App.tsx", "utf8");
  assert.match(app, /if \(!ok\) break;[\s\S]{0,200}bankStore\.markCut/, "the Clip button path also marks only after success");
});
