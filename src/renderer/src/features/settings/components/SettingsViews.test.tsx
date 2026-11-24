/**
 * File: SettingsViews.test.tsx
 * Description: The four Settings views as drawn: rows, switches, the campaign form's fields (no clip
 *   id, no format or quality), Final Cut fields only while ticked, two-step delete, Back targets and
 *   the App wiring that mounts the drawer and the "<Campaign> settings" row.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsCampaign, { type SettingsCampaignProps } from "./SettingsCampaign";
import SettingsCampaigns from "./SettingsCampaigns";
import SettingsFolder from "./SettingsFolder";
import SettingsTopList from "./SettingsTopList";
import { parentOf } from "../hooks/useSettingsController";

const noop = () => {};
const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src", f), "utf8");

test("top list: Your work rows, two switches, nothing about editor, quality or crashes", () => {
  const h = renderToStaticMarkup(
    <SettingsTopList campaignNames="Acme, Nova" clipsFolderLabel="Downloads/Clipr" app={{ notifyQueueDone: true, autoUpdate: false }} onPatchApp={noop} onOpenCampaigns={noop} onOpenFolder={noop} onClose={noop} />,
  );
  assert.match(h, /aria-label="Campaigns: Acme, Nova"/);
  assert.match(h, /aria-label="Clips folder: Downloads\/Clipr"/);
  assert.match(h, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Tell me when the queue finishes"/);
  assert.match(h, /aria-checked="false"[^>]*aria-label="Update automatically"/);
  assert.match(h, /aria-label="Close Settings"/);
  assert.doesNotMatch(h, /Editor|Quality|crash/i);
});

test("campaigns list: summary lines, Edit per campaign, Add campaign", () => {
  const h = renderToStaticMarkup(
    <SettingsCampaigns rows={[{ id: "a", name: "Acme", summary: "3 clips a day · 1s extra at both ends", languages: "Languages: Original, Spanish" }, { id: "n", name: "Nova", summary: "2 clips a day · 1s extra at both ends", languages: null }]} onEdit={noop} onAdd={noop} onBack={noop} onClose={noop} />,
  );
  assert.match(h, /Languages: Original, Spanish/);
  assert.match(h, /aria-label="Edit Nova"/);
  assert.match(h, /aria-label="Add campaign"/);
  assert.match(h, /aria-label="Back to Settings"/);
});

const campaign: SettingsCampaignProps = {
  name: "Acme",
  prefs: { extraSeconds: 1, languages: ["original", "es"] },
  dubs: [{ code: "es", label: "Spanish" }, { code: "pt", label: "Portuguese" }],
  quota: 3,
  onQuota: noop,
  folderLabel: "Clipr/Acme",
  finalCut: null,
  onPatch: noop,
  onToggleLanguage: noop,
  onOpenFolder: noop,
  confirmingDelete: false,
  onDelete: noop,
  onBack: noop,
  onClose: noop,
};

test("one campaign: quota, extra seconds, languages, folder; no id pattern, format or quality", () => {
  const h = renderToStaticMarkup(<SettingsCampaign {...campaign} />);
  assert.match(h, /Clips a day/);
  assert.match(h, /aria-label="One more clip a day"/);
  assert.match(h, /aria-checked="true"[^>]*aria-label="1 seconds"/);
  assert.match(h, /aria-label="Spanish audio, ticked"/);
  assert.match(h, /aria-label="Portuguese audio, not ticked"/);
  assert.match(h, /aria-label="Open the Acme folder"/);
  assert.match(h, /aria-label="Back to Campaigns"/);
  assert.doesNotMatch(h, /Final Cut/);
  assert.doesNotMatch(h, /pattern|prefix|Quality|Format|short code/i);
});

test("Languages show only when the open video has dubs", () => {
  assert.doesNotMatch(renderToStaticMarkup(<SettingsCampaign {...campaign} dubs={[]} />), /Languages/);
});

test("Final Cut library and event appear only when Final Cut is ticked", () => {
  const h = renderToStaticMarkup(<SettingsCampaign {...campaign} finalCut={{ library: "Acme.fcpbundle", event: "Acme", onChoose: noop, onEvent: noop }} />);
  assert.match(h, /role="group" aria-label="Final Cut Pro"/);
  assert.match(h, /value="Acme\.fcpbundle"/);
  assert.match(h, /aria-label="Choose the Final Cut library for Acme"/);
});

test("delete takes two clicks", () => {
  assert.match(renderToStaticMarkup(<SettingsCampaign {...campaign} />), />Delete campaign</);
  assert.match(renderToStaticMarkup(<SettingsCampaign {...campaign} confirmingDelete />), />Click again to delete Acme</);
});

test("clips folder view and Back targets", () => {
  const h = renderToStaticMarkup(<SettingsFolder label="Downloads/Clipr" problem="" onChange={noop} onBack={noop} onClose={noop} />);
  assert.match(h, /aria-label="Change the clips folder"/);
  assert.deepEqual(parentOf({ kind: "campaign", id: "a" }), { label: "Campaigns", view: { kind: "campaigns" } });
  assert.deepEqual(parentOf({ kind: "folder" })?.label, "Settings");
  assert.equal(parentOf({ kind: "top" }), null);
});

test("App mounts the drawer, the gear toggles it and the campaign menu opens it on a campaign", () => {
  const app = read("routes/App.tsx");
  assert.match(app, /<SettingsDrawer/);
  assert.match(app, /const openCampaignSettings = \(campaignId: string\) => \{\s*setSettingsStartAt\(campaignId\)/);
  assert.match(app, /<CampaignMenu onOpenSettings=\{openCampaignSettings\} \/>/);
  assert.match(app, /onToggleSettings=\{\(\) => \{\s*setSettingsStartAt\(null\)/);
});
