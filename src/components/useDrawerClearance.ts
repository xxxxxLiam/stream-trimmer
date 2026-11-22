/**
 * File: useDrawerClearance.ts
 * Path: src/components/useDrawerClearance.ts
 * Description: How far in from the right edge a floating panel (Copy blocks, Symbols) sits so it
 *   is not hidden behind the 400px help drawer. The drawer is drawn above these panels (F-3), so
 *   with it open they move to its left instead; tutorials ask the user to press things in them
 *   while the drawer is up.
 */
import { useEffect, useLayoutEffect, useState } from "react";

export const EDGE_GAP = 16;

// useLayoutEffect warns when a panel is rendered to a string (the help catalogue test does).
const useLayoutEffectOnClient = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Pure part: the drawer's box and the window width in, the panel's `right` out. */
export function clearanceFor(drawer: { left: number; width: number } | null, windowWidth: number): number {
  if (!drawer) return EDGE_GAP;
  // Stacked under the app (narrow window): it is not at the right edge, nothing to dodge.
  return drawer.left > 0 && drawer.width > 0 ? Math.round(windowWidth - drawer.left) + EDGE_GAP : EDGE_GAP;
}

function rightOffset(): number {
  const el = typeof document === "undefined" ? null : document.getElementById("ui-help-drawer");
  return clearanceFor(el ? el.getBoundingClientRect() : null, window.innerWidth);
}

export function useDrawerClearance(open: boolean): number {
  const [right, setRight] = useState(EDGE_GAP);
  useLayoutEffectOnClient(() => {
    if (!open) return;
    const update = () => setRight(rightOffset());
    update();
    window.addEventListener("resize", update);
    // The drawer opens and closes without telling the panel.
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("resize", update);
      mo.disconnect();
    };
  }, [open]);
  return right;
}
