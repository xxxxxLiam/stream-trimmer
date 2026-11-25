/**
 * File: appMenu.ts
 * Path: src/main/modules/windows/appMenu.ts
 * Description: The application menu. It is Electron's usual one (App on macOS, File, Edit, View, Window)
 *   except that View's Zoom In goes through the zoom cap: the built-in zoomIn role would zoom past
 *   where the workspace still fits, because the cap otherwise only guards the key chord and the wheel.
 *   The template is built here, apart from Electron, so it can be tested.
 */
import { zoomInTarget } from "./zoomLimit";

/** What the menu needs from a window: its zoom level and its content width. */
export type ZoomTarget = {
  getZoomLevel: () => number;
  setZoomLevel: (level: number) => void;
  contentWidth: () => number;
};

export type MenuTemplateItem = {
  role?: string;
  label?: string;
  accelerator?: string;
  type?: "separator";
  submenu?: MenuTemplateItem[];
  click?: () => void;
};

/** Zoom In for the menu: one step, unless the cap says no. Returns whether the zoom changed. */
export function zoomInFromMenu(target: ZoomTarget | null | undefined): boolean {
  if (!target) return false;
  const next = zoomInTarget(target.getZoomLevel(), target.contentWidth());
  if (next === null) return false;
  target.setZoomLevel(next);
  return true;
}

export function appMenuTemplate(platform: string, focusedZoom: () => ZoomTarget | null | undefined): MenuTemplateItem[] {
  const view: MenuTemplateItem = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { label: "Zoom In", accelerator: "CommandOrControl+Plus", click: () => void zoomInFromMenu(focusedZoom()) },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };
  return [...(platform === "darwin" ? [{ role: "appMenu" }] : []), { role: "fileMenu" }, { role: "editMenu" }, view, { role: "windowMenu" }];
}
