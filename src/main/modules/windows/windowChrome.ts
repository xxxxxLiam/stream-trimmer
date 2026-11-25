/**
 * File: windowChrome.ts
 * Path: src/main/modules/windows/windowChrome.ts
 * Description: The main window's frame. On macOS and Windows the native title bar is hidden so the app's
 *   own top bar is the only one: on macOS the traffic-light dots sit in it at the left, on Windows the
 *   system draws minimise, maximise and close over its right end (a title-bar overlay). Linux keeps the
 *   native frame. Pure, so the platform rules can be tested without a window.
 */

/** Where the traffic-light dots sit: the left margin of the top bar, centred in its 53px height. */
export const TRAFFIC_LIGHTS = { x: 17, y: 21 } as const;

/**
 * The Windows overlay: the buttons are painted in the app's own bg and fg (the design tokens' values; a
 * main-process option cannot read the page's CSS variables) at the bar's height, less its 1px bottom border.
 */
export const WINDOWS_OVERLAY = { color: "#0A0D0F", symbolColor: "#F2F5F6", height: 52 } as const;

export type TitleBarOptions = {
  titleBarStyle?: "hidden";
  trafficLightPosition?: { x: number; y: number };
  titleBarOverlay?: { color: string; symbolColor: string; height: number };
};

/** The BrowserWindow options that depend on the platform; empty on Linux. */
export function titleBarOptions(platform: string): TitleBarOptions {
  if (platform === "darwin") return { titleBarStyle: "hidden", trafficLightPosition: { ...TRAFFIC_LIGHTS } };
  if (platform === "win32") return { titleBarStyle: "hidden", titleBarOverlay: { ...WINDOWS_OVERLAY } };
  return {};
}

/** What the page needs to know about its frame. */
export type WindowChrome = { macInset: boolean; winOverlay: boolean; fullScreen: boolean };

export function windowChrome(platform: string, fullScreen: boolean): WindowChrome {
  const macInset = platform === "darwin";
  const winOverlay = platform === "win32";
  return { macInset, winOverlay, fullScreen: (macInset || winOverlay) && fullScreen };
}
