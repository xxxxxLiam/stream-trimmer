/**
 * File: editorSetup.test.ts
 * Description: The editor's setup opens when it is not set up for the campaign, and not again once set up or skipped.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { editorStartAt, editorStartCampaign, markSeen, needsEditorSetup } from "./editorSetup";

test("Final Cut opens its setup until a library is set, for this campaign only", () => {
  assert.equal(needsEditorSetup("finalcut", { campaignId: "a", fcpLibrary: "", seen: {} }), true);
  assert.equal(needsEditorSetup("finalcut", { campaignId: "a", fcpLibrary: "/Movies/Clips.fcpbundle", seen: {} }), false);
});

test("Skip for now is remembered per campaign and editor", () => {
  const seen = markSeen({}, "a", "finalcut");
  assert.equal(needsEditorSetup("finalcut", { campaignId: "a", fcpLibrary: "", seen }), false);
  assert.equal(needsEditorSetup("finalcut", { campaignId: "b", fcpLibrary: "", seen }), true);
  assert.equal(needsEditorSetup("resolve", { campaignId: "a", seen }), true);
});

test("Premiere and Resolve show their page once; CapCut, folder and no campaign never open it", () => {
  assert.equal(needsEditorSetup("premiere", { campaignId: "a", seen: {} }), true);
  assert.equal(needsEditorSetup("premiere", { campaignId: "a", seen: markSeen({}, "a", "premiere") }), false);
  assert.equal(needsEditorSetup("capcut", { campaignId: "a", seen: {} }), false);
  assert.equal(needsEditorSetup("folder", { campaignId: "a", seen: {} }), false);
  assert.equal(needsEditorSetup("finalcut", { campaignId: null, seen: {} }), false);
});

test("the start-at value round-trips a campaign id and ignores other values", () => {
  assert.equal(editorStartCampaign(editorStartAt("acme")), "acme");
  assert.equal(editorStartCampaign("acme"), null);
  assert.equal(editorStartCampaign(null), null);
});
