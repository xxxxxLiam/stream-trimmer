/**
 * File: appMenu.test.ts
 * Description: F2-7: the View menu's Zoom In obeys the zoom cap like the key chord and the wheel do.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { appMenuTemplate, zoomInFromMenu, type MenuTemplateItem, type ZoomTarget } from "./appMenu";
import { zoomLevelOf, maxZoomFactor } from "./zoomLimit";

const fake = (level: number, width: number): ZoomTarget & { level: number } => {
  const t = { level, getZoomLevel: () => t.level, setZoomLevel: (l: number) => void (t.level = l), contentWidth: () => width };
  return t;
};

test("Zoom In from the menu steps up below the cap and stops at it", () => {
  const t = fake(0, 1160);
  assert.equal(zoomInFromMenu(t), true);
  assert.equal(t.level, 0.5);
  const limit = zoomLevelOf(maxZoomFactor(1160));
  const atCap = fake(limit - 0.2, 1160);
  assert.equal(zoomInFromMenu(atCap), false);
  assert.equal(atCap.level, limit - 0.2, "unchanged");
  const past = fake(3.5, 1160);
  assert.equal(zoomInFromMenu(past), false);
  assert.equal(zoomInFromMenu(null), false);
});

test("the View menu has no built-in zoomIn role, and its Zoom In goes through the cap", () => {
  const t = fake(3.5, 1160);
  const menu = appMenuTemplate("linux", () => t);
  const view = menu.find((m) => m.label === "View")!;
  const items = view.submenu as MenuTemplateItem[];
  assert.ok(!items.some((i) => i.role === "zoomIn"), "the built-in role bypasses the cap");
  const zoomIn = items.find((i) => i.label === "Zoom In")!;
  assert.equal(zoomIn.accelerator, "CommandOrControl+Plus");
  zoomIn.click!();
  assert.equal(t.level, 3.5, "blocked past the cap");
  const ok = fake(0, 1160);
  appMenuTemplate("linux", () => ok).find((m) => m.label === "View")!.submenu!.find((i) => i.label === "Zoom In")!.click!();
  assert.equal(ok.level, 0.5);
});

test("the standard menus are kept, App only on macOS", () => {
  const roles = (p: string) => appMenuTemplate(p, () => null).map((m) => m.role ?? m.label);
  assert.deepEqual(roles("darwin"), ["appMenu", "fileMenu", "editMenu", "View", "windowMenu"]);
  assert.deepEqual(roles("win32"), ["fileMenu", "editMenu", "View", "windowMenu"]);
});
