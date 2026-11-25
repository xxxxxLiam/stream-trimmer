/**
 * File: useAudioLanes.test.ts
 * Description: The Audio lanes can be hidden from the Panels menu, as the Transcript lane can.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAudioLanesShown, setAudioLanesShown } from "./useAudioLanes";

test("the audio lanes show by default and the choice flips both ways", () => {
  assert.equal(getAudioLanesShown(), true);
  setAudioLanesShown(false);
  assert.equal(getAudioLanesShown(), false);
  setAudioLanesShown(true);
  assert.equal(getAudioLanesShown(), true);
});

test("the Panels menu lists Audio lanes under Timeline and the timeline hides them when off", () => {
  const menu = readFileSync(new URL("../../../modules/layout/components/PanelsMenu.tsx", import.meta.url), "utf8");
  const timeline = readFileSync(new URL("../components/Timeline.tsx", import.meta.url), "utf8");
  assert.match(menu, /label: "Audio lanes", checked: audioShown/);
  assert.match(menu, /setAudioLanesShown\(!audioShown\)/);
  assert.ok(menu.indexOf('"Audio lanes"') > menu.indexOf('"h-timeline"') && menu.indexOf('"Audio lanes"') < menu.indexOf('"sep-layout"'));
  assert.match(timeline, /\{audioLanes \? <AudioLanes c=\{c\} \/> : null\}/);
});
