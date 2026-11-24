/**
 * File: HelpButton.test.tsx
 * Description: F-3 — the "?" must be drawn above every layer that covers the app, and the Copy
 *   blocks panel must sit under the header. These are stacking rules, so the test reads the
 *   z-indexes the product actually uses; the live click is verified in the audit harness.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

test("F-3: Symbols, Copy blocks and Help are all the one centred dialog, not three shapes", () => {
  // They were a right-edge drawer plus two panels pinned under the header, which needed
  // clearance maths between them to avoid overlapping. One shape removes that whole class
  // of bug, so the rule worth protecting is that none of them grows its own overlay again.
  for (const f of ["features/handoff/components/SymbolPalette.tsx", "features/handoff/components/CopyBlocks.tsx", "features/help/components/HelpDrawer.tsx"]) {
    const src = readFileSync(join(SRC, f), "utf8");
    assert.match(src, /<CentredDialog\b/, `${f} must render the shared dialog`);
    assert.doesNotMatch(src, /className="surface-panel fixed/, `${f} must not pin its own panel`);
  }
});

test("F-3: the dialog layer is above the app and below the spotlight", () => {
  const dialog = Number(/className=\{`fixed inset-0 z-\[(\d+)\]/.exec(readFileSync(join(SRC, "shared/components/CentredDialog.tsx"), "utf8"))?.[1]);
  assert.ok(dialog > 50 && dialog < 60, `dialog z ${dialog}`);
});

test("F-3: Help stays non-modal, or its own tutorials become impossible to follow", () => {
  // A help step spotlights a real control and asks the user to press it. A scrim over the
  // app would swallow that click, so Help must never become modal.
  const help = readFileSync(join(SRC, "features/help/components/HelpDrawer.tsx"), "utf8");
  assert.match(help, /modal=\{false\}/, "Help must pass modal={false}");
});

test("F-3: the slot stays in the header layout and the button keeps its id", () => {
  const html = renderToStaticMarkup(createElement(HelpButton, { open: false, onToggle: () => {} }));
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /class="icon-btn[^"]*"/);
  const src = readFileSync(join(SRC, "features/help/components/HelpButton.tsx"), "utf8");
  assert.match(src, /createPortal\(/);
  assert.match(src, /id="ui-help-button"/);
});
