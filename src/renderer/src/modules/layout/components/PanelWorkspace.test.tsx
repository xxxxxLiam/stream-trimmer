/**
 * File: PanelWorkspace.test.tsx
 * Description: The shell renders whatever is registered, in the right group, with the right
 *   keyboard semantics, and the real feature panels are all registered by default.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import PanelWorkspace from "./PanelWorkspace";
import PanelTabStrip from "./PanelTabStrip";
import { forgetPanelLayoutForTest } from "../hooks/usePanelLayoutState";
import { clearPanelsForTest, getPanel, listPanels, registerPanel } from "../utils/panelRegistry";

test("the feature panels register themselves: Videos | Transcript | Markers, Export | History, Preview over Timeline", () => {
  assert.deepEqual(
    listPanels().map((p) => `${p.group}:${p.id}`),
    ["left:videos", "left:transcript", "left:markers", "right:export", "right:history", "centre:preview", "centre:timeline"],
  );
  assert.equal(getPanel("export")?.title, "Export", "the right panel is called Export, not Clips");
});

test("the workspace mounts a registered panel in its group, and a replaced panel shows the new body", () => {
  clearPanelsForTest();
  forgetPanelLayoutForTest();
  registerPanel({ id: "videos", title: "Videos", group: "left", component: () => <i>first body</i> });
  registerPanel({ id: "export", title: "Export", group: "right", component: () => <i>export body</i> });
  registerPanel({ id: "preview", title: "Preview", group: "centre", component: () => <i>preview body</i> });
  let html = renderToStaticMarkup(<PanelWorkspace />);
  assert.match(html, /first body/);
  assert.match(html, /export body/);
  assert.match(html, /preview body/);
  assert.match(html, /aria-label="Left panels"/);
  assert.match(html, /aria-label="Right panels"/);

  registerPanel({ id: "videos", title: "Videos", group: "left", component: () => <i>second body</i> });
  html = renderToStaticMarkup(<PanelWorkspace />);
  assert.match(html, /second body/);
  assert.doesNotMatch(html, /first body/);
});

test("the tab strip is a tablist with one tab in the tab order and Close only on the shown tab", () => {
  const C = () => null;
  const tabs = [
    { id: "a", title: "A", group: "left" as const, component: C },
    { id: "b", title: "B", group: "left" as const, component: C },
  ];
  const html = renderToStaticMarkup(
    <PanelTabStrip
      label="Left panels"
      tabs={tabs}
      active="b"
      onActivate={() => {}}
      onClose={() => {}}
      onMove={() => {}}
      addable={[]}
      onAdd={() => {}}
      menuItems={[]}
    />,
  );
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1, "roving tabindex");
  assert.match(html, /aria-label="Close B"/);
  assert.doesNotMatch(html, /aria-label="Close A"/);
  assert.match(html, /aria-label="Add a panel to left panels"/);
});
