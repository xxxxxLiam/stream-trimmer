/**
 * File: settingsPrefs.test.ts
 * Description: Defaults, repair of bad stored values, the quota stepper limits, the language rule and
 *   the summary lines the Campaigns list shows.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignSummary,
  languagesLine,
  normalizeAppPrefs,
  normalizeCampaignPrefs,
  stepClipsPerDay,
  toggleLanguage,
} from "./settingsPrefs";

test("nothing stored gives the drawn defaults", () => {
  assert.deepEqual(normalizeAppPrefs(undefined), { notifyQueueDone: true, autoUpdate: true });
  assert.deepEqual(normalizeCampaignPrefs(null), { extraSeconds: 1, languages: ["original"] });
});

test("bad stored values are repaired, good ones kept", () => {
  assert.equal(normalizeAppPrefs({ autoUpdate: false }).autoUpdate, false);
  assert.equal(normalizeAppPrefs({ autoUpdate: "no" }).autoUpdate, true);
  const p = normalizeCampaignPrefs({ extraSeconds: 7, languages: ["es", "es", 4] });
  assert.equal(p.extraSeconds, 1);
  assert.deepEqual(p.languages, ["original", "es"]);
  assert.equal(normalizeCampaignPrefs({ extraSeconds: 2 }).extraSeconds, 2);
});

test("clips a day never goes below 1 or above 99", () => {
  assert.equal(stepClipsPerDay(1, -1), 1);
  assert.equal(stepClipsPerDay(3, 1), 4);
  assert.equal(stepClipsPerDay(99, 1), 99);
});

test("a dub can be ticked and unticked, the original cannot be unticked", () => {
  assert.deepEqual(toggleLanguage(["original"], "es"), ["original", "es"]);
  assert.deepEqual(toggleLanguage(["original", "es"], "es"), ["original"]);
  assert.deepEqual(toggleLanguage(["original", "es"], "original"), ["original", "es"]);
});

test("summary lines match the Campaigns list", () => {
  const acme = { extraSeconds: 1 as const, languages: ["original", "es"] };
  assert.equal(campaignSummary(3, acme), "3 clips a day · 1s extra at both ends");
  assert.equal(campaignSummary(1, acme), "1 clip a day · 1s extra at both ends");
  assert.equal(languagesLine(acme), "Languages: Original, Spanish");
  assert.equal(languagesLine({ ...acme, languages: ["original"] }), null);
});
