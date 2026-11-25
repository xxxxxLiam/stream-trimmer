/**
 * File: ActionRow.test.tsx
 * Description: The shared list row: an always-visible ⋯, actions only when open, one open row at a time.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ActionRow from "./ActionRow";
import { getOpenRow, setOpenRow } from "../utils/openRowStore";

const actions = [
  { key: "a", label: "Clip now", icon: <i />, onSelect: () => {} },
  { key: "r", label: "Remove", icon: <i />, onSelect: () => {}, danger: true },
];
const row = () => renderToStaticMarkup(<ActionRow id="clip:B1" name="Big Deal" actions={actions}>content</ActionRow>);

test("closed: only the ⋯ shows, 32px, with no menu and no hover-only reveal", () => {
  setOpenRow(null);
  const html = row();
  assert.match(html, /aria-label="More for Big Deal"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="More for Big Deal"/);
  assert.match(html, /size-\[32px\]/);
  assert.doesNotMatch(html, /role="menu"|Clip now|group-hover/);
});

test("open: hairline divider, 44px lines, Remove red text and never a red fill", () => {
  setOpenRow("clip:B1");
  const html = row();
  setOpenRow(null);
  assert.match(html, /role="menu"/);
  assert.match(html, /border-t border-hairline/);
  assert.equal((html.match(/h-\[44px\]/g) ?? []).length, 2);
  assert.match(html, /text-error[^>]*>.*Remove/);
  assert.doesNotMatch(html, /bg-error/);
});

test("one row is open at a time", () => {
  setOpenRow("a");
  setOpenRow("b");
  assert.equal(getOpenRow(), "b");
  setOpenRow(null);
  assert.equal(getOpenRow(), null);
});

test("History rows use the shared row with the three approved actions, no hover icon buttons", () => {
  const src = readFileSync("src/renderer/src/features/downloads/components/HistoryPanel.tsx", "utf8");
  assert.match(src, /<ActionRow/);
  assert.doesNotMatch(src, /RowIconButton/);
  for (const w of ["Show in File Explorer", "In editor", "Go to source"]) assert.ok(src.includes(w), w);
});
