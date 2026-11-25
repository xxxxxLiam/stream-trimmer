/**
 * File: TranscriptWait.test.tsx
 * Description: The Transcript tab while the transcript is on its way: a dim line and skeleton rows, no spinner.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import TranscriptWait from "./TranscriptWait";

test("the wait shows the dim line and six skeleton rows that pulse, with no spinner", () => {
  const html = renderToStaticMarkup(<TranscriptWait />);
  assert.match(html, /Getting the transcript…/);
  assert.equal((html.match(/h-target/g) ?? []).length, 6);
  assert.match(html, /animate-pulse/);
  assert.doesNotMatch(html, /animate-spin|role="progressbar"/);
});
