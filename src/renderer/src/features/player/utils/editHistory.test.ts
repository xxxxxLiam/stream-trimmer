import assert from "node:assert/strict";
import test from "node:test";
import { createEditHistory } from "./editHistory";

const eq = (a: number, b: number) => a === b;

test("undo goes back one settled step and redo returns", () => {
  const h = createEditHistory<number>(eq);
  h.reset(0);
  h.change(1);
  h.settle();
  h.change(2);
  h.settle();
  assert.equal(h.undo(), 1);
  assert.equal(h.undo(), 0);
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 1);
  assert.equal(h.redo(), 2);
  assert.equal(h.redo(), null);
});

test("changes before a settle are one step (a drag)", () => {
  const h = createEditHistory<number>(eq);
  h.reset(0);
  h.change(1);
  h.change(2);
  h.change(3);
  assert.equal(h.undo(), 0);
  assert.equal(h.undo(), null);
});

test("a new edit after an undo drops the redo steps", () => {
  const h = createEditHistory<number>(eq);
  h.reset(0);
  h.change(1);
  h.settle();
  h.undo();
  assert.equal(h.get().canRedo, true);
  h.change(5);
  assert.equal(h.get().canRedo, false);
  assert.equal(h.undo(), 0);
});

test("the buttons' state: empty at the start, undo after an edit, redo after an undo", () => {
  const h = createEditHistory<number>(eq);
  h.reset(0);
  assert.deepEqual(h.get(), { canUndo: false, canRedo: false });
  h.change(1);
  assert.deepEqual(h.get(), { canUndo: true, canRedo: false });
  h.undo();
  assert.deepEqual(h.get(), { canUndo: false, canRedo: true });
});

test("reset forgets everything; a state equal to the current one is not an edit; the limit holds", () => {
  const h = createEditHistory<number>(eq, 3);
  h.reset(0);
  h.change(0);
  assert.equal(h.get().canUndo, false);
  for (let i = 1; i <= 6; i++) {
    h.change(i);
    h.settle();
  }
  let steps = 0;
  while (h.undo() !== null) steps++;
  assert.equal(steps, 3);
  h.reset(9);
  assert.deepEqual(h.get(), { canUndo: false, canRedo: false });
});
