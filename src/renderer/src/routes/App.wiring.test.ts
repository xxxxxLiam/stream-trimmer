/**
 * File: App.wiring.test.ts
 * Description: Pins the App.tsx wiring that the per-tab clip store (B-2, C-1) depends on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const app = readFileSync(join(process.cwd(), "src", "renderer", "src", "routes", "App.tsx"), "utf8");

test("B-2: each tab's provider is told which tab it is", () => {
  assert.match(app, /<TabActiveProvider active=\{active\} tabId=\{tab\.id\}>/);
});

test("C-1: a cut clears ITS tab's store, never the module-level active one", () => {
  assert.ok(!/import \{[^}]*\bclearSegments\b[^}]*\} from "\.\/hooks\/useSegmentsState"/.test(app));
  assert.match(app, /clear: clearSegments\s*\} = useSegmentsState\(\)/);
});

test("F-1: one top bar and one tips host, for the open video only", () => {
  assert.match(app, /useTipsController\(!!info && active &&/);
  assert.match(app, /\{active && \(\s*<TopBar/);
  assert.match(app, /\{active && \(\s*<ExportBar/);
  assert.ok(!/BottomBar/.test(app), "the floating bottom bar is gone");
  assert.equal((app.match(/<TopBar/g) ?? []).length, 1);
});

test("R2: one timeline controller feeds the Timeline panel and the fixed export bar", () => {
  assert.match(app, /<TimelineControllerProvider>[\s\S]*<PanelWorkspace \/>[\s\S]*<ExportBar[\s\S]*<\/TimelineControllerProvider>/);
  const timeline = readFileSync(new URL("../features/player/components/Timeline.tsx", import.meta.url), "utf8");
  const bar = readFileSync(new URL("../features/player/components/ExportBar.tsx", import.meta.url), "utf8");
  assert.match(timeline, /useTimelineView\(\)/);
  assert.ok(!/useTimelineController\(\)/.test(timeline), "a second controller would double the key handlers");
  assert.match(timeline, /<TimelineTools \/>/);
  assert.match(bar, /h-\[60px\][^"]*border-t border-hairlineStrong bg-panel/);
  assert.ok(!/\b(m[xtblr]?-\[|rounded-)/.test(bar.match(/id="ui-export-bar" className="([^"]*)"/)![1]), "full bleed: no margin, no radius");
});

test("R2: the timeline is an inset rounded card above the fixed export bar", () => {
  const timeline = readFileSync(new URL("../features/player/components/Timeline.tsx", import.meta.url), "utf8");
  const cls = timeline.match(/id="ui-timeline"[^>]*className=\{?[`"]([^`"]*)[`"]/)![1];
  assert.match(cls, /\bmx-\[8px\]/);
  assert.match(cls, /\bmb-\[8px\]/);
  assert.match(cls, /\brounded-panel\b/);
  assert.ok(!/border-y/.test(cls));
});

test("R2: screens without a top bar still drag the window by a strip along the top edge", () => {
  const start = readFileSync(new URL("../features/start/components/ColdStartScreen.tsx", import.meta.url), "utf8");
  const crash = readFileSync(new URL("../shared/components/CrashScreen.tsx", import.meta.url), "utf8");
  const strip = readFileSync(new URL("../modules/layout/components/TitleBarDrag.tsx", import.meta.url), "utf8");
  assert.match(start, /<TitleBarDrag \/>/);
  assert.match(crash, /<TitleBarDrag \/>/);
  assert.match(strip, /barIsTitleBar\(chrome\)/);
  assert.match(strip, /topbar-drag/);
});

test("F4-2: Ctrl+, and Ctrl+/ swap the right drawers like the buttons, one at a time", () => {
  const src = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(src, /k === "\/"[\s\S]{0,200}setSettingsOpen\(false\);\s*setHelpOpen\(\(v\) => !v\)/);
  assert.match(src, /k === ","[\s\S]{0,200}setHelpOpen\(false\);\s*setSettingsOpen\(\(v\) => !v\)/);
});

test("F4-1: a failed update download clears the percent; F4-4/List rows: Videos rows use the shared ⋯ row (44px action lines), no hover-only button", () => {
  const hook = readFileSync(new URL("../features/updates/hooks/useUpdateStatusEffects.ts", import.meta.url), "utf8");
  assert.match(hook, /s\.state === "error"\) setDownloading\(null\)/);
  const panel = readFileSync(new URL("../features/workspace/components/VideosPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /<ActionRow[\s\S]{0,200}actions=\{actions\}/);
  assert.match(panel, /Mark done[\s\S]{0,400}Open on YouTube[\s\S]{0,400}Hold to remove video/);
  assert.doesNotMatch(panel, /group-hover|Done with this video/);
  const row = readFileSync(new URL("../shared/components/ActionRow.tsx", import.meta.url), "utf8");
  assert.match(row, /h-\[44px\]/);
});

test("R2: the top bar's centre is the link field; Enter adds, Esc restores, and Cmd/Ctrl+L stays Loop", () => {
  const bar = readFileSync(new URL("../modules/layout/components/TopBar.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../features/workspace/hooks/useAddVideoController.ts", import.meta.url), "utf8");
  assert.match(bar, /<TopBarLinkField channel=\{channel\} \/>/);
  assert.match(hook, /e\.key === "Enter"[\s\S]*submit\(\)/);
  assert.match(hook, /e\.key === "Escape"[\s\S]*leave\(\)/);
  assert.match(hook, /ws\.addTab\(action\.target\)/);
  assert.ok(!/ctrlKey|metaKey/.test(hook), "L belongs to Loop the range");
});

test("R2: the top bar sits above the workspace, so the link field's panel is not hidden behind Preview", () => {
  const bar = readFileSync(new URL("../modules/layout/components/TopBar.tsx", import.meta.url), "utf8");
  const header = bar.match(/<header\s+className=\{`([^`]*)`/)![1];
  assert.match(header, /\brelative z-40\b/, "a z-auto header is painted over by the later, positioned workspace row");
  const field = readFileSync(new URL("../features/workspace/components/TopBarLinkField.tsx", import.meta.url), "utf8");
  assert.match(field, /role="status"[\s\S]{0,80}z-30|z-30[\s\S]{0,120}role="status"/);
});

test("Liam 28 Nov: Symbols and phrases has an icon among the top-right icons", () => {
  const bar = readFileSync(new URL("../modules/layout/components/TopBar.tsx", import.meta.url), "utf8");
  assert.match(bar, /aria-label="Symbols and phrases"[\s\S]{0,200}onClick=\{onOpenSymbols\}/);
  assert.ok(bar.indexOf('aria-label="Symbols and phrases"') < bar.indexOf("<HelpButton"), "sits left of Help and Settings");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(app, /onOpenSymbols=\{\(\) => \(window\.electronAPI\?\.openSymbols/);
});
