/**
 * File: CampaignMenu.test.ts
 * Description: Item 9 (C-5) — the campaign form says "Another campaign already has that name."
 * when the name clashes with a different campaign, and not when you keep your own name.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { campaignFormProblems } from "./CampaignMenu";

const draft = { name: "Acme Q4", clipsDir: "/a/clips", dataDir: "/a/data", pattern: "{prefix}-{nn}" };
const list = [
  { id: "c1", name: "Acme Q4" },
  { id: "c2", name: "Other" },
];

test("a new campaign with a taken name (any case, padded) shows the message", () => {
  assert.deepEqual(campaignFormProblems(draft, list), ["Another campaign already has that name."]);
  assert.deepEqual(campaignFormProblems({ ...draft, name: "  acme q4 " }, list), ["Another campaign already has that name."]);
});

test("editing a campaign may keep its own name, but not take another's", () => {
  assert.deepEqual(campaignFormProblems(draft, list, "c1"), []);
  assert.deepEqual(campaignFormProblems({ ...draft, name: "Other" }, list, "c1"), ["Another campaign already has that name."]);
});

test("the form passes the other campaigns to the check", () => {
  const src = readFileSync(new URL("./CampaignMenu.tsx", import.meta.url), "utf8");
  assert.match(src, /campaignFormProblems\(d, campaigns, editing\?\.id\)/);
});
