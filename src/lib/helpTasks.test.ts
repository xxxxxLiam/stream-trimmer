import test from "node:test";
import assert from "node:assert/strict";
import {
  ANCHORS,
  CHANNEL_HELP_TASKS,
  HELP_TASKS,
  MAX_DO_LENGTH,
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
    "help-anchor-channel-start",
    "help-anchor-channel-stop",
  ]);
  for (const t of ALL)
    for (const s of t.steps) {
      assert.ok(known.has(s.anchorId), `${t.id}: unknown anchor ${s.anchorId}`);
      assert.match(s.anchorId, /^(help-anchor|ui)-[a-z0-9-]+$/);
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
