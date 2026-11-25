import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/renderer/src/routes/App.tsx", "utf8");

test("C-1: the Clip button names the file from the lane's name, never from the campaign pattern", () => {
  assert.match(app, /clipNameFor\(\{ candidates: \[getNextClipName\(\)\]/);
  assert.doesNotMatch(app, /nextClipId\(/);
});

test("C-3: marked sections are padded by the fixed 5 seconds, and the recorded ranges are the marked ones", () => {
  assert.match(app, /padSections\(segments, CLIP_PADDING_SEC, duration/);
  assert.doesNotMatch(app, /extraSecondsFor/);
  assert.match(app, /download\(\{ segments: toCut,/);
  assert.match(app, /recordUse\(videoId, segments, groupId, cutCampaignId\)/);
});

test("C-14: a Clip range that is a waiting moment marks it cut", () => {
  assert.match(app, /matchingMoment\(clipsFor\(bankStore\.get\(\), cutCampaignId, videoId\), segments\)/);
  assert.match(app, /bankStore\.markCut\(cutCampaignId, videoId, moment\.id\)/);
});

test("C-5: a clip's language copies share its id in History", () => {
  assert.match(app, /clipId: groupId \?\? clipId/);
  assert.match(app, /afterSaved\(fileName, undefined, segments, startSettings, undefined, groupId\)/);
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

test("C2-4: a Clip-button clip that is a waiting moment is recorded, grouped and so undone under the moment's id", () => {
  assert.match(app, /const groupId = moment\?\.id \?\? name/);
  assert.match(app, /recordUse\(videoId, segments, groupId, cutCampaignId\)/);
  assert.match(app, /afterSaved\(fileName, undefined, segments, startSettings, undefined, groupId\)/);
});

test("C2-1 / F2-2 / C2-10: Add a moment and Ctrl B bank the just-marked range (else the sections) under a suggested name", () => {
  assert.match(app, /clipSections\(tabSegments, range\)/);
  assert.match(app, /pickedRangeOf\(\{ startText, endText/);
  assert.match(app, /label,\s*segments: sections/);
  assert.match(app, /k === "b" && !e\.shiftKey/);
  assert.match(app, /^    addMoment,$/m);
});

test("C2-8: both cut paths set the making name and the making moment as they start and clear them when they end", () => {
  assert.equal((app.match(/setMakingClipId\(null\)/g) ?? []).length, 2);
  assert.match(app, /setMakingClipId\(clip\.id\)/);
});

test("C2-6: Change folder changes the folder the cut used (the campaign's) and then re-runs the cut", () => {
  const mut = readFileSync("src/renderer/src/features/clips/hooks/useExportMutations.ts", "utf8");
  assert.match(mut, /if \(campaignId\) await pickClipsDir\(campaignId\)/);
  assert.match(mut, /latest\.current\.where !== before\) latest\.current\.retry\(\)/);
  const eff = readFileSync("src/renderer/src/features/clips/hooks/useExportEffects.ts", "utf8");
  assert.match(eff, /kind: classified !== "stopped" \? classified : \(fromRow\?\.kind \?\? classified\)/);
});

test("Free space: the check runs before anything is fetched, only for a clear measured shortfall, and never dims Clip", () => {
  const dl = readFileSync("src/renderer/src/modules/clipper/hooks/useClipDownloadMutations.ts", "utf8");
  const check = dl.indexOf("window.electronAPI.checkFreeSpace({");
  const request = dl.indexOf("new EventSource(");
  assert.ok(check > 0 && check < request, "the check comes before the progress stream and the request");
  assert.match(dl, /const room = roomProblem\(answer\);\s*\n\s*if \(room\) \{/);
  assert.match(dl, /\/\* no answer: the clip goes ahead \*\//);
  const clip = readFileSync("src/renderer/src/features/player/utils/clipDestination.ts", "utf8");
  assert.doesNotMatch(clip, /freeMb|checkFreeSpace/);
});

test("the folder check runs before the free-space check and the request, and Clip is never dimmed by it", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../modules/clipper/hooks/useClipDownloadMutations.ts", import.meta.url), "utf8");
  const folder = src.indexOf("checkFolder");
  assert.ok(folder > 0 && folder < src.indexOf("checkFreeSpace") && folder < src.indexOf("new EventSource("));
});

test("C4-1: the pre-check answers stop the clip before the engine, outside the progress-channel guard that would swallow them", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../modules/clipper/hooks/useClipDownloadMutations.ts", import.meta.url), "utf8");
  const guard = src.indexOf("let es: EventSource | null = null;");
  assert.ok(src.indexOf("window.electronAPI.checkFolder") < guard && src.indexOf("window.electronAPI.checkFreeSpace") < guard, "the checks run before the guarded block");
  const swallow = src.indexOf("EventSource unavailable");
  const rethrow = src.indexOf("if (refusal) throw refusal; // the pre-check");
  assert.ok(swallow > 0 && rethrow > swallow, "the refusal is thrown after the guard, into the catch that fills the clip's row");
  assert.ok(src.indexOf("fetch(\n        apiUrl(`/api/download?") > rethrow, "and before the engine is asked");
});

test("C4-3: a failed Clip-button cut kept in Waiting keeps its name", async () => {
  const fs = await import("node:fs");
  const eff = fs.readFileSync(new URL("../features/clips/hooks/useExportEffects.ts", import.meta.url), "utf8");
  assert.match(eff, /clipNameFor\(\{ candidates: \[f\.name\]/);
  assert.match(eff, /importClips\(q\.campaignId, q\.vid, \[\{ line: 1, id: null, label, segments: f\.segments \}\]\)/);
});
