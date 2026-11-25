/**
 * File: pasteRouting.ts
 * Path: src/renderer/src/shared/utils/pasteRouting.ts
 * Description: What a paste means, decided by its content (Keyboard board, "Paste decides"): a
 *   video link opens the video, rows with times open Import moments, a channel link opens Channel
 *   data. Anything else is left alone. Pure, so each rule has a test.
 */
import { extractVideoId } from "./clip";
import { parseBankImport } from "./bankImport";
import { parseMoments } from "../../features/import/utils/momentRows";

export type PasteKind = "video" | "moments" | "channel" | "none";

export type PasteRules = {
  /** True for a channel link. Absent in a public build, where channel links mean nothing. */
  isChannelUrl?: (text: string) => boolean;
  /** The video that is open: a sheet with no video column belongs to it (Import's reader decides). */
  openVideoId?: string | null;
};

export function classifyPaste(text: string, rules: PasteRules = {}): PasteKind {
  const t = text.trim();
  if (!t) return "none";
  const oneLine = !/\r|\n/.test(t);
  if (oneLine && rules.isChannelUrl?.(t)) return "channel";
  if (oneLine && !t.includes("\t") && extractVideoId(t)) return "video";
  // The sheet "Copy format" asks for (tab-separated, with or without its header, each row led by a
  // video link): Import's own reader decides, so a paste it can read opens it.
  if (!oneLine || t.includes("\t")) {
    if (parseMoments(t, { openVideoId: rules.openVideoId ?? null }).some((r) => r.videoId && r.end > r.start)) return "moments";
  }
  // Rows with times: at least one parsed moment, and not just a link that failed above.
  if (!/^https?:\/\//i.test(t) && parseBankImport(t).clipCount > 0) return "moments";
  return "none";
}
