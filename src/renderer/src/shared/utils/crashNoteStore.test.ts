import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { consumeCrashFlag, crashNoteText, workIsBack } from "./crashNoteStore";

test("Crash note: the crashed flag is read once, cleared from the address, and a refresh does not bring it back", () => {
  let address = "?crashed=1&x=2";
  assert.equal(consumeCrashFlag("?crashed=1&x=2", (clean) => (address = clean)), true);
  assert.equal(address, "?x=2");
  // The same launch asking again, or a refresh (no flag any more), changes nothing and keeps the note.
  assert.equal(consumeCrashFlag("", () => assert.fail("must not rewrite again")), true);
});

test("Crash note: 'Your work is back' is said only when saved work was loaded", () => {
  assert.equal(workIsBack({ "clipper.campaigns": [{ id: "a" }] }), true);
  assert.equal(workIsBack({ "clipper.bank": {} }), true);
  assert.equal(workIsBack({}), false);
  assert.equal(workIsBack(undefined), false);
  assert.equal(workIsBack({ "clipper.theme": "dark" }), false);
  assert.equal(crashNoteText(true), "Clipr closed unexpectedly. Your work is back.");
  assert.equal(crashNoteText(false), "Clipr closed unexpectedly.");
});

test("Crash note: the app reopens on its own page with the note in Export, not on the full-screen crash screen", () => {
  const app = readFileSync("src/renderer/src/routes/App.tsx", "utf8");
  assert.match(app, /consumeCrashFlag\(window\.location\.search/);
  assert.doesNotMatch(app, /if \(wasCrashed\(window\.location\.search\)\) return <CrashScreenHost/);
  const panel = readFileSync("src/renderer/src/features/clips/components/ExportPanel.tsx", "utf8");
  assert.match(panel, /<CrashNoteHost \/>\s*\n\s*\{c\.making/);
});
