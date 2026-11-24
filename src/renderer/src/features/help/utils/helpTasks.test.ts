import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CopyBlocks from "../../handoff/components/CopyBlocks";
import {
  ANCHORS,
  CHANNEL_HELP_TASKS,
  HELP_TASKS,
  MAX_DO_LENGTH,
  PENDING_PRECISE_ANCHORS,
  searchTasks,
  type HelpTask,
} from "./helpTasks";

const ALL: HelpTask[] = [...HELP_TASKS, ...CHANNEL_HELP_TASKS];
const ids = (r: HelpTask[]) => r.map((t) => t.id);

test("every task has 2 to 4 steps", () => {
  for (const t of ALL) {
    assert.ok(t.steps.length >= 2 && t.steps.length <= 4, `${t.id}: ${t.steps.length} steps`);
  }
});

test("no step is long: do <= 90 chars, why <= 90 chars, one line", () => {
  for (const t of ALL) {
    for (const s of t.steps) {
      assert.ok(s.do.length <= MAX_DO_LENGTH, `${t.id}: "${s.do}" is ${s.do.length}`);
      assert.ok(s.why.length <= MAX_DO_LENGTH, `${t.id}: why too long`);
      assert.ok(!/\n/.test(s.do + s.why), `${t.id}: multi-line step`);
      assert.ok(s.do.trim() && s.why.trim());
    }
  }
});

test("ids are unique and every anchor is a known, prefixed id", () => {
  assert.equal(new Set(ids(ALL)).size, ALL.length);
  // Channel anchors are literals in CHANNEL_HELP_TASKS (kept out of ANCHORS so a public
  // build carries no trace of them), so they are allowed by name here.
  const known = new Set<string>([
    ...Object.values(ANCHORS),
    "ui-channel-link",
    "ui-channel-start",
    "ui-channel-stop",
  ]);
  for (const t of ALL)
    for (const s of t.steps) {
      if (s.anchorId === null) continue;
      assert.ok(known.has(s.anchorId), `${t.id}: unknown anchor ${s.anchorId}`);
      assert.match(s.anchorId, /^(ui-[a-z0-9-]+|clips-[a-z-]+|panel-tab-[a-z]+|help-anchor-[a-z-]+)$/);
    }
});

test("catalogue covers the 16 starter tasks and avoids em dashes", () => {
  assert.ok(ALL.length >= 16);
  for (const t of ALL) {
    assert.match(t.title, /^[A-Z][a-z-]+ /, `${t.id} title is verb-first`);
    const text = JSON.stringify(t);
    assert.ok(!text.includes("—"), `${t.id} has an em dash`);
  }
});

test("each starter task is found by its natural phrase", () => {
  const cases: [string, string][] = [
    ["cut a clip", "cut-clip"],
    ["two moments into one clip", "stitch-two-moments"],
    ["find what was said", "find-by-words"],
    ["frame by frame", "nudge-edge"],
    ["has this been used", "check-unused"],
    ["reorder segments", "reorder-segments"],
    ["switch campaign", "switch-campaign"],
    ["where clips save", "change-clips-folder"],
    ["where exported data saves", "change-data-folder"],
    ["copy transcript for chat", "copy-transcript"],
    ["copy the script lines", "copy-script-lines"],
    ["insert honorific", "insert-symbol"],
    ["360p", "fix-360p"],
    ["recut saved clip", "recut-saved"],
    ["export channel data", "export-channel"],
    ["stop a run", "stop-run"],
  ];
  for (const [q, id] of cases) {
    assert.equal(ids(searchTasks(ALL, q))[0], id, `query "${q}"`);
  }
});

test("search matches aliases, ignores filler words and tolerates a typo", () => {
  assert.equal(ids(searchTasks(ALL, "bismillah"))[0], "insert-symbol");
  assert.equal(ids(searchTasks(ALL, "how do I stitch"))[0], "stitch-two-moments");
  assert.equal(ids(searchTasks(ALL, "campiagn"))[0], "switch-campaign");
});

test("title hits outrank alias hits", () => {
  const tasks: HelpTask[] = [
    { id: "alias", title: "Do thing", aliases: ["folder"], steps: [] },
    { id: "title", title: "Change folder", aliases: [], steps: [] },
  ];
  assert.deepEqual(ids(searchTasks(tasks, "folder")), ["title", "alias"]);
});

test("every query word must match; nonsense returns nothing; empty returns all", () => {
  assert.deepEqual(searchTasks(ALL, "zzzzqq"), []);
  assert.deepEqual(searchTasks(ALL, "cut zzzzqq"), []);
  assert.equal(searchTasks(ALL, "").length, ALL.length);
  assert.equal(searchTasks(ALL, "   the a ").length, ALL.length);
});

// ---------------------------------------------------------------------------------------------
// F-1: an anchor must be an element that exists, in the state the step puts the app in.
//
// The old test only checked that ids were spelled consistently, so 19 of 26 anchors named no
// element at all and shipped. This one reads the product source.
// ---------------------------------------------------------------------------------------------

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((f) => ({ path: relative(SRC, f), text: readFileSync(f, "utf8") }));
// handoff.ts is not a component but it names the Copy blocks ids.
const FILES_BY_PATH = new Map([
  ...FILES.map((f) => [f.path, f] as const),
  ["shared/utils/handoff.ts", { path: "shared/utils/handoff.ts", text: readFileSync(join(SRC, "shared", "utils", "handoff.ts"), "utf8") }] as const,
]);
/** Files that render the app. The catalogue itself and its test do not count as rendering. */
const RENDERING = FILES;

/** Every id some component writes as `id="x"` (a literal) in a rendering file. */
function literalIds(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const f of RENDERING) {
    for (const m of f.text.matchAll(/\bid="([A-Za-z][\w-]*)"/g)) {
      found.set(m[1], [...(found.get(m[1]) ?? []), f.path]);
    }
  }
  return found;
}

/**
 * Where each anchor lives and what the app must be doing for it to be on screen.
 * `file` is the component that renders it. `opener` is the anchor of the control that puts the app
 * in the needed state: the task must contain a step on that opener BEFORE the step that uses it.
 * `templated` is for ids built from a list (`clips-tab-${t.id}`).
 */
const WHERE: Record<string, { file: string; state: string; opener?: string; templated?: RegExp }> = {
  "ui-source-chip": { file: "modules/layout/components/AppHeader.tsx", state: "workspace screen" },
  "ui-campaign-chip": { file: "features/campaigns/components/CampaignChip.tsx", state: "always" },
  "ui-copy-blocks": { file: "modules/layout/components/AppHeader.tsx", state: "always" },
  "ui-symbols": { file: "modules/layout/components/AppHeader.tsx", state: "always" },
  "ui-footer-clips": { file: "modules/layout/components/AppFooter.tsx", state: "always" },
  "ui-footer-data": { file: "modules/layout/components/AppFooter.tsx", state: "always" },
  "ui-footer-format": { file: "modules/layout/components/AppFooter.tsx", state: "always" },
  "ui-panels-left": { file: "modules/layout/components/PanelWorkspace.tsx", state: "workspace screen" },
  "ui-panels-centre": { file: "modules/layout/components/PanelWorkspace.tsx", state: "workspace screen" },
  "ui-mark-in": { file: "features/clips/components/MarkBar.tsx", state: "workspace screen" },
  "ui-mark-out": { file: "features/clips/components/MarkBar.tsx", state: "workspace screen" },
  "ui-add-segment": { file: "features/clips/components/MarkBar.tsx", state: "workspace screen" },
  "ui-stitched-total": { file: "features/clips/components/MarkBar.tsx", state: "workspace screen" },
  "ui-overlap-warning": { file: "features/clips/components/MarkBar.tsx", state: "a marked range overlaps a used one" },
  "ui-cut": { file: "features/clips/components/MarkBar.tsx", state: "workspace screen" },
  "ui-copy-block-transcript": { file: "features/handoff/components/CopyBlocks.tsx", state: "Copy blocks open", opener: "ui-copy-blocks", templated: /id=\{`ui-copy-block-\$\{b\.id\}`\}/ },
  "ui-copy-block-script": { file: "features/handoff/components/CopyBlocks.tsx", state: "Copy blocks open", opener: "ui-copy-blocks", templated: /id=\{`ui-copy-block-\$\{b\.id\}`\}/ },
  "panel-tab-history": { file: "modules/layout/components/PanelTabStrip.tsx", state: "workspace screen", templated: /`panel-tab-\$\{id\}`/ },
  "clips-panel": { file: "features/downloads/components/HistoryPanel.tsx", state: "workspace screen", opener: "panel-tab-history" },
  "help-anchor-youtube-status": { file: "features/youtubeConnection/components/YouTubeStatusChip.tsx", state: "always (header)" },
  "help-anchor-clips-tabs": { file: "features/clips/components/ExportPanel.tsx", state: "workspace screen" },
  "ui-segment-list": { file: "features/clips/components/SegmentList.tsx", state: "at least one segment added" },
  "ui-timeline": { file: "features/player/components/Timeline.tsx", state: "workspace screen" },
  "ui-transcript-search": { file: "features/transcript/components/TranscriptColumn.tsx", state: "workspace screen" },
  "ui-transcript-lines": { file: "features/transcript/components/TranscriptColumn.tsx", state: "workspace screen" },
  "ui-campaign-list": { file: "features/campaigns/components/CampaignMenu.tsx", state: "campaign menu open", opener: "ui-campaign-chip" },
  "ui-symbol-list": { file: "features/handoff/components/SymbolPalette.tsx", state: "Symbols open", opener: "ui-symbols" },
  "ui-saved-clip": { file: "features/downloads/components/HistoryPanel.tsx", state: "History tab, at least one clip saved", opener: "panel-tab-history", templated: /id=\{g === h\.groups\[0\] && e === g\.entries\[0\] \? "ui-saved-clip" : undefined\}/ },
  // Channel screens, present only in a build with the exporter.
  "ui-channel-start": { file: "features/channelExport/components/ChannelExportPanel.tsx", state: "channel exporter open, not running" },
  "ui-channel-stop": { file: "features/channelExport/components/ChannelExportPanel.tsx", state: "channel export running" },
  "ui-channel-link": { file: "modules/layout/components/AppHeader.tsx", state: "channel exporter built in" },
};

const used = (): { task: HelpTask; index: number; id: string }[] =>
  ALL.flatMap((task) =>
    task.steps.flatMap((s, index) => (s.anchorId ? [{ task, index, id: s.anchorId }] : [])),
  );

test("F-1: every anchor a step uses is declared in WHERE with the component and state", () => {
  for (const { task, index, id } of used()) {
    assert.ok(WHERE[id], `${task.id} step ${index + 1} uses ${id}, which this test does not know how to find`);
  }
});

test("F-1: every anchor is rendered by the component that is meant to render it", () => {
  const literals = literalIds();
  for (const id of new Set(used().map((u) => u.id))) {
    const w = WHERE[id];
    const file = FILES.find((f) => f.path === w.file);
    assert.ok(file, `${id}: ${w.file} does not exist`);
    if (w.templated) {
      assert.match(file.text, w.templated, `${id}: ${w.file} no longer builds this id from its list`);
      // The list the template is built from must still contain the suffix this anchor needs.
      if (!id.startsWith("clips-tab-") && !id.startsWith("ui-copy-block-")) continue;
      const tab = id.startsWith("clips-tab-");
      const suffix = id.slice((tab ? "clips-tab-" : "ui-copy-block-").length);
      const producerFile = tab ? file : FILES_BY_PATH.get("shared/utils/handoff.ts");
      assert.ok(producerFile, "producer file missing");
      assert.match(producerFile.text, tab ? new RegExp(`id: "${suffix}"`) : new RegExp(`mk\\("${suffix}"`), `${id}: nothing produces "${suffix}"`);
    } else {
      assert.ok(
        (literals.get(id) ?? []).includes(w.file),
        `${id} is not an id="${id}" in ${w.file} (found in: ${(literals.get(id) ?? []).join(", ") || "nowhere in src/"})`,
      );
    }
  }
});

test("F-1: an anchor that needs an open panel or tab has its opener earlier in the same task", () => {
  for (const { task, index, id } of used()) {
    const opener = WHERE[id].opener;
    if (!opener) continue;
    const before = task.steps.slice(0, index).map((s) => s.anchorId);
    assert.ok(before.includes(opener), `${task.id} step ${index + 1} needs ${WHERE[id].state}: add an earlier step on ${opener}`);
  }
});

test("F-1: the components this file owns really render their anchors when the panel is open", () => {
  const lines = [{ start: 0, end: 4, text: "hello there" }];
  const open = renderToStaticMarkup(
    createElement(CopyBlocks, { open: true, onClose: () => {}, input: { lines, segments: [{ start: 0, end: 4 }], videoId: "abcdefghijk" } }),
  );
  for (const id of ["ui-copy-block-transcript", "ui-copy-block-script"]) {
    assert.match(open, new RegExp(`id="${id}"`), `${id} missing from the open Copy blocks panel`);
  }
  const closed = renderToStaticMarkup(createElement(CopyBlocks, { open: false, onClose: () => {} }));
  assert.equal(closed, "", "closed Copy blocks renders nothing, so its anchors are state dependent");
});

test("F-1: no step points at an id that no element carries", () => {
  const all = new Set(FILES.flatMap((f) => [...f.text.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => m[1])));
  const templated = (id: string) => Object.entries(WHERE).some(([k, w]) => k === id && w.templated);
  const dead = used().filter((u) => !all.has(u.id) && !templated(u.id));
  assert.deepEqual(dead.map((d) => `${d.task.id}#${d.index + 1}:${d.id}`), []);
});

test("item 10: every precise id T8 asked for now exists, so the pending list is empty", () => {
  const wanted = [
    "help-anchor-youtube-status", "ui-segment-list", "ui-timeline",
    "ui-transcript-search", "ui-transcript-lines", "ui-campaign-list", "ui-symbol-list",
    "ui-saved-clip", "ui-channel-start", "ui-channel-stop",
  ];
  const usedIds = new Set(used().map((u) => u.id));
  for (const id of wanted) assert.ok(usedIds.has(id), `${id} is not used by any step`);
  assert.deepEqual(Object.keys(PENDING_PRECISE_ANCHORS), []);
  // SetupChecklist (F-18) clicks these two by id; they must exist for it to work.
  const literals = literalIds();
  assert.ok((literals.get("help-anchor-youtube-status") ?? []).includes("features/youtubeConnection/components/YouTubeStatusChip.tsx"));
  assert.ok((literals.get("help-anchor-clips-tabs") ?? []).includes("features/clips/components/ExportPanel.tsx"));
  const checklist = FILES.find((f) => f.path === "features/help/components/SetupChecklist.tsx")!.text;
  assert.match(checklist, /getElementById\("help-anchor-youtube-status"\)/);
  assert.match(checklist, /getElementById\("help-anchor-clips-tabs"\)/);
});

test("F-1: wished-for ids are not used yet, and still do not exist (move them when they do)", () => {
  const literals = literalIds();
  const usedIds = new Set(used().map((u) => u.id));
  for (const id of Object.keys(PENDING_PRECISE_ANCHORS)) {
    assert.ok(!usedIds.has(id), `${id} is pending but a step already uses it`);
    assert.ok(!literals.has(id), `${id} now exists in ${literals.get(id)?.join(", ")}: move it into ANCHORS and re-point the step`);
  }
});

test("steps with no anchor are the ones that happen outside the app or await an id, and nothing else", () => {
  const got = ALL.flatMap((t) => t.steps.flatMap((s, i) => (s.anchorId === null ? [`${t.id}#${i + 1}`] : []))).sort();
  assert.deepEqual(got, [
    "fix-360p#2", // happens in the user's browser
    "fix-360p#3", // dropped onto the whole window
  ]);
});

test("the catalogue has no dead-id class: ids from the old catalogue are gone", () => {
  for (const dead of [
    "ui-primary-action",
    "help-anchor-timeline",
    "help-anchor-mark-in",
    "help-anchor-segment-list",
    "help-anchor-clips-tabs",
  ]) {
    assert.ok(!JSON.stringify([ANCHORS, ALL]).includes(`"${dead}"`), `${dead} is back in the catalogue`);
  }
});
