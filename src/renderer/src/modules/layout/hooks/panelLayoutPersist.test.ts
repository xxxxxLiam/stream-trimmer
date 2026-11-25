/**
 * File: panelLayoutPersist.test.ts
 * Description: F-8: a divider dragged with the mouse is saved when the drag ends.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { forgetPanelLayoutForTest, resizePanel } from "./usePanelLayoutState";
import { registerPanel } from "../utils/panelRegistry";
import { LAYOUT_KEY } from "../utils/panelLayout";

test("F-8: the end of a drag writes the size; moving mid-drag does not", () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  const C = () => null;
  for (const [id, group] of [["videos", "left"], ["export", "right"], ["preview", "centre"], ["timeline", "centre"]] as const) {
    registerPanel({ id, title: id, group, component: C });
  }
  forgetPanelLayoutForTest();
  resizePanel("left", 360, 1600, false); // mid-drag
  resizePanel("left", 380, 1600, false);
  assert.equal(store.get(LAYOUT_KEY), undefined, "nothing written while the pointer is moving");
  resizePanel("left", 380, 1600, true); // pointer up: the size is already 380
  const saved = JSON.parse(store.get(LAYOUT_KEY)!);
  assert.equal(saved.sizes.left, 380);
  delete (globalThis as any).window;
});
