/**
 * File: useCountdown.ts
 * Path: src/renderer/src/shared/hooks/useCountdown.ts
 * Description: Seconds left until a deadline, ticking every 100 ms while it runs and calling
 *   `onDone` once at zero. `null` start means no countdown.
 */
import { useEffect, useRef, useState } from "react";

export function useCountdown(startedAt: number | null, seconds: number, onDone?: () => void): number {
  const [left, setLeft] = useState(startedAt === null ? 0 : seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (startedAt === null) {
      setLeft(0);
      return;
    }
    let fired = false;
    const tick = () => {
      const remaining = Math.max(0, seconds - (Date.now() - startedAt) / 1000);
      setLeft(remaining);
      if (remaining === 0 && !fired) {
        fired = true;
        done.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startedAt, seconds]);
  return left;
}
