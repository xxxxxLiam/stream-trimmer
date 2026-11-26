import assert from "node:assert/strict";
import test from "node:test";
import { editAction, ownsUndo } from "./editKeys";

const k = (key: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...o,
});

test("Cmd+Z undoes and Shift+Cmd+Z redoes on a Mac; Ctrl alone means nothing there", () => {
  assert.equal(editAction(k("z", { metaKey: true }), true), "undo");
  assert.equal(editAction(k("Z", { metaKey: true, shiftKey: true }), true), "redo");
  assert.equal(editAction(k("z", { ctrlKey: true }), true), null);
  assert.equal(editAction(k("y", { metaKey: true }), true), null);
});

test("Ctrl+Z, Shift+Ctrl+Z and Ctrl+Y on Windows and Linux; a bare Z or Alt chord is not ours", () => {
  assert.equal(editAction(k("z", { ctrlKey: true }), false), "undo");
  assert.equal(editAction(k("Z", { ctrlKey: true, shiftKey: true }), false), "redo");
  assert.equal(editAction(k("y", { ctrlKey: true }), false), "redo");
  assert.equal(editAction(k("z"), false), null);
  assert.equal(editAction(k("z", { ctrlKey: true, altKey: true }), false), null);
});

test("a text field keeps its own undo", () => {
  assert.equal(ownsUndo({ tagName: "INPUT" }), true);
  assert.equal(ownsUndo({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(ownsUndo({ tagName: "BUTTON" }), false);
  assert.equal(ownsUndo(null), false);
});
