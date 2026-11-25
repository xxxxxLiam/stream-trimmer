/**
 * File: cutAttempt.ts
 * Path: src/renderer/src/shared/utils/cutAttempt.ts
 * Description: The cut that is running (or just failed): its name and the sections the person marked.
 *   Pressing Clip clears the marks at once, so a failed cut's Retry and Save for later read the range
 *   from here, and "Your range is kept" stays true. Every cut sets it before it starts; a saved cut
 *   clears it.
 */
import type { Segment } from "./segments";

export type CutAttempt = { name: string; segments: Segment[]; bankId?: string };

let attempt: CutAttempt | null = null;

export const getCutAttempt = (): CutAttempt | null => attempt;
export const setCutAttempt = (next: CutAttempt | null): void => {
  attempt = next ? { ...next, segments: next.segments.map((s) => ({ start: s.start, end: s.end })) } : null;
};
