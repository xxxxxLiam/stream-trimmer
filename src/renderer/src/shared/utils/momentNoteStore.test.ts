import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bankedTwin } from "./momentNoteStore";

test("V18-M-3: a range that is already banked is found, whatever it is called", () => {
  const clips = [{ label: "Podcast Long", segments: [{ start: 10, end: 40 }] }];
  assert.equal(bankedTwin(clips, [{ start: 10.1, end: 40 }])?.label, "Podcast Long");
  assert.equal(bankedTwin(clips, [{ start: 11, end: 40 }]), undefined);
  assert.equal(bankedTwin(clips, [{ start: 10, end: 20 }, { start: 30, end: 40 }]), undefined);
});

test("Add a moment says what it did, and does not add a range twice", () => {
  const app = readFileSync(new URL("../../routes/App.tsx", import.meta.url), "utf8");
  assert.match(app, /bankedTwin\(/);
  assert.match(app, /showMomentNote\(/);
  assert.match(readFileSync(new URL("../../features/clips/components/ExportPanel.tsx", import.meta.url), "utf8"), /useMomentNote\(\)/);
});
