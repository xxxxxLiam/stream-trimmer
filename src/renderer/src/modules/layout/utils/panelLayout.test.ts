/**
 * File: panelLayout.test.ts
 * Description: The panel layout rules: close and bring back, neighbours, reordering, size limits,
 *   and reading a stored layout (unknown ids, new panels, closed-on-purpose panels).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CENTRE_MIN_W,
  DEFAULT_SIZES,
  SIZE_LIMITS,
  activatePanel,
  closePanel,
  closedPanels,
  defaultLayout,
  moveTab,
  normalizeLayout,
  openPanel,
  resizeGroup,
  serializeLayout,
  togglePanel,
} from "./panelLayout";
import type { PanelDefinition } from "./panelRegistry";

const C = () => null;
const defs: PanelDefinition[] = [
  { id: "videos", title: "Videos", group: "left", component: C },
  { id: "transcript", title: "Transcript", group: "left", component: C },
  { id: "markers", title: "Markers", group: "left", component: C },
  { id: "export", title: "Export", group: "right", component: C },
  { id: "history", title: "History", group: "right", component: C },
  { id: "preview", title: "Preview", group: "centre", component: C },
  { id: "timeline", title: "Timeline", group: "centre", component: C },
];
const by = (id: string) => defs.find((d) => d.id === id)!;

test("default layout puts every panel in its home group, first tab showing", () => {
  const l = defaultLayout(defs);
  assert.deepEqual(l.groups.left.tabs, ["videos", "transcript", "markers"]);
  assert.deepEqual(l.groups.right.tabs, ["export", "history"]);
  assert.deepEqual(l.groups.centre.tabs, ["preview", "timeline"]);
  assert.equal(l.groups.left.active, "videos");
  assert.equal(l.groups.right.active, "export");
});

test("closing the shown tab shows its right neighbour, else its left one", () => {
  let l = activatePanel(defaultLayout(defs), "transcript");
  l = closePanel(l, "transcript");
  assert.equal(l.groups.left.active, "markers");
  l = closePanel(l, "markers");
  assert.equal(l.groups.left.active, "videos");
  l = closePanel(l, "videos");
  assert.equal(l.groups.left.active, null);
  assert.deepEqual(l.groups.left.tabs, []);
});

test("closing a tab that is not shown leaves the shown one alone", () => {
  const l = closePanel(defaultLayout(defs), "markers");
  assert.equal(l.groups.left.active, "videos");
});

test("a closed panel comes back at the end of its home group and is shown", () => {
  let l = closePanel(defaultLayout(defs), "videos");
  assert.deepEqual(closedPanels(l, defs).map((d) => d.id), ["videos"]);
  l = openPanel(l, by("videos"));
  assert.deepEqual(l.groups.left.tabs, ["transcript", "markers", "videos"]);
  assert.equal(l.groups.left.active, "videos");
  assert.equal(closedPanels(l, defs).length, 0);
});

test("opening an open panel just shows it; toggle closes then reopens", () => {
  const l = openPanel(defaultLayout(defs), by("markers"));
  assert.equal(l.groups.left.active, "markers");
  assert.equal(l.groups.left.tabs.length, 3);
  const off = togglePanel(l, by("markers"));
  assert.ok(!off.groups.left.tabs.includes("markers"));
  assert.ok(togglePanel(off, by("markers")).groups.left.tabs.includes("markers"));
});

test("moveTab reorders inside the group and stops at the ends", () => {
  const l = moveTab(defaultLayout(defs), "transcript", -1);
  assert.deepEqual(l.groups.left.tabs, ["transcript", "videos", "markers"]);
  assert.equal(moveTab(l, "transcript", -1), l);
});

test("sizes are clamped to their limits, and the centre keeps its minimum width", () => {
  const l = defaultLayout(defs);
  assert.equal(resizeGroup(l, "left", 5).sizes.left, SIZE_LIMITS.left.min);
  assert.equal(resizeGroup(l, "left", 5000).sizes.left, SIZE_LIMITS.left.max);
  const width = 1200;
  const wide = resizeGroup(l, "left", 5000, width);
  assert.equal(wide.sizes.left, width - DEFAULT_SIZES.right - CENTRE_MIN_W);
});

test("a stored layout drops unknown ids and keeps what the user closed closed", () => {
  const stored = serializeLayout(closePanel(defaultLayout(defs), "history"), defs);
  const raw = JSON.parse(JSON.stringify(stored));
  raw.groups.left.tabs.push("gone");
  const l = normalizeLayout(raw, defs);
  assert.ok(!l.groups.left.tabs.includes("gone"));
  assert.ok(!l.groups.right.tabs.includes("history"), "closed on purpose stays closed");
});

test("a panel the stored layout never saw joins its home group", () => {
  const stored = JSON.parse(JSON.stringify(serializeLayout(defaultLayout(defs.slice(0, 4)), defs.slice(0, 4))));
  const l = normalizeLayout(stored, defs);
  assert.ok(l.groups.right.tabs.includes("history"));
  assert.ok(l.groups.centre.tabs.includes("preview"));
});

test("junk in storage falls back to the built-in layout", () => {
  assert.deepEqual(normalizeLayout("nope", defs), defaultLayout(defs));
  assert.deepEqual(normalizeLayout({ groups: { left: 3 }, sizes: { left: "wide" } }, defs).sizes, DEFAULT_SIZES);
});
