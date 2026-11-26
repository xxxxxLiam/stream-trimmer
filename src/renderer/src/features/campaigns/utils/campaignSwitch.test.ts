import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { campaignSwitchOf, switchLine, switchTitle } from "./campaignSwitch";

const tabs = [
  { id: "a", campaignId: "acme" },
  { id: "b", campaignId: "acme" },
  { id: "c", campaignId: "nova" },
  { id: "d" },
];
const known = (c: string) => c === "acme" || c === "nova";

test("opening a video from another campaign asks; the same campaign, the same video or an unknown one does not", () => {
  assert.deepEqual(campaignSwitchOf(tabs, "a", "c", known), { from: "acme", to: "nova" });
  assert.equal(campaignSwitchOf(tabs, "a", "b", known), null);
  assert.equal(campaignSwitchOf(tabs, "a", "a", known), null);
  assert.equal(campaignSwitchOf(tabs, "a", "d", known), null);
  assert.equal(campaignSwitchOf(tabs, "a", "c", (c) => c === "acme"), null);
});

test("the words are the board's, with the real names", () => {
  assert.equal(switchTitle("Nova"), "Switch to Nova?");
  assert.equal(switchLine("Q3 town hall", "Nova", "Acme"), "Q3 town hall is in Nova. Opening it changes your active campaign from Acme to Nova.");
});

test("Board 03.2.54: 420px, 24px padding, Cancel outline then Open in (Ice), never red; the question stops after one Open or the tick", () => {
  const dlg = readFileSync("src/renderer/src/features/campaigns/components/CampaignSwitchDialog.tsx", "utf8");
  assert.match(dlg, /w-\[420px\][\s\S]*p-\[24px\]/);
  assert.match(dlg, /variant="secondary"[\s\S]*Cancel[\s\S]*variant="primary"[\s\S]*Open in \{to\}/);
  assert.match(dlg, /Don&rsquo;t show this again/);
  assert.doesNotMatch(dlg, /error/);
  const host = readFileSync("src/renderer/src/features/campaigns/components/CampaignSwitchHost.tsx", "utf8");
  assert.match(host, /readSetting<boolean>\(SWITCH_SEEN_KEY, false\)\) return false/);
  assert.match(host, /writeSetting\(SWITCH_SEEN_KEY, true\);\s*ws\.selectTabNow/);
  assert.match(readFileSync("src/renderer/src/features/workspace/hooks/WorkspaceContext.tsx", "utf8"), /if \(selectGuard\.current\?\.\(id\)\) return;\s*setActiveId\(id\)/);
  assert.match(readFileSync("src/main/features/settings/services/settingsKeys.ts", "utf8"), /clipper\.campaignSwitchSeen/);
});
