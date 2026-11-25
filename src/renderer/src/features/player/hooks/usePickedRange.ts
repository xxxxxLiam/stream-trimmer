/**
 * File: usePickedRange.ts
 * Path: src/renderer/src/features/player/hooks/usePickedRange.ts
 * Description: The part the clipper has picked on the open video, or null. A fresh video has nothing
 *   picked (the range fields are empty); I, O, a drag, the scissors or a transcript line pick one.
 */
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import type { Range } from "../../../shared/utils/segments";
import { pickedRangeOf } from "../utils/pickedRange";

export function usePickedRange(): Range | null {
  return pickedRangeOf(useClipperContext());
}
