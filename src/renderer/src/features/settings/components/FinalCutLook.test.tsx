/**
 * File: FinalCutLook.test.tsx
 * Description: The "Your look" row: a drop zone with no saved looks, a list with saved looks (current
 *   ticked, No look, Upload a new look), one error sentence under the row, and the steps in place.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import FinalCutLook, { type FinalCutLookProps } from "./FinalCutLook";

const base: FinalCutLookProps = {
  saved: [],
  currentId: null,
  found: "",
  problem: "",
  open: false,
  guide: false,
  inputRef: { current: null },
  onToggleOpen() {},
  onToggleGuide() {},
  onChoose() {},
  onFile() {},
  onPick() {},
  onRemove() {},
  usedIds: [],
};
const html = (p: Partial<FinalCutLookProps>) => renderToStaticMarkup(<FinalCutLook {...base} {...p} />);
const looks = [{ id: "look-1", name: "Acme look", xml: "<x/>" }, { id: "look-2", name: "Nova look", xml: "<y/>" }];

test("no saved looks: a drop zone with Choose file", () => {
  const h = html({});
  assert.match(h, /Drop your Final Cut export, or choose a file/);
  assert.match(h, />Choose file</);
});

test("saved looks: the current one is shown and the list has No look and Upload a new look", () => {
  const h = html({ saved: looks, currentId: "look-2", open: true, found: "Scale 120%" });
  assert.match(h, /Nova look/);
  assert.match(h, /aria-selected="true"[^>]*>(?:<span[^>]*>✓<\/span>)<span[^>]*>Nova look/);
  assert.match(h, /No look/);
  assert.match(h, /Upload a new look…/);
  assert.match(h, /Found: Scale 120%/);
});

test("a look in use cannot be deleted", () => {
  const h = html({ saved: looks, currentId: "look-1", open: true, usedIds: ["look-1"] });
  assert.match(h, /aria-label="Delete Acme look" aria-disabled="true"/);
  assert.match(h, /aria-label="Delete Nova look" aria-disabled="false"/);
});

test("an error is one sentence in red, and the steps open in place", () => {
  const h = html({ problem: "No video clip was found in that export.", guide: true });
  assert.match(h, /role="alert"[^>]*text-error[^>]*>No video clip was found/);
  assert.match(h, /Show Package Contents/);
  assert.doesNotMatch(html({}), /Show Package Contents/);
});

test("wiring: the row is fed by the saved-looks hook; the old paste editor is gone", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const dir = new URL(".", import.meta.url).pathname;
  const drawer = readFileSync(`${dir}SettingsDrawer.tsx`, "utf8");
  assert.match(drawer, /useFinalCutLook\(/);
  assert.match(drawer, /\blook,\n/);
  assert.equal(existsSync(`${dir}../../handoff/components/LookEditor.tsx`), false);
  const handoff = readFileSync(`${dir}../../handoff/components/EditorHandoff.tsx`, "utf8");
  assert.doesNotMatch(handoff, /LookEditor|My look/);
  const hook = readFileSync(`${dir}../hooks/useFinalCutLook.ts`, "utf8");
  assert.match(hook, /addPickedLook/);
  assert.match(hook, /deleteSavedLook/);
});
