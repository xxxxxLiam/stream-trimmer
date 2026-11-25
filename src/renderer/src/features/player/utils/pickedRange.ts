/**
 * File: pickedRange.ts
 * Path: src/renderer/src/features/player/utils/pickedRange.ts
 * Description: Which part counts as picked. A range over the 10-minute cap is still the range the clipper
 *   drew (Clip says why it will not run); any other invalid range is no range.
 */
import { overCapMessage } from "../../../shared/utils/clip";
import type { Range } from "../../../shared/utils/segments";

export function pickedRangeOf(s: {
  startText: string;
  endText: string;
  start: number;
  end: number;
  validationError: string;
}): Range | null {
  const touched = s.startText.trim() !== "" || s.endText.trim() !== "";
  const fine = !s.validationError || s.validationError === overCapMessage(s.end - s.start);
  return touched && fine && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start
    ? { start: s.start, end: s.end }
    : null;
}
