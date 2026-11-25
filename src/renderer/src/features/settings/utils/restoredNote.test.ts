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
