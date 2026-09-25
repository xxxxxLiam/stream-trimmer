/**
 * File: channelLimit.test.ts
 * Path: server/channelLimit.test.ts
 * Description: Verifies how the channel exporter's video budget is parsed —
 * the field that used to turn anything unusable into a silent ten-video run.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHANNEL_LIMIT_MAX,
  CHANNEL_LIMIT_MIN,
  describeChannelLimit,
  parseChannelLimit,
} from "../src/lib/channel";

test("a plain count is taken as written", () => {
  assert.deepEqual(parseChannelLimit("250"), { ok: true, limit: 250 });
  assert.deepEqual(parseChannelLimit(250), { ok: true, limit: 250 });
  assert.deepEqual(parseChannelLimit(" 250 "), { ok: true, limit: 250 });
  assert.deepEqual(parseChannelLimit("250.4"), { ok: true, limit: 250 });
});

test("every video on the channel is its own budget", () => {
  assert.deepEqual(parseChannelLimit("all"), { ok: true, limit: "all" });
});

test("counts far above the old 500 ceiling are accepted", () => {
  // The whole point of the change: a 5000-video channel is exportable.
  assert.deepEqual(parseChannelLimit("5000"), { ok: true, limit: 5000 });
  assert.deepEqual(parseChannelLimit(String(CHANNEL_LIMIT_MAX)), {
    ok: true,
    limit: CHANNEL_LIMIT_MAX,
  });
});

test("an empty field is reported, not silently turned into the minimum", () => {
  // This was the bug: `Math.round(Number("")) || 10` exported ten videos and
  // said nothing about it.
  for (const raw of ["", "   "]) {
    const result = parseChannelLimit(raw);
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /Enter how many/i);
    assert.doesNotMatch((result as { reason: string }).reason, /^10$/);
  }
});

test("nonsense in the field is reported", () => {
  const result = parseChannelLimit("lots");
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /isn't a number/i);
});

test("out-of-range counts say which way they are wrong", () => {
  const low = parseChannelLimit("0");
  assert.equal(low.ok, false);
  assert.match(
    (low as { reason: string }).reason,
    new RegExp(`at least ${CHANNEL_LIMIT_MIN}`, "i"),
  );
  assert.equal(parseChannelLimit("-20").ok, false);

  const high = parseChannelLimit(CHANNEL_LIMIT_MAX + 1);
  assert.equal(high.ok, false);
  assert.match((high as { reason: string }).reason, /Everything/);
});

test("the budget reads as a phrase", () => {
  assert.equal(describeChannelLimit("all"), "every video on the channel");
  assert.equal(describeChannelLimit(100), "100 videos");
});
