/**
 * File: auditA2.test.ts
 * Description: Audit run 2, area A — a quick first clip waits for the launch sign-in check (A2-2), the top bar says
 *   "Done for today" at quota (A2-3), two names that make one folder are refused (A2-4), the new-campaign form
 *   keeps focus in its first field (A2-7), a double-click does not delete (A2-5), the Saved toast goes by itself and
 *   clears the footer (A2-8).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { campaignNameProblems, createCampaign, todayCount, type Campaign } from "./campaigns";
import { isSignedOut } from "./youtubeConnection";

const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src", f), "utf8");

test("A2-2: nothing still looking for a session is never called signed out", () => {
  assert.equal(isSignedOut({ connected: false, restoring: false }), true, "the plain case is unchanged");
  assert.equal(isSignedOut({ connected: false, restoring: false, busy: true }), false, "a sweep is running");
  assert.equal(isSignedOut({ connected: false, restoring: false, launching: true }), false, "the launch check has not ended");
  assert.equal(isSignedOut({ connected: false, restoring: false, busy: false, launching: false }), true);
  assert.equal(isSignedOut({ connected: true, restoring: false, launching: false }), false);
});

test("A2-2: a clip waits for the check, then asks for the quality the result allows; the launch check always ends", () => {
  const m = read("modules/clipper/hooks/useClipDownloadMutations.ts");
  assert.match(m, /await whenSignInSettled\(\);\s*const quality = requestedQuality\(\{ signedOut: isSignedOut\(connectionNow\(\)\)/);
  assert.match(read("routes/App.tsx"), /\}\)\.finally\(endLaunchCheck\)/);
});

test("A2-3: the top bar reads Done for today at quota, never '3 of 2 today'", () => {
  const c = createCampaign([], { name: "Acme", dailyQuota: 2 }).campaign;
  const at = (n: number): Campaign => ({ ...c, usedRanges: { v: Array.from({ length: n }, (_, i) => ({ start: i * 10, end: i * 10 + 5, clipId: `c${i}`, at: Date.now() })) } as never });
  assert.equal(todayCount(at(1)), "1 of 2 today");
  assert.equal(todayCount(at(2)), "Done for today");
  assert.equal(todayCount(at(3)), "Done for today");
});

test("V18-F-2: clips cut from one video share its title as their id but still count one each", () => {
  const c = createCampaign([], { name: "Acme", dailyQuota: 2 }).campaign;
  const t = Date.now();
  const made: Campaign = { ...c, usedRanges: { v: [{ start: 0, end: 5, clipId: "Podcast", at: t }, { start: 10, end: 15, clipId: "Podcast", at: t + 5000 }] } };
  assert.equal(todayCount(made), "Done for today");
  const joined: Campaign = { ...c, usedRanges: { v: [{ start: 0, end: 5, clipId: "Podcast", at: t }, { start: 10, end: 15, clipId: "Podcast", at: t }] } };
  assert.equal(todayCount(joined), "1 of 2 today", "the ranges of one joined clip still count once");
});

test("A2-4: A/B and A:B share a folder, so the second is refused with a plain sentence", () => {
  const first = [{ id: "1", name: "A/B" }];
  const found = campaignNameProblems("A:B", first);
  assert.equal(found.length, 1);
  assert.match(found[0], /saves to a folder with that name/);
  assert.deepEqual(campaignNameProblems("A B", first), []);
  assert.deepEqual(campaignNameProblems("A/B", first, "1"), [], "renaming a campaign to its own folder name is fine");
});

test("A2-7: the dialog leaves focus in the field that asked for it", () => {
  assert.match(read("shared/components/CentredDialog.tsx"), /!panelRef\.current\?\.contains\(document\.activeElement\)\) panelRef\.current\?\.focus\(\)/);
  assert.match(read("features/campaigns/components/CampaignForm.tsx"), /id="ui-campaign-name"[^>]*autoFocus/);
});

test("A2-5: a second click right after arming Delete does not delete", () => {
  const d = read("features/settings/components/SettingsDrawer.tsx");
  assert.match(d, /DELETE_GUARD_MS = 400/);
  assert.match(d, /if \(Date\.now\(\) - armedAt\.current < DELETE_GUARD_MS\) return;/);
});

test("A2-8: the Saved toast dismisses itself and sits above the footer", () => {
  const a = read("routes/App.tsx");
  assert.match(a, /window\.setTimeout\(dismissSavedNotice, SAVED_TOAST_MS\)/);
  assert.match(a, /fixed bottom-\[88px\] left-1\/2 z-50/);
});
