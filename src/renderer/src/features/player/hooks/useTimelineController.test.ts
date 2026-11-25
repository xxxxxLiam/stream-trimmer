/**
 * File: useTimelineController.test.ts
 * Description: Source-level guards for how the lane answers the pointer (the hook needs a DOM to run):
 *   the pointer tool seeks on press and scrubs on drag and never sets a range; the scissors set the range
 *   and never seek; the lane listens for the wheel.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./useTimelineController.ts", import.meta.url), "utf8");
const lane = readFileSync(new URL("../components/Timeline.tsx", import.meta.url), "utf8");
const effects = readFileSync(new URL("./useTimelineEffects.ts", import.meta.url), "utf8");
const sourceLane = readFileSync(new URL("../components/SourceLane.tsx", import.meta.url), "utf8");
const down = src.slice(src.indexOf("const onLanePointerDown"), src.indexOf("const onLanePointerMove"));

test("pointer tool: a press moves the playhead and starts a scrub, with no range drag", () => {
  const after = down.slice(down.indexOf("The pointer only moves the playhead"));
  assert.match(after, /kind: "scrub"/);
  assert.match(after, /requestSeek/);
  assert.doesNotMatch(after, /kind: "range"/);
});

test("scissors: a press marks a start or an end and does not seek or drag", () => {
  const clip = down.slice(down.indexOf('tools.tool === "clip"'), down.indexOf('tools.tool === "range"'));
  assert.match(clip, /scissorsClick/);
  assert.doesNotMatch(clip, /requestSeek|kind: "range"/);
});

test("select range: a press starts a range drag and does not seek", () => {
  const range = down.slice(down.indexOf('tools.tool === "range"'), down.indexOf("The pointer only moves"));
  assert.match(range, /kind: "range"/);
  assert.doesNotMatch(range, /requestSeek/);
});

test("the tools act on the whole timeline area, not only the Source lane", () => {
  assert.match(lane, /data-timeline-area[\s\S]*onPointerDown=\{c\.onLanePointerDown\}/);
  assert.doesNotMatch(sourceLane, /onPointerDown=\{c\.onLanePointerDown\}/);
});

test("the Source lane takes the height the timeline gains", () => {
  assert.match(lane, /sourceLaneHeight\(height\)/);
});

test("the lane listens for the wheel with a non-passive listener", () => {
  assert.match(lane, /addEventListener\("wheel"[\s\S]*passive: false/);
});

test("the cursor follows the tool over the whole timeline, not only the Source lane", () => {
  assert.match(lane, /cursorFor\(c\.tool, alt\)/);
});

test("the Source outline wraps the filmstrip instead of sitting on it", () => {
  assert.match(sourceLane, /left: x - 3/);
});

test("zooming does not snap the view back to the playhead: only the playhead moving does", () => {
  const follow = effects.slice(effects.indexOf("the window follows the playhead"));
  const deps = follow.slice(0, follow.indexOf("publishTimelineView")).match(/\}, \[([^\]]*)\]\)/g) ?? [];
  assert.deepEqual(deps, ["}, [a.playhead])"]);
});

test("tool keys are wired, and the tool buttons show them in their tooltips", () => {
  assert.match(effects, /toolForKey\(e\)[\s\S]*setTool\(t\)/);
  const bar = readFileSync(new URL("../components/TimelineTools.tsx", import.meta.url), "utf8");
  assert.match(bar, /title=\{`\$\{label\} \(\$\{TOOL_KEYS\[t\]\.toUpperCase\(\)\}\)`\}/);
});

test("a short timeline scrolls its tracks vertically under a ruler that stays put, with a keyboard route", () => {
  const i = lane.indexOf("data-timeline-tracks");
  const tracks = lane.slice(lane.lastIndexOf("<div", i), lane.indexOf("</div>", i));
  assert.match(tracks, /overflow-y-auto/);
  assert.match(tracks, /tabIndex=\{0\}/, "focusable, so the arrow keys and Page Up/Down scroll it");
  assert.match(tracks, /<SourceLane[\s\S]*<ClipsLane/);
  assert.ok(lane.indexOf("<TimelineRuler") < lane.lastIndexOf("<div", i), "the ruler sits above the scrolling part");
});

test("Fit's re-centre runs after the zoom-reset effect, so Fit (zoom to 0 and a new centre in one commit) is not cleared", () => {
  const clear = effects.indexOf("if (a.zoom <= 0) a.setFocus(null)");
  const fit = effects.indexOf("fitWindow(a.range, a.duration)");
  assert.ok(clear > 0 && fit > 0 && clear < fit);
});

test("V18-T-1: a zoom with no centre takes the one it shows, and a scrub never moves the axis", () => {
  assert.match(effects, /a\.zoom > 0 && a\.focus === null\) a\.setFocus\(a\.win\.start/);
  assert.match(effects, /a\.zoom <= 0 \|\| a\.scrubbing\) return/);
  assert.match(src, /scrubbing: s\.drag\?\.kind === "scrub"/);
});

test("V18-T-2: wheel and pinch zoom, and the zoom tool, anchor on the pointer", () => {
  assert.match(src, /focusForAnchor\(duration, next, t, x \/ s\.width, padFrac\)/);
  assert.match(src, /zoomAt\(x, at, getZoom\(\) \+ act\.amount\)/);
  assert.match(src, /tools\.tool === "zoom"\) return zoomAt\(/);
  assert.doesNotMatch(src, /s\.setFocus\(at\);\s*tools\.zoomBy/, "centring on the pointer time drifted away from it");
});

const tools = readFileSync(new URL("../components/TimelineTools.tsx", import.meta.url), "utf8");
const clipsLane = readFileSync(new URL("../components/ClipsLane.tsx", import.meta.url), "utf8");
const rangeState = readFileSync(new URL("../../../modules/clipper/hooks/useClipRangeState.ts", import.meta.url), "utf8");

test("V18-T-3/4: both ends are set at once, in order, and an edge drag keeps the other edge fixed", () => {
  assert.match(src, /clipper\.setRangeFromSeconds\(from, to\)/);
  assert.doesNotMatch(src.slice(src.indexOf("const setRange"), src.indexOf("const swallowClick")), /setStartFromSeconds|setEndFromSeconds/);
  assert.match(rangeState, /orderedRange\(a, b\)/);
  assert.match(src, /fixed: edge === "start" \? range\.end : range\.start/);
  assert.match(src, /setRange\(d\.fixed, t\)/);
});

test("V18-T-7: the other tools work on top of a clip bar, and the bar's own click is swallowed", () => {
  assert.match(src, /if \(onButton && tools\.tool === "pointer"\) return;/);
  assert.match(src, /swallowClick\.current = onButton/);
  assert.match(lane, /onClickCapture=\{c\.onLaneClickCapture\}/);
});

test("V18-T-5: the clip being built uses free space for its name like made and waiting clips", () => {
  assert.match(clipsLane, /key: "built"/);
  assert.match(clipsLane, /outside\("built"/);
});

test("V18-T-8: the zoom slider drags and has a 44 px hit area", () => {
  assert.match(tools, /onPointerMove=\{\(e\) => \{\s*if \(e\.buttons !== 1\) return/);
  assert.match(tools, /setPointerCapture/);
  assert.match(tools, /h-\[44px\] w-\[96px\]/);
});

test("V18-T-11/12: Alt shows the zoom-out cursor; tool keys and M stay quiet while a dialog is open", () => {
  assert.match(lane, /cursorFor\(c\.tool, alt\)/);
  assert.equal((effects.match(/dialogOpen\(\)/g) ?? []).length, 2);
});

const clipCtl = readFileSync(new URL("./useClipController.ts", import.meta.url), "utf8");
const clipBtn = readFileSync(new URL("../components/ClipButton.tsx", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../../../routes/App.tsx", import.meta.url), "utf8");
const transcriptCol = readFileSync(new URL("../../transcript/components/TranscriptColumn.tsx", import.meta.url), "utf8");

test("B3-1: an Out set before the In keeps the In, and the readout shows the stored Out", () => {
  const setEnd = rangeState.slice(rangeState.indexOf("const setEndFromSeconds"), rangeState.indexOf("const setRangeFromSeconds"));
  assert.doesNotMatch(setEnd, /setStartText/);
  assert.match(src, /outText: range \? clockTime\(range\.end\) : endPicked \? clockTime\(clipper\.end\) : dash/);
});

test("B3-2: Esc during a range or edge drag restores the marks and ends the drag", () => {
  assert.match(down, /marksBeforeDrag\.current = \{ start: clipper\.startText, end: clipper\.endText \}/);
  const esc = src.slice(src.indexOf("B3-2"), src.indexOf("const lastScrub"));
  assert.match(esc, /e\.key !== "Escape"/);
  assert.match(esc, /clipper\.setStartText\(before\.start\)/);
  assert.match(esc, /clipper\.setEndText\(before\.end\)/);
  assert.match(esc, /s\.setDrag\(null\)/);
});

test("B3-3: Ctrl/Cmd+F is app-wide, opens the Transcript tab and focuses its search; the column no longer owns it", () => {
  assert.match(appSrc, /e\.key\.toLowerCase\(\) !== "f"/);
  assert.match(appSrc, /openPanelById\("transcript"\)/);
  assert.match(appSrc, /getElementById\("ui-transcript-search"\)/);
  assert.doesNotMatch(transcriptCol, /key\.toLowerCase\(\) === "f"/);
});

test("B2-9: Ctrl+Enter while Clip is blocked shows the reason the dimmed button shows", () => {
  assert.match(clipCtl, /if \(reason\) return setReasonShown\(true\)/);
  assert.match(clipBtn, /c\.reasonShown \? "inline-flex"/);
});

test("V18-T-6: overlapping clip bars are stacked into rows without text", () => {
  assert.match(clipsLane, /packRows\(/);
  assert.match(clipsLane, /!stacked\(/);
});

test("B4-1: a stacked bar keeps a readable name beside the stack, for made, waiting and built clips", () => {
  assert.equal((clipsLane.match(/\{stackedLabel\(/g) ?? []).length, 3);
  assert.match(clipsLane, /text-fg-dim"\s*\n\s*style=\{style\}/);
  assert.match(clipsLane, /laneRows > 1 \? 10 \+ laneRows \* ROW_H : 34/);
});

test("V18-T-6: packing sees the width a bar is drawn at (18 px: padding and border)", () => {
  assert.match(clipsLane, /const MIN_BAR = 18;/);
  assert.match(clipsLane, /Math\.max\(MIN_BAR, toX\(c\.axis, end\) - x\)/);
});

test("B4-2: with no transcript the search box is read-only, not disabled, so Ctrl+F can focus it", () => {
  assert.match(transcriptCol, /readOnly=\{!hasTranscript\}/);
  assert.doesNotMatch(transcriptCol, /\sdisabled=\{!hasTranscript\}/);
});

test("a video that just opened shows its picture strip at once; the first-clip hint never hides it", () => {
  assert.match(sourceLane, /<Filmstrip axis=\{c\.axis\}/);
  assert.doesNotMatch(sourceLane, /firstClipHint \? null : <Filmstrip/);
  const strip = sourceLane.indexOf("<Filmstrip");
  assert.ok(strip > 0 && !/firstClipHint/.test(sourceLane.slice(strip - 80, strip)));
});

test("unsaved range: its bar carries Create clip and a remove ×; Esc clears it, never mid-drag or while typing", () => {
  assert.match(clipsLane, /const unsaved = !!c\.range && sections\.length === 1 && !c\.waiting\.some\(isBuilt\)/);
  assert.match(clipsLane, /Create clip · \{length\}/);
  assert.match(clipsLane, /aria-label="Remove this range \(Esc\)"/);
  assert.match(clipsLane, /onCreate=\{clipNow\.clip\}/);
  assert.match(clipsLane, /onRemove=\{c\.clearRange\}/);
  const esc = src.slice(src.indexOf("An unsaved range goes away"), src.indexOf("const lastScrub"));
  assert.match(esc, /e\.key !== "Escape"/);
  assert.match(esc, /!hasRange \|\| dragging/);
  assert.match(esc, /INPUT/);
  assert.match(esc, /clearRange\(\)/);
});

test("dragging the playhead, a new range or an edge to either end of a zoomed timeline scrolls it", () => {
  assert.match(src, /edgeScroll\(pointer\.current\.clientX - pointer\.current\.left, s\.width\)/);
  assert.match(src, /window\.setInterval\(\(\) => scrollRef\.current\(\), 40\)/);
  assert.match(src, /const scrolling = dragKind === "scrub" \|\| dragKind === "range" \|\| dragKind === "edge"/);
  assert.match(src, /tools\.zoom <= 0\) return/); // nothing to scroll at Fit
  assert.match(src, /s\.setFocus\(next\)/);
});

const filmstrip = readFileSync(new URL("../components/Filmstrip.tsx", import.meta.url), "utf8");

test("Fit and the far right keep end room; the view can go out; pointer times stay inside the video", () => {
  assert.match(src, /const padFrac = s\.width > 0 \? END_PAD_PX \/ s\.width : 0/);
  assert.match(src, /windowFor\(duration, tools\.zoom, s\.focus \?\? playhead, padFrac\)/);
  assert.match(src, /const inVideo = \(t: number \| null\)/);
  assert.match(src, /axisTicks\(axis, 110, \{ start: 0, end: duration \}\)/);
  assert.match(effects, /zoomForSpan\(a\.duration, w\.end - w\.start, a\.padFrac\)/);
  assert.match(filmstrip, /Math\.min\(p\.t1, duration \?\? p\.t1\)/);
  assert.match(sourceLane, /duration=\{c\.duration\}/);
});

test("the lane works out the over-cap line live from the range's length, and grows to hold it", () => {
  assert.match(clipsLane, /unsaved && c\.totalSeconds > MAX_CLIP_SECONDS \? overCapMessage\(c\.totalSeconds\) : ""/);
  assert.match(clipsLane, /\(overCap \? OVER_LINE_H : 0\)/);
  assert.match(clipsLane, /over=\{overCap\}/);
});
