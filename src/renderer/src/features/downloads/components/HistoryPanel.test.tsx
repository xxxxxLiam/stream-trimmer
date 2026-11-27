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

test("Add to Final Cut (Design, option A): an item in the row's ⋯ on location clips, Select clips with one Ice bar, In Final Cut for 2 seconds", async () => {
  const panel = readFileSync("src/renderer/src/features/downloads/components/HistoryPanel.tsx", "utf8");
  assert.match(panel, /key: "finalcut", label: "Add to Final Cut"/);
  assert.match(panel, /fc\.canAdd\(e\)/);
  assert.match(panel, /bg-ice text-bg[\s\S]*Add to Final Cut \{chosen\.length \|\| ""\}/);
  assert.match(panel, /In Final Cut/);
  assert.doesNotMatch(panel, /aria-label="Add to Final Cut"/); // no always-visible row button
  const group = readFileSync("src/renderer/src/modules/layout/components/PanelGroup.tsx", "utf8");
  assert.match(group, /activeDef\?\.id === "history" && finalCut[\s\S]*label: "Select clips"/);
  const hook = readFileSync("src/renderer/src/features/downloads/hooks/useAddToFinalCut.ts", "utf8");
  assert.match(hook, /c\.kind === "location"/);
  assert.match(readFileSync("src/renderer/src/shared/hooks/useFinalCutInstalled.ts", "utf8"), /apps\?\.finalcut/);
});

test("History, Videos and Export all remove by holding", async () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("./HistoryPanel.tsx"), /Hold to remove from history[^}]*hold: true/);
  assert.match(read("../../workspace/components/VideosPanel.tsx"), /Hold to remove video[^}]*hold: true/);
  assert.match(read("../../clips/components/WaitingRow.tsx"), /Hold to remove[^}]*hold: true/);
  assert.doesNotMatch(read("../../clips/components/ExportPanel.tsx"), /c\.made/);
});
