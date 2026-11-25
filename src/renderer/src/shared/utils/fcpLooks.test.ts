/**
 * File: fcpLooks.test.ts
 * Path: src/renderer/src/shared/utils/fcpLooks.test.ts
 * Description: Saved Final Cut looks: stored once, a campaign keeps only an id, delete is refused while in use,
 *   and the old single pasted look moves into the list without anyone losing it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseLook } from "../../../../common/utils/fcpLook";
import { sampleExport } from "../../../../common/utils/fcpLook.fixture";
import { createCampaign, normalizeCampaigns } from "./campaigns";
import {
  addSavedLook,
  deleteSavedLook,
  lookForCampaign,
  lookNameFromFile,
  migratePastedLook,
  normalizeSavedLooks,
} from "./fcpLooks";

const look = parseLook(sampleExport());
let n = 0;
const ids = () => `l-${++n}`;
const campaigns = () => createCampaign(createCampaign([], { name: "Acme" }).campaigns, { name: "Beta" }).campaigns;

test("the name comes from the file name, and a repeat is made different", () => {
  assert.equal(lookNameFromFile("Acme grade.fcpxmld"), "Acme grade");
  assert.equal(lookNameFromFile("grade.TXT"), "grade");
  assert.equal(lookNameFromFile(".xml"), "My look");
  const first = addSavedLook([], { fileName: "Acme grade.fcpxml", look }, 5, ids);
  assert.deepEqual({ name: first.saved.name, addedAt: first.saved.addedAt }, { name: "Acme grade", addedAt: 5 });
  assert.equal(addSavedLook(first.looks, { fileName: "acme grade.fcpxml", look }, 6, ids).saved.name, "acme grade 2");
});

test("a look is stored once and a campaign keeps only its id", () => {
  const { looks, saved } = addSavedLook([], { fileName: "A.fcpxml", look }, 1, ids);
  const [a, b] = campaigns().map((c) => ({ ...c, fcpLookId: saved.id }));
  assert.equal(lookForCampaign(a, looks), look);
  assert.equal(lookForCampaign(b, looks), look);
  assert.equal(JSON.stringify(a).includes(look.clip), false, "the campaign does not hold a copy of the look");
  assert.equal(lookForCampaign({ fcpLookId: undefined }, looks), undefined);
  assert.equal(lookForCampaign({ fcpLookId: "gone" }, looks), undefined);
  assert.equal(lookForCampaign(undefined, looks), undefined);
});

test("delete is refused while a campaign uses the look and names those campaigns", () => {
  const { looks, saved } = addSavedLook([], { fileName: "A.fcpxml", look }, 1, ids);
  const used = campaigns().map((c, i) => (i === 0 ? { ...c, fcpLookId: saved.id } : c));
  assert.deepEqual(deleteSavedLook(looks, used, saved.id), { ok: false, usedBy: ["Acme"] });
  const free = used.map((c) => ({ ...c, fcpLookId: undefined }));
  assert.deepEqual(deleteSavedLook(looks, free, saved.id), { ok: true, looks: [] });
});

test("migration: the pasted look becomes 'My look' and every campaign that had it on points to it", () => {
  const out = migratePastedLook(campaigns(), [], { applyLook: true, lookXml: sampleExport() }, 9, ids);
  assert.equal(out.migrated, true);
  assert.equal(out.looks.length, 1);
  assert.equal(out.looks[0].name, "My look");
  assert.ok(out.campaigns.every((c) => c.fcpLookId === out.looks[0].id));
});

test("migration with the switch off still keeps the look, and points no campaign at it", () => {
  const out = migratePastedLook(campaigns(), [], { applyLook: false, lookXml: sampleExport() }, 9, ids);
  assert.equal(out.looks[0].name, "My look");
  assert.ok(out.campaigns.every((c) => c.fcpLookId === undefined));
});

test("migration never overrides a campaign's own pick, and nothing pasted is a quiet no-op", () => {
  const base = campaigns().map((c, i) => (i === 0 ? { ...c, fcpLookId: "mine" } : c));
  const out = migratePastedLook(base, [], { applyLook: true, lookXml: sampleExport() }, 9, ids);
  assert.equal(out.campaigns[0].fcpLookId, "mine");
  assert.equal(out.campaigns[1].fcpLookId, out.looks[0].id);
  assert.deepEqual(migratePastedLook(base, [], {}), { campaigns: base, looks: [], migrated: true });
});

test("a pasted look that no longer parses is not lost: nothing is marked migrated", () => {
  const out = migratePastedLook(campaigns(), [], { applyLook: true, lookXml: "garbage" });
  assert.equal(out.migrated, false);
  assert.equal(out.looks.length, 0);
});

test("a new campaign starts with the last look used", () => {
  const base = campaigns().map((c, i) => (i === 0 ? { ...c, fcpLookId: "l-x" } : c));
  assert.equal(createCampaign(base, { name: "Gamma" }).campaign.fcpLookId, "l-x");
  assert.equal(createCampaign([], { name: "First" }).campaign.fcpLookId, undefined);
});

test("the list and a campaign's look id survive the settings round trip; a malformed look is dropped", () => {
  const { looks } = addSavedLook([], { fileName: "A.fcpxml", look }, 1, ids);
  assert.deepEqual(normalizeSavedLooks(JSON.parse(JSON.stringify(looks))), looks);
  const broken = JSON.parse(JSON.stringify(looks));
  broken[0].look.effects = "nope";
  assert.deepEqual(normalizeSavedLooks(broken), []);
  const withId = campaigns().map((c) => ({ ...c, fcpLookId: "l-1" }));
  assert.equal(normalizeCampaigns(JSON.parse(JSON.stringify(withId)))[0].fcpLookId, "l-1");
});
