/**
 * File: quality.ts
 * Path: server/quality.ts
 * Description: The check that stops a clip being handed over at a resolution
 * far below the one YouTube had just listed for the same video. Kept pure and
 * separate from the download route so the thresholds are pinned by tests
 * instead of being rediscovered from a user's log.
 */

/**
 * How far below the attainable height a clip has to land before it is treated
 * as a broken download rather than a compromise.
 *
 * Half is deliberately generous. The failure this exists for is a 1080p video
 * delivered as itag 18 — 360p, a third of what the probe listed, and never a
 * choice the format selector would make on purpose. One rung down is: 720p
 * where 1080p was asked for, or 1080p from a 2160p video whose only H.264
 * rendition is 1080p. Those are trade-offs the selector makes deliberately,
 * they are already reported through X-Delivered-Height, and re-downloading
 * the clip would not improve them.
 */
export const DEGRADED_HEIGHT_RATIO = 0.5;

/** The tallest usable height out of what the probe reported, or 0. */
export function bestAvailableHeight(available: readonly number[]): number {
  let best = 0;
  for (const h of available) {
    if (Number.isFinite(h) && h > best) best = h;
  }
  return best;
}

/**
 * Whether a finished clip came back so far below the attainable resolution
 * that it should be retried rather than handed over.
 *
 * `requested` is the height the user asked for, or "best". `available` is what
 * the pre-download probe listed for this video — the cap on what any retry
 * could possibly achieve, so asking for 1080p on a video that only has 360p is
 * not a degradation.
 *
 * Returns false whenever the question cannot be answered: an audio-only clip
 * (no height), an ffmpeg probe that failed to report one, or a video whose
 * format list came back empty. Guessing in those cases would mean
 * re-downloading perfectly good clips.
 */
export function isDegradedDelivery(
  delivered: number | undefined,
  requested: number | "best",
  available: readonly number[],
): boolean {
  if (!Number.isFinite(delivered) || (delivered as number) <= 0) return false;
  const ceiling = bestAvailableHeight(available);
  if (ceiling <= 0) return false;
  const target = requested === "best" ? ceiling : Math.min(requested, ceiling);
  if (!Number.isFinite(target) || target <= 0) return false;
  return (delivered as number) < target * DEGRADED_HEIGHT_RATIO;
}
