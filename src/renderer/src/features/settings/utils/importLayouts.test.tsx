/**
 * File: importLayouts.test.ts
 * Description: The Layout row: four templates, each previewed as a tree with the campaign's real names; the
 *   choice is stored on the campaign, defaults to A, and a new campaign starts with the last one used.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import FinalCutLayout from "../components/FinalCutLayout";
import { DEFAULT_IMPORT_LAYOUT } from "../../../../../common/types/importLayout";
import { createCampaign, normalizeCampaigns } from "../../../shared/utils/campaigns";
import { FINAL_CUT_LAYOUTS, layoutTree } from "./importLayouts";

const names = { library: "Acme", event: "Export", videos: ["Podcast #214", "Morning routine"], clip: "ACM-x-01", day: "25 Nov 2026" };
const shape = (id: Parameters<typeof layoutTree>[0]) => layoutTree(id, names).map((l) => `${l.depth}:${l.note}:${l.label}`);

test("A: one Export event, a keyword collection per video, each with its project and raw clip", () => {
  assert.deepEqual(shape("export-event"), [
    "0:library:Acme", "1:event:Export",
    "2:keyword collection:Podcast #214", "3:project:ACM-x-01", "3:raw clip:ACM-x-01.mp4",
    "2:keyword collection:Morning routine", "3:project:ACM-x-01", "3:raw clip:ACM-x-01.mp4",
  ]);
});

test("B: an event per video; C: one event a day with a collection per video; D: one flat event", () => {
  assert.deepEqual(shape("event-per-video").filter((l) => l.includes(":event:")), ["1:event:Podcast #214", "1:event:Morning routine"]);
  const c = shape("event-per-day");
  assert.equal(c[1], "1:event:25 Nov 2026");
  assert.equal(c.filter((l) => l.includes("keyword collection")).length, 2);
  assert.deepEqual(shape("flat"), ["0:library:Acme", "1:event:Export", "2:project:ACM-x-01", "2:raw clip:ACM-x-01.mp4"]);
  assert.equal(layoutTree("export-event", { ...names, videos: [] })[2].label, "Your first video");
});

test("the row lists four templates with a line each, marks the chosen one and shows the preview", () => {
  const h = renderToStaticMarkup(
    <FinalCutLayout options={FINAL_CUT_LAYOUTS} current="event-per-video" open onToggleOpen={() => {}} onPick={() => {}} tree={layoutTree("event-per-video", names)} />,
  );
  assert.equal(FINAL_CUT_LAYOUTS.length, 4);
  assert.match(h, /aria-selected="true"[^>]*>(?:<span[^>]*>✓<\/span>)<span[^>]*><span[^>]*>Event per video/);
  assert.match(h, /One event, no folders/);
  assert.match(h, /How it looks in Final Cut/);
  assert.match(h, /Morning routine/);
});

test("the layout is stored on the campaign, defaults to A, and a bad value is dropped", () => {
  const made = createCampaign([], { name: "Acme", fcpLayout: "event-per-day" }).campaign;
  assert.equal(normalizeCampaigns(JSON.parse(JSON.stringify([made])))[0].fcpLayout, "event-per-day");
  const bad = normalizeCampaigns([{ ...made, fcpLayout: "nonsense" }])[0];
  assert.equal(bad.fcpLayout, undefined);
  assert.equal(DEFAULT_IMPORT_LAYOUT, "export-event");
});

test("wiring: a new campaign starts with the last layout; picking one remembers it; Event shows only for A and D", () => {
  const dir = new URL("../../", import.meta.url).pathname;
  assert.match(readFileSync(`${dir}campaigns/hooks/CampaignContext.tsx`, "utf8"), /fcpLayout: input\.fcpLayout \?\? loadLastLayout\(\)/);
  assert.match(readFileSync(`${dir}settings/hooks/useFinalCutLayout.ts`, "utf8"), /rememberLastLayout\(id\)/);
  assert.match(readFileSync(`${dir}settings/components/SettingsDrawer.tsx`, "utf8"), /showEvent:/);
  assert.match(readFileSync(`${dir}settings/components/SettingsCampaign.tsx`, "utf8"), /showEvent !== false/);
});
