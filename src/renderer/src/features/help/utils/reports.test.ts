/**
 * File: reports.test.ts
 * Description: A report keeps the note and cleaned details, is kept when it cannot be sent, and is
 *   dropped from the kept list once it goes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cutNote, makeReport, reportText, sendReport } from "./reports";

const now = new Date("2026-11-24T19:00:00Z");

test("a report carries the note and the details, with secrets cleaned", () => {
  const r = makeReport("Clip stopped at 61%.", "po_token=abcdef123456 stack", now, "r1");
  assert.equal(r.at, "2026-11-24T19:00:00.000Z");
  assert.match(r.note, /61%/);
  assert.doesNotMatch(r.details, /abcdef123456/);
  assert.match(reportText(r), /What happened: Clip stopped at 61%\./);
});

test("sending goes through the main process: sent, kept, and kept when it cannot be asked", async () => {
  const w = globalThis as unknown as { window?: { electronAPI?: unknown } };
  const calls: unknown[] = [];
  const set = (api: unknown) => { w.window = { electronAPI: api }; };
  try {
    set({ sendReport: async (p: unknown) => (calls.push(p), { ok: true, status: "sent" }) });
    assert.equal(await sendReport("problem", "it broke po_token=abc123secretvalue", "Reported from Help"), "sent");
    assert.deepEqual(Object.keys(calls[0] as object).sort(), ["error", "kind", "note"]);
    assert.doesNotMatch(String((calls[0] as { note: string }).note), /abc123secretvalue/, "the note is cleaned before it leaves the window");
    set({ sendReport: async () => ({ ok: true, status: "kept" }) });
    assert.equal(await sendReport("crash", "", "boom"), "kept");
    set({ sendReport: async () => { throw new Error("ipc"); } });
    assert.equal(await sendReport("crash", "", "boom"), "kept");
    set({});
    assert.equal(await sendReport("crash", "", "boom"), "kept", "outside the desktop app nothing can send");
    set({ sendReport: async (p: unknown) => (calls.push(p), { ok: true, status: "sent" }) });
    await sendReport("crash", "a note that crash reports do not carry", "boom");
    assert.equal((calls.at(-1) as { note?: string }).note, undefined);
  } finally {
    delete w.window;
  }
});

test("F-9: the 2,000-character cut never splits an emoji", () => {
  const text = "a".repeat(1999) + "😀" + "tail";
  const cut = cutNote(text, 2000);
  assert.equal(cut, "a".repeat(1999), "the emoji does not fit whole, so it is left out, not halved");
  assert.doesNotMatch(cut, /[\ud800-\udbff]$/);
  assert.equal(makeReport(text, "", now, "x").note, cut);
  assert.equal(cutNote("short", 2000), "short");
  assert.equal(cutNote("a" + "👨‍👩‍👧" + "b", 5), "a", "a joined family emoji is one character");
});
