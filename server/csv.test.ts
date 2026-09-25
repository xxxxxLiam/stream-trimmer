/**
 * File: csv.test.ts
 * Path: server/csv.test.ts
 * Description: Verifies the streaming CSV writer the channel exporter uses to
 * get a whole channel's comments and captions onto disk without holding them
 * in memory — including the 1 MiB read boundary, which is where a naive
 * chunk-at-a-time decoder corrupts multi-byte text.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMMENT_COLUMNS,
  CSV_BOM,
  STATUS_COLUMNS,
  SUMMARY_COLUMNS,
  TRANSCRIPT_COLUMNS,
  VIDEO_COLUMNS,
  csvCell,
  csvLine,
  writeCsv,
  writeCsvFromJsonl,
} from "./csv";
import * as client from "../src/lib/channel";

const READ_CHUNK = 1 << 20; // must match csv.ts

function tempDir(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("the server's column orders match the client's", () => {
  // The two copies exist because the server is bundled separately and cannot
  // import from src/. If they drift, path delivery and rows delivery produce
  // different files.
  assert.deepEqual(VIDEO_COLUMNS, client.VIDEO_COLUMNS);
  assert.deepEqual(COMMENT_COLUMNS, client.COMMENT_COLUMNS);
  assert.deepEqual(TRANSCRIPT_COLUMNS, client.TRANSCRIPT_COLUMNS);
  assert.deepEqual(STATUS_COLUMNS, client.STATUS_COLUMNS);
  assert.deepEqual(SUMMARY_COLUMNS, client.SUMMARY_COLUMNS);
});

test("cells are quoted and embedded quotes doubled", () => {
  assert.equal(csvCell("plain"), '"plain"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell(false), '"false"');
});

test("a line follows the column order and ends CRLF", () => {
  assert.equal(
    csvLine(["b", "a"], { a: 1, b: 2, c: 3 }),
    '"2","1"\r\n',
  );
  // A column the row has no value for is empty, not "undefined".
  assert.equal(csvLine(["missing"], {}), '""\r\n');
});

test("a written CSV matches the client's builder byte for byte", (t) => {
  const dir = tempDir(t);
  const rows = [
    { video_id: "a1", title: 'He said "no"', status: "ok" },
    { video_id: "b2", title: "多行\ntext 🎬", status: "no captions" },
  ];
  const file = path.join(dir, "out.csv");
  const count = writeCsv(file, STATUS_COLUMNS, rows);

  assert.equal(count, 2);
  assert.equal(
    fs.readFileSync(file, "utf8"),
    client.rowsToCsv(STATUS_COLUMNS, rows),
  );
});

test("a missing source yields a header-only CSV", (t) => {
  const dir = tempDir(t);
  const out = path.join(dir, "comments.csv");
  const count = writeCsvFromJsonl(
    path.join(dir, "never-written.jsonl"),
    out,
    COMMENT_COLUMNS,
  );

  assert.equal(count, 0);
  const text = fs.readFileSync(out, "utf8");
  assert.ok(text.startsWith(CSV_BOM));
  assert.equal(text.trimEnd().split("\r\n").length, 1);
});

test("a checkpoint truncated mid-write loses only the broken line", (t) => {
  const dir = tempDir(t);
  const src = path.join(dir, "in.jsonl");
  fs.writeFileSync(
    src,
    [
      JSON.stringify({ video_id: "a", start: 0, end: 1, text: "one" }),
      JSON.stringify({ video_id: "b", start: 1, end: 2, text: "two" }),
      '{"video_id":"c","start":2,"en', // interrupted write
    ].join("\n"),
  );
  const out = path.join(dir, "out.csv");

  assert.equal(writeCsvFromJsonl(src, out, TRANSCRIPT_COLUMNS), 2);
  const text = fs.readFileSync(out, "utf8");
  assert.ok(text.includes('"one"'));
  assert.ok(text.includes('"two"'));
});

test("a final line without a trailing newline is still written", (t) => {
  const dir = tempDir(t);
  const src = path.join(dir, "in.jsonl");
  fs.writeFileSync(
    src,
    JSON.stringify({ video_id: "a", start: 0, end: 1, text: "only" }),
  );
  const out = path.join(dir, "out.csv");

  assert.equal(writeCsvFromJsonl(src, out, TRANSCRIPT_COLUMNS), 1);
  assert.ok(fs.readFileSync(out, "utf8").includes('"only"'));
});

test("a multi-byte character straddling the read boundary survives", (t) => {
  // The failure this guards against: decoding each 1 MiB chunk on its own
  // splits a 4-byte emoji across two decodes and turns it into replacement
  // characters. The first row is padded so that the emoji lands with its
  // bytes on both sides of the boundary.
  const dir = tempDir(t);
  const src = path.join(dir, "in.jsonl");
  const out = path.join(dir, "out.csv");

  const emoji = "🎬"; // 4 bytes in UTF-8
  // Row shape: {"video_id":"pad","start":0,"end":1,"text":"<filler><emoji>"}
  const prefix = '{"video_id":"pad","start":0,"end":1,"text":"';
  const suffix = '"}';
  // Put the emoji's first byte two bytes before the boundary, so two of its
  // bytes land in the first chunk and two in the second.
  const fillerLength = READ_CHUNK - 2 - Buffer.byteLength(prefix);
  const padded = prefix + "x".repeat(fillerLength) + emoji + suffix;
  assert.equal(
    Buffer.byteLength(prefix + "x".repeat(fillerLength)),
    READ_CHUNK - 2,
    "the emoji must start two bytes before the chunk boundary",
  );

  const tail = [];
  for (let i = 0; i < 500; i++) {
    tail.push(
      JSON.stringify({
        video_id: `v${i}`,
        start: i,
        end: i + 1,
        text: `日本語 ${emoji} line ${i}`,
      }),
    );
  }
  fs.writeFileSync(src, [padded, ...tail].join("\n") + "\n");
  assert.ok(
    fs.statSync(src).size > READ_CHUNK,
    "the fixture must be larger than one read chunk",
  );

  const count = writeCsvFromJsonl(src, out, TRANSCRIPT_COLUMNS);
  assert.equal(count, 501);

  const text = fs.readFileSync(out, "utf8");
  assert.ok(
    !text.includes("�"),
    "no character should have been mangled into U+FFFD",
  );
  assert.equal(
    (text.match(/🎬/gu) ?? []).length,
    501,
    "every emoji should come through intact",
  );
  assert.ok(text.includes(`${"x".repeat(20)}🎬`), "the boundary row is intact");
  assert.ok(text.includes("日本語"));
});
