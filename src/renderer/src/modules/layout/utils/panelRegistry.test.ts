/**
 * File: panelRegistry.test.ts
 * Description: The slot API: registering adds a panel, registering the same id replaces it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { clearPanelsForTest, getPanel, listPanels, panelsVersion, registerPanel } from "./panelRegistry";

test("registerPanel adds a panel; the same id replaces it and keeps its place", () => {
  clearPanelsForTest();
  const A = () => null;
  const B = () => null;
  registerPanel({ id: "a", title: "A", group: "left", component: A });
  registerPanel({ id: "b", title: "B", group: "left", component: A });
  const v = panelsVersion();
  registerPanel({ id: "a", title: "A2", group: "left", component: B });
  assert.ok(panelsVersion() > v, "a replace is announced so the shell re-renders");
  assert.deepEqual(listPanels().map((p) => p.id), ["a", "b"]);
  assert.equal(getPanel("a")?.component, B);
  assert.equal(getPanel("a")?.title, "A2");
  assert.equal(getPanel("a")?.closable, true, "closable by default");
});
