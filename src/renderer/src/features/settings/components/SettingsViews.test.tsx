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
import SettingsTopList from "./SettingsTopList";
import SettingsSignIn from "./SettingsSignIn";
import { signInRowValue, statusFromAnswer } from "../utils/signInStatus";
import { cookieReason } from "../utils/cookieReasons";
import { parentOf } from "../hooks/useSettingsController";

const noop = () => {};
const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src", f), "utf8");

test("top list: campaigns listed here, sign-in, two switches; no Campaigns page, no global Clips folder row", () => {
  const rows = [{ id: "a", name: "Acme", summary: "3 clips a day", languages: null }, { id: "n", name: "Nova", summary: "2 clips a day", languages: null }];
  const h = renderToStaticMarkup(
    <SettingsTopList rows={rows} onEdit={noop} onAdd={noop} app={{ notifyQueueDone: true }} autoUpdate={false} onAutoUpdate={noop} onPatchApp={noop} onOpenSignIn={noop} onClose={noop} />,
  );
  // Liam, 25 Nov: the campaigns are listed right on Settings, each opening that campaign.
  assert.match(h, /aria-label="Acme: 3 clips a day"/);
  assert.match(h, /aria-label="Nova: 2 clips a day"/);
  assert.match(h, /aria-label="Add campaign"/);
  const row = h.slice(h.indexOf('aria-label="Acme: 3 clips a day"'), h.indexOf("</button>", h.indexOf('aria-label="Acme: 3 clips a day"')));
  assert.match(row, /M4\.646 1\.646/, "a chevron-right at the row's end");
  assert.doesNotMatch(row, /M8 4\.754/, "not a gear: the gear is only in the top-left campaign menu");
  assert.doesNotMatch(h, /aria-label="Campaigns/);
  // The clips folder is per campaign only.
  assert.doesNotMatch(h, /Clips folder|Change the clips folder/);
  assert.match(h, /aria-label="Sign in for 1080p: Not signed in"/);
  assert.match(h, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Tell me when the queue finishes"/);
  assert.match(h, /aria-checked="false"[^>]*aria-label="Update automatically"/);
  assert.match(h, /aria-label="Close Settings"/);
  assert.doesNotMatch(h, /Editor|Quality|crash/i);
  assert.throws(() => read("features/settings/components/SettingsCampaigns.tsx"));
});

test("top list on a Mac: no Update automatically switch (the build is unsigned and cannot update itself), the other switch stays", () => {
  const props = { rows: [], onEdit: noop, onAdd: noop, app: { notifyQueueDone: true }, autoUpdate: true, onAutoUpdate: noop, onPatchApp: noop, onOpenSignIn: noop, onClose: noop };
  const mac = renderToStaticMarkup(<SettingsTopList {...props} autoUpdateAvailable={false} />);
  assert.doesNotMatch(mac, /Update automatically/);
  assert.match(mac, /aria-label="Tell me when the queue finishes"/);
  const other = renderToStaticMarkup(<SettingsTopList {...props} />);
  assert.match(other, /aria-label="Update automatically"/);
  assert.match(read("features/settings/components/SettingsDrawer.tsx"), /autoUpdateAvailable=\{updatesInPlace\(/);
});

test("Liam 25 Nov: the drawer panel grows with its content, so scrolling never shows the timeline behind it", () => {
  assert.match(read("shared/components/Drawer.tsx"), /flex min-h-full w-\[440px\]/);
  assert.doesNotMatch(read("shared/components/Drawer.tsx"), /flex h-full w-\[440px\]/);
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
  // Liam, 25 Nov: Languages is one dropdown (many ticks), closed it names what is picked.
  assert.match(h, /aria-label="Languages: Original \+ ES"/);
  assert.match(h, /aria-haspopup="menu"/);
  assert.doesNotMatch(h, /aria-label="Spanish audio/);
  assert.match(h, /aria-label="Open the Acme folder"/);
  assert.match(h, /aria-label="Back to Settings"/);
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
  assert.match(other, /Nothing to set for DaVinci Resolve\. Clip saves the clip and a timeline file/);
  assert.match(renderToStaticMarkup(<SettingsEditor campaignName="Acme" label="Premiere Pro" finalCut={null} onBack={noop} onClose={noop} />), /Nothing to set for Premiere Pro yet/);
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
  assert.deepEqual(parentOf({ kind: "campaign", id: "a" }), { label: "Settings", view: { kind: "top" } });
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

test("sign-in page: honest line, three steps, drop zone; a refusal shows reason then fix", () => {
  const base = { status: null, onFile: noop, onChoose: noop, onSignOut: noop, onBack: noop, onClose: noop };
  const h = renderToStaticMarkup(<SettingsSignIn {...base} />);
  assert.match(h, /never posts, likes or changes anything/);
  assert.match(h, /Drop cookies\.txt, or choose a file/);
  assert.match(h, /Get cookies\.txt LOCALLY/);
  assert.doesNotMatch(h, /Try again/);
  const bad = renderToStaticMarkup(<SettingsSignIn {...base} status={statusFromAnswer({ ok: false, reason: "wrong-site" })} />);
  assert.match(bad, /role="alert"/);
  assert.match(bad, /Couldn’t sign in/);
  assert.match(bad, /no YouTube cookies/);
  assert.match(bad, /text-error/);
  assert.match(bad, /Drop cookies\.txt/, "a failed file keeps the steps and drop zone");
});

test("board 04.6 A: Checking shows the sliding line; Signed in folds the steps away and offers Replace file and Sign out", () => {
  const base = { status: null, onFile: noop, onChoose: noop, onSignOut: noop, onBack: noop, onClose: noop };
  const checking = renderToStaticMarkup(<SettingsSignIn {...base} status={{ state: "checking" }} />);
  assert.match(checking, /Checking your file…/);
  const named = renderToStaticMarkup(<SettingsSignIn {...base} status={statusFromAnswer({ ok: true, verify: "signed_in", account: "Acme Studio" })} />);
  assert.match(named, /Signed in as Acme Studio/);
  assert.match(named, /1080p is on\. Checked just now\./);
  assert.match(named, />Replace file</);
  assert.match(named, />Sign out</);
  assert.doesNotMatch(named, /Drop cookies\.txt/);
  assert.doesNotMatch(named, /Get cookies\.txt LOCALLY/);
  const plain = renderToStaticMarkup(<SettingsSignIn {...base} status={statusFromAnswer({ ok: true, verify: "signed_in" })} />);
  assert.match(plain, />Signed in</);
  assert.doesNotMatch(plain, /Signed in as/);
});

test("board 04.6 A: the engine's verdicts map onto the card and the Settings row", () => {
  const rejected = statusFromAnswer({ ok: true, verify: "rejected", message: "YouTube didn't accept this sign-in. Export a fresh cookies file while signed in and add it again." });
  assert.deepEqual(rejected, { state: "failed", reason: "YouTube didn't accept this sign-in.", fix: "Export a fresh cookies file while signed in and add it again." });
  assert.equal(statusFromAnswer({ ok: true, verify: "unverified", message: "Saved." }).state, "saved");
  assert.equal(statusFromAnswer({ ok: true }).state, "signed-in");
  assert.equal(statusFromAnswer(undefined).state, "failed");
  assert.equal(signInRowValue({ state: "checking" }, false), "Checking…");
  assert.equal(signInRowValue(null, true), "Signed in");
  assert.equal(signInRowValue(rejected, false), "Not signed in");
  const hook = read("features/settings/hooks/useCookieDropMutations.ts");
  assert.match(hook, /setSignInStatus\(\{ state: "checking" \}\);\s*await settle\(await window\.electronAPI\?\.importYouTubeCookiesText/, "Checking is set before the main process is asked");
});

test("the engine's own sentences win over the fallback", () => {
  const r = cookieReason({ ok: false, reason: "signed-out", message: "Signed out when exported.", fix: "Sign in, then export." });
  assert.deepEqual(r, { reason: "Signed out when exported.", fix: "Sign in, then export." });
  assert.match(cookieReason({ ok: false }).reason, /isn’t a cookies file/);
  assert.match(cookieReason({ ok: false, kind: "too_old" }).reason, /ended this session/);
  assert.match(cookieReason({ ok: false, kind: "wrong_site" }).reason, /no YouTube cookies/);
  assert.match(cookieReason({ ok: false, kind: "wrong_format" }).reason, /isn’t a cookies file/);
});


test("Liam 25 Nov: a campaign's export settings are always on its page, Final Cut's when no editor is chosen", () => {
  const withEditor = renderToStaticMarkup(<SettingsCampaign {...campaign} editor={{ label: "Final Cut Pro", summary: "Library · Export", onOpen: noop }} />);
  assert.match(withEditor, />Export settings</);
  assert.match(withEditor, /aria-label="Final Cut Pro settings for Acme"/);
  const drawer = read("features/settings/components/SettingsDrawer.tsx");
  assert.match(drawer, /const destination = hasEditorPage\(chosen\) \? chosen : "finalcut"/);
});

test("Liam 25 Nov: the Languages dropdown ticks many, Original first and on, and the menu stays open between picks", () => {
  const src = read("features/settings/components/SettingsCampaign.tsx");
  assert.match(src, /\[\{ code: "original", label: "Original" \}, \.\.\.p\.dubs\]/);
  assert.match(src, /checked: prefs\.languages\.includes\(l\.code\), keepOpen: true/);
  assert.doesNotMatch(src, /aria-pressed=\{on\}/);
});

test("Liam 25 Nov: the campaign menu has a gear on each row, not a separate '<Campaign> settings' line", () => {
  const menu = read("features/campaigns/components/CampaignMenu.tsx");
  assert.match(menu, /aria-label=\{`\$\{c\.name\} settings`\}/);
  assert.match(menu, /<IconGear \/>/);
  assert.doesNotMatch(menu, /\{current\.name\} settings/);
  assert.match(menu, /New campaign/);
});
