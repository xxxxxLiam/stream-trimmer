/**
 * File: projectName.ts
 * Path: src/renderer/src/features/clips/utils/projectName.ts
 * Description: Suggests a short project name (two words at most) for a banked clip, taken from
 *   the label that came in with the imported timestamps, then from its category. Pure: no
 *   storage, no React. Returns "" when there is nothing usable, so callers fall back to the
 *   campaign's project name pattern.
 */

import { twoWordName } from "../../../../../common/utils/nameWords";

/** Up to two words, in Title Case: from the label first, then topped up from the category. */
export function suggestProjectName(clip: { label?: string; category?: string }): string {
  return twoWordName(clip.label, clip.category);
}
