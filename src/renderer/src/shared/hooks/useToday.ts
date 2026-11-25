/**
 * File: useToday.ts
 * Path: src/renderer/src/shared/hooks/useToday.ts
 * Description: The current time, refreshed at local midnight and whenever the window wakes or
 *   regains focus, so counts of "today" never go stale while the app stays open overnight.
 */
import { useEffect, useState } from "react";
import { dayKey, msUntilMidnight } from "../utils/dayClock";

export function useToday(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setNow(Date.now());
        arm();
      }, msUntilMidnight());
    };
    // Sleep and wake pause timers, so also check the day when the window comes back.
    const check = () => {
      const t = Date.now();
      setNow((prev) => (dayKey(prev) === dayKey(t) ? prev : t));
      arm();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    arm();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}
