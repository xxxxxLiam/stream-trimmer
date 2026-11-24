/**
 * File: pasteRouting.ts
 * Path: src/renderer/src/shared/utils/pasteRouting.ts
 * Description: What a paste means, decided by its content (Keyboard board, "Paste decides"): a
 *   video link opens the video, rows with times open Import moments, a channel link opens Channel
 *   data. Anything else is left alone. Pure, so each rule has a test.
 */
import { extractVideoId } from "./clip";
import { parseBankImport } from "./bankImport";

export type PasteKind = "video" | "moments" | "channel" | "none";

export type PasteRules = {
  /** True for a channel link. Absent in a public build, where channel links mean nothing. */
  isChannelUrl?: (text: string) => boolean;
};

export function classifyPaste(text: string, rules: PasteRules = {}): PasteKind {
  const t = text.trim();
  if (!t) return "none";
  const oneLine = !/\r|\n/.test(t);
  if (oneLine && rules.isChannelUrl?.(t)) return "channel";
  if (oneLine && extractVideoId(t)) return "video";
  // Rows with times: at least one parsed moment, and not just a link that failed above.
  if (!/^https?:\/\//i.test(t) && parseBankImport(t).clipCount > 0) return "moments";
  return "none";
}
