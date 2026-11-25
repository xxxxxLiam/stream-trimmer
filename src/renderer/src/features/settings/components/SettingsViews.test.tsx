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
import SettingsEditor from "./SettingsEditor";
import { editorSummary, finalCutSummary, hasEditorPage } from "../utils/editorSummary";
import SettingsCampaigns from "./SettingsCampaigns";
import SettingsTopList from "./SettingsTopList";
import { parentOf } from "../hooks/useSettingsController";

const noop = () => {};
const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src", f), "utf8");

test("top list: Your work rows, two switches, nothing about editor, quality or crashes", () => {
  const h = renderToStaticMarkup(
    <SettingsTopList campaignNames="Acme, Nova" clipsFolderLabel="Downloads/Clipr" app={{ notifyQueueDone: true }} autoUpdate={false} onAutoUpdate={noop} onPatchApp={noop} onOpenCampaigns={noop} onChangeFolder={noop} onClose={noop} />,
  );
  assert.match(h, /aria-label="Campaigns: Acme, Nova"/);
  // Liam, 25 Nov: a page with one control is not a page; the Change button sits flat on the row.
  assert.match(h, /Downloads\/Clipr/);
  assert.match(h, /aria-label="Change the clips folder"/);
  assert.doesNotMatch(h, /aria-label="Clips folder: /);
  assert.match(h, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Tell me when the queue finishes"/);
  assert.match(h, /aria-checked="false"[^>]*aria-label="Update automatically"/);
  assert.match(h, /aria-label="Close Settings"/);
  assert.doesNotMatch(h, /Editor|Quality|crash/i);
});

test("campaigns list: summary lines, Edit per campaign, Add campaign", () => {
  const h = renderToStaticMarkup(
    <SettingsCampaigns rows={[{ id: "a", name: "Acme", summary: "3 clips a day", languages: "Languages: Original, Spanish" }, { id: "n", name: "Nova", summary: "2 clips a day", languages: null }]} onEdit={noop} onAdd={noop} onBack={noop} onClose={noop} />,
  );
  assert.match(h, /Languages: Original, Spanish/);
  assert.match(h, /aria-label="Edit Nova"/);
  assert.match(h, /aria-label="Add campaign"/);
  assert.match(h, /aria-label="Back to Settings"/);
});

const campaign: SettingsCampaignProps = {
  name: "Acme",
  prefs: { languages: ["original", "es"] },
  dubs: [{ code: "es", label: "Spanish" }, { code: "pt", label: "Portuguese" }],
  quota: 3,
  onQuota: noop,
  folderLabel: "Clipr/Acme",
  lengthRule: {},
  onLengthRule: noop,
  editor: null,
  onPatch: noop,
  onToggleLanguage: noop,
  onOpenFolder: noop,
  onChangeFolder: async () => null,
  onRename: () => [],
  confirmingDelete: false,
  onDelete: noop,
  onBack: noop,
  onClose: noop,
};

test("one campaign: quota, languages, folder; no id pattern, format or quality", () => {
  const h = renderToStaticMarkup(<SettingsCampaign {...campaign} />);
  assert.match(h, /Clips a day/);
  assert.match(h, /aria-label="One more clip a day"/);
  // Liam, 25 Nov: the padding is a fixed 5 seconds, so there is no choice to show.
  assert.doesNotMatch(h, /Extra seconds|aria-label="\d seconds"/);
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

test("the campaign form ends with one button for the ticked editor, and no editor fields", () => {
  const h = renderToStaticMarkup(<SettingsCampaign {...campaign} editor={{ label: "Final Cut Pro", summary: "Acme.fcpbundle · Export · One Export event · Acme grade", onOpen: noop }} />);
  assert.match(h, /aria-label="Final Cut Pro settings for Acme"/);
  assert.match(h, />Final Cut Pro</);
  assert.match(h, /Acme\.fcpbundle · Export · One Export event · Acme grade/);
  assert.doesNotMatch(h, /fcp-lib|fcp-event/);
  assert.doesNotMatch(renderToStaticMarkup(<SettingsCampaign {...campaign} />), /settings for Acme/);
});

test("the editor page: Final Cut holds Library, Event, Layout and Your look under \u2039 Acme", () => {
  const h = renderToStaticMarkup(
    <SettingsEditor campaignName="Acme" label="Final Cut Pro" finalCut={{ library: "Acme.fcpbundle", event: "Acme", onChoose: noop, onEvent: noop }} onBack={noop} onClose={noop} />,
  );
  assert.match(h, /aria-label="Back to Acme"/);
  assert.match(h, />Final Cut Pro</);
  assert.match(h, /value="Acme\.fcpbundle"/);
  assert.match(h, /aria-label="Choose the Final Cut library for Acme"/);
  const other = renderToStaticMarkup(<SettingsEditor campaignName="Acme" label="DaVinci Resolve" finalCut={null} onBack={noop} onClose={noop} />);
  assert.match(other, /Nothing to set for DaVinci Resolve yet/);
  assert.doesNotMatch(other, /fcp-lib/);
});

test("which editors get a button, and the summary line", () => {
  assert.deepEqual(["folder", "premiere", "finalcut", "resolve", "capcut"].map(hasEditorPage), [false, true, true, true, false]);
  assert.equal(finalCutSummary({ library: "Acme.fcpbundle", event: "", layout: "export", look: "Acme grade" }), "Acme.fcpbundle · Export · One Export event · Acme grade");
  assert.equal(finalCutSummary({ library: "", event: "x", layout: "video", look: "" }), "Event per video");
  assert.equal(editorSummary("finalcut", "Final Cut Pro", ""), "Not set up yet");
});

test("the editor view goes back to its campaign, and the drawer wires the button to it", () => {
  assert.deepEqual(parentOf({ kind: "editor", id: "a" })?.view, { kind: "campaign", id: "a" });
  const drawer = read("features/settings/components/SettingsDrawer.tsx");
  assert.match(drawer, /onOpen: \(\) => c\.setView\(\{ kind: "editor", id: campaign\.id \}\)/);
  assert.match(drawer, /view\.kind === "editor" && campaign && hasEditorPage\(destination\)/);
});

test("campaign settings: an optional Clip length row, empty by default, with its hint; set values show as times", () => {
  const empty = renderToStaticMarkup(<SettingsCampaign {...campaign} />);
  assert.match(empty, /role="group" aria-label="Clip length"/);
  assert.match(empty, /Leave empty if Acme has no length rule\./);
  assert.doesNotMatch(empty, /aria-label="Shortest clip length"[^>]*value="[^"]/);
  const set = renderToStaticMarkup(<SettingsCampaign {...campaign} lengthRule={{ min: 30, max: 60 }} />);
  assert.match(set, /aria-label="Shortest clip length"[^>]*value="0:30"/);
  assert.match(set, /aria-label="Longest clip length"[^>]*value="1:00"/);
  assert.match(read("features/settings/components/SettingsDrawer.tsx"), /onLengthRule=\{\(patch\) => c\.campaigns\.update\(campaign\.id, patch\)\}/);
});

test("delete takes two clicks", () => {
  assert.match(renderToStaticMarkup(<SettingsCampaign {...campaign} />), />Delete campaign</);
  assert.match(renderToStaticMarkup(<SettingsCampaign {...campaign} confirmingDelete />), />Click again to delete Acme</);
});

test("Back targets, and there is no separate Clips folder page", () => {
  assert.throws(() => read("features/settings/components/SettingsFolder.tsx"));
  assert.deepEqual(parentOf({ kind: "campaign", id: "a" }), { label: "Campaigns", view: { kind: "campaigns" } });
  assert.equal(parentOf({ kind: "top" }), null);
});

test("App mounts the drawer, the gear toggles it and the campaign menu opens it on a campaign", () => {
  const app = read("routes/App.tsx");
  assert.match(app, /<SettingsDrawer/);
  assert.match(app, /const openCampaignSettings = \(campaignId: string\) => \{\s*setSettingsStartAt\(campaignId\)/);
  assert.match(app, /<CampaignMenu onOpenSettings=\{openCampaignSettings\} \/>/);
  assert.match(app, /onToggleSettings=\{\(\) => \{\s*setSettingsStartAt\(null\)/);
});

test("A-5: a campaign can be renamed and its folder changed from its own view", () => {
  const h = renderToStaticMarkup(<SettingsCampaign {...campaign} />);
  assert.match(h, /<label for="campaign-name"[^>]*>Name<\/label>/);
  assert.match(h, /id="campaign-name"[^>]*value="Acme"/);
  assert.match(h, /aria-label="Change the Acme folder"/);
  const view = read("features/settings/components/SettingsCampaign.tsx");
  assert.match(view, /onBlur=\{commitName\}/);
  assert.match(view, /e\.key === "Enter"\) commitName\(\)/);
  const drawer = read("features/settings/components/SettingsDrawer.tsx");
  assert.match(drawer, /campaignNameProblems\(next, c\.campaigns\.campaigns, campaign\.id\)/);
  // Renaming must not move the folder the clips already sit in.
  assert.match(drawer, /update\(campaign\.id, \{ name: next\.trim\(\), \.\.\.\(pinned \? \{ clipsDir: pinned \} : \{\}\) \}\)/);
  assert.match(drawer, /onChangeFolder=\{\(\) => c\.campaigns\.pickClipsDir\(campaign\.id\)\}/);
});

test("A3-1: backing out of the New campaign form closes the chip's popover as well", () => {
  assert.match(read("features/campaigns/components/CampaignMenu.tsx"), /onClose=\{\(\) => \{ setWizard\(false\); onClose\?\.\(\); \}\}/);
});

test("A3-2: Open on a folder that is not made yet says it will be made with the first clip, on Settings and on Start", () => {
  assert.match(read("features/settings/components/SettingsDrawer.tsx"), /r\?\.missing \? FOLDER_NOT_MADE_YET : null/);
  assert.match(read("features/start/hooks/useStartController.ts"), /r\?\.missing \? FOLDER_NOT_MADE_YET : ""/);
  const h = renderToStaticMarkup(<SettingsCampaign {...campaign} />);
  assert.doesNotMatch(h, /made with your first clip/, "nothing is said before Open is pressed");
  assert.match(readFileSync(join(process.cwd(), "src/main/features/files/services/filesService.ts"), "utf8"), /missing \? \{ missing: true \}/);
});

test("A3-3: Settings keeps focus inside, lands on its heading when it opens and returns to the Settings button", () => {
  const drawer = read("features/settings/components/SettingsDrawer.tsx");
  assert.match(drawer, /useDrawerFocus\(root, open, .*"#ui-settings"\)/);
  assert.match(drawer, /ref=\{root\} onKeyDown=\{onKeyDown\}/);
  assert.match(drawer, /querySelector<HTMLElement>\("h3"\)/);
});
