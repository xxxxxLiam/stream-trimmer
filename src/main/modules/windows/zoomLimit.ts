/**
 * File: zoomLimit.ts
 * Path: src/main/modules/windows/zoomLimit.ts
 * Description: How far the page may be zoomed (Ctrl/Cmd +) before the workspace no longer fits.
 *   Zoom shrinks the page's CSS width; below MIN_CSS_WIDTH the preview has no room left, so the
 *   zoom stops there. Pure, so it can be tested without a window.
 */

/** The narrowest CSS width the workspace works at: Preview's minimum plus both side groups at their floor. */
export const MIN_CSS_WIDTH = 720;
/** Electron's zoom factor is 1.2 to the power of the zoom level. */
const STEP = Math.log(1.2);

/** The biggest zoom factor that keeps `MIN_CSS_WIDTH` css px across `contentWidth` real px; never below 1. */
export function maxZoomFactor(contentWidth: number): number {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return 1;
  return Math.max(1, contentWidth / MIN_CSS_WIDTH);
}

/** The zoom level that goes with a factor. */
export const zoomLevelOf = (factor: number): number => Math.log(factor) / STEP;

/** True for the "zoom in" chords: Ctrl/Cmd with + or = (also numpad +). */
export function isZoomInChord(input: { type?: string; key: string; control?: boolean; meta?: boolean; alt?: boolean }): boolean {
  if (input.type && input.type !== "keyDown") return false;
  if (!(input.control || input.meta) || input.alt) return false;
  return input.key === "+" || input.key === "=" || input.key === "Add";
}

/** Whether one more zoom step from `currentLevel` would pass the limit for `contentWidth`. */
export function zoomInBlocked(currentLevel: number, contentWidth: number): boolean {
  return currentLevel + 0.5 > zoomLevelOf(maxZoomFactor(contentWidth)) + 1e-9;
}

/** The zoom level one Zoom In step reaches, or null when that would pass the limit (every route to zoom-in uses this). */
export function zoomInTarget(currentLevel: number, contentWidth: number): number | null {
  return zoomInBlocked(currentLevel, contentWidth) ? null : currentLevel + 0.5;
}
