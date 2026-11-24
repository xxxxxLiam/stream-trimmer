/**
 * File: useDismissEffects.ts
 * Path: src/renderer/src/shared/hooks/useDismissEffects.ts
 * Description: Closes a popover on outside mousedown or Escape.
 */
import { useEffect, type RefObject } from "react";

export function useDismissEffects(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, open, onClose]);
}
