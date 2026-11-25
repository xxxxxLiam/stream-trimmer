/**
 * File: workspaceShortcuts.test.ts
 * Path: src/renderer/src/features/workspace/utils/workspaceShortcuts.test.ts
 * Description: B-13 — the browser tab chords are gone; switching between videos still works.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { workspaceShortcut } from "./workspaceShortcuts";

const chord = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...o,
});

test("B-13: Ctrl+T, Ctrl+W and Ctrl+Shift+T do nothing (and Cmd on macOS)", () => {
  assert.equal(workspaceShortcut(chord("t"), 3), null);
  assert.equal(workspaceShortcut(chord("w"), 3), null);
  assert.equal(workspaceShortcut(chord("T", { shiftKey: true }), 3), null);
  assert.equal(workspaceShortcut(chord("w", { ctrlKey: false, metaKey: true }), 3), null);
});

test("B-13: Ctrl+number and Ctrl+Tab still move between videos", () => {
  assert.deepEqual(workspaceShortcut(chord("2"), 3), { kind: "select", index: 1 });
  assert.deepEqual(workspaceShortcut(chord("Tab", { shiftKey: true }), 3), { kind: "step", back: true });
  assert.equal(workspaceShortcut(chord("2", { altKey: true }), 3), null);
});
