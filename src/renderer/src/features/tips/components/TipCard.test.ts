/**
 * File: TipCard.test.ts
 * Description: Liam, 25 Nov: the walkthrough must black out everything but the focused control. Four flat token
 *   panels round a cut-out, none of them taking a click, and the card stays a non-blocking dialog (A4-1).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./TipCard.tsx", import.meta.url), "utf8");

test("the tip dims everything but its target with the overlay token, and lets clicks through", () => {
  assert.match(src, /data-tip-scrim=""[^>]*className="pointer-events-none fixed z-\[59\] bg-bg-overlay-75"/);
  assert.equal((src.match(/\{ top: [^}]*\},/g) ?? []).length >= 4, true, "four panels round the cut-out");
  assert.doesNotMatch(src, /rgba?\(|#[0-9a-fA-F]{3,6}\b|boxShadow/);
  assert.match(src, /border-2 border-ice/);
});

test("the card itself stays non-blocking for shortcuts, so Ctrl+Enter still clips at a tip", () => {
  assert.match(src, /role="dialog"\s+data-nonblocking=""/);
});
