/**
 * File: restoredNote.test.ts
 * Description: E-3. The quiet line after settings were restored from the backup.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { restoredNote } from "./restoredNote";

test("nothing restored: no line; a time reads as one sentence", () => {
  assert.equal(restoredNote(null), "");
  assert.match(restoredNote("2026-11-25T03:00:00Z", "en-US"), /^Clipr restored your settings from .+\.$/);
  assert.equal(restoredNote("not a date"), "Clipr restored your settings from a backup.");
});

test("the shell shows the line on launch", () => {
  const app = readFileSync(new URL("../../../routes/App.tsx", import.meta.url), "utf8");
  assert.match(app, /<SettingsRestoredNote \/>/);
});

import { lostNote, savedRefusedNote } from "./restoredNote";

test("E2-3 / E2-4: lost settings and a refused save each get one plain line", () => {
  assert.match(lostNote("unreadable"), /couldn't read your saved settings.*kept/);
  assert.match(lostNote("missing"), /couldn't find your saved settings/);
  assert.equal(lostNote(null), "");
  assert.match(savedRefusedNote("clipper.bank", "too-large"), /couldn't save your bank.*too much/);
  assert.match(savedRefusedNote("clipper.flags", "write-failed"), /couldn't save your latest changes.*space/);
});

test("E2-3 / E2-4: the note component listens for both", () => {
  const src = readFileSync(new URL("../components/SettingsRestoredNote.tsx", import.meta.url), "utf8");
  assert.match(src, /settingsLost/);
  assert.match(src, /onSaveRefused/);
});
