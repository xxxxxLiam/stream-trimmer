/**
 * File: reports.test.ts
 * Path: src/main/features/reports/services/reports.test.ts
 * Description: The app side of the crash-report relay: what a report holds (no home folder, no video link), the kept
 *   queue (20 at most, 5 launches each), and that with no relay address a report is kept and nothing is sent.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildReport, validInput } from "./reportBuild";
import { createReportQueue, type RelayReport } from "./reportQueue";
import { createReportSender } from "./reportSender";
import { RELAY_URL } from "./relayConfig";

const queueFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rq-")), "pending-reports.json");
const rep = (n: number | string = 1): RelayReport => ({ kind: "crash", error: `Error ${n}`, appVersion: "14.0.0", os: "darwin", log: [] });

test("a report carries the error, versions and the last 50 log lines, with the home folder and any video link removed", () => {
  const home = "/Users/Jane Doe";
  const log = Array.from({ length: 80 }, (_, i) => `line ${i} /Users/Jane Doe/Movies/a.mp4`).concat("watching https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const r = buildReport(
    { kind: "problem", note: "it broke at /Users/Jane Doe/x", error: "Error: open /Users/Jane Doe/y\n    at f (/Users/Jane Doe/z.js:1:1)" },
    { appVersion: "14.0.0", os: "darwin 24", homeDir: home, logTail: log.join("\n") },
  );
  const all = JSON.stringify(r);
  assert.ok(!/Jane|Doe|dQw4w9WgXcQ|youtube\.com/.test(all), all.slice(0, 300));
  assert.equal(r.log.length, 50);
  assert.equal(r.kind, "problem");
  assert.match(r.note ?? "", /it broke/);
  // A crash report has no note.
  assert.equal(buildReport({ kind: "crash", note: "ignored", error: "E" }, { appVersion: "1", os: "x", homeDir: home, logTail: "" }).note, undefined);
});

test("only a real report is accepted from the page", () => {
  assert.ok(validInput({ kind: "crash", error: "x" }));
  for (const bad of [null, "x", {}, { kind: "other", error: "x" }, { kind: "crash", error: "" }, { kind: "crash", error: "x", note: 5 }]) assert.equal(validInput(bad), null);
});

test("with no relay address a report is kept and nothing is sent; the address is empty in this build", async () => {
  assert.equal(RELAY_URL, "");
  const queue = createReportQueue(queueFile());
  let posts = 0;
  const s = createReportSender({ url: "", queue, post: async () => (posts++, true) });
  assert.equal(await s.send(rep()), "kept");
  assert.equal(await s.flush(), 0);
  assert.equal(posts, 0);
  assert.equal(queue.list().length, 1);
});

test("a report the relay takes is sent and not kept; one it can't take is kept; a later launch sends it", async () => {
  const queue = createReportQueue(queueFile());
  let up = false;
  const s = createReportSender({ url: "https://r.example", queue, post: async () => up });
  assert.equal(await s.send(rep(1)), "kept");
  assert.equal(queue.list().length, 1);
  up = true;
  assert.equal(await s.send(rep(2)), "sent");
  assert.equal(queue.list().length, 1, "the sent one is not kept");
  assert.equal(await s.flush(), 1);
  assert.equal(queue.list().length, 0);
});

test("a post that throws is a kept report, not a crash", async () => {
  const queue = createReportQueue(queueFile());
  const s = createReportSender({ url: "https://r.example", queue, post: async () => Promise.reject(new Error("offline")) });
  assert.equal(await s.send(rep()), "kept");
});

test("at most 20 are kept, the oldest dropped first", () => {
  const queue = createReportQueue(queueFile());
  for (let i = 0; i < 25; i++) queue.add(`id${i}`, rep(i));
  const ids = queue.list().map((q) => q.id);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], "id5");
  assert.equal(ids[19], "id24");
});

test("a kept report is tried on 5 launches, then dropped", async () => {
  const queue = createReportQueue(queueFile());
  const s = createReportSender({ url: "https://r.example", queue, post: async () => false });
  queue.add("a", rep());
  for (let launch = 1; launch <= 4; launch++) {
    await s.flush();
    assert.equal(queue.list().length, 1, `still kept after launch ${launch}`);
  }
  await s.flush();
  assert.equal(queue.list().length, 0);
});

test("a damaged queue file reads as empty", () => {
  const f = queueFile();
  fs.writeFileSync(f, "{nope");
  assert.deepEqual(createReportQueue(f).list(), []);
});
