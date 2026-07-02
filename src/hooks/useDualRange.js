import { useCallback } from "react";

// Encapsulates the start/end clamping so start stays below end and vice-versa.
export function useDualRange({
  start,
  end,
  min = 0,
  max,
  setStart,
  setEnd,
  gap = 1,
}) {
  const onStart = useCallback(
    (value) => {
      const clamped = Math.max(min, Math.min(value, end - gap));
      setStart(clamped);
    },
    [min, end, gap, setStart],
  );

  const onEnd = useCallback(
    (value) => {
      const clamped = Math.min(max, Math.max(value, start + gap));
      setEnd(clamped);
    },
    [max, start, gap, setEnd],
  );

  return { onStart, onEnd };
}
