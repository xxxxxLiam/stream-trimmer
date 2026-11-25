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

// ---- Audit run 1: F-7, F-8, F-10, F-13 ----
import { SIDE_FLOOR, fitSides, movePanelToGroup } from "./panelLayout";

test("F-7: a panel moves to the other group, becomes its shown tab, and the source picks a neighbour", () => {
  let l = movePanelToGroup(defaultLayout(defs), "videos", "right");
  assert.deepEqual(l.groups.right.tabs, ["export", "history", "videos"]);
  assert.equal(l.groups.right.active, "videos");
  assert.deepEqual(l.groups.left.tabs, ["transcript", "markers"]);
  assert.equal(l.groups.left.active, "transcript");
  // at a position
  l = movePanelToGroup(l, "markers", "right", 0);
  assert.deepEqual(l.groups.right.tabs, ["markers", "export", "history", "videos"]);
  // the centre is not movable, and the last panel of a group can leave it empty
  assert.equal(movePanelToGroup(l, "preview", "left"), l);
  const one = movePanelToGroup(movePanelToGroup(l, "transcript", "right"), "markers", "right");
  assert.deepEqual(one.groups.left.tabs, []);
  assert.equal(one.groups.left.active, null);
});

test("F-7: a moved panel survives save and load in its new group", () => {
  const l = movePanelToGroup(defaultLayout(defs), "history", "left");
  const back = normalizeLayout(JSON.parse(JSON.stringify(serializeLayout(l, defs))), defs);
  assert.ok(back.groups.left.tabs.includes("history"));
  assert.ok(!back.groups.right.tabs.includes("history"));
});

test("F-8/F-10/F-13: saved side widths are fitted so Preview keeps its minimum width", () => {
  // a layout saved on a big screen, opened at the minimum window (1160, minus 16 padding)
  const f = fitSides({ left: 560, right: 560 }, 1144);
  assert.ok(1144 - f.left - f.right >= CENTRE_MIN_W, `preview ${1144 - f.left - f.right}`);
  assert.ok(f.left >= SIDE_FLOOR && f.right >= SIDE_FLOOR);
  // zoomed to ~190%: 1144 / 1.9 = 602 css px; the sides give way, never below the floor
  const z = fitSides({ left: 300, right: 300 }, 602);
  assert.ok(z.left >= SIDE_FLOOR && z.right >= SIDE_FLOOR);
  assert.ok(602 - z.left - z.right >= 602 - 2 * 191 - 1 || 602 - z.left - z.right >= CENTRE_MIN_W - 1);
  // plenty of room: untouched; an empty group takes nothing
  assert.deepEqual(fitSides({ left: 300, right: 300 }, 1600), { left: 300, right: 300 });
  assert.deepEqual(fitSides({ left: 300, right: 300 }, 1000, { left: false, right: true }), { left: 0, right: 300 });
  assert.ok(fitSides({ left: 300, right: 300 }, 1000, { left: false, right: true }).right <= 1000 - CENTRE_MIN_W);
});

test("F-10: a stored layout can never lose Preview or Timeline", () => {
  const bad = {
    groups: { left: { tabs: ["preview", "videos"], active: "preview" }, right: { tabs: ["timeline", "export"], active: "nope" }, centre: { tabs: [], active: null } },
    sizes: { left: 999999, right: -5, timeline: 3 },
  };
  const l = normalizeLayout(bad, defs);
  assert.deepEqual([...l.groups.centre.tabs].sort(), ["preview", "timeline"]);
  assert.ok(!l.groups.left.tabs.includes("preview") && !l.groups.right.tabs.includes("timeline"));
  for (const g of ["left", "right"] as const) {
    const a = l.groups[g].active;
    assert.ok(a === null ? l.groups[g].tabs.length === 0 : l.groups[g].tabs.includes(a));
  }
  assert.ok(l.sizes.left <= SIZE_LIMITS.left.max && l.sizes.right >= SIZE_LIMITS.right.min && l.sizes.timeline >= SIZE_LIMITS.timeline.min);
});

// ---- Audit run 2: F2-6 ----
import { PREVIEW_MIN_H, TIMELINE_GAP, fitTimeline, timelineMax } from "./panelLayout";

test("F2-6: a saved 520px timeline cannot crush Preview in a short window", () => {
  // 900x600 window: the workspace is about 480 tall (top bar and footer take the rest)
  const short = 480;
  const t = fitTimeline(520, short);
  assert.ok(short - t - TIMELINE_GAP >= PREVIEW_MIN_H, `preview ${short - t - TIMELINE_GAP}`);
  assert.ok(t >= SIZE_LIMITS.timeline.min);
  // the 1160x760 minimum window: 520 still leaves Preview its minimum
  const min = 633;
  assert.ok(min - fitTimeline(520, min) - TIMELINE_GAP >= PREVIEW_MIN_H);
});

test("F2-6: a timeline that already fits is left alone, and a tiny window keeps the timeline's own minimum", () => {
  assert.equal(fitTimeline(200, 700), 200);
  assert.equal(fitTimeline(200, Infinity), 200);
  assert.equal(timelineMax(100), SIZE_LIMITS.timeline.min);
  assert.equal(fitTimeline(90, 700), 90, "never raised, only capped");
});
