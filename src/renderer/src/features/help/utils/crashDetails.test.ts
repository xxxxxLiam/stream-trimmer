/**
 * File: crashDetails.test.ts
 * Description: E-2. The crash report carries the error and where it happened, then the diagnostics; redaction still applies.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crashDetails } from "./crashDetails";
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
