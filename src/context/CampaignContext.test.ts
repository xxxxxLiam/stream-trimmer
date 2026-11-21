/**
 * File: CampaignContext.test.ts
 * Path: src/context/CampaignContext.test.ts
 * Description: Drives the real CampaignProvider against a settings.json in the shape older
 *   versions wrote (campaign ids that are slugs of the name). Pins that removing a campaign
 *   disposes of its bank, that a campaign created afterwards under the same name starts
 *   empty, and that nothing in the existing file is stranded.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

// Settings exactly as a pre-fix install holds them.
const settings: Record<string, unknown> = {
  "clipper.campaigns": [
    {
      id: "acme-q4",
      name: "Acme Q4",
      targetMinSec: 30,
      targetMaxSec: 60,
      hardMaxSec: 90,
      clipIdPattern: "{prefix}-{videoId}-{nn}",
      prefix: "AQ",
      format: "mp4",
      quality: "best",
      clipsDir: "/v/clips",
      dataDir: "/v/data",
      usedRanges: { vid1: [{ start: 1, end: 2, clipId: "AQ-vid1-01" }] },
    },
    { id: "beta", name: "Beta", targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90, usedRanges: {} },
  ],
  "clipper.activeCampaign": "acme-q4",
  "clipper.bank": {
    "acme-q4": { vid1: [{ id: "A01", label: "hook", segments: [{ start: 60, end: 90 }], status: "banked", category: "hook", tier: "T1" }] },
    beta: { vid1: [{ id: "B01", label: "x", segments: [{ start: 5, end: 9 }], status: "banked" }] },
  },
};
const written: Record<string, unknown> = {};
(globalThis as any).window = {
  electronAPI: {
    settingsSnapshot: JSON.parse(JSON.stringify(settings)),
    setSetting: async (k: string, v: unknown) => {
      written[k] = v;
    },
  },
  addEventListener() {},
  removeEventListener() {},
};

test("removing a campaign deletes its bank; same-name recreation starts empty; nothing else is stranded", async () => {
  const { CampaignProvider, useCampaign } = await import("./CampaignContext");
  const { bankStore, clipsFor } = await import("../lib/bank");

  // Today's file loads intact: both campaigns, both banks, active campaign kept.
  let ctx!: ReturnType<typeof useCampaign>;
  const Probe = () => {
    ctx = useCampaign();
    return null;
  };
  renderToString(createElement(CampaignProvider, null, createElement(Probe)));
  assert.deepEqual(ctx.campaigns.map((c) => c.id), ["acme-q4", "beta"]);
  assert.equal(ctx.activeId, "acme-q4");
  assert.equal(ctx.campaigns[0].usedRanges.vid1.length, 1);
  assert.equal(clipsFor(bankStore.get(), "acme-q4", "vid1").length, 1);
  assert.equal(clipsFor(bankStore.get(), "beta", "vid1").length, 1);

  ctx.remove("acme-q4");
  assert.equal("acme-q4" in bankStore.get(), false, "removed campaign's bank is gone");
  assert.equal("acme-q4" in (written["clipper.bank"] as object), false, "and gone from settings.json");
  assert.equal(clipsFor(bankStore.get(), "beta", "vid1").length, 1, "other campaigns untouched");

  const again = ctx.create({ name: "Acme Q4", clipsDir: "/v/clips" });
  assert.notEqual(again.id, "acme-q4", "identity is not a function of the name");
  assert.equal(clipsFor(bankStore.get(), again.id, "vid1").length, 0, "new campaign starts empty");
  assert.deepEqual(bankStore.get().beta.vid1.map((c) => c.id), ["B01"]);
});
