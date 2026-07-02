/**
 * File: useDualRange.ts
 * Path: src/hooks/useDualRange.ts
 * Description: Clamping helpers so start stays below end (and vice versa).
 */
import { useCallback } from "react";

interface UseDualRangeArgs {
  start: number;
  end: number;
  min?: number;
  max: number;
  setStart: (v: number) => void;
  setEnd: (v: number) => void;
  gap?: number;
}

export function useDualRange({
  start,
  end,
  min = 0,
  max,
  setStart,
  setEnd,
  gap = 1,
}: UseDualRangeArgs) {
  const onStart = useCallback(
    (value: number) => setStart(Math.max(min, Math.min(value, end - gap))),
    [min, end, gap, setStart],
  );
  const onEnd = useCallback(
    (value: number) => setEnd(Math.min(max, Math.max(value, start + gap))),
    [max, start, gap, setEnd],
  );
  return { onStart, onEnd };
}