/**
 * File: MarkBar.cutRow.test.ts
 * Path: src/renderer/src/features/clips/components/MarkBar.cutRow.test.ts
 * Description: Cut is the primary action and must be reachable WITHOUT burying the controls
 * before it (B2-1, H2-1). Run 1 made the Cut row sticky; that put an opaque row over In, Out,
 * Add and the segment list at 1100x760 and at every 600-660px window. The row is now in flow,
 * directly under In/Out/Add, and the segment list (the thing that grows) comes after it and
 * scrolls inside itself. Source-level because the repo has no DOM test environment; the
 * measured hit-tests are in audit/run-2/fixes/RB.md.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./MarkBar.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const list = readFileSync(new URL("./SegmentList.tsx", import.meta.url), "utf8");

test("the Cut row is in flow: nothing is sticky, fixed or z-indexed over the mark bar", () => {
  const rowStart = src.indexOf('id="ui-cut-row"');
  assert.ok(rowStart > 0, "ui-cut-row exists");
  const openTag = src.slice(src.lastIndexOf("<div", rowStart), src.indexOf(">", rowStart));
  assert.doesNotMatch(openTag, /\b(sticky|fixed|absolute)\b|\bz-\d+|-m[xb]-4/);
  assert.doesNotMatch(css, /\.cut-row\b/, "no .cut-row rule is left in the stylesheet");
  assert.doesNotMatch(css, /position:\s*sticky/);
  const cutAt = src.indexOf('id="ui-cut"');
  assert.ok(cutAt > rowStart, "Cut is after the row opens");
  const afterCut = src.slice(cutAt);
  assert.ok(afterCut.indexOf("</button>") < afterCut.indexOf("</div>"), "Cut is inside the row");
});

test("order in the mark bar: In, Out, Add, then Cut, then the segment list", () => {
  const at = (needle: string) => {
    const i = src.indexOf(needle);
    assert.ok(i > 0, `${needle} present`);
    return i;
  };
  const order = [at('id="ui-mark-in"'), at('id="ui-mark-out"'), at('id="ui-add-segment"'), at('id="ui-cut-row"'), at("<SegmentList")];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("the segment list scrolls inside itself and stays keyboard-reachable", () => {
  assert.match(list, /className="seg-scroll"/);
  const rule = /\.seg-scroll\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, ".seg-scroll rule exists");
  assert.match(rule![1], /max-height:/);
  assert.match(rule![1], /overflow-y:\s*auto/);
  // Every row is a real button, so Tab reaches all of them.
  assert.match(list, /<button\s+type="button"\s+className="flex min-w-0 flex-1/);
  assert.match(list, /aria-label=\{`Remove segment/);
});

test("the player fills the column, and the controls under it stay reachable", () => {
  // The player used to be capped by viewport height so In, Out, Add and Cut always sat
  // above the fold. That cost a letterboxed video with dead bars either side on any normal
  // desktop — about 656px inside a column over 1100px wide — and the owner would rather
  // scroll for a bigger picture. The cap is gone deliberately.
  //
  // What still has to hold is the reason the cap existed: the controls must remain
  // reachable. They are, because the workspace scrolls and is focusable, which is also
  // what the hidden-scrollbar rule requires of anything scrollable.
  const rule = /\.cols-centre \.aspect-video\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, "the player box still has a rule");
  assert.match(rule![1], /max-width:\s*100%/, "the player fills the centre column");
  assert.doesNotMatch(rule![1], /100vh/, "no viewport-height cap: that is what letterboxed it");

  const layout = readFileSync(new URL("../../../modules/layout/components/ThreeColumnLayout.tsx", import.meta.url), "utf8");
  const host = /className="cols-host[^"]*"/.exec(layout);
  assert.ok(host, "the workspace host is present");
  assert.match(host![0], /overflow-y-auto/, "the workspace scrolls, so a tall player is not a trap");
  assert.match(layout, /tabIndex=\{0\}[\s\S]{0,120}cols-host|cols-host[\s\S]{0,120}tabIndex=\{0\}/, "and it is focusable, so the keyboard reaches the controls");
});

test("no visible scrollbar is introduced, and the rule is stated once", () => {
  assert.match(css, /::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0;?\s*\}/);
  assert.equal((css.match(/::-webkit-scrollbar\s*\{/g) ?? []).length, 1);
  assert.equal((css.match(/@container \(min-width: 840px\)/g) ?? []).length, 1, "one copy of the container block");
});
