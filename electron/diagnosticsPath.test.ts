/**
 * File: diagnosticsPath.test.ts
 * Path: electron/diagnosticsPath.test.ts
 * Description: AF2-1. The log can hold cookie rows, tokens, signed URLs, an email and the
 * home path. Every reader of it in the main process must go through one scrubbing function, so
 * a new surface cannot skip redaction by calling logger.tail() directly (the clipboard, then the
 * alert, then the connect-screen panel each got fixed one at a time).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("main.ts reads the raw log in exactly one place, and it scrubs", () => {
  const reads = [...main.matchAll(/logger\.tail\(/g)];
  assert.equal(reads.length, 1, "a second reader of the raw log exists; route it through readLogScrubbed()");
  const fn = main.slice(main.indexOf("function readLogScrubbed"), main.indexOf("let serverHandle"));
  assert.ok(fn.includes("logger.tail("), "the single raw read is not inside readLogScrubbed");
  assert.ok(fn.includes("scrubForDisplay("), "readLogScrubbed does not scrub");
});

test("diagnostics:read and diagnostics:copy both use the scrubbed reader", () => {
  for (const channel of ["diagnostics:read", "diagnostics:copy"]) {
    const start = main.indexOf(`ipcMain.handle("${channel}"`);
    assert.ok(start > 0, `${channel} missing`);
    const body = main.slice(start, main.indexOf("ipcMain.handle", start + 10));
    assert.ok(body.includes("readLogScrubbed("), `${channel} does not use readLogScrubbed()`);
  }
});

test("the log's own path is scrubbed before it is shown", () => {
  const start = main.indexOf('ipcMain.handle("diagnostics:read"');
  const body = main.slice(start, main.indexOf("ipcMain.handle", start + 10));
  assert.match(body, /scrubForDisplay\(\s*logger\.logFilePath\(\)/);
});
