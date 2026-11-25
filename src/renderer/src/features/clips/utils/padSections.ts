/**
 * File: padSections.ts
 * Path: src/renderer/src/features/clips/utils/padSections.ts
 * Description: Clipr always adds CLIP_PADDING_SEC (5 s) at both ends: each marked section starts that much
 *   earlier and ends that much later, kept inside the video (0 to its length). Sections that touch
 *   or overlap after padding join into one, so no second is cut twice. Imported times are cut as
 *   given (flow-cross-audit-decisions #13), so only marked sections come through here. Pure.
 */
/** Decision (Liam, 25 Nov): a fixed 5 seconds at both ends of every marked clip, not a per-campaign choice. */
export const CLIP_PADDING_SEC = 5;

type Section = { start: number; end: number };

export function padSections<T extends Section>(sections: readonly T[], extra: number = CLIP_PADDING_SEC, duration?: number): Section[] {
  const max = duration && duration > 0 ? duration : Infinity;
  const padded = sections
    .map((s) => ({ start: Math.max(0, s.start - extra), end: Math.min(max, s.end + extra) }))
    .filter((s) => s.end > s.start);
  const out: Section[] = [];
  // Keep the order the person marked them in; join only a section that runs into the one before it.
  for (const s of padded) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end && s.end >= last.start) {
      last.start = Math.min(last.start, s.start);
      last.end = Math.max(last.end, s.end);
    } else out.push({ ...s });
  }
  return out;
}
