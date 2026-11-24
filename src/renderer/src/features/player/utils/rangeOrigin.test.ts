/**
 * File: rangeOrigin.test.ts
 * Path: src/renderer/src/features/player/utils/rangeOrigin.test.ts
 * Description: A hand-marked range never re-frames the timeline; one that arrives from elsewhere does.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { arrivedFromElsewhere, markByHand } from "./rangeOrigin";

test("a range marked by hand is not one that arrived from elsewhere, for a moment", () => {
  assert.equal(arrivedFromElsewhere(10_000), true);
  markByHand(10_000);
  assert.equal(arrivedFromElsewhere(10_500), false);
  assert.equal(arrivedFromElsewhere(12_000), true);
});
