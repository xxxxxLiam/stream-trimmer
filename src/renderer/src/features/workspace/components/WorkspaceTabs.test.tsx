/**
 * File: WorkspaceTabs.test.tsx
 * Description: The strip is a real tablist (roles, roving tabindex, labelled close buttons),
 *   its close affordance is always laid out so it cannot move the strip, and the shortcuts
 *   and keyboard reorder exist in the source that ships.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceProvider } from "../hooks/WorkspaceContext";
import WorkspaceTabs from "./WorkspaceTabs";

const here = dirname(fileURLToPath(import.meta.url));
const html = renderToStaticMarkup(createElement(WorkspaceProvider, null, createElement(WorkspaceTabs)));

test("the strip is a labelled tablist with one tab in the tab order", () => {
  assert.match(html, /role="tablist"[^>]*aria-label="Workspace tabs"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="status"/, "reorders are announced");
});

test("close is a labelled button that is always laid out (opacity only, no display toggle)", () => {
  assert.match(html, /aria-label="Close /);
  assert.match(html, /absolute right-1/);
  assert.doesNotMatch(html, /hidden group-hover:/);
  assert.doesNotMatch(html, /overflow-x-scroll/);
});

test("the keyboard route for every mouse gesture exists", () => {
  const src = readFileSync(join(here, "WorkspaceTabs.tsx"), "utf8");
  for (const k of ["ArrowLeft", "Home", "End", "Delete", "F2"]) assert.ok(src.includes(`"${k}"`), k);
  assert.ok(src.includes("onAuxClick"), "middle-click closes");
  assert.ok(src.includes("moveTab(id, to)"), "Ctrl/Cmd+Shift+Arrow reorders");
  const ctx = readFileSync(join(here, "..", "hooks", "WorkspaceContext.tsx"), "utf8");
  for (const needle of ['k === "t"', 'k === "w"', "indexForDigit"]) assert.ok(ctx.includes(needle), needle);
});
