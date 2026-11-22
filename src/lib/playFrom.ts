/**
 * File: playFrom.ts
 * Path: src/lib/playFrom.ts
 * Description: One-line signal from the timeline and the bank to the preview player:
 *   jump to this second and start playing.
 */
export const PLAY_FROM_EVENT = "clipr:play-from";

export function playFrom(seconds: number): void {
  window.dispatchEvent(new CustomEvent<number>(PLAY_FROM_EVENT, { detail: seconds }));
}
