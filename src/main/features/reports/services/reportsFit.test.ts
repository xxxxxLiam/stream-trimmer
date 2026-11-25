/**
 * File: reportsFit.test.ts
 * Path: src/main/features/reports/services/reportsFit.test.ts
 * Description: E2-6 and E2-7. Whatever report the app builds fits the relay's 32 KB cap and passes its schema, and
 *   reports kept by older builds in `clipper.pendingReports` are carried into the queue once.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MAX_BODY_BYTES, parseReport } from "../../../../../relay/src/handler";
import { buildReport } from "./reportBuild";
import { LEGACY_REPORTS_KEY, migrateLegacyReports } from "./reportMigration";
import { createReportQueue } from "./reportQueue";

const ctx = (logTail: string) => ({ appVersion: "15.0.0", os: "win32 10.0.22631", homeDir: "C:\\Users\\Jane", logTail });
const size = (r: unknown) => Buffer.byteLength(JSON.stringify(r), "utf8");

test("E2-6: the worst-case reports (quote-heavy, Windows paths, Japanese text) still fit the relay and pass its schema", () => {
  const worst: Record<string, string> = {
    quotes: Array.from({ length: 80 }, () => `"${'"'.repeat(380)}"`).join("\n"),
    windows: Array.from({ length: 80 }, () => "D:\\Videos\\project\\clips\\" + "\\sub".repeat(80)).join("\n"),
    japanese: Array.from({ length: 80 }, () => "日本語のログ".repeat(80)).join("\n"),
  };
  for (const [name, logTail] of Object.entries(worst)) {
    const r = buildReport({ kind: "problem", note: "メモ".repeat(2000), error: "日本語\"".repeat(2000) }, ctx(logTail));
    assert.ok(size(r) <= MAX_BODY_BYTES, `${name}: ${size(r)} bytes`);
    assert.ok(parseReport(JSON.parse(JSON.stringify(r))), `${name}: the relay's schema accepts it`);
    assert.ok(r.error.length > 0, "the error is kept");
  }
});

test("E2-6: a report that already fits is untouched, and trimming drops the oldest log lines first", () => {
  const small = buildReport({ kind: "crash", error: "boom" }, ctx("a\nb\nc"));
  assert.deepEqual(small.log, ["a", "b", "c"]);
  const lines = Array.from({ length: 50 }, (_, i) => `line-${String(i).padStart(2, "0")} ` + "日".repeat(400));
  const big = buildReport({ kind: "crash", error: "boom" }, ctx(lines.join("\n")));
  assert.ok(big.log.length > 0 && big.log.length < 50);
  assert.match(big.log[big.log.length - 1], /^line-49/, "the newest line survives");
});

const tmpQueue = () => createReportQueue(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rm-")), "pending-reports.json"));
const old = (id: string) => ({ id, at: "2026-11-01T10:00:00Z", note: "it broke", details: "ERROR: boom at C:\\Users\\Jane\\x.mp4\nlog line 1\nlog line 2" });

test("E2-7: old kept reports move into the new queue once, redacted, and the old key is cleared", () => {
  const queue = tmpQueue();
  let stored: unknown = [old("a"), old("b"), { nonsense: true }];
  const deps = {
    read: () => stored,
    clear: () => { stored = null; },
    queue,
    ctx: { appVersion: "15.0.0", os: "darwin 24", homeDir: "C:\\Users\\Jane" },
  };
  assert.equal(migrateLegacyReports(deps), 2);
  const list = queue.list();
  assert.equal(list.length, 2);
  assert.equal(stored, null);
  assert.equal(list[0].report.note, "it broke");
  assert.match(list[0].report.error, /^ERROR: boom/);
  assert.doesNotMatch(JSON.stringify(list), /Jane/);
  assert.deepEqual(list[0].report.log, ["log line 1", "log line 2"]);
  // A second launch finds nothing left to move.
  assert.equal(migrateLegacyReports(deps), 0);
  assert.equal(queue.list().length, 2);
  assert.equal(LEGACY_REPORTS_KEY, "clipper.pendingReports");
});
