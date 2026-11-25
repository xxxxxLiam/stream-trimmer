/**
 * File: reports.test.ts
 * Description: A report keeps the note and cleaned details, is kept when it cannot be sent, and is
 *   dropped from the kept list once it goes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { addPending, flushPending, makeReport, normalizePending, relayUrlFrom, reportText, sendToRelay } from "./reports";

const now = new Date("2026-11-24T19:00:00Z");

test("a report carries the note and the details, with secrets cleaned", () => {
  const r = makeReport("Clip stopped at 61%.", "po_token=abcdef123456 stack", now, "r1");
  assert.equal(r.at, "2026-11-24T19:00:00.000Z");
  assert.match(r.note, /61%/);
  assert.doesNotMatch(r.details, /abcdef123456/);
  assert.match(reportText(r), /What happened: Clip stopped at 61%\./);
});

test("kept reports are capped and replaced by id, bad stored rows are dropped", () => {
  let list = normalizePending([{ id: "a", at: "x", note: "n", details: "d" }, { id: 3 }, null]);
  assert.equal(list.length, 1);
  list = addPending(list, { id: "a", at: "y", note: "n2", details: "d" });
  assert.equal(list.length, 1);
  assert.equal(list[0].note, "n2");
  for (let i = 0; i < 30; i++) list = addPending(list, { id: `r${i}`, at: "z", note: "n", details: "d" });
  assert.equal(list.length, 20);
});

test("without a relay nothing is sent, so the report is kept", async () => {
  assert.equal(await sendToRelay({ id: "a", at: "x", note: "n", details: "d" }, ""), false);
});

test("flushing drops only the reports that were accepted, and a throw keeps the report", async () => {
  const list = [
    { id: "ok", at: "x", note: "n", details: "d" },
    { id: "no", at: "x", note: "n", details: "d" },
    { id: "boom", at: "x", note: "n", details: "d" },
  ];
  const left = await flushPending(list, async (r) => {
    if (r.id === "boom") throw new Error("offline");
    return r.id === "ok";
  });
  assert.deepEqual(left.map((r) => r.id), ["no", "boom"]);
});

test("the relay address is a build-time setting: only an https address counts, and none means reports are kept", () => {
  assert.equal(relayUrlFrom("https://relay.example.com/report"), "https://relay.example.com/report");
  assert.equal(relayUrlFrom("  https://relay.example.com/r  "), "https://relay.example.com/r");
  for (const bad of ["", "http://relay.example.com", "javascript:1", "relay.example.com", undefined, 5, null]) assert.equal(relayUrlFrom(bad), "");
});
