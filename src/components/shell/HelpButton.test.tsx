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

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
  const others = zClasses().filter((z) => z.file !== "components/shell/HelpButton.tsx");
  assert.ok(others.length > 5, "the scan found the app's z-index classes");
  const highest = Math.max(...others.map((o) => o.z));
  assert.ok(HELP_BUTTON_Z > highest, `help button z ${HELP_BUTTON_Z} must exceed ${highest}`);
});

test("F-3: the Copy blocks panel sits under the header, so it cannot cover the header's controls", () => {
  const header = Number(/<header className="[^"]*\bz-(\d+)/.exec(readFileSync(join(SRC, "components/shell/AppHeader.tsx"), "utf8"))?.[1]);
  const panel = Number(/aria-label="Copy blocks"\s*className="[^"]*\bz-(\d+)/.exec(readFileSync(join(SRC, "components/CopyBlocks.tsx"), "utf8"))?.[1]);
  assert.ok(Number.isFinite(header) && Number.isFinite(panel), `header ${header}, panel ${panel}`);
  assert.ok(panel < header, `Copy blocks z-${panel} must be below the header z-${header}`);
});

test("F-3: the help drawer is above the modal scrim and below the spotlight", () => {
  const drawer = Number(/id="ui-help-drawer"\s*aria-label="Help"\s*className="[^"]*\bz-\[(\d+)\]/.exec(readFileSync(join(SRC, "components/HelpDrawer.tsx"), "utf8"))?.[1]);
  assert.ok(drawer > 50 && drawer < 60, `drawer z ${drawer}`);
});

test("F-3: the slot stays in the header layout and the button keeps its id", () => {
  const html = renderToStaticMarkup(createElement(HelpButton, { open: false, onToggle: () => {} }));
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /class="icon-btn[^"]*"/);
  const src = readFileSync(join(SRC, "components/shell/HelpButton.tsx"), "utf8");
  assert.match(src, /createPortal\(/);
  assert.match(src, /id="ui-help-button"/);
});
