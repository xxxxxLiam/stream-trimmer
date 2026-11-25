/**
 * File: StartFreshDialog.test.tsx
 * Description: The one-time start-fresh prompt as drawn, and its wiring: no Esc or outside-click exit,
 *   a failed backup keeps it open, "fresh" reloads, and App mounts it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import StartFreshDialog from "./StartFreshDialog";

const noop = () => {};
const html = (p: { busy?: boolean; error?: string } = {}) =>
  renderToStaticMarkup(
    <StartFreshDialog
      busy={!!p.busy}
      error={p.error ?? ""}
      onStartFresh={noop}
      onKeep={noop}
    />,
  );

test("drawn: title, line, three reassurances, both buttons, the fine print", () => {
  const h = html();
  assert.match(h, /Clipr has changed a lot/);
  assert.match(h, /Most screens work differently now/);
  assert.match(h, /go into a backup first\. Nothing is deleted\./);
  assert.match(h, /walks you through setup again/);
  assert.match(h, /Clips you already made stay in your folders, untouched\./);
  assert.match(h, /Start fresh\s*<span[^>]*>· Recommended</);
  assert.match(h, />Keep my data</);
  assert.match(
    h,
    /Documents\/Clipr backups\/&lt;date&gt;\. You only see this once\./,
  );
  assert.match(h, /max-w-\[520px\]/);
  assert.doesNotMatch(h, /Remind me|Later/);
});

test("a failed backup shows its sentence and busy blocks both buttons", () => {
  assert.match(
    html({ error: "No space left." }),
    /role="alert"[^>]*>No space left\./,
  );
  assert.equal(
    (html({ busy: true }).match(/aria-disabled="true"/g) ?? []).length,
    2,
  );
});

test("Esc and an outside click do nothing: the dialog has no close handler", () => {
  const src = readFileSync(
    new URL("./StartFreshDialog.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(src, /Escape|onMouseDown|onClose/);
});

test("the controller asks once, reloads after fresh, closes after keep, keeps the dialog on failure", () => {
  const src = readFileSync(
    new URL("../hooks/useStartFreshController.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /startFreshPending\?\.\(\)/);
  // V18-F-1: an answered question is remembered for the session, so the reload (or a Keep) never asks or backs up again.
  assert.match(src, /if \(answeredThisSession\(\)\) return;/);
  assert.match(src, /sessionStorage\.setItem\(ANSWERED_KEY, "1"\)/);
  assert.match(src, /if \(!r\.ok\) \{\s*setError/);
  assert.match(
    src,
    /if \(choice === "fresh"\) \{\s*window\.location\.reload\(\)/,
  );
  assert.match(src, /setOpen\(false\)/);
});

test("App mounts it", () => {
  const app = readFileSync(
    join(process.cwd(), "src/renderer/src/routes/App.tsx"),
    "utf8",
  );
  assert.match(app, /<StartFreshPrompt \/>/);
});

test("E3-1: only the visible workspace tab mounts the start-fresh dialog and the restored note", () => {
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /\{active && <StartFreshPrompt \/>\}/);
  assert.match(app, /\{active && <SettingsRestoredNote \/>\}/);
});

test("A3-4: focus starts on Keep my data, stays in the dialog and Tab wraps inside it", () => {
  const src = readFileSync(new URL("./StartFreshDialog.tsx", import.meta.url), "utf8");
  assert.match(src, /useModalFocus\(root, "\[data-start-fresh-first\]"\)/);
  assert.match(src, /ref=\{root\}[\s\S]*onKeyDown=\{onKeyDown\}/);
  assert.match(renderToStaticMarkup(<StartFreshDialog busy={false} error="" onStartFresh={() => {}} onKeep={() => {}} />), /data-start-fresh-first[^>]*>Keep my data</);
  const hook = readFileSync(new URL("../../../shared/hooks/useModalFocus.ts", import.meta.url), "utf8");
  assert.match(hook, /addEventListener\("focusin"/);
  assert.match(hook, /wrapTarget\(focusableIn/);
});

test("A3-6: the scrim is a named token in both dialogs, not a raw rgba", () => {
  const dialog = readFileSync(new URL("./StartFreshDialog.tsx", import.meta.url), "utf8");
  const centred = readFileSync(new URL("../../../shared/components/CentredDialog.tsx", import.meta.url), "utf8");
  for (const src of [dialog, centred]) {
    assert.match(src, /bg-bg-overlay-50/);
    assert.doesNotMatch(src, /rgba\(/);
  }
});
