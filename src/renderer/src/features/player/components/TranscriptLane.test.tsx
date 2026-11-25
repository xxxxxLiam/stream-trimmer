/**
 * File: TranscriptLane.test.tsx
 * Description: The Transcript lane says "Getting the transcript…" (dim, no spinner) while the transcript
 *   is on its way, and not once it has arrived.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineController } from "../hooks/useTimelineController";
import TranscriptLane from "./TranscriptLane";

const stub = (over: Partial<TimelineController>) =>
  ({ opening: false, lines: null, axis: { pieces: [] }, sections: [], transcriptLoading: false, ...over }) as unknown as TimelineController;

test("while the transcript is on its way the lane says so, dim and without a spinner", () => {
  const h = renderToStaticMarkup(<TranscriptLane c={stub({ transcriptLoading: true })} />);
  assert.match(h, /Getting the transcript…/);
  assert.match(h, /text-fg-dim/);
  assert.doesNotMatch(h, /animate-spin|<svg/);
});

test("once it has arrived the line is gone", () => {
  assert.doesNotMatch(renderToStaticMarkup(<TranscriptLane c={stub({})} />), /Getting the transcript/);
});
