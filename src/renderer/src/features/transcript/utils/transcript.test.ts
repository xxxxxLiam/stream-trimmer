import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_DRAWN,
  WINDOW_SIZE,
  snapRangeToWords,
  wordBoundsAt,
  computeWindow,
  extendEarlier,
  extendLater,
  followWindow,
  formatMatchCounter,
  isLineUsed,
  lineIndexAt,
  normalizeTranscript,
  searchTranscript,
  isClickDrag,
  snapRange,
  snapRangeByIndex,
  stepMatch,
  windowAround,
  type Line,
} from "./transcript";

/** n lines, each `dur` seconds, back to back, text "line i". */
function make(n: number, dur = 3): Line[] {
  return Array.from({ length: n }, (_, i) => ({
    start: i * dur,
    end: (i + 1) * dur,
    text: `line ${i}`,
  }));
}

describe("normalizeTranscript", () => {
  it("handles null and empty", () => {
    assert.deepEqual(normalizeTranscript(null), []);
    assert.deepEqual(normalizeTranscript([]), []);
  });
  it("sorts by start, stably, and repairs end < start", () => {
    const out = normalizeTranscript([
      { start: 5, end: 6, text: "b1" },
      { start: 1, end: 0, text: "a" },
      { start: 5, end: 7, text: "b2" },
    ]);
    assert.deepEqual(
      out.map((l) => l.text),
      ["a", "b1", "b2"],
    );
    assert.equal(out[0].end, 1);
  });
});

describe("lineIndexAt", () => {
  const lines = make(10);
  it("empty transcript -> -1", () => assert.equal(lineIndexAt([], 5), -1));
  it("before the first line -> 0", () => {
    assert.equal(lineIndexAt(make(5).map((l) => ({ ...l, start: l.start + 10, end: l.end + 10 })), 0), 0);
    assert.equal(lineIndexAt(lines, -4), 0);
  });
  it("after the last line -> last index", () => assert.equal(lineIndexAt(lines, 9999), 9));
  it("exact starts and interior times", () => {
    assert.equal(lineIndexAt(lines, 0), 0);
    assert.equal(lineIndexAt(lines, 3), 1);
    assert.equal(lineIndexAt(lines, 5.99), 1);
    assert.equal(lineIndexAt(lines, 27), 9);
  });
  it("picks the latest-starting line among overlapping lines", () => {
    const ov: Line[] = [
      { start: 0, end: 10, text: "a" },
      { start: 4, end: 6, text: "b" },
    ];
    assert.equal(lineIndexAt(ov, 5), 1);
  });
  it("zero-length and duplicate-start lines resolve to the last of them", () => {
    const z: Line[] = [
      { start: 0, end: 0, text: "a" },
      { start: 2, end: 2, text: "b" },
      { start: 2, end: 2, text: "c" },
      { start: 4, end: 5, text: "d" },
    ];
    assert.equal(lineIndexAt(z, 2), 2);
    assert.equal(lineIndexAt(z, 3), 2);
  });
  it("is a binary search: O(log n) element reads on 5,000 lines", () => {
    const big = make(5000);
    let reads = 0;
    const counted = new Proxy(big, {
      get(t, p, r) {
        if (typeof p === "string" && /^\d+$/.test(p)) reads++;
        return Reflect.get(t, p, r);
      },
    });
    assert.equal(lineIndexAt(counted, 3 * 3333 + 1), 3333);
    assert.ok(reads <= 20, `read ${reads} elements`);
  });
});

describe("computeWindow / windowAround", () => {
  it("empty transcript", () => {
    assert.deepEqual(computeWindow(0, 0), { from: 0, to: 0 });
    assert.deepEqual(windowAround([], 12), { from: 0, to: 0 });
  });
  it("shorter than the window draws everything", () => {
    assert.deepEqual(computeWindow(12, 5), { from: 0, to: 12 });
  });
  it("centres in the middle", () => {
    const w = computeWindow(1000, 500);
    assert.equal(w.to - w.from, WINDOW_SIZE);
    assert.ok(w.from <= 500 && 500 < w.to);
  });
  it("does not run off the start", () => {
    assert.deepEqual(computeWindow(1000, 0), { from: 0, to: WINDOW_SIZE });
    assert.deepEqual(computeWindow(1000, 3), { from: 0, to: WINDOW_SIZE });
  });
  it("does not run off the end", () => {
    assert.deepEqual(computeWindow(1000, 999), { from: 1000 - WINDOW_SIZE, to: 1000 });
    assert.deepEqual(computeWindow(1000, 5000), { from: 1000 - WINDOW_SIZE, to: 1000 });
    assert.deepEqual(computeWindow(1000, -5), { from: 0, to: WINDOW_SIZE });
  });
  it("playhead before the first line and after the last", () => {
    const lines = make(500);
    assert.deepEqual(windowAround(lines, -100), { from: 0, to: WINDOW_SIZE });
    assert.deepEqual(windowAround(lines, 1e9), { from: 500 - WINDOW_SIZE, to: 500 });
  });
  it("PERF: windowing 5,000 lines touches no more than a window's worth of elements", () => {
    const big = make(5000);
    let reads = 0;
    const counted = new Proxy(big, {
      get(t, p, r) {
        if (typeof p === "string" && /^\d+$/.test(p)) reads++;
        return Reflect.get(t, p, r);
      },
    });
    const w = windowAround(counted, 7500);
    assert.equal(w.to - w.from, WINDOW_SIZE);
    // The window itself is slice-able without reading the other ~4,960 lines.
    const drawn = counted.slice(w.from, w.to);
    assert.equal(drawn.length, WINDOW_SIZE);
    assert.ok(
      reads <= WINDOW_SIZE + 20,
      `read ${reads} of 5000 elements (limit ${WINDOW_SIZE + 20})`,
    );
  });
});

describe("followWindow", () => {
  it("keeps the window while the playhead is comfortably inside", () => {
    const w = { from: 100, to: 140 };
    assert.equal(followWindow(w, 1000, 120), w);
  });
  it("re-centres near an edge or when the playhead leaves", () => {
    const w = { from: 100, to: 140 };
    const near = followWindow(w, 1000, 136);
    assert.ok(near.from <= 136 && 136 < near.to - 8);
    const gone = followWindow(w, 1000, 600);
    assert.ok(gone.from <= 600 && 600 < gone.to);
  });
  it("an edge touching the transcript start/end never forces a move", () => {
    const top = { from: 0, to: 40 };
    assert.equal(followWindow(top, 1000, 2), top);
    const bottom = { from: 960, to: 1000 };
    assert.equal(followWindow(bottom, 1000, 998), bottom);
  });
  it("recovers from an invalid window (transcript shrank) and empty transcript", () => {
    assert.deepEqual(followWindow({ from: 900, to: 940 }, 50, 10), { from: 0, to: 40 });
    assert.deepEqual(followWindow({ from: 0, to: 40 }, 0, -1), { from: 0, to: 0 });
  });
});

describe("extendEarlier / extendLater", () => {
  it("earlier grows upward and clamps at 0", () => {
    assert.deepEqual(extendEarlier({ from: 100, to: 140 }, 1000), { from: 60, to: 140 });
    assert.deepEqual(extendEarlier({ from: 10, to: 50 }, 1000), { from: 0, to: 50 });
  });
  it("later grows downward and clamps at total", () => {
    assert.deepEqual(extendLater({ from: 100, to: 140 }, 1000), { from: 100, to: 180 });
    assert.deepEqual(extendLater({ from: 960, to: 990 }, 1000), { from: 960, to: 1000 });
  });
  it("never draws more than MAX_DRAWN", () => {
    let w = { from: 500, to: 540 };
    for (let i = 0; i < 10; i++) w = extendLater(w, 2000);
    assert.ok(w.to - w.from <= MAX_DRAWN);
    assert.equal(w.to, 940);
    assert.equal(w.to - w.from, MAX_DRAWN);
    let e = { from: 500, to: 540 };
    for (let i = 0; i < 10; i++) e = extendEarlier(e, 2000);
    assert.ok(e.to - e.from <= MAX_DRAWN);
    assert.equal(e.from, 100);
  });
});

describe("searchTranscript", () => {
  const lines: Line[] = [
    { start: 0, end: 2, text: "In the name of God" },
    { start: 2, end: 4, text: "the most gracious, the most" },
    { start: 4, end: 6, text: "merciful. Praise be" },
    { start: 6, end: 8, text: "to the Lord of the worlds" },
  ];
  it("empty transcript and empty query give no matches", () => {
    assert.deepEqual(searchTranscript([], "x"), []);
    assert.deepEqual(searchTranscript(lines, ""), []);
    assert.deepEqual(searchTranscript(lines, "   "), []);
  });
  it("zero matches", () => {
    assert.deepEqual(searchTranscript(lines, "pharaoh"), []);
  });
  it("is case-insensitive and finds every occurrence across the whole transcript", () => {
    const m = searchTranscript(lines, "THE");
    // "the name"(0), "the most"(1) x2, "the Lord"(3), "the worlds"(3)
    assert.deepEqual(
      m.map((x) => x.line),
      [0, 1, 1, 3, 3],
    );
  });
  it("finds a term that spans two lines and reports where it starts and ends", () => {
    const m = searchTranscript(lines, "most merciful");
    assert.deepEqual(m, [{ line: 1, endLine: 2 }]);
  });
  it("a span across a doubled space or wrapped whitespace still matches", () => {
    const m = searchTranscript(
      [
        { start: 0, end: 1, text: "praise  be" },
        { start: 1, end: 2, text: "to   God" },
      ],
      "be to god",
    );
    assert.deepEqual(m, [{ line: 0, endLine: 1 }]);
  });
  it("empty caption lines do not break a span", () => {
    const m = searchTranscript(
      [
        { start: 0, end: 1, text: "alpha" },
        { start: 1, end: 1, text: "" },
        { start: 1, end: 2, text: "beta" },
      ],
      "alpha beta",
    );
    assert.deepEqual(m, [{ line: 0, endLine: 2 }]);
  });
  it("matches do not overlap", () => {
    assert.equal(searchTranscript([{ start: 0, end: 1, text: "aaaa" }], "aa").length, 2);
  });
  it("searches ALL lines, not a window: a hit at line 4,900 of 5,000 is found", () => {
    const big = make(5000);
    big[4900].text = "needle here";
    const m = searchTranscript(big, "needle");
    assert.deepEqual(m, [{ line: 4900, endLine: 4900 }]);
  });
});

describe("match counter and stepping", () => {
  it("formats 3/9", () => {
    assert.equal(formatMatchCounter(2, 9), "3/9");
    assert.equal(formatMatchCounter(0, 0), "0/0");
    assert.equal(formatMatchCounter(50, 9), "9/9");
  });
  it("wraps around in both directions", () => {
    assert.equal(stepMatch(8, 9, 1), 0);
    assert.equal(stepMatch(0, 9, -1), 8);
    assert.equal(stepMatch(3, 9, 1), 4);
    assert.equal(stepMatch(0, 0, 1), -1);
  });
});

describe("snapRange (outward to whole caption lines)", () => {
  const lines = make(10); // 3s each: [0,3] [3,6] ...
  it("empty transcript -> null", () => {
    assert.equal(snapRange([], 1, 2), null);
    assert.equal(snapRangeByIndex([], 0, 1), null);
  });
  it("mid-line start and mid-line end widen to line edges", () => {
    const r = snapRange(lines, 4, 10)!;
    assert.deepEqual([r.start, r.end, r.first, r.last], [3, 12, 1, 3]);
  });
  it("an end exactly on a line boundary does not pull in the next line", () => {
    const r = snapRange(lines, 3, 6)!;
    assert.deepEqual([r.start, r.end], [3, 6]);
  });
  it("swapped arguments", () => {
    const r = snapRange(lines, 10, 4)!;
    assert.deepEqual([r.start, r.end], [3, 12]);
  });
  it("a zero-length range snaps to the single line at that time", () => {
    const r = snapRange(lines, 7, 7)!;
    assert.deepEqual([r.start, r.end, r.first, r.last], [6, 9, 2, 2]);
  });
  it("before the first line and after the last line clamp", () => {
    const r1 = snapRange(lines, -50, 1)!;
    assert.deepEqual([r1.start, r1.end], [0, 3]);
    const r2 = snapRange(lines, 28, 9999)!;
    assert.deepEqual([r2.start, r2.end], [27, 30]);
  });
  it("end in a gap after a line pulls in the next line, so the range still covers it", () => {
    const gap: Line[] = [
      { start: 0, end: 2, text: "a" },
      { start: 5, end: 7, text: "b" },
    ];
    const r = snapRange(gap, 0.5, 3)!;
    assert.deepEqual([r.start, r.end], [0, 7]);
    assert.ok(r.start <= 0.5 && r.end >= 3);
  });
  it("overlapping lines: span covers the earliest start and latest end within the picked lines", () => {
    const ov: Line[] = [
      { start: 0, end: 10, text: "long" },
      { start: 4, end: 6, text: "inner" },
      { start: 8, end: 9, text: "tail" },
    ];
    const r = snapRange(ov, 5, 8.5)!;
    assert.deepEqual([r.start, r.end, r.first, r.last], [4, 9, 1, 2]);
  });
  it("zero-length lines are snapped, not dropped", () => {
    const z: Line[] = [
      { start: 0, end: 0, text: "a" },
      { start: 1, end: 1, text: "b" },
      { start: 2, end: 3, text: "c" },
    ];
    // 1.5 sits after zero-length "b" (end 1), so the next line "c" is pulled in to cover it.
    const r = snapRange(z, 0.5, 1.5)!;
    assert.deepEqual([r.first, r.last, r.start, r.end], [0, 2, 0, 3]);
    const only = snapRange(z, 1, 1)!;
    assert.deepEqual([only.first, only.last, only.start, only.end], [1, 1, 1, 1]);
  });
  it("by index clamps and orders", () => {
    const r = snapRangeByIndex(lines, 7, 2)!;
    assert.deepEqual([r.first, r.last, r.start, r.end], [2, 7, 6, 24]);
    const c = snapRangeByIndex(lines, -5, 99)!;
    assert.deepEqual([c.first, c.last], [0, 9]);
  });
  it("snapped range always covers the requested one inside the transcript", () => {
    for (let k = 0; k < 200; k++) {
      const a = (k * 7.3) % 29;
      const b = a + ((k * 3.1) % 5);
      const r = snapRange(lines, a, b)!;
      assert.ok(r.start <= a + 1e-9, `start ${r.start} > ${a}`);
      assert.ok(r.end >= Math.min(b, 30) - 1e-9, `end ${r.end} < ${b}`);
    }
  });
});

describe("used ranges", () => {
  const ranges = [{ start: 10, end: 20 }];
  it("overlap is strict at the edges", () => {
    assert.equal(isLineUsed({ start: 7, end: 10, text: "" }, ranges), false);
    assert.equal(isLineUsed({ start: 20, end: 23, text: "" }, ranges), false);
    assert.equal(isLineUsed({ start: 9, end: 11, text: "" }, ranges), true);
    assert.equal(isLineUsed({ start: 19, end: 22, text: "" }, ranges), true);
    assert.equal(isLineUsed({ start: 12, end: 13, text: "" }, ranges), true);
  });
  it("zero-length lines count by their instant", () => {
    assert.equal(isLineUsed({ start: 10, end: 10, text: "" }, ranges), true);
    assert.equal(isLineUsed({ start: 20, end: 20, text: "" }, ranges), false);
    assert.equal(isLineUsed({ start: 5, end: 5, text: "" }, ranges), false);
  });
  it("no ranges -> not used", () => {
    assert.equal(isLineUsed({ start: 12, end: 13, text: "" }, []), false);
  });
});

it("copy text: the whole transcript and only the words inside a range", async () => {
  const { wholeTranscriptText, wordsInRanges } = await import("./transcript");
  const lines = [
    { start: 0, end: 4, text: "welcome back" },
    { start: 4, end: 9, text: "that is a pricing problem" },
    { start: 9, end: 15, text: "nobody wants to hear this" },
  ];
  assert.equal(wholeTranscriptText(lines), "welcome back\nthat is a pricing problem\nnobody wants to hear this");
  assert.equal(wordsInRanges(lines, [{ start: 5, end: 10 }]), "that is a pricing problem\nnobody wants to hear this");
  assert.equal(wordsInRanges(lines, []), "");
});

describe("dragging snaps to words (B-10)", () => {
  const timed = { start: 10, end: 14, text: "so here is what", words: [
    { start: 10, end: 10.8, text: "so" }, { start: 10.9, end: 11.9, text: "here" },
    { start: 12, end: 12.6, text: "is" }, { start: 12.7, end: 14, text: "what" } ] };
  const plain = { start: 20, end: 30, text: "aaaa bbbb", };
  it("uses the cue's word times where present", () => {
    assert.deepEqual(wordBoundsAt(timed, 0.3), { start: 10.9, end: 11.9 }); // "here"
    assert.deepEqual(wordBoundsAt(timed, 0.99), { start: 12.7, end: 14 }); // "what"
  });
  it("spreads the line's time over its characters when there are no word times", () => {
    const b = wordBoundsAt(plain, 0.9);
    assert.ok(b.start > 20 && b.start < 30 && b.end === 30);
  });
  it("a drag runs from the start of the first word to the end of the last, in either direction", () => {
    const lines = [timed, plain];
    const fwd = snapRangeToWords(lines, { line: 0, frac: 0.3 }, { line: 0, frac: 0.99 });
    assert.deepEqual(fwd, { start: 10.9, end: 14 });
    assert.deepEqual(snapRangeToWords(lines, { line: 0, frac: 0.99 }, { line: 0, frac: 0.3 }), fwd);
    const across = snapRangeToWords(lines, { line: 0, frac: 0.3 }, { line: 1, frac: 0.1 });
    assert.equal(across?.start, 10.9);
    assert.ok(across && across.end < 30 && across.end > 20, "ends mid-line, not at the end of the whole line");
  });
});

it("B2-7: search ignores accents both ways", () => {
  const lines = [{ start: 0, end: 2, text: "Meet me at the café" }, { start: 2, end: 4, text: "naive plans" }, { start: 4, end: 6, text: "a naïve idea" }];
  assert.deepEqual(searchTranscript(lines, "cafe").map((m) => m.line), [0]);
  assert.deepEqual(searchTranscript(lines, "café").map((m) => m.line), [0]);
  assert.deepEqual(searchTranscript(lines, "NAIVE").map((m) => m.line), [1, 2]);
});

it("B2-6: a drag inside one caption line is a drag, a still press is a click", () => {
  assert.equal(isClickDrag({ line: 3, frac: 0.4 }, { line: 3, frac: 0.4 }), true);
  assert.equal(isClickDrag({ line: 3, frac: 0.4 }, { line: 3, frac: 0.41 }), true);
  assert.equal(isClickDrag({ line: 3, frac: 0.2 }, { line: 3, frac: 0.7 }), false);
  assert.equal(isClickDrag({ line: 3, frac: 0.4 }, { line: 4, frac: 0.4 }), false);
});
