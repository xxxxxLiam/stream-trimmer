/**
 * File: CampaignForm.test.tsx
 * Description: Campaign form A (A-4): the new-campaign form asks for Name, Clips a day and Folder and
 *   nothing from the old form; a clashing name is refused; the old inline form is gone from the campaign menu.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { campaignNameProblems } from "../../../shared/utils/campaigns";

const list = [
  { id: "c1", name: "Acme Q4" },
  { id: "c2", name: "Other" },
];
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("a taken name (any case, padded) shows the message; editing may keep its own name", () => {
  assert.deepEqual(campaignNameProblems("Acme Q4", list), ["Another campaign already has that name."]);
  assert.deepEqual(campaignNameProblems("  acme q4 ", list), ["Another campaign already has that name."]);
  assert.deepEqual(campaignNameProblems("Acme Q4", list, "c1"), []);
  assert.deepEqual(campaignNameProblems("  ", list), ["Give the campaign a name."]);
});

test("A-4: the form is Name, Clips a day and Folder, with none of the old fields", () => {
  const form = src("./CampaignForm.tsx");
  for (const word of ["Name", "Clips a day", "Folder"]) assert.match(form, new RegExp(word));
  assert.doesNotMatch(form, /Extra seconds|extraSeconds/, "the padding is a fixed 5 seconds");
  assert.doesNotMatch(form, /Aim for at least|Never longer than|MP3|Research folder|Data folder|Format|prefix|pattern/i);
  assert.match(form, /dailyQuota: quota/);
});

test("A-4: the old wizard and the campaign menu's inline form are deleted", () => {
  assert.throws(() => src("./CampaignWizard.tsx"));
  const menu = src("./CampaignMenu.tsx");
  assert.doesNotMatch(menu, /Aim for at least|Never longer than|MP3|Data folder|toDraft/);
  assert.match(menu, /CampaignForm/);
});
