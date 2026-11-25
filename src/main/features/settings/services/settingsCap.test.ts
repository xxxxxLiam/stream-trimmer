/**
 * File: settingsCap.test.ts
 * Description: E2-4. A bank of years of moments fits one settings value; a value past the cap is refused with a reason.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkPageWrite, MAX_VALUE_BYTES, pageMayWrite } from "./settingsKeys";

const moment = (i: number) => ({ id: `m-${i}`, videoId: "dQw4w9WgXcQ", start: i, end: i + 30, note: "x".repeat(200) });

test("E2-4: 20,000 moments (about 3 years of banking at 15 a day, three moments each) are accepted", () => {
  const bank = Array.from({ length: 20_000 }, (_, i) => moment(i));
  assert.ok(JSON.stringify(bank).length > 2_000_000, "bigger than the old 2 MB cap");
  assert.equal(checkPageWrite("clipper.bank", bank), "ok");
  assert.equal(pageMayWrite("clipper.bank", bank), true);
});

test("E2-4: a value past the cap is 'too-large', an unknown key 'not-allowed', null always ok", () => {
  assert.equal(checkPageWrite("clipper.bank", "x".repeat(MAX_VALUE_BYTES + 1)), "too-large");
  assert.equal(checkPageWrite("clipper.nope", 1), "not-allowed");
  assert.equal(checkPageWrite("__proto__", 1), "not-allowed");
  assert.equal(checkPageWrite("clipper.bank", null), "ok");
});
