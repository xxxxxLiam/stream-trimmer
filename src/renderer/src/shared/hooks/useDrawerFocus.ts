/**
 * File: useDrawerFocus.ts
 * Path: src/renderer/src/shared/hooks/useDrawerFocus.ts
 * Description: Keyboard focus for a side drawer that blocks nothing with the mouse. While it is open,
 *   Tab and Shift+Tab stay inside it (the controls it covers are not walked into); when it closes,
 *   focus goes back to the control that was focused before it opened; when its view changes, focus goes
 *   to the new view's heading so a keyboard user is not dropped on the page body.
 */
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every control inside `root` Tab can reach, in order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/** Where Tab or Shift+Tab should wrap to, or null when the browser's own move stays inside. */
export function wrapTarget(items: HTMLElement[], active: Element | null, shift: boolean): HTMLElement | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  if (!active || !items.includes(active as HTMLElement)) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

export function useDrawerFocus(root: RefObject<HTMLElement | null>, open: boolean, viewKey: string, fallback: string) {
  const outside = useRef<Element | null>(null);

  // Remember the last control focused outside the drawer: that is the one that opened it.
  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const t = e.target as Element | null;
      if (t && !root.current?.contains(t)) outside.current = t;
    };
    document.addEventListener("focusin", onIn);
    return () => document.removeEventListener("focusin", onIn);
  }, [root]);

  useEffect(() => {
    if (!open) return;
    return () => {
      const back = outside.current;
      window.requestAnimationFrame(() => {
        // Focus already moved on to something else (a tip card, a dialog): leave it there.
        const now = document.activeElement;
        if (now && now !== document.body) return;
        // The opener first; the fallback only when the opener is gone or cannot take focus (hidden).
        const opener = back && back.isConnected ? (back as HTMLElement) : null;
        opener?.focus?.();
        if (!opener || document.activeElement === document.body || document.activeElement === null) document.querySelector<HTMLElement>(fallback)?.focus?.();
      });
    };
  }, [open, fallback]);

  const first = useRef(true);
  useEffect(() => {
    if (!open) {
      first.current = true;
      return;
    }
    if (first.current) {
      first.current = false;
      return;
    }
    const h = root.current?.querySelector<HTMLElement>("h3");
    if (h) {
      h.tabIndex = -1;
      h.focus();
    }
  }, [open, viewKey, root]);

  return (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !root.current) return;
    const to = wrapTarget(focusableIn(root.current), document.activeElement, e.shiftKey);
    if (to) {
      e.preventDefault();
      to.focus();
    }
  };
}
