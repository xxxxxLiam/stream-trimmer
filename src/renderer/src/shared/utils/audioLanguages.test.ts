/**
 * File: audioLanguages.test.ts
 * Description: The export sentence's language rules: no dubs means no choice, each ticked dub is
 *   its own clip, the original is ticked by default, and the labels shorten as languages grow.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  audioButtonLabel,
  hasDubTracks,
  makesText,
  nameForLanguage,
  planLanguages,
  shortenPath,
  ticked,
  toggleLanguage,
  type AudioTrackInfo,
} from "./audioLanguages";

const en: AudioTrackInfo = { language: "en", label: "English", kind: "original" };
const es: AudioTrackInfo = { language: "es", label: "Spanish", kind: "auto-dubbed" };
const pt: AudioTrackInfo = { language: "pt-BR", label: "Portuguese", kind: "creator-dub" };

test("a video with no dubs has no audio choice and makes one plain clip", () => {
  assert.equal(hasDubTracks([en]), false);
  assert.equal(hasDubTracks(undefined), false);
  assert.deepEqual(planLanguages([en], ["es"]), [{ language: undefined, suffix: "" }]);
  assert.equal(makesText(1), "Makes 1 clip");
});

test("the original is ticked by default; ticking ES makes two clips, the dub named with its tag", () => {
  assert.deepEqual(ticked([en, es], undefined).map((t) => t.language), ["en"]);
  const plan = planLanguages([en, es], ["es"]);
  assert.equal(plan.length, 2);
  assert.equal(makesText(plan.length), "Makes 2 clips");
  assert.equal(nameForLanguage("Honest Version", plan[0]), "Honest Version");
  assert.equal(nameForLanguage("Honest Version", plan[1]), "Honest Version ES");
  assert.deepEqual(plan[1], { language: "es", suffix: "ES" });
});

test("button label: Original, Original + ES, then a count past two", () => {
  assert.equal(audioButtonLabel([en, es, pt], undefined), "Original");
  assert.equal(audioButtonLabel([en, es, pt], ["es"]), "Original + ES");
  assert.equal(audioButtonLabel([en, es, pt], ["es", "pt-BR"]), "3 languages");
});

test("toggling ticks and unticks a language, and never leaves nothing to make", () => {
  let sel = toggleLanguage([en, es], undefined, "es");
  assert.deepEqual(planLanguages([en, es], sel).length, 2);
  sel = toggleLanguage([en, es], sel, "en"); // original off, ES stays
  assert.deepEqual(planLanguages([en, es], sel), [{ language: "es", suffix: "ES" }]);
  const back = toggleLanguage([en, es], sel, "es"); // last dub off: the original comes back
  assert.deepEqual(back, []);
  assert.deepEqual(planLanguages([en, es], back), [{ language: undefined, suffix: "" }]);
});

test("a folder is shortened from the left, without the home folder in front", () => {
  assert.equal(shortenPath("/Users/liam/Clips/Acme"), "Clips/Acme");
  assert.equal(shortenPath("/home/liam"), "~");
  const long = shortenPath("/Volumes/Big Drive/Campaigns/2026/Acme/Clips/Podcasts", 24);
  assert.equal(long.length, 24);
  assert.ok(long.startsWith("…"));
  assert.ok(long.endsWith("Clips/Podcasts"));
});

test("audioLanesOf gives one lane per ticked language and drops a lane when it is unticked", async () => {
  const { audioLanesOf } = await import("./audioLanguages");
  const tracks = [
    { language: "en", label: "English", kind: "original" as const },
    { language: "es", label: "Spanish", kind: "auto-dubbed" as const },
  ];
  assert.deepEqual(audioLanesOf(tracks, ["es"]), [
    { language: "en", name: "Original" },
    { language: "es", name: "Spanish dub" },
  ]);
  assert.deepEqual(audioLanesOf(tracks, []), [{ language: "en", name: "Original" }]);
  assert.deepEqual(audioLanesOf([tracks[0]], []), []);
});
