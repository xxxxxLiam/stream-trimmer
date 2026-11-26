/**
 * File: PleaseUpdateScreen.test.tsx
 * Description: Board 03.2.55: the blocking "Please update" screen shows both versions and exactly two actions, no
 *   close or skip, no Ice beyond the mark; VersionGate shows the app untouched until the gate says blocked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import PleaseUpdateScreen from "./PleaseUpdateScreen";
import VersionGate from "./VersionGate";
import { DOWNLOAD_URL } from "../utils/versionGate";

const screen = () => renderToStaticMarkup(<PleaseUpdateScreen current="19.4.2" required="19.5.1" onDownload={() => {}} onQuit={() => {}} />);

test("the screen says what is wrong in plain words and shows both versions", () => {
  const html = screen();
  assert.match(html, />Please update Clipr</);
  assert.match(html, /This version is too old to keep running\. Install the latest one and carry on where you left off\./);
  assert.match(html, /Your version[\s\S]*19\.4\.2/);
  assert.match(html, /Needed[\s\S]*19\.5\.1/);
  assert.match(html, /role="alertdialog"/);
});

test("exactly two buttons, Download the update and Quit; no close, skip or later", () => {
  const html = screen();
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.match(html, /id="ui-update-download"[^>]*>Download the update/);
  assert.match(html, /id="ui-update-quit"[^>]*>Quit</);
  assert.doesNotMatch(html, /skip|later|close|dismiss/i);
});

test("Ice appears once, in the mark: the buttons carry no Ice and no fill but the light one", () => {
  const html = screen();
  const buttons = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
  for (const b of buttons) assert.doesNotMatch(b, /ice/);
  assert.match(buttons[0], /bg-fg[^"]*text-bg/);
});

test("the download button goes to the releases page", () => {
  assert.equal(DOWNLOAD_URL, "https://github.com/xxxxxLiam/clipr/releases/latest");
});

test("until the gate answers (and whenever it cannot), the app is shown untouched", () => {
  const html = renderToStaticMarkup(
    <VersionGate>
      <p id="the-app">workspace</p>
    </VersionGate>,
  );
  assert.match(html, /id="the-app"/);
  assert.doesNotMatch(html, /Please update/);
});

test("App wraps everything in the gate, inside the crash boundary", () => {
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /<CrashScreenHost error=\{error\} \/>\}>\s*<VersionGate>\s*<WorkspaceProvider>/);
});
