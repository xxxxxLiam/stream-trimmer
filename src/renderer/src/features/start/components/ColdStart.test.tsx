/**
 * File: ColdStart.test.tsx
 * Description: The cold start's four states as drawn, the paste key label, and that App shows it
 *   while no video is open.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ColdStart, { type ColdStartProps } from "./ColdStart";

const noop = () => {};
const base: ColdStartProps = {
  pasteKey: "⌘V",
  value: "",
  onChange: noop,
  onPasteButton: noop,
  onPasteText: noop,
  onSubmit: noop,
  offer: null,
  onUseOffer: noop,
  toolsStatus: "ready",
  onRetryTools: noop,
  problem: "",
  onRetryOpen: noop,
  opening: false,
  backTo: null,
  folderLabel: "Downloads/Clipr",
  onOpenFolder: noop,
};
const html = (p: Partial<ColdStartProps> = {}) => renderToStaticMarkup(<ColdStart {...base} {...p} />);

test("empty: logo, name, promise, glowing box, Paste with its key, both chips and the folder chip", () => {
  const h = html();
  assert.match(h, /aria-label="Clipr"/);
  assert.match(h, /id="r-cut"/, "lockup C: the r is cut, its top piece its own path");
  assert.match(h, /Only the seconds you need/);
  assert.match(h, /placeholder="Paste a YouTube link"/);
  assert.match(h, /shadow-box/);
  assert.match(h, /Paste\s*<span[^>]*>⌘V</);
  assert.match(h, /No ads/);
  assert.match(h, /No account/);
  assert.match(h, /Downloads\/Clipr/);
  assert.doesNotMatch(h, /font-mono/);
});

test("Windows shows Ctrl V", () => {
  assert.match(html({ pasteKey: "Ctrl V" }), />Ctrl V</);
});

test("link already copied: the box offers it and has no input; nothing opens by itself", () => {
  const h = html({ offer: { text: "https://youtu.be/abc", short: "youtu.be/abc" } });
  assert.match(h, /Use the link you copied\?/);
  assert.match(h, /youtu\.be\/abc/);
  assert.match(h, />Use it/);
  assert.doesNotMatch(h, /<input/);
});

test("checking tools: the box keeps its glow and caret from the first frame, and the line says why the link waits", () => {
  const h = html({ toolsStatus: "checking" });
  assert.match(h, /Updating download tools, about 20 s\. Your link will open when they are ready\./);
  assert.match(h, /border-ice-tint-50 shadow-box/, "focused look while the tools update (Liam, 25 Nov)");
  assert.doesNotMatch(h, /opacity-0/, "the caret shows too");
  assert.match(h, /<input[^>]*id="ui-cold-start-link"/);
  assert.doesNotMatch(h, /<input[^>]*disabled/, "a link can be pasted during the update");
});

test("tool cannot be fixed: one sentence and one button in the error colour", () => {
  const h = html({ toolsStatus: "broken" });
  assert.match(h, /The download tools could not start\. Try again\./);
  assert.match(h, />Try again</);
  assert.match(h, /border-error/);
});

test("a link that is not a video shows its sentence", () => {
  assert.match(html({ value: "x", problem: "That is not a video link." }), /That is not a video link\./);
});

test("App shows the cold start while no video is open", () => {
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /!info \? \(\s*<ColdStartScreen \/>/);
});

test("the new-campaign offer waits for a video, so nothing covers the cold start", () => {
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /open=\{active && !!info && !campaign && !campaignPromptDismissed\}/);
});

test("B-4: a failed open shows its sentence with Try again, and a way back when a video is open", () => {
  const h = html({ value: "x", problem: "This video is private.", backTo: { label: "Acme podcast", onBack: noop } });
  assert.match(h, /This video is private\./);
  assert.match(h, />Try again</);
  assert.match(h, /Back to Acme podcast/);
  assert.doesNotMatch(html({ value: "x" }), /Try again/);
});

test("B-7: while the link opens the box says Opening… and runs the Preparing line", () => {
  const h = html({ value: "x", opening: true });
  assert.match(h, /Opening…/);
  assert.match(h, /w-1\/4 bg-ice/);
  assert.doesNotMatch(html({ value: "x", opening: true, problem: "old sentence" }), /old sentence/);
  assert.doesNotMatch(html(), /Opening…/);
});

test("E-1: Try again re-asks the engine, and a pasted link is tried even before the tools are ready", async () => {
  const { readFileSync } = await import("node:fs");
  const dir = new URL("../hooks/", import.meta.url).pathname;
  assert.match(readFileSync(`${dir}useToolsStatusQueries.ts`, "utf8"), /force \? "\/api\/tools\?retry=1"/);
  const ctl = readFileSync(`${dir}useStartController.ts`, "utf8");
  assert.doesNotMatch(ctl, /setHeld|held/);
  assert.match(ctl, /onRetryOpen: searchNow/);
});

test("B-4: a link that has not opened is not saved as a video", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../workspace/hooks/WorkspaceContext.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(url && !opened\) return;/);
});

test("A-9: pasted or submitted text that is not a video gets a sentence; a stale engine error never shows for it", async () => {
  const { readFileSync } = await import("node:fs");
  const ctl = readFileSync(new URL("../hooks/useStartController.ts", import.meta.url), "utf8");
  assert.match(ctl, /submitted === url\.trim\(\) \? NOT_A_VIDEO/);
  assert.match(ctl, /extractVideoId\(url\) \? \(error \? plainOpenError\(error\)/);
  assert.match(ctl, /onSubmit: \(\) => \{/);
  const box = readFileSync(new URL("./ColdStart.tsx", import.meta.url), "utf8");
  assert.match(box, /onPaste=\{p\.onPasteText\}/);
  assert.match(box, /e\.key === "Enter"/);
  const { NOT_A_VIDEO } = await import("../utils/startUtils");
  assert.match(html({ value: "meeting notes", problem: NOT_A_VIDEO }), /That is not a link to one video\./);
});
