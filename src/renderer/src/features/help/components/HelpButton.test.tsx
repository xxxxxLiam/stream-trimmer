/**
 * File: HelpButton.test.tsx
 * Description: F-3 — the "?" must be drawn above every layer that covers the app, and the Copy
 *   blocks panel must sit under the header. These are stacking rules, so the test reads the
 *   z-indexes the product actually uses; the live click is verified in the audit harness.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HelpButton, { HELP_BUTTON_Z } from "./HelpButton";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

/** Every Tailwind z-index class (`z-50`, `z-[55]`) in a rendering file, with the file. */
function zClasses(): { file: string; z: number }[] {
  const found: { file: string; z: number }[] = [];
  for (const f of files(SRC)) {
    for (const m of readFileSync(f, "utf8").matchAll(/\bz-(?:\[(\d+)\]|(\d+))/g)) {
      found.push({ file: f.slice(SRC.length + 1), z: Number(m[1] ?? m[2]) });
    }
  }
  return found;
}

test("F-3: the help button is drawn above every other z-index in the app", () => {
  const others = zClasses().filter((z) => z.file !== "features/help/components/HelpButton.tsx");
  assert.ok(others.length > 5, "the scan found the app's z-index classes");
  const highest = Math.max(...others.map((o) => o.z));
  assert.ok(HELP_BUTTON_Z > highest, `help button z ${HELP_BUTTON_Z} must exceed ${highest}`);
});

test("F-3: Copy blocks and the Symbols palette are gone; Symbols in the browser build uses the shared dialog", () => {
  for (const f of ["features/handoff/components/SymbolPalette.tsx", "features/handoff/components/CopyBlocks.tsx"]) {
    assert.equal(existsSync(join(SRC, f)), false, `${f} was replaced by the Transcript Copy menu and the Symbols window`);
  }
  assert.match(readFileSync(join(SRC, "features/symbols/components/SymbolsDialog.tsx"), "utf8"), /<CentredDialog\b/);
});

test("F-3: the dialog layer is above the app and below the spotlight", () => {
  const dialog = Number(/className=\{`fixed inset-0 z-\[(\d+)\]/.exec(readFileSync(join(SRC, "shared/components/CentredDialog.tsx"), "utf8"))?.[1]);
  assert.ok(dialog > 50 && dialog < 60, `dialog z ${dialog}`);
});

test("F-3: Help is a drawer that blocks nothing, never a dialog with a scrim", () => {
  const help = readFileSync(join(SRC, "features/help/components/HelpDrawer.tsx"), "utf8");
  assert.doesNotMatch(help, /CentredDialog/, "Help must not become modal");
  assert.match(help, /<Drawer label="Help">/);
});

test("F-1: the button renders in place, in the top bar's own tab order, and is portalled only while a layer covers the app", () => {
  const html = renderToStaticMarkup(createElement(HelpButton, { open: false, onToggle: () => {} }));
  assert.match(html, /<button[^>]*id="ui-help-button"/, "the live button is in the markup where the top bar puts it");
  assert.doesNotMatch(html, /<span[^>]*aria-hidden="true"/, "no hidden placeholder while nothing covers the app");
  const src = readFileSync(join(SRC, "features/help/components/HelpButton.tsx"), "utf8");
  assert.match(src, /covered && slot/, "the portal is for the covered case only");
  assert.match(src, /data-covers-app/);
  assert.match(src, /id="ui-help-button"/);
  for (const f of ["shared/components/CentredDialog.tsx", "shared/components/OverlayLoader.tsx"]) {
    assert.match(readFileSync(join(SRC, f), "utf8"), /data-covers-app/, `${f} marks itself as covering the app`);
  }
});
