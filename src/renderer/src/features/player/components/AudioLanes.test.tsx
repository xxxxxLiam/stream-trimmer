/**
 * File: AudioLanes.test.tsx
 * Path: src/renderer/src/features/player/components/AudioLanes.test.tsx
 * Description: Each ticked language is its own Audio lane with its tag and name; none, none drawn.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineController } from "../hooks/useTimelineController";
import AudioLanes from "./AudioLanes";

const base = {
  opening: false,
  duration: 100,
  axis: { pieces: [{ t0: 0, t1: 100, x0: 0, x1: 500 }] },
  sections: [{ start: 10, end: 20 }],
} as unknown as TimelineController;

test("one lane per ticked language, with tag and name", () => {
  const h = renderToStaticMarkup(
    <AudioLanes c={{ ...base, audioLanes: [{ language: "en", name: "Original" }, { language: "es", name: "Spanish dub" }] } as TimelineController} />,
  );
  assert.equal(h.match(/data-audio-lane=/g)?.length, 2);
  assert.match(h, />ES</);
  assert.match(h, /Spanish dub/);
});

test("no lanes when nothing is ticked", () => {
  assert.equal(renderToStaticMarkup(<AudioLanes c={{ ...base, audioLanes: [] } as TimelineController} />), "");
});
