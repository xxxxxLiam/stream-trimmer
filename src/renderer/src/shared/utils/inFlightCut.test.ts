import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readInFlightCut } from "./inFlightCut";

test("E4-1: only a well-formed interrupted cut is taken back", () => {
  const ok = readInFlightCut({ campaignId: "acme", videoId: "v", name: "Hot Take", segments: [{ start: 10, end: 40 }, { start: 5, end: 5 }, { start: "x", end: 9 }] });
  assert.deepEqual(ok, { campaignId: "acme", videoId: "v", name: "Hot Take", segments: [{ start: 10, end: 40 }] });
  assert.equal(readInFlightCut(null), null);
  assert.equal(readInFlightCut({ campaignId: "a", videoId: "v", name: "n", segments: [] }), null);
  assert.equal(readInFlightCut({ campaignId: 1, videoId: "v", name: "n", segments: [{ start: 1, end: 2 }] }), null);
});

test("E4-1: a Clip-button cut is saved while it runs, cleared when it ends, and handed back as a waiting moment at launch", () => {
  const app = readFileSync(new URL("../../routes/App.tsx", import.meta.url), "utf8");
  assert.match(app, /if \(cutCampaignId && !moment\) saveInFlightCut\(/);
  assert.match(app, /finally \{\s*clearInFlightCut\(\);/);
  assert.match(app, /takeInterruptedCut\(\)[\s\S]{0,200}bankStore\.importClips\(cut\.campaignId/);
  assert.match(readFileSync(new URL("../../../../main/features/settings/services/settingsKeys.ts", import.meta.url), "utf8"), /"clipper\.cutInFlight"/);
});

test("E4-2: Stop works while the clip waits for the launch sign-in check", () => {
  const src = readFileSync(new URL("../../modules/clipper/hooks/useClipDownloadMutations.ts", import.meta.url), "utf8");
  const made = src.indexOf("const controller = new AbortController();");
  const wait = src.indexOf("whenSignInSettled(),");
  assert.ok(made > 0 && made < wait, "the abort handle exists before the wait");
  assert.match(src, /controller\.signal\.addEventListener\("abort"/);
  assert.match(src, /if \(controller\.signal\.aborted\) \{[\s\S]{0,400}return false;/);
});
