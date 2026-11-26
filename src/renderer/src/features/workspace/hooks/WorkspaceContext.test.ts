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

import { readFileSync } from "node:fs";

test("Liam 25 Nov: a link pasted into the top bar is selected while it opens; a failure returns to the previous video and keeps the workspace and the field says why", () => {
  const ctx = readFileSync(new URL("./WorkspaceContext.tsx", import.meta.url), "utf8");
  const add = readFileSync(new URL("./useAddVideoController.ts", import.meta.url), "utf8");
  const field = readFileSync(new URL("../components/TopBarLinkField.tsx", import.meta.url), "utf8");
  // addTab with a link selects the new tab at once (Liam 26 Nov), so something visibly happens while it opens.
  assert.match(ctx, /if \(link\) \{[\s\S]*?setOpeningId\(id\);\s*\}\s*setActiveId\(id\);/);
  // A failed open goes back to the video that was open before it.
  assert.match(ctx, /failOpening[\s\S]*?if \(activeRef\.current === id\) \{[\s\S]*?if \(target\) setActiveId\(target\);/);
  // Once opened it stays selected, unless the user went elsewhere meanwhile.
  assert.match(ctx, /if \(openingRef\.current === id\) \{[\s\S]*?if \(activeRef\.current === cameFromRef\.current\[id\]\) setActiveId\(id\);/);
  // A failed open drops the tab, stays put, and hands the reason to the field.
  assert.match(ctx, /failOpening[\s\S]*?setOpenFailure\(message \|\| "That link did not open\."\);[\s\S]*?setTabs\(\(prev\) => prev\.filter\(\(t\) => t\.id !== id\)\);/);
  assert.match(ctx, /else if \(url && openError && !loadingInfo\) ws\.failOpening\(id, openError\);/);
  assert.match(add, /problem: problem \|\| ws\.openFailure/);
  assert.match(add, /if \(ws\.opening\) return;/);
  assert.match(field, /Opening the video\. You stay here until it is ready\./);
});

test("Liam 26 Nov (board 03.1.4): the top field is always empty and clears on paste; the opening video is a card with the link and the sliding line; the title sits in the preview header", () => {
  const field = readFileSync(new URL("../components/TopBarLinkField.tsx", import.meta.url), "utf8");
  const add = readFileSync(new URL("./useAddVideoController.ts", import.meta.url), "utf8");
  const videos = readFileSync(new URL("../components/VideosPanel.tsx", import.meta.url), "utf8");
  const vctl = readFileSync(new URL("./useVideosController.ts", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../../player/components/PreviewPanel.tsx", import.meta.url), "utf8");
  assert.match(field, /value=\{c\.text\}/);
  assert.doesNotMatch(field, /c\.title/);
  assert.match(add, /ws\.addTab\(action\.target\);\s*setTextState\(""\);/);
  assert.match(vctl, /openingLabel/);
  assert.match(videos, /\{v\.openingLabel\}/);
  assert.match(videos, /<PreparingLine \/>/);
  assert.match(preview, /mx-\[20px\] min-w-\[0px\] flex-1 truncate text-center/);
});
