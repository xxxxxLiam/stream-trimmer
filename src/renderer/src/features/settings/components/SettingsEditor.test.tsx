/**
 * File: SettingsEditor.test.tsx
 * Description: Picking an editor opens its setup with a quiet "Skip for now" marked not recommended; the page reached
 *   from a campaign's settings has no skip. The Clip menu's pick reaches the app through the setup request.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { onEditorSetupRequest, requestEditorSetup } from "../../../shared/utils/editorSetupRequest";
import SettingsEditor from "./SettingsEditor";

const base = { campaignName: "Acme", label: "Premiere Pro", finalCut: null, onBack: () => {}, onClose: () => {} };

test("Skip for now shows only when the page opened from the Clip menu, and says it is not recommended", () => {
  const picked = renderToStaticMarkup(<SettingsEditor {...base} onSkip={() => {}} />);
  assert.match(picked, />Skip for now</);
  assert.match(picked, /Not recommended/);
  assert.doesNotMatch(renderToStaticMarkup(<SettingsEditor {...base} />), /Skip for now/);
});

test("choosing an editor in the Clip menu raises the setup request the app listens for", () => {
  const got: string[] = [];
  const off = onEditorSetupRequest((e) => got.push(e));
  requestEditorSetup("finalcut");
  off();
  requestEditorSetup("resolve");
  assert.deepEqual(got, ["finalcut"]);
  const ctl = readFileSync("src/renderer/src/features/player/hooks/useClipController.ts", "utf8");
  assert.match(ctl, /setDestination\(d\);[\s\S]*requestEditorSetup\(d\)/);
});
