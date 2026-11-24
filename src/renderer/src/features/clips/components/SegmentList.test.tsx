/**
 * File: SegmentList.test.tsx
 * Path: src/renderer/src/features/clips/components/SegmentList.test.tsx
 * Description: B-7 — while a cut runs the segment list is frozen (rendered, server-side).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SegmentList from "./SegmentList";
import { SegmentStoreContext, createSegmentStore } from "../../../shared/hooks/useSegmentsState";

function render(locked: boolean) {
  const store = createSegmentStore();
  store.setLocked(locked);
  return renderToStaticMarkup(
    createElement(
      SegmentStoreContext.Provider,
      { value: store },
      createElement(SegmentList, {
        segments: [{ start: 2, end: 5 }, { start: 20, end: 24 }],
        onMove: () => {},
        onRemove: () => {},
      }),
    ),
  );
}

test("B-7: remove buttons are disabled and rows not draggable while locked", () => {
  const locked = render(true);
  assert.equal((locked.match(/aria-label="Remove segment \d"[^>]*disabled=""/g) ?? []).length, 2);
  assert.doesNotMatch(locked, /draggable="true"/);
});

test("B-7: unlocked list keeps live remove buttons and draggable rows", () => {
  const open = render(false);
  assert.doesNotMatch(open, /aria-label="Remove segment \d"[^>]*disabled=""/);
  assert.match(open, /draggable="true"/);
});
