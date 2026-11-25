/**
 * File: UnsavedRange.test.tsx
 * Description: A range that is not a clip yet shows "Create clip · length" and a remove × on its bar.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UnsavedRange } from "./ClipsLane";

const noop = () => {};

test("the unsaved range's bar has the Create clip pill with the length and the × with its Esc hint", () => {
  const html = renderToStaticMarkup(<UnsavedRange style={{ left: 10, width: 300 }} length="0:42" blocked={null} onCreate={noop} onRemove={noop} />);
  assert.match(html, /Create clip · 0:42/);
  assert.match(html, /aria-label="Remove this range \(Esc\)"/);
  assert.match(html, /bg-ice text-bg/);
});

test("a blocked clip (over the cap) dims the pill and says why", () => {
  const html = renderToStaticMarkup(<UnsavedRange style={{ left: 10, width: 300 }} length="12:00" blocked="Clips can be up to 10 minutes." onCreate={noop} onRemove={noop} />);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /title="Clips can be up to 10 minutes\."/);
});

test("a narrow bar puts the × just outside its right edge so it never covers the pill", () => {
  const html = renderToStaticMarkup(<UnsavedRange style={{ left: 10, width: 40 }} length="0:08" blocked={null} onCreate={noop} onRemove={noop} />);
  assert.match(html, /left:100%/);
});
