/**
 * File: laneRename.ts
 * Path: src/renderer/src/features/player/utils/laneRename.ts
 * Description: Renaming the clip on the Clips lane: what a finished edit does (save, no change, or the
 *   naming rule's plain error) and what each key does while editing.
 */
import { sameName, tidyName, validateClipName } from "../../clips/utils/clipName";

export type RenameResult = { kind: "save"; name: string } | { kind: "same" } | { kind: "error"; reason: string };

/** The draft is judged by the one naming rule; a name equal to the current one changes nothing. */
export function finishRename(draft: string, current: string): RenameResult {
  const check = validateClipName(draft);
  if (!check.ok) return { kind: "error", reason: check.reason };
  return sameName(check.name, current) && tidyName(current) === check.name ? { kind: "same" } : { kind: "save", name: check.name };
}

/** Enter saves, Escape cancels. */
export function renameKey(key: string): "save" | "cancel" | null {
  return key === "Enter" ? "save" : key === "Escape" ? "cancel" : null;
}
