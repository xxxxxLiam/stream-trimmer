/**
 * File: diagnosticsPath.test.ts
 * Path: src/main/features/diagnostics/services/diagnosticsPath.test.ts
 * Description: AF2-1. The log can hold cookie rows, tokens, signed URLs, an email and the
 * home path. Every reader of it in the main process must go through one scrubbing function, so
 * a new surface cannot skip redaction by calling logger.tail() directly (the clipboard, then the
 * alert, then the connect-screen panel each got fixed one at a time).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
/** Every non-test main-process source file (src/main/). */
function mainSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) mainSources(rel, out);
    else if (/\.ts$/.test(name) && !/\.test\./.test(name)) out.push(rel);
  }
  return out;
}
const sources = mainSources("src/main");
const service = read("src/main/features/diagnostics/services/diagnosticsService.ts");
const handlers = read("src/main/ipc/diagnosticsHandlers.ts");
const fnBody = (src: string, name: string) => {
  const at = src.indexOf(`function ${name}`);
  assert.ok(at >= 0, `${name} missing`);
  const next = src.indexOf("\nexport function", at + 10);
  return src.slice(at, next < 0 ? undefined : next);
};

test("main.ts reads the raw log in exactly one place, and it scrubs", () => {
  const reads = sources.flatMap((f) => [...read(f).matchAll(/logger\.tail\(/g)].map(() => f));
  assert.equal(reads.length, 1, "a second reader of the raw log exists; route it through readLogScrubbed()");
  const fn = fnBody(service, "readLogScrubbed");
  assert.ok(fn.includes("logger.tail("), "the single raw read is not inside readLogScrubbed");
  assert.ok(fn.includes("scrubForDisplay("), "readLogScrubbed does not scrub");
});

test("diagnostics:read and diagnostics:copy both use the scrubbed reader", () => {
  const through: Record<string, string> = { "diagnostics:read": "readDiagnostics", "diagnostics:copy": "copyLog" };
  for (const channel of Object.keys(through)) {
    const start = handlers.indexOf(`ipcMain.handle("${channel}"`);
    assert.ok(start > 0, `${channel} missing`);
    const line = handlers.slice(start, handlers.indexOf(";", start));
    assert.ok(line.includes(`${through[channel]}(`), `${channel} does not call ${through[channel]}()`);
    assert.ok(fnBody(service, through[channel]).includes("readLogScrubbed("), `${channel} does not use readLogScrubbed()`);
  }
});

test("the log's own path is scrubbed before it is shown", () => {
  assert.match(fnBody(service, "readDiagnostics"), /scrubForDisplay\(\s*logger\.logFilePath\(\)/);
});
