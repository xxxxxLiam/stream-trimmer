/**
 * File: editorLayouts.test.ts
 * Description: Final Cut offers all four layouts; editors that get no project file offer none.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { layoutsFor } from "./editorLayouts";

test("Final Cut offers all four layouts, the default first", () => {
  assert.deepEqual(layoutsFor("finalcut"), ["export", "video", "day", "flat"]);
});

test("Premiere, Resolve and CapCut show no Layout row until a project file is written for them", () => {
  for (const e of ["premiere", "resolve", "capcut", undefined, "other"]) assert.deepEqual(layoutsFor(e), []);
});
