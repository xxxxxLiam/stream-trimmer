/**
 * File: WorkspaceContext.test.ts
 * Path: src/renderer/src/features/workspace/hooks/WorkspaceContext.test.ts
 * Description: B-8 — what a tab remembers across a relaunch and across close/reopen.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyTabWork, parsePersisted, reinsertTab, type WorkspaceTab } from "./WorkspaceContext";

test("B-8: the stored workspace keeps each tab's link and unsaved segments across a relaunch", () => {
  const stored = JSON.parse(
    JSON.stringify({
      tabs: [
        { id: "a", name: "Interview", url: "https://www.youtube.com/watch?v=AAA", segments: [{ start: 10, end: 20 }, { start: 60, end: 90 }] },
        { id: "b", name: "" },
      ],
      activeId: "a",
    }),
  );
  const back = parsePersisted(stored);
  assert.ok(back);
  assert.equal(back.tabs[0].url, "https://www.youtube.com/watch?v=AAA");
  assert.deepEqual(back.tabs[0].segments, [{ start: 10, end: 20 }, { start: 60, end: 90 }]);
  assert.equal(back.tabs[1].url, undefined);
  assert.equal(back.activeId, "a");
});

test("B-8: junk in the stored record is dropped, not trusted", () => {
  const back = parsePersisted({
    tabs: [{ id: "a", name: 5, url: 7, segments: [{ start: 5, end: 1 }, { start: "x", end: 2 }, { start: 1, end: 2 }] }],
    activeId: "zzz",
  } as never);
  assert.ok(back);
  assert.equal(back.tabs[0].name, "");
  assert.equal(back.tabs[0].url, undefined);
  assert.deepEqual(back.tabs[0].segments, [{ start: 1, end: 2 }]);
  assert.equal(back.activeId, "a");
  assert.equal(parsePersisted(null), null);
});

test("B-8: applyTabWork records a tab's work and is a no-op when nothing changed", () => {
  const tabs: WorkspaceTab[] = [{ id: "a", name: "" }, { id: "b", name: "" }];
  const next = applyTabWork(tabs, "a", { url: "u", segments: [{ start: 1, end: 2 }] });
  assert.deepEqual(next[0].segments, [{ start: 1, end: 2 }]);
  assert.equal(next[0].url, "u");
  assert.equal(next[1], tabs[1]);
  assert.equal(applyTabWork(next, "a", { url: "u", segments: [{ start: 1, end: 2 }] }), next);
});

test("B-8: a closed tab goes back where it was, with its work, and only once", () => {
  const closed = { tab: { id: "b", name: "x", url: "u", segments: [{ start: 1, end: 2 }] }, index: 1 };
  const tabs: WorkspaceTab[] = [{ id: "a", name: "" }, { id: "c", name: "" }];
  const back = reinsertTab(tabs, closed);
  assert.deepEqual(back.map((t) => t.id), ["a", "b", "c"]);
  assert.deepEqual(back[1].segments, [{ start: 1, end: 2 }]);
  assert.equal(reinsertTab(back, closed), back);
});

test("a video folded into Done stays Done across a relaunch", () => {
  const parsed = parsePersisted(
    JSON.parse(JSON.stringify({ tabs: [{ id: "a", name: "", done: true }, { id: "b", name: "" }], activeId: "b" })),
  );
  assert.equal(parsed?.tabs[0].done, true);
  assert.equal(parsed?.tabs[1].done, undefined);
});

test("B-11: the picked In and Out are saved with the video and survive a relaunch", () => {
  const tabs: WorkspaceTab[] = [{ id: "a", name: "" }];
  const saved = applyTabWork(tabs, "a", {
    url: "https://www.youtube.com/watch?v=AAA",
    segments: [],
    picked: { start: "1:12:04", end: "1:12:46" },
  });
  assert.deepEqual(saved[0].picked, { start: "1:12:04", end: "1:12:46" });
  const back = parsePersisted(JSON.parse(JSON.stringify({ tabs: saved, activeId: "a" })));
  assert.ok(back);
  assert.deepEqual(back.tabs[0].picked, { start: "1:12:04", end: "1:12:46" });
  // Nothing picked clears it again.
  const cleared = applyTabWork(saved, "a", { url: "https://www.youtube.com/watch?v=AAA", segments: [], picked: { start: "", end: "" } });
  assert.equal(cleared[0].picked, undefined);
});
