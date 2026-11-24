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
  offer: null,
  onUseOffer: noop,
  toolsStatus: "ready",
  onRetryTools: noop,
  problem: "",
  folderLabel: "Downloads/Clipr",
  onOpenFolder: noop,
};
const html = (p: Partial<ColdStartProps> = {}) => renderToStaticMarkup(<ColdStart {...base} {...p} />);

test("empty: logo, name, promise, glowing box, Paste with its key, both chips and the folder chip", () => {
  const h = html();
  assert.match(h, /aria-label="Clipr logo"/);
  assert.match(h, />Clipr</);
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

test("checking tools: box loses its glow and the line says why the link waits", () => {
  const h = html({ toolsStatus: "checking" });
  assert.match(h, /Updating download tools, about 20 s\. Your link will open when they are ready\./);
  assert.doesNotMatch(h, /shadow-box/);
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
  assert.match(app, /!info && !\(CHANNEL_DATA_BUILT && screen === "channel"\) \? \(\s*<ColdStartScreen \/>/);
});
