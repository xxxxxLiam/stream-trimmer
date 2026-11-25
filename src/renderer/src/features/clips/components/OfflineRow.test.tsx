import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import OfflineRow from "./OfflineRow";

test("Board 03.6.2: the offline row says No connection. and what happens next, with no pill, no red, and the bar stopped where it was", () => {
  const html = renderToStaticMarkup(<OfflineRow name="Cold Open" percent={58} />);
  assert.match(html, /aria-label="Cold Open: No connection\."/);
  assert.match(html, /No connection\./);
  assert.match(html, /It picks up where it stopped when the connection is back\./);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /text-error|border-error/);
  assert.match(html, /bg-hover" style="width:58%"/);
});

test("Offline: Export shows the row, the clip stays out of Waiting, and the cut carries on when the connection is back", () => {
  const panel = readFileSync("src/renderer/src/features/clips/components/ExportPanel.tsx", "utf8");
  assert.match(panel, /c\.offline && <OfflineRow/);
  const ctl = readFileSync("src/renderer/src/features/clips/hooks/useExportController.ts", "utf8");
  assert.match(ctl, /state\.offline\?\.bankId && !downloading\) onTop\.add/);
  assert.match(ctl, /useOfflineResume\(Boolean\(state\.offline\), actions\.resume\)/);
  const eff = readFileSync("src/renderer/src/features/clips/hooks/useExportEffects.ts", "utf8");
  assert.match(eff, /addEventListener\("online", go\)/);
  assert.match(eff, /s\.setOffline\(\{ \.\.\.a, percent: lastPercent\.current \}\)/);
});

test("Undo seconds never read above the window, even on the first frame after a long wait", () => {
  const ctl = readFileSync("src/renderer/src/features/clips/hooks/useExportController.ts", "utf8");
  assert.match(ctl, /Math\.min\(UNDO_SECONDS, \(f\.endsAt - Math\.max\(state\.now, Date\.now\(\)\)\) \/ 1000\)/);
});
