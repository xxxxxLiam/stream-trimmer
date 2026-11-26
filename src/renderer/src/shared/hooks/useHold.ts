/**
 * File: useHold.ts
 * Path: src/renderer/src/shared/hooks/useHold.ts
 * Description: Press and hold. progress goes 0 to 1 while held; at 1 `onDone` runs once. Releasing early cancels and the
 *   progress goes back to 0. Used where a delete asks for a held press instead of a dialog (moments only).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const HOLD_MS = 3000;

/** How far along a hold is, 0 to 1. */
export function holdProgress(elapsedMs: number, totalMs: number = HOLD_MS): number {
  if (totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / totalMs));
}

export function useHold(onDone: () => void, ms: number = HOLD_MS) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  }, []);
  const start = useCallback(() => {
    if (frame.current !== null) return;
    const t0 = performance.now();
    const tick = () => {
      const p = holdProgress(performance.now() - t0, ms);
      if (p >= 1) {
        frame.current = null;
        setProgress(0);
        done.current();
        return;
      }
      setProgress(p);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [ms]);
  useEffect(() => stop, [stop]);
  return { progress, holding: progress > 0, start, cancel: stop };
}
