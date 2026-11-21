import test from "node:test";
import assert from "node:assert/strict";
import { buildExportFolderName } from "./channel";

test("E-5: two exports of one channel on one day never share a folder", () => {
  const names = new Set<string>();
  for (let i = 0; i < 20; i++) names.add(buildExportFolderName("Test Channel"));
  assert.equal(names.size, 20);
});

test("E-5: the folder name still leads with the channel and the date", () => {
  const name = buildExportFolderName("Test Channel");
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(name.startsWith("Test Channel-export-") || name.startsWith("Test-Channel-export-"), name);
  assert.ok(name.includes(today), name);
  assert.ok(!/[\\/:*?"<>|]/.test(name));
});

test("E-5: a given instant and run id name a folder deterministically", () => {
  const at = new Date("2026-11-21T14:32:05Z");
  assert.equal(buildExportFolderName("Chan", at, "abc"), "Chan-export-2026-11-21-143205-abc");
});

import { rowsToCsv } from "./channel";
import { csvHeader, csvLine } from "../../server/csv";

test("E-7: the client CSV escapes formulas exactly as the server does", () => {
  const cols = ["a", "b", "n"];
  const rows = [
    { a: "=HYPERLINK(\"x\")", b: "-5", n: -3 },
    { a: "+1+1", b: "@SUM(A1)", n: 0 },
    { a: "\tTab", b: "plain, \"quoted\"", n: "" },
    { a: "-1.5", b: "- not a number", n: null },
  ];
  const server = csvHeader(cols) + rows.map((r) => csvLine(cols, r)).join("");
  assert.equal(rowsToCsv(cols, rows), server);
  assert.ok(rowsToCsv(cols, rows).includes(`"'=HYPERLINK(`));
});
