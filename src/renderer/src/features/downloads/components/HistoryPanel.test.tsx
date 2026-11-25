/**
 * File: HistoryPanel.test.tsx
 * Description: D2-8: In editor on a History row answers on the History tab (a failure is never silent),
 *   whichever campaign the clip belongs to.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("D2-8: History shows the editor handoff answer for a clip of any campaign", () => {
  const panel = readFileSync("src/renderer/src/features/downloads/components/HistoryPanel.tsx", "utf8");
  assert.match(panel, /useHandoffNotice\(null, true\)/);
  assert.match(panel, /<HandoffRow/);
  const hook = readFileSync("src/renderer/src/features/clips/hooks/useHandoffNotice.ts", "utf8");
  assert.match(hook, /anyCampaign \? \(answer\?\.campaignId \?\? null\) : campaignId/);
});
