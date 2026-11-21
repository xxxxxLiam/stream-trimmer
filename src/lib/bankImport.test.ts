/**
 * File: bankImport.test.ts
 * Path: src/lib/bankImport.test.ts
 * Description: Pins the forgiving timestamp parser: separators, joins, time shapes, ids,
 *   labels, the four category/tier routes and their precedence, headings, and reporting.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTier, parseBankImport } from "./bankImport";

const one = (text: string, opts = {}) => {
  const p = parseBankImport(text, opts);
  assert.equal(p.errors.length, 0, JSON.stringify(p.errors));
  assert.equal(p.clips.length, 1);
  return p.clips[0];
};

test("every range separator reads the same range", () => {
  for (const sep of ["-", "–", "—", " to ", "→", " - ", " – ", " — ", " → ", "->", "-->"]) {
    const c = one(`1:00${sep}2:00`);
    assert.deepEqual(c.segments, [{ start: 60, end: 120 }], `sep ${JSON.stringify(sep)}`);
  }
});

test("every time shape", () => {
  assert.deepEqual(one("90-120").segments, [{ start: 90, end: 120 }]);
  assert.deepEqual(one("1:05-2:10").segments, [{ start: 65, end: 130 }]);
  assert.deepEqual(one("01:05-02:10").segments, [{ start: 65, end: 130 }]);
  assert.deepEqual(one("1:02:03-1:03:04").segments, [{ start: 3723, end: 3784 }]);
  assert.deepEqual(one("01:02:03 to 01:03:04").segments, [{ start: 3723, end: 3784 }]);
  assert.deepEqual(one("0:05:40-0:06:35").segments, [{ start: 340, end: 395 }]);
  assert.deepEqual(one("1:00.500-1:02.250").segments, [{ start: 60.5, end: 62.25 }]);
});

test("segments joined by ; or + are ONE clip", () => {
  for (const join of [";", " ; ", "+", " + "]) {
    const c = one(`00:01:12 to 00:01:30${join}00:10:04 to 00:10:20`);
    assert.deepEqual(c.segments, [
      { start: 72, end: 90 },
      { start: 604, end: 620 },
    ]);
  }
  const three = one("0:10-0:20; 1:00-1:10 + 2:00-2:05");
  assert.equal(three.segments.length, 3);
});

test("out-of-order segments are kept in written order", () => {
  const c = one("10:00-10:30; 1:00-1:30");
  assert.deepEqual(c.segments, [
    { start: 600, end: 630 },
    { start: 60, end: 90 },
  ]);
});

test("leading id and trailing label", () => {
  const c = one("T1-A01   38:43 - 39:26    the hook line here");
  assert.equal(c.id, "T1-A01");
  assert.equal(c.label, "the hook line here");
  assert.deepEqual(c.segments, [{ start: 2323, end: 2366 }]);
  const d = one("M-aBcDeFg-05  1:12:04–1:12:38");
  assert.equal(d.id, "M-aBcDeFg-05");
  assert.equal(d.label, "");
  assert.deepEqual(d.segments, [{ start: 4324, end: 4358 }]);
  assert.equal(one("A01: 1:00-2:00").id, "A01");
  assert.equal(one("1) A07 1:00-2:00").id, "A07");
});

test("no id: a label before the times stays a label", () => {
  const c = one("Great story 1:00-2:00");
  assert.equal(c.id, null);
  assert.equal(c.label, "Great story");
});

test("an id with digits inside is not read as a range", () => {
  const c = one("A-05-07 1:00-2:00 note");
  assert.equal(c.id, "A-05-07");
  assert.deepEqual(c.segments, [{ start: 60, end: 120 }]);
});

test("label quotes and separators are trimmed", () => {
  assert.equal(one('1:00-2:00 - "the hook"').label, "the hook");
  assert.equal(one("1:00-2:00: the hook").label, "the hook");
});

test("blank lines are ignored and line numbers count them", () => {
  const p = parseBankImport("\n1:00-2:00\n\n\nnonsense\n3:00-4:00\n");
  assert.equal(p.clipCount, 2);
  assert.deepEqual(p.clips.map((c) => c.line), [2, 6]);
  assert.equal(p.errors.length, 1);
  assert.equal(p.errors[0].line, 5);
  assert.equal(p.errors[0].text, "nonsense");
  assert.match(p.errors[0].reason, /No time range/);
});

test("CRLF input", () => {
  const p = parseBankImport("1:00-2:00\r\n3:00-4:00\r\n");
  assert.equal(p.clipCount, 2);
});

test("end before start is reported, not swapped", () => {
  const p = parseBankImport("A1 2:00-1:00");
  assert.equal(p.clipCount, 0);
  assert.equal(p.errors[0].line, 1);
  assert.match(p.errors[0].reason, /end \(1:00\) is before the start \(2:00\)/);
});

test("start equal to end is reported", () => {
  assert.match(parseBankImport("1:00-1:00").errors[0].reason, /same/);
});

test("a range past the video duration is reported only when duration is known", () => {
  const text = "1:00-2:00\n1:00:00-1:02:00";
  const known = parseBankImport(text, { duration: 3600 });
  assert.equal(known.clipCount, 1);
  assert.equal(known.errors.length, 1);
  assert.equal(known.errors[0].line, 2);
  assert.match(known.errors[0].reason, /past the end of the video \(1:00:00\)/);
  assert.equal(parseBankImport(text).clipCount, 2);
  assert.equal(parseBankImport("59:00-1:00:00", { duration: 3600 }).clipCount, 1);
});

test("one bad segment fails the whole line and names the segment", () => {
  const p = parseBankImport("1:00-2:00; 5:00-4:00");
  assert.equal(p.clipCount, 0);
  assert.match(p.errors[0].reason, /^Segment 2: /);
  const q = parseBankImport("1:00-2:00; 5:00");
  assert.match(q.errors[0].reason, /Segment 2 is not a range/);
});

test("invalid clock values are reported", () => {
  assert.match(parseBankImport("1:75-2:00").errors[0].reason, /1:75 is not a valid time/);
  assert.match(parseBankImport("1:00:99-2:00:00").errors[0].reason, /not a valid time/);
});

test("a lone time and junk are reported with the reason", () => {
  const p = parseBankImport("38:43\nlorem ipsum\n???");
  assert.equal(p.clipCount, 0);
  assert.deepEqual(p.errors.map((e) => e.line), [1, 2, 3]);
  assert.match(p.errors[0].reason, /no range/);
  assert.match(p.errors[1].reason, /No time range/);
});

test("duplicate ids in one paste are reported on the later line", () => {
  const p = parseBankImport("A1 1:00-2:00\na1 3:00-4:00");
  assert.equal(p.clipCount, 1);
  assert.equal(p.errors[0].line, 2);
  assert.match(p.errors[0].reason, /already used on line 1/);
});

// ---- categories and tiers ---------------------------------------------------

test("route 1: explicit key: value, any position, all key spellings", () => {
  assert.equal(one("1:00-2:00 category: hook").category, "hook");
  assert.equal(one("category: hook 1:00-2:00").category, "hook");
  assert.equal(one("A1 cat: payoff 1:00-2:00 label").category, "payoff");
  assert.equal(one("1:00-2:00 tier: 2").tier, "2");
  assert.equal(one("1:00-2:00 t: 3").tier, "3");
  assert.equal(one("1:00-2:00 t: T3").tier, "3");
  assert.equal(one('1:00-2:00 category: "big idea"').category, "big idea");
  const c = one("A1 1:00-2:00 the line cat: hook t: 1");
  assert.equal(c.label, "the line");
  assert.equal(c.category, "hook");
  assert.equal(c.tier, "1");
  assert.equal(one("1:00-2:00 tier: gold").tier, "gold");
});

test("explicit keys do not fire inside other words or times", () => {
  const c = one("1:00-2:00 what: now");
  assert.equal(c.tier, undefined);
  assert.equal(c.category, undefined);
  assert.equal(c.label, "what: now");
});

test("route 2: brackets and pipes", () => {
  const b = one("A1 1:00-2:00 [hook] [T2] the line");
  assert.equal(b.category, "hook");
  assert.equal(b.tier, "2");
  assert.equal(b.label, "the line");
  const p = one("A1 1:00-2:00 | hook | T2");
  assert.equal(p.category, "hook");
  assert.equal(p.tier, "2");
  const q = one("A1 1:00-2:00 label | T1");
  assert.equal(q.tier, "1");
  assert.equal(q.category, undefined);
  assert.equal(q.label, "label");
  assert.equal(one("1:00-2:00 | hook | 2").tier, "2");
  assert.equal(one("[hook] 1:00-2:00").category, "hook");
  assert.equal(one("1:00-2:00 | hook | T2 | extra words").note, "extra words");
});

test("route 3: a heading applies to everything beneath it until the next heading", () => {
  const p = parseBankImport(
    ["Hook moments:", "A1 1:00-2:00", "", "A2 3:00-4:00", "Payoffs:", "A3 5:00-6:00"].join("\n"),
  );
  assert.equal(p.errors.length, 0);
  assert.deepEqual(p.clips.map((c) => c.category), ["Hook moments", "Hook moments", "Payoffs"]);
  assert.deepEqual(p.clips.map((c) => c.line), [2, 4, 6]);
  assert.equal(p.withCategory, 3);
});

test("a heading is not an error and lines above it get no category", () => {
  const p = parseBankImport("A0 0:10-0:20\nHooks:\nA1 1:00-2:00");
  assert.equal(p.errors.length, 0);
  assert.equal(p.clips[0].category, undefined);
  assert.equal(p.clips[1].category, "Hooks");
  assert.equal(p.withCategory, 1);
  assert.equal(p.withoutCategory, 1);
});

test("heading markup is stripped; an empty heading is reported", () => {
  const p = parseBankImport("## Hooks:\n1:00-2:00\n :");
  assert.equal(p.clips[0].category, "Hooks");
  assert.equal(p.errors.length, 1);
  assert.equal(p.errors[0].line, 3);
});

test("route 4: tier from a leading T<n>- id, and only that shape", () => {
  assert.equal(one("T1-A01 1:00-2:00").tier, "1");
  assert.equal(one("T12-x 1:00-2:00").tier, "12");
  assert.equal(one("T1A01 1:00-2:00").tier, undefined);
  assert.equal(one("M-T1-A 1:00-2:00").tier, undefined);
  assert.equal(one("T-A01 1:00-2:00").tier, undefined);
  assert.equal(one("t2-a 1:00-2:00").tier, undefined);
});

test("precedence: explicit beats field beats heading; explicit tier beats id tier", () => {
  const text = [
    "Heading:",
    "A1 1:00-2:00 [bracket] category: explicit",
    "A2 1:00-2:00 [bracket]",
    "A3 1:00-2:00",
    "T1-A4 1:00-2:00 | pipe | T5",
    "T1-A5 1:00-2:00 tier: 9 [T7]",
    "T1-A6 1:00-2:00",
  ].join("\n");
  const p = parseBankImport(text);
  assert.equal(p.errors.length, 0);
  const by = (id: string) => p.clips.find((c) => c.id === id)!;
  assert.equal(by("A1").category, "explicit");
  assert.equal(by("A2").category, "bracket");
  assert.equal(by("A3").category, "Heading");
  assert.equal(by("T1-A4").category, "pipe");
  assert.equal(by("T1-A4").tier, "5");
  assert.equal(by("T1-A5").tier, "9");
  assert.equal(by("T1-A6").tier, "1");
});

test("nothing is guessed: no category and no tier stay empty", () => {
  const c = one("A01 1:00-2:00 just a label");
  assert.equal("category" in c, false);
  assert.equal("tier" in c, false);
});

test("normalizeTier", () => {
  assert.equal(normalizeTier("T2"), "2");
  assert.equal(normalizeTier("tier 3"), "3");
  assert.equal(normalizeTier(" 4 "), "4");
  assert.equal(normalizeTier("gold"), "gold");
});

test("preview counts", () => {
  const text = [
    "Hooks:",
    "T1-A01 0:10-0:40 one",
    "T2-A02 1:00-1:30; 5:00-5:30 two",
    "Quiet:",
    "A03 10:00-10:20 [Hooks]",
    "bad line",
    "A04 2:00-1:00",
  ].join("\n");
  const p = parseBankImport(text);
  assert.equal(p.clipCount, 3);
  assert.equal(p.segmentCount, 4);
  assert.equal(p.totalSec, 30 + 30 + 30 + 20);
  assert.equal(p.withCategory, 3);
  assert.equal(p.withoutCategory, 0);
  assert.equal(p.withTier, 2);
  assert.deepEqual(p.categories, ["Hooks"]);
  assert.deepEqual(p.tiers, ["1", "2"]);
  assert.equal(p.errors.length, 2);
  assert.deepEqual(p.errors.map((e) => e.line), [6, 7]);
});

test("categories differing only in case are one entry", () => {
  const p = parseBankImport("1:00-2:00 [Hook]\n3:00-4:00 [hook]");
  assert.deepEqual(p.categories, ["Hook"]);
});

test("spec examples", () => {
  const p = parseBankImport(
    [
      "T1-A01   38:43 - 39:26    the hook line here",
      "M-aBcDeFg-05  1:12:04–1:12:38",
      "00:01:12 to 00:01:30; 00:10:04 to 00:10:20   (two segments, ONE clip)",
      "0:05:40-0:06:35",
    ].join("\n"),
  );
  assert.equal(p.errors.length, 0);
  assert.equal(p.clipCount, 4);
  assert.equal(p.segmentCount, 5);
  assert.equal(p.clips[2].segments.length, 2);
  assert.equal(p.clips[2].label, "(two segments, ONE clip)");
});

test("empty and whitespace-only input", () => {
  for (const t of ["", "   \n \n"]) {
    const p = parseBankImport(t);
    assert.equal(p.clipCount, 0);
    assert.equal(p.errors.length, 0);
  }
});
