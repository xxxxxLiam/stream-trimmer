import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("C-9: the end card's Open the bank and Open a video do something (they bring their panel forward)", () => {
  const app = readFileSync("src/renderer/src/routes/App.tsx", "utf8");
  assert.doesNotMatch(app, /onOpenBank: \(\) => \{\}/);
  assert.doesNotMatch(app, /onOpenVideo: \(\) => \{\}/);
  assert.match(app, /onOpenBank: \(\) => focusPanel\("export"\)/);
  assert.match(app, /onOpenVideo: \(\) => focusPanel\("videos"\)/);
  assert.match(app, /openPanelById\(id\)/);
});
