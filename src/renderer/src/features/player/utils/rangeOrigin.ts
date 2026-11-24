/**
 * File: rangeOrigin.ts
 * Path: src/renderer/src/features/player/utils/rangeOrigin.ts
 * Description: Tells a range the user is marking by hand (drag, scissors, I and O) from one that
 *   arrives from elsewhere (a banked moment, an import, a restored session). Only the second kind
 *   re-frames the timeline; a drag must never move the ruler under the pointer.
 */
const HAND_MS = 1500;
let handAt = -Infinity;

export function markByHand(now = Date.now()): void {
  handAt = now;
}

export function arrivedFromElsewhere(now = Date.now()): boolean {
  return now - handAt > HAND_MS;
}
