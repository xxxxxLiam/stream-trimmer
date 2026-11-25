/**
 * File: crashDetails.test.ts
 * Description: E-2. The crash report carries the error and where it happened, then the diagnostics; redaction still applies.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { crashDetails, reopenUrl, wasCrashed } from "./crashDetails";
import { makeReport } from "./reports";

test("the error, its first stack lines and the diagnostics all go into the details", () => {
  const e = new Error("bad value");
  e.stack = "Error: bad value\n at a (x.js:1:1)\n at b (y.js:2:2)";
  const d = crashDetails(e, "Clipr 14.0.0");
  assert.match(d, /Renderer crash: Error: bad value/);
  assert.match(d, /at a \(x\.js:1:1\)/);
  assert.match(d, /Clipr 14\.0\.0/);
});

test("a path with a user name is cleaned by the report maker", () => {
  const e = new Error("ENOENT /Users/liam/Clips/a.mp4");
  const r = makeReport("", crashDetails(e, ""), new Date(0), "c-1");
  assert.doesNotMatch(r.details, /liam/);
});

test("E-2: a window reloaded at ?crashed=1 opens the crash note, and Reopen drops the flag", () => {
  assert.equal(wasCrashed("?crashed=1"), true);
  assert.equal(wasCrashed(""), false);
  assert.equal(wasCrashed("?window=symbols"), false);
  assert.equal(reopenUrl("file:///app/index.html?crashed=1&x=2#/a"), "file:///app/index.html?x=2#/a");
  const app = readFileSync(new URL("../../../routes/App.tsx", import.meta.url), "utf8");
  assert.match(app, /consumeCrashFlag\(window\.location\.search/);
});
