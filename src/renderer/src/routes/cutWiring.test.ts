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

test("D2-7: Make this clip names the Final Cut clip after the file, not \"B01 - name\", so two videos' B01 moments never share a document", () => {
  assert.match(app, /afterSaved\(nameForLanguage\(baseId, plan\), undefined, clip\.segments, startSettings, projectName, clip\.id\)/);
  assert.doesNotMatch(app, /afterSaved\(nameForLanguage\(clip\.id, plan\), clip\.label/);
});

test("C2-2 / C2-3: every Clip-button cut records its range before it starts, and Retry re-cuts that range without clearing the marks", () => {
  assert.match(app, /setCutAttempt\(\{ name, segments \}\);\s*\n\s*setMakingName\(name\)|setCutAttempt\(\{ name, segments \}\)/);
  assert.match(app, /cutAgain: \(segs, name\) => void cutQueue\.current\.enqueue\(\(\) => cutClip\(segs, name\)\)/);
  const mut = readFileSync("src/renderer/src/features/clips/hooks/useExportMutations.ts", "utf8");
  assert.match(mut, /cutAgain\(f\.segments, f\.name\)/);
  assert.doesNotMatch(mut, /cutSegments\(f\.segments\)/);
  const eff = readFileSync("src/renderer/src/features/clips/hooks/useExportEffects.ts", "utf8");
  assert.match(eff, /getCutAttempt\(\) \?\? s\.attempt\.current/);
});
