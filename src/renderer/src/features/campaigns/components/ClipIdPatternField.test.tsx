/**
 * File: ClipIdPatternField.test.tsx
 * Description: The clip naming control is a dropdown of worked examples, with the old text box
 *   behind "Advanced / custom…" and the live preview line kept.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ClipIdPatternField from "./ClipIdPatternField";

const render = (pattern: string, prefix = "SHD") =>
  renderToStaticMarkup(createElement(ClipIdPatternField, { pattern, prefix, onChange: () => {} }));

test("a ready-made pattern shows a select of examples built from the campaign's prefix", () => {
  const html = render("{prefix}-{videoId}-{nn}");
  assert.match(html, /<select/);
  assert.match(html, /SHD-9xK2mQ-01 \(client code, video, number\)/);
  assert.match(html, /SHD-01 \(client code and number\)/);
  assert.match(html, /Advanced \/ custom…/);
  assert.match(html, /Next clip looks like <span[^>]*>SHD-9xK2mQ-01</);
  assert.doesNotMatch(html, /Your own naming pattern/, "text box stays hidden for a preset");
});

test("a hand-written pattern opens in custom mode with its text box and a working preview", () => {
  const html = render("{prefix}_{nn}x");
  assert.match(html, /Your own naming pattern/);
  assert.match(html, /value="\{prefix\}_\{nn\}x"/);
  assert.match(html, /SHD_01x/);
});

test("the form and the wizard use this control instead of a free-text pattern box", () => {
  for (const f of ["./CampaignMenu.tsx", "./CampaignWizard.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /<ClipIdPatternField/, f);
    assert.doesNotMatch(src, /Clip id pattern/, f);
  }
});

test("the Data folder field is only offered when the exporter is built in", () => {
  const menu = readFileSync(new URL("./CampaignMenu.tsx", import.meta.url), "utf8");
  assert.match(menu, /dataVisible \? \(\[\["dataDir"/);
  const footer = readFileSync(new URL("../../../modules/layout/components/AppFooter.tsx", import.meta.url), "utf8");
  assert.match(footer, /\{showData && \(/);
});
