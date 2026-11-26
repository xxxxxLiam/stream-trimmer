/**
 * File: CampaignScope.test.ts
 * Path: src/renderer/src/features/campaigns/hooks/CampaignScope.test.ts
 * Description: Liam, 25 Nov: choosing a clips folder for a campaign in Settings did not stick. The tab scope's
 *   pickClipsDir ignored the campaign it was given and wrote to the tab's own campaign. A cancelled picker
 *   changes nothing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const campaign = (id: string, name: string, clipsDir: string) => ({ id, name, targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90, prefix: id, clipsDir, dataDir: "/v/data", usedRanges: {} });
const written: Record<string, any> = {};
let picked: string | null = "/chosen/beta";
(globalThis as any).window = {
  electronAPI: {
    settingsSnapshot: { "clipper.campaigns": [campaign("acme", "Acme", ""), campaign("beta", "Beta", "")], "clipper.activeCampaign": "acme", "clipper.clipsDir": "/Downloads/Clipr" },
    setSetting: async (k: string, v: unknown) => {
      written[k] = v;
    },
    pickDirectory: async () => picked,
  },
  addEventListener() {},
  removeEventListener() {},
};

test("Settings picks a folder for the campaign it is editing, not the tab's own; a cancelled picker changes nothing", async () => {
  const { CampaignProvider, CampaignTabScope, useCampaign } = await import("./CampaignContext");
  let ctx!: ReturnType<typeof useCampaign>;
  const Probe = () => {
    ctx = useCampaign();
    return null;
  };
  renderToString(createElement(CampaignProvider, null, createElement(CampaignTabScope, { campaignId: "acme", onChange: () => {}, children: createElement(Probe) })));
  assert.equal(ctx.activeId, "acme");

  for (const k of Object.keys(written)) delete written[k]; // what loading wrote is not the point
  picked = null;
  assert.equal(await ctx.pickClipsDir("beta"), null);
  assert.equal(written["clipper.campaigns"], undefined, "a cancelled picker writes nothing");

  picked = "/chosen/beta";
  assert.equal(await ctx.pickClipsDir("beta"), null);
  const saved = (written["clipper.campaigns"] as unknown) as { id: string; clipsDir: string }[];
  assert.equal(saved.find((c) => c.id === "beta")?.clipsDir, "/chosen/beta");
  assert.equal(saved.find((c) => c.id === "acme")?.clipsDir, "", "the tab's own campaign is untouched");
});

test("chooseClipsDir tells a cancelled dialog from a folder that was chosen, even when it is the same folder", async () => {
  const { CampaignProvider, CampaignTabScope, useCampaign } = await import("./CampaignContext");
  let ctx!: ReturnType<typeof useCampaign>;
  const Probe = () => {
    ctx = useCampaign();
    return null;
  };
  renderToString(createElement(CampaignProvider, null, createElement(CampaignTabScope, { campaignId: "acme", onChange: () => {}, children: createElement(Probe) })));
  picked = null;
  assert.deepEqual(await ctx.chooseClipsDir("beta"), { picked: false, problem: null });
  picked = "/chosen/beta";
  assert.deepEqual(await ctx.chooseClipsDir("beta"), { picked: true, problem: null });
  assert.deepEqual(await ctx.chooseClipsDir("beta"), { picked: true, problem: null }, "the same folder again is still a pick");
});
