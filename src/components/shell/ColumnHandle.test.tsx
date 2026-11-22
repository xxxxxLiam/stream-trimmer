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
import ThreeColumnLayout from "./ThreeColumnLayout";
import { COLUMN_WIDTHS_KEY } from "./columnSizes";

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
  assert.match(outside, /\.col-handle\s*\{\s*display:\s*none;/);
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
