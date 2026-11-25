/**
 * File: tipAdvance.test.ts
 * Description: F-2 and F-3 — a tip step finishes on the real action (I, O, Clip), never on a stray key;
 *   its card handles keys only while focus is inside it; it has Skip step; it says "Clip", not "Cut".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { clickAdvances, keyAdvances, typingInField } from "./tipAdvance";
import { TIPS } from "./tipRegistry";

const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src/features/tips", f), "utf8");
const key = (k: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; repeat: boolean }> = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, repeat: false, ...o });
const marking = TIPS.find((t) => t.id === "marking")!;

test("F-3: pressing I finishes step 1, O step 2, Clip step 3", () => {
  assert.ok(keyAdvances(marking.steps[0], key("i")));
  assert.ok(keyAdvances(marking.steps[0], key("I")));
  assert.ok(!keyAdvances(marking.steps[0], key("o")), "O is not the step 1 action");
  assert.ok(keyAdvances(marking.steps[1], key("o")));
  assert.ok(keyAdvances(marking.steps[2], key("Enter", { ctrlKey: true })));
  assert.ok(!keyAdvances(marking.steps[2], key("Enter")), "plain Enter is not Clip");
  assert.ok(!keyAdvances(marking.steps[0], key("i", { metaKey: true })), "Cmd I is not the mark key");
  assert.ok(!keyAdvances(marking.steps[0], key("i", { repeat: true })), "a held key counts once");
  assert.ok(!keyAdvances({ target: "#x", text: "t" }, key("i")), "a step with no action waits for Next");
});

test("F-3: clicking the control finishes the step; typing in a field never does", () => {
  const inside = { closest: (s: string) => (s === "#ui-cut" ? {} : null) } as unknown as Element;
  assert.ok(clickAdvances(marking.steps[2], inside));
  assert.ok(!clickAdvances(marking.steps[0], inside));
  assert.ok(!clickAdvances(marking.steps[0], null));
  assert.ok(typingInField({ tagName: "INPUT" } as unknown as EventTarget));
  assert.ok(!typingInField({ tagName: "BUTTON" } as unknown as EventTarget));
});

test("F-3: the card says Clip, has Skip step, and every tip keeps Turn off tips", () => {
  for (const tip of TIPS) for (const s of tip.steps) assert.doesNotMatch(s.text, /\bCut\b/);
  const card = read("components/TipCard.tsx");
  assert.match(card, /Skip step/);
  assert.match(card, /Turn off tips/);
  assert.match(card, /clickAdvances/);
});

test("F-2: the card handles keys only from inside itself, and Enter is left to the focused button", () => {
  const card = read("components/TipCard.tsx");
  assert.match(card, /onKeyDown=\{onCardKey\}/);
  assert.doesNotMatch(card, /window\.addEventListener\("keydown", onKey\);\s*\n\s*return \(\) => window\.removeEventListener\("keydown", onKey\)[\s\S]{0,40}onNext, onBack, onDone/, "no window-wide Enter handler");
  assert.doesNotMatch(card, /e\.key === "Enter"/, "Enter is never intercepted");
});

test("F-2: Turn off tips is one switch in the one controller, saved for every video", () => {
  const c = read("hooks/useTipsController.ts");
  assert.match(c, /setTipsOn\(false\)/);
});
