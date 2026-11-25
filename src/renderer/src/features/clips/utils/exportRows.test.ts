import assert from "node:assert/strict";
import test from "node:test";
import type { BankedClip } from "../../../shared/utils/bank";
import { boardTime, makingText, rangeLine, suggestedNextId, undoRingDash, undoText, waitingClips } from "./exportRows";

const clip = (id: string, over: Partial<BankedClip> = {}): BankedClip => ({
  id,
  label: id,
  segments: [{ start: 4324, end: 4366 }],
  status: "banked",
  ...over,
});

test("waiting rows are only the banked ones", () => {
  const list = [clip("a"), clip("b", { status: "cut" }), clip("c", { status: "published" }), clip("d")];
  assert.deepEqual(waitingClips(list).map((c) => c.id), ["a", "d"]);
});

test("suggested next is the best rated, else the first", () => {
  assert.equal(suggestedNextId([clip("a", { rating: 7 }), clip("b", { rating: 9.1 }), clip("c", { rating: 8.4 })]), "b");
  assert.equal(suggestedNextId([clip("a"), clip("b")]), "a");
  assert.equal(suggestedNextId([]), null);
});

test("the range line matches the board", () => {
  assert.equal(boardTime(4324), "1:12:04");
  assert.equal(rangeLine(clip("a")), "1:12:04–1:12:46 · 0:42");
  assert.equal(
    rangeLine(clip("a", { segments: [{ start: 10, end: 20 }, { start: 30, end: 40 }] })),
    "0:00:10–0:00:20 +1 · 0:20",
  );
});

test("Making says Preparing, then the percentage", () => {
  assert.equal(makingText(0, "downloading"), "Preparing");
  assert.equal(makingText(58.4, "downloading"), "Making · 58%");
  assert.equal(makingText(100, "processing"), "Finishing up");
});

test("the Undo ring drains over 8 seconds and the text counts down", () => {
  assert.equal(undoRingDash(5), "58.9 94.2");
  assert.equal(undoRingDash(8), "94.2 94.2");
  assert.equal(undoRingDash(0), "0.0 94.2");
  assert.equal(undoText(5), "Undo · 5 s left");
  assert.equal(undoText(4.2), "Undo · 5 s left");
});

test("the empty sentence uses this computer's key", async () => {
  const { emptyExportText } = await import("./exportRows");
  assert.match(emptyExportText(true), /⌘B/);
  assert.match(emptyExportText(false), /Ctrl B/);
});
