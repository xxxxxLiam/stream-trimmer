/**
 * File: inOutFields.ts
 * Path: src/renderer/src/features/player/utils/inOutFields.ts
 * Description: The footer's In and Out fields: what a typed or pasted time becomes (the clipper's HH:MM:SS
 *   text, cleared, or a short sentence saying what is wrong) and when In and Out are the wrong way round.
 */
import { formatTimestamp, parseTimestamp } from "../../../shared/utils/clip";
import { parseTimecode } from "../../../shared/utils/segments";

export type TimeEntry = { kind: "clear" } | { kind: "set"; text: string } | { kind: "bad"; message: string };

/** A typed or pasted time ("1:12:04", "72:04", "4324") for a video of `duration` seconds (0 when unknown). */
export function readTime(draft: string, duration: number): TimeEntry {
  const t = draft.trim();
  if (t === "") return { kind: "clear" };
  const sec = parseTimecode(t);
  if (sec === null) return { kind: "bad", message: "Type a time like 1:12:04" };
  const whole = Math.floor(sec);
  if (duration > 0 && whole > duration) return { kind: "bad", message: "That is past the end of the video" };
  return { kind: "set", text: formatTimestamp(whole) };
}

/** Both ends are set and Out is not after In. */
export function outBeforeIn(startText: string, endText: string): boolean {
  const a = parseTimestamp(startText);
  const b = parseTimestamp(endText);
  return a !== null && b !== null && b <= a;
}

export const OUT_AFTER_IN = "Out must be after In";
