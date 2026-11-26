/**
 * File: useTimelineController.test.ts
 * Description: Source-level guards for how the lane answers the pointer (the hook needs a DOM to run):
 *   the pointer tool seeks on press and scrubs on drag and never sets a range; the scissors set the range
 *   and never seek; the lane listens for the wheel.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("V18-T-8: the zoom slider drags and has a 36 px hit area (Design v145)", () => {
  assert.match(tools, /onPointerMove=\{\(e\) => \{\s*if \(e\.buttons !== 1\) return/);
  assert.match(tools, /setPointerCapture/);
  assert.match(tools, /h-\[36px\] w-\[96px\]/);
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

test("the Clips lane draws only the active clip, never the bank's waiting or made moments", () => {
  assert.doesNotMatch(clipsLane, /c\.waiting\.map\(/);
  assert.doesNotMatch(clipsLane, /c\.used\.map\(/);
  assert.match(clipsLane, /const named: \{ key: string[^\n]*\[\];/);
});

test("B4-1: a stacked bar keeps a readable name beside the stack for the built clip", () => {
  assert.equal((clipsLane.match(/\{stackedLabel\(/g) ?? []).length, 1);
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

test("unsaved range: its bar carries Create clip and a remove ×; Esc and a click never clear it", () => {
  assert.match(clipsLane, /const unsaved = !!c\.range && sections\.length === 1 && !c\.waiting\.some\(isBuilt\)/);
  assert.match(clipsLane, /Create clip · \{length\}/);
  assert.match(clipsLane, /aria-label="Remove this range"/);
  assert.match(clipsLane, /onCreate=\{clipNow\.clip\}/);
  assert.match(clipsLane, /onRemove=\{c\.clearRange\}/);
  assert.doesNotMatch(src, /e\.key !== "Escape" \|\| e\.defaultPrevented/, "Esc never clears the selection");
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

test("the selection outline sits exactly on the picture strip's top and bottom lines, no padding", () => {
  const inset = Number(/export const STRIP_INSET = (\d+);/.exec(sourceLane)?.[1]);
  assert.ok(inset > 0);
  assert.match(filmstrip, new RegExp(`top: ${inset}, bottom: ${inset}`), "the strip is inset by the same amount");
  assert.match(sourceLane, /top: STRIP_INSET, bottom: STRIP_INSET/);
  assert.doesNotMatch(sourceLane, /top: c\.joined \? 12 : 3/);
  assert.doesNotMatch(sourceLane, /left: x - 3/);
});

test("pointer tool: pressing a selected range's body on the Source lane moves it (length kept); a grabbed edge resizes; no move means a click seek", () => {
  assert.match(down, /target\.closest\('\[data-lane="source"\]'\)/);
  assert.match(down, /kind: "move", grab: t - hit\.r\.start, len: hit\.r\.end - hit\.r\.start/);
  assert.match(down, /pickSection\(/);
  assert.match(src, /const r = movedRange\(d\.len, d\.grab, t, duration\);\s*clipper\.setRangeFromSeconds\(r\.start, r\.end\)/);
  assert.match(src, /if \(!d\.moved\) \{[\s\S]*?clipper\.requestSeek\(Math\.round\(d\.pressedAt\)\)/);
});

test("a locked section is movable too: it is promoted to the selected range, the old one locks, Esc puts all back", () => {
  assert.match(down, /if \(range\) store\.add\(range, /);
  assert.match(down, /store\.remove\(hit\.id\)/);
  assert.match(src, /store\.load\(before\.segments\)/);
});

test("a moved range touching another section reads as one and joins only on release; Esc and edge scroll cover the move", () => {
  assert.match(src, /touching\(range, store\.segments, TOUCH_PX \* /);
  assert.match(src, /if \(joinable && mergeHint\) \{[\s\S]*store\.remove\(i\)[\s\S]*clipper\.setRangeFromSeconds\(mergeHint\.union\.start, mergeHint\.union\.end\)/);
  assert.match(src, /dragKind !== "move"\) return;/);
  assert.match(src, /dragKind === "move"/);
  assert.match(sourceLane, /Joins when you let go/);
});

test("a range drawn with the Range tool, or a resized handle, joins any section it touches on release, like a move does", () => {
  assert.match(src, /const shaping = movingDrag \|\| s\.drag\?\.kind === "edge" \|\| s\.drag\?\.kind === "range" \? s\.drag : null;/);
  assert.match(src, /shaping && range && s\.width > 0 \? touching\(range, store\.segments/);
  assert.match(src, /const joinable = d\?\.kind === "edge" \|\| d\?\.kind === "range" \|\| \(d\?\.kind === "move" && d\.moved\);\s*if \(joinable && mergeHint\) \{[\s\S]*store\.remove\(i\)[\s\S]*clipper\.setRangeFromSeconds\(mergeHint\.union\.start, mergeHint\.union\.end\)/);
  // While it overlaps, the lanes show the one range, not two with a seam.
  assert.match(src, /sections: shownSections,/);
});

test("handles: the Pointer and the Range tool show a hover, and a held handle shows as pressed", () => {
  assert.match(src, /\(tools\.tool === "pointer" \|\| tools\.tool === "range"\)[\s\S]*grabbedEdge\(x, toX\(axis, r\.start\), toX\(axis, r\.end\)\)/);
  assert.match(src, /hoverGrip: s\.drag \? null : hoverGrip,/);
  assert.match(src, /pressedGrip: s\.drag\?\.kind === "edge"/);
  assert.match(sourceLane, /state === "pressed" \? "w-\[3px\][^"]*scale-y-90 bg-ice" : state === "hover" \? "w-\[6px\][^"]*bg-frost"/);
  assert.match(lane, /cursor-ew-resize/);
  assert.match(lane, /onPointerLeave=\{c\.onLanePointerLeave\}/);
});

test("Liam 26 Nov: the loaded bank clip's edge edits write to the bank item; an added section grows the item and keeps the link", () => {
  assert.match(src, /bankStore\.setSegments\(active\.id, videoId, bankId, sections\)/);
  assert.match(src, /sections\.length !== item\.segments\.length && range\) return;/);
  assert.doesNotMatch(src, /sections\.length !== item\.segments\.length\) return detachBank\(\)/);
  const mut = readFileSync(new URL("../../clips/hooks/useExportMutations.ts", import.meta.url), "utf8");
  assert.match(mut, /seg\.load\(clip\.segments, clip\.id\)/);
});

test("Liam 26 Nov: Only the trash (and a finished Clip) clears the whole selection, loaded sections included; a made bank clip leaves the timeline empty", async () => {
  const esc = src.slice(src.indexOf("An unsaved range goes away"), src.indexOf("const lastScrub"));
  assert.doesNotMatch(esc, /Escape/);
  assert.match(esc, /const clearSelection = \(\) => \{\s*clearRange\(\);\s*store\.clear\(\);/);
  const mut = readFileSync(new URL("../../clips/hooks/useExportMutations.ts", import.meta.url), "utf8");
  assert.match(mut, /if \(seg\.store\.get\(\)\.bankId === clip\.id\) \{\s*seg\.clear\(\);\s*setStartText\(""\);\s*setEndText\(""\);/);
  // The store half is real behaviour: clear() empties loaded sections and ends the bank link.
  const { createSegmentStore } = await import("../../../shared/hooks/useSegmentsState");
  const store = createSegmentStore();
  store.load([{ start: 10, end: 20 }], "B01");
  assert.equal(store.get().bankId, "B01");
  store.clear();
  assert.deepEqual(store.get().segments, []);
  assert.equal(store.get().bankId, null);
});

test("board 03.2.49 B: a selected clip has a 32px Delete clip trash just outside its bar; it deletes the range and its waiting card", () => {
  const lane2 = readFileSync(new URL("../components/ClipsLane.tsx", import.meta.url), "utf8");
  assert.match(lane2, /aria-label="Delete clip"/);
  assert.match(lane2, /size-\[32px\][^"]*border-hairlineStrong bg-raised text-fg-dim/);
  assert.match(lane2, /Math\.min\(sp\.left \+ sp\.width \+ 6, c\.width - 32\)/, "6px gap outside the right edge, kept on the lane when the bar runs to its end");
  assert.match(lane2, /onClick=\{c\.deleteClip\}/);
  assert.match(src, /bankStore\.remove\(active\.id, videoId, id\);\s*\}\s*clearSelection\(\);/);
  const down2 = src.slice(src.indexOf("const onLanePointerDown"), src.indexOf("const onLanePointerMove"));
  assert.doesNotMatch(down2.slice(down2.indexOf("A click never clears")).slice(0, 220), /clearSelection\(\)/, "a click on the timeline only moves the playhead");
  const mut = readFileSync(new URL("../../clips/hooks/useExportMutations.ts", import.meta.url), "utf8");
  assert.match(mut, /if \(timelineEmpty && selectedId\) setSelectedId\(null\)/, "Clip, Esc or the trash leaves no bank row selected");
});

test("Liam 26 Nov, canvas v143: the timeline is Transcript, Source and Clips only; no Audio lane anywhere", () => {
  const tl = readFileSync(new URL("../components/Timeline.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(tl, /AudioLanes|useAudioLanes/);
  assert.match(tl, /<TranscriptLane[\s\S]*<SourceLane[\s\S]*<ClipsLane/);
  const menu = readFileSync(new URL("../../../modules/layout/components/PanelsMenu.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(menu, /Audio lanes|audio-lanes/);
  assert.doesNotMatch(src, /audioLanes/);
  assert.equal(existsSync(new URL("../components/AudioLanes.tsx", import.meta.url)), false);
});

test("canvas v144 timeline measures: panel padding 8, Transcript 32, Source 76, Clips 34, trash 32 at top 1", () => {
  const tl = readFileSync(new URL("../components/Timeline.tsx", import.meta.url), "utf8");
  assert.match(tl, /bg-panel pb-\[8px\]/);
  const lane2 = readFileSync(new URL("../components/ClipsLane.tsx", import.meta.url), "utf8");
  assert.match(lane2, /absolute top-\[1px\] inline-flex size-\[32px\]/);
  const tr = readFileSync(new URL("../components/TranscriptLane.tsx", import.meta.url), "utf8");
  assert.match(tr, /h-\[32px\]/);
});

test("Source grips are children of the section box, flush with the outline and its full height", () => {
  assert.match(sourceLane, /-left-\[2px\]/);
  assert.match(sourceLane, /-right-\[2px\]/);
  assert.match(sourceLane, /<Grip side="left"/);
  assert.doesNotMatch(sourceLane, /STRIP_INSET \+ 6/);
});

test("a joined clip's fold is only the fit: zooming in leaves it so the handles can be adjusted by seconds", () => {
  assert.match(src, /joined && !s\.foldOpen && tools\.zoom <= 0 \? foldedAxis/);
});

test("Design v145: Snap pill decides whether handles snap to the transcript; the drag label and per-section trash exist", () => {
  const tools = readFileSync(new URL("../components/TimelineTools.tsx", import.meta.url), "utf8");
  assert.match(tools, /aria-pressed=\{snap\}/);
  assert.match(tools, /h-\[45px\]/);
  assert.match(tools, /ui-playhead-time/);
  assert.match(src, /tools\.snap \? Math\.round\(snapToWord\(lines, t, edge\)\) : Math\.round\(t\)/);
  assert.match(sourceLane, /Delete section \$\{i \+ 1\}/);
  assert.match(sourceLane, /c\.dragEdge/);
  assert.match(sourceLane, /size-\[22px\]/);
  assert.match(sourceLane, / long</);
  assert.match(src, /store\.segments\.length === 1 && !range\) deleteClip\(\)/);
});

test("Design v146: Select moments is in the Export menu, ticks cards, and deletes after one confirm", () => {
  const group = readFileSync(new URL("../../../modules/layout/components/PanelGroup.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../clips/components/ExportPanel.tsx", import.meta.url), "utf8");
  assert.match(group, /label: "Select moments"/);
  assert.match(panel, /Select all/);
  assert.match(panel, /Delete \{chosen\.length\}\? This can't be undone/);
  assert.match(panel, /chosen\.forEach\(\(x\) => c\.remove\(x\)\)/);
});
