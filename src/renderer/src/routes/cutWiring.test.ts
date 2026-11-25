import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/renderer/src/routes/App.tsx", "utf8");

test("C-1: the Clip button names the file from the lane's name, never from the campaign pattern", () => {
  assert.match(app, /clipNameFor\(\{ candidates: \[getNextClipName\(\)\]/);
  assert.doesNotMatch(app, /nextClipId\(/);
});

test("C-3: marked sections are padded by the campaign's extra seconds, and the recorded ranges are the marked ones", () => {
  assert.match(app, /padSections\(segments, extraSecondsFor\(cutCampaignId\)/);
  assert.match(app, /download\(\{ segments: toCut,/);
  assert.match(app, /recordUse\(videoId, segments, name, cutCampaignId\)/);
});

test("C-14: a Clip range that is a waiting moment marks it cut", () => {
  assert.match(app, /matchingMoment\(clipsFor\(bankStore\.get\(\), cutCampaignId, videoId\), segments\)/);
  assert.match(app, /bankStore\.markCut\(cutCampaignId, videoId, moment\.id\)/);
});

test("C-5: a clip's language copies share its id in History", () => {
  assert.match(app, /clipId: groupId \?\? clipId/);
  assert.match(app, /afterSaved\(fileName, undefined, segments, startSettings, undefined, name\)/);
});
