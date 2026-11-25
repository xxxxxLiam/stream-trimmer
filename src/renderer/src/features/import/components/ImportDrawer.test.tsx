/**
 * File: ImportDrawer.test.tsx
 * Description: The drawer is closed with no text, and App wires paste of rows and the Export button to it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ImportDrawer from "./ImportDrawer";

test("closed when there is no pasted text", () => {
  assert.equal(renderToStaticMarkup(<ImportDrawer text={null} onClose={() => {}} />), "");
});

test("App opens it for pasted rows, and Export asks the host for it", () => {
  const app = readFileSync("src/renderer/src/routes/App.tsx", "utf8");
  assert.match(app, /onMoments: \(text\) => setImportText\(text\)/);
  const exp = readFileSync("src/renderer/src/features/clips/components/ExportPanel.tsx", "utf8");
  assert.match(exp, /host\.openImport\(\)/);
});

test("C-4: the drawer has its own box to paste the sheet into, shown while there is nothing to review", () => {
  const src = readFileSync("src/renderer/src/features/import/components/ImportDrawer.tsx", "utf8");
  assert.match(src, /<textarea[\s\S]*aria-label="Paste rows from your sheet"/);
  assert.match(src, /const showBox = empty \|\| typing/);
});
