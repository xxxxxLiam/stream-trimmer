/**
 * File: useModalFocus.ts
 * Path: src/renderer/src/shared/hooks/useModalFocus.ts
 * Description: Keyboard focus for a dialog nothing may be done behind: focus starts on `initial` when it opens, Tab and
 *   Shift+Tab wrap inside it, and anything else that takes focus (a tip card, a late autofocus) is pulled back in.
 */
import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { focusableIn, wrapTarget } from "./useDrawerFocus";

export function useModalFocus(root: RefObject<HTMLElement | null>, initial: string): (e: KeyboardEvent) => void {
  useEffect(() => {
    const start = () => root.current?.querySelector<HTMLElement>(initial)?.focus();
    start();
    const onIn = (e: FocusEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) start();
    };
    document.addEventListener("focusin", onIn);
    return () => document.removeEventListener("focusin", onIn);
  }, [root, initial]);

  return (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !root.current) return;
    const target = wrapTarget(focusableIn(root.current), document.activeElement, e.shiftKey);
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };
}
