/**
 * File: topBarInset.ts
 * Path: src/renderer/src/modules/layout/utils/topBarInset.ts
 * Description: The top bar's side room when it is the window's title bar. On macOS the traffic lights sit
 *   in its left end, so the campaign chip starts after them (the board's chip is at x 83); on Windows the
 *   system draws minimise, maximise and close over its right end, so Panels, Help and Settings stop short
 *   of them (the overlay is three 46px buttons). In full screen both go away and the bar goes back to its
 *   normal margins. The bar drags the window only when it is the title bar.
 */

export const TOP_BAR_PAD = 16;
export const TOP_BAR_PAD_RIGHT = 12;
export const TOP_BAR_PAD_WITH_LIGHTS = 83;
/** Windows' three overlay buttons are 46px each. */
export const WINDOWS_OVERLAY_WIDTH = 138;

export type WindowChrome = { macInset: boolean; winOverlay: boolean; fullScreen: boolean };

/** True when the traffic lights are showing inside the bar. */
export const lightsShowing = (c: WindowChrome): boolean => c.macInset && !c.fullScreen;

/** True when Windows' window buttons are showing over the bar's right end. */
export const overlayShowing = (c: WindowChrome): boolean => c.winOverlay && !c.fullScreen;

/** True when the bar stands in for the system title bar (so it drags the window). */
export const barIsTitleBar = (c: WindowChrome): boolean => c.macInset || c.winOverlay;

export const topBarPaddingLeft = (c: WindowChrome): number => (lightsShowing(c) ? TOP_BAR_PAD_WITH_LIGHTS : TOP_BAR_PAD);

export const topBarPaddingRight = (c: WindowChrome): number => (overlayShowing(c) ? WINDOWS_OVERLAY_WIDTH + TOP_BAR_PAD_RIGHT : TOP_BAR_PAD_RIGHT);
