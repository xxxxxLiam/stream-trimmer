/**
 * File: ThreeColumnLayout.test.tsx
 * Description: H-3/H-4/B-10 (the default window opened below the three-column breakpoint),
 *   B-3 (preview overflowed over the mark bar) and H-6 (no visible scrollbars).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ThreeColumnLayout, { THREE_COLUMN_MIN_PX } from "./ThreeColumnLayout";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function windowSize() {
  const main = read("electron/main.cjs");
  const opts = /mainWindow = new BrowserWindow\(\{([^}]*)\}/.exec(main)![1];
  const num = (k: string) => Number(new RegExp(`\\b${k}:\\s*(\\d+)`).exec(opts)![1]);
  return { width: num("width"), minWidth: num("minWidth") };
}

test("H-3: the three-column breakpoint is at or below the width the app opens at", () => {
  const css = read("src/styles.css");
  const m = /@container \(min-width: (\d+)px\)\s*\{\s*\.cols-row/.exec(css);
  assert.ok(m, "styles.css has the @container rule for .cols-row");
  assert.equal(Number(m![1]), THREE_COLUMN_MIN_PX, "CSS and the exported constant agree");
  const { width, minWidth } = windowSize();
  assert.ok(THREE_COLUMN_MIN_PX <= width, `breakpoint ${THREE_COLUMN_MIN_PX} <= default window ${width}`);
  assert.ok(THREE_COLUMN_MIN_PX > minWidth, "the minimum window still degrades to the stacked layout");
});

test("H-3: no window-width breakpoint is left in the layout markup", () => {
  const html = renderToStaticMarkup(
    <ThreeColumnLayout transcript={<i />} centre={<i />} clips={<i />} />,
  );
  assert.ok(!/min-\[\d+px\]/.test(html), "columns must not depend on the window width");
  assert.match(html, /cols-host/);
  assert.match(html, /id="ui-col-clips"/);
});

test("B-3: centre-column children never shrink under their own content", () => {
  const html = renderToStaticMarkup(
    <ThreeColumnLayout transcript={<i />} centre={<i />} clips={<i />} />,
  );
  assert.match(html, /id="ui-col-centre"[^>]*\[&amp;&gt;\*\]:shrink-0/);
  const preview = read("src/components/PreviewPanel.tsx");
  assert.match(preview, /<div className="flex min-w-0 shrink-0 flex-col gap-4">/);
  assert.ok(!/flex min-h-0 min-w-0 flex-1 flex-col gap-4/.test(preview));
});

test("H-6: scrollbars are hidden app-wide, scrolling is not disabled", () => {
  const css = read("src/styles.css");
  assert.match(css, /\*::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0;\s*\}/);
  assert.match(css, /\*\s*\{\s*scrollbar-width:\s*none;\s*-ms-overflow-style:\s*none;\s*\}/);
  assert.ok(!/overflow:\s*hidden\s*!important/.test(css));
});

test("H-6: the layout's scroll area is keyboard-focusable", () => {
  const html = renderToStaticMarkup(
    <ThreeColumnLayout transcript={<i />} centre={<i />} clips={<i />} />,
  );
  assert.match(html, /role="region"[^>]*tabindex="0"|tabindex="0"[^>]*role="region"/);
});
