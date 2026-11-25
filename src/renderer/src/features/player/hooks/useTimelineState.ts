/**
 * File: useTimelineState.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineState.ts
 * Description: The timeline's own switches: where the zoom is centred, a scissors click waiting for
 *   its end, a drag in progress, and the width of the lanes.
 */
import { useState } from "react";

export type Drag =
  | { kind: "range"; anchor: number }
  | { kind: "edge"; edge: "start" | "end"; fixed: number }
  | { kind: "scrub" }
  | { kind: "pan"; startX: number; startFocus: number }
  | null;

export function useTimelineState() {
  const [focus, setFocus] = useState<number | null>(null);
  const [scissorsStart, setScissorsStart] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [width, setWidth] = useState(0);
  const [foldOpen, setFoldOpen] = useState(false);
  const [dragOrigin, setDragOrigin] = useState(0);
  return { focus, setFocus, scissorsStart, setScissorsStart, drag, setDrag, dragOrigin, setDragOrigin, width, setWidth, foldOpen, setFoldOpen };
}
