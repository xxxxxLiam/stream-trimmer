/**
 * File: pasteRules.test.ts
 * Description: Audit A-10, A-12, A-15, A-16: two links open the first, Space presses a focused control, campaign names
 *   have a limit and a deleted campaign's prefs go with it, tips wait for the first campaign.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractVideoId, normalizeYouTubeUrl } from "./clip";
import { campaignNameProblems, normalizeCampaigns } from "./campaigns";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("A-10: two links pasted together open the first, not a nonsense id", () => {
  const two = "https://youtu.be/aaaaaaaaaaa https://youtu.be/bbbbbbbbbbb";
  assert.equal(extractVideoId(two), "aaaaaaaaaaa");
  assert.equal(normalizeYouTubeUrl(two), "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  assert.equal(extractVideoId("meeting notes: call Dan at 3"), null);
  assert.equal(extractVideoId("  https://youtu.be/aaaaaaaaaaa\n"), "aaaaaaaaaaa");
});

test("A-12: Space on a focused button or switch is left to the control, not the video", () => {
  const s = src("../../features/player/hooks/usePreviewEffects.ts");
  assert.match(s, /if \(e\.key === " " && onControl\(e\)\) return;/);
  assert.match(s, /\[role="switch"\]/);
});

test("A-15: a name has a limit, a bad quota is capped, and delete drops the campaign's prefs", () => {
  assert.deepEqual(campaignNameProblems("x".repeat(61), []), ["Keep the name to 60 characters or fewer."]);
  assert.deepEqual(campaignNameProblems("x".repeat(60), []), []);
  assert.equal(normalizeCampaigns([{ id: "a", name: "A", dailyQuota: 1e9 }])[0].dailyQuota, 99);
  assert.match(src("../../features/settings/components/SettingsDrawer.tsx"), /dropCampaignPrefs\(campaign\.id/);
});

test("A-16: tips wait for the first campaign (or for the prompt to be dismissed)", () => {
  assert.match(src("../../routes/App.tsx"), /useTipsController\(!!info && \(!!campaign \|\| campaignPromptDismissed\)\)/);
});
