/**
 * File: ColumnHandle.test.tsx
 * Description: The handle is a real, focusable, labelled separator; the stylesheet only
 *   applies dragged widths inside the wide container query; the layout persists them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ColumnHandle from "./ColumnHandle";
import ColumnToggle from "./ColumnToggle";
import ThreeColumnLayout from "./ThreeColumnLayout";
import { COLUMN_WIDTHS_KEY, RAIL_PX } from "./columnSizes";

const noop = () => {};
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

test("handle: separator semantics, value range, label, tab stop, reset hint", () => {
  const html = renderToStaticMarkup(
    <ColumnHandle kind="clips" value={260} min={200} max={480} onKeyMove={noop} onDragStart={noop} onDragTo={noop} onDragEnd={noop} onReset={noop} />,
  );
  assert.match(html, /role="separator"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /aria-valuenow="260"/);
  assert.match(html, /aria-valuemin="200"/);
  assert.match(html, /aria-valuemax="480"/);
  assert.match(html, /aria-label="Resize clips column"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /title="[^"]*[Dd]ouble-click[^"]*"/);
});

test("stylesheet: dragged widths and handles exist only inside the wide container query", () => {
  const outside = css.replace(/@container \(min-width: 840px\) \{[\s\S]*?\n\}\n/g, "");
  assert.ok(!/var\(--col-[tc]\)/.test(outside), "no rule outside the wide query reads --col-t/--col-c");
  assert.match(outside, /\.col-handle,\s*\.col-pill,\s*\.col-rail\s*\{\s*display:\s*none;/);
});

test("layout: with no measured width (stacked or first paint) there are no handles and no inline widths", () => {
  const html = renderToStaticMarkup(<ThreeColumnLayout transcript={<i />} centre={<i />} clips={<i />} />);
  assert.ok(!/role="separator"/.test(html));
  assert.ok(!/--col-t/.test(html));
  assert.ok(!/data-sized/.test(html));
});

test("persistence key is the documented one", () => {
  assert.equal(COLUMN_WIDTHS_KEY, "clipper.columnWidths");
});

test("toggle (shown): a real button, named for what it hides, aria-expanded true", () => {
  const html = renderToStaticMarkup(<ColumnToggle kind="transcript" collapsed={false} onToggle={noop} />);
  assert.match(html, /^<button type="button"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-label="Hide transcript"/);
  assert.match(html, /aria-controls="ui-col-transcript"/);
});

test("toggle (collapsed): a visible labelled rail that says what it reopens", () => {
  const html = renderToStaticMarkup(<ColumnToggle kind="clips" collapsed onToggle={noop} />);
  assert.match(html, /^<button type="button"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Show clips"/);
  assert.match(html, /col-rail-label">Clips</, "the visible label names the column");
  assert.ok(!/tabindex="-1"/.test(html), "it is in the tab order");
});

test("the two forms share one id, so focus can follow the toggle", () => {
  const a = renderToStaticMarkup(<ColumnToggle kind="clips" collapsed={false} onToggle={noop} />);
  const b = renderToStaticMarkup(<ColumnToggle kind="clips" collapsed onToggle={noop} />);
  assert.match(a, /id="ui-toggle-clips"/);
  assert.match(b, /id="ui-toggle-clips"/);
});

test("stylesheet: hiding a column only happens inside the wide query, and the block is still stated once", () => {
  const outside = css.replace(/@container \(min-width: 840px\) \{[\s\S]*?\n\}\n/g, "");
  assert.ok(!/data-hide-/.test(outside), "stacked columns can never be hidden");
  assert.match(css, /\.cols-row\[data-hide-transcript\] \.cols-transcript,\s*\.cols-row\[data-hide-clips\] \.cols-clips\s*\{\s*display:\s*none;/);
  assert.match(outside, /\.col-rail\s*\{\s*display:\s*none;/);
  assert.equal((css.match(/@container \(min-width: 840px\)/g) ?? []).length, 1);
});

test("stylesheet: the rail width matches RAIL_PX", () => {
  const m = /\.col-rail\s*\{[^}]*flex:\s*0 0 (\d+)px/.exec(css);
  assert.ok(m);
  assert.equal(Number(m![1]), RAIL_PX);
});

test("layout: unmeasured (stacked or first paint) shows no toggles and no hide flags", () => {
  const html = renderToStaticMarkup(<ThreeColumnLayout transcript={<i />} centre={<i />} clips={<i />} />);
  assert.ok(!/ui-toggle-/.test(html));
  assert.ok(!/data-hide-/.test(html));
});
