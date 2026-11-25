/**
 * File: infoFailure.ts
 * Path: src/main/features/engine/utils/infoFailure.ts
 * Description: What /api/info sends when opening a video fails: a plain sentence and a kind, never the raw
 *   yt-dlp text or an exit code. The raw text stays in the log.
 */
import { JS_RUNTIME_SENTENCE } from "../services/segments";
import { ytReasonOf, type YtReasonKind } from "./ytReasons";

export type InfoFailureKind = YtReasonKind | "unknown" | "tools";

export interface InfoFailure {
  error: string;
  kind: InfoFailureKind;
}

const UNKNOWN: InfoFailure = {
  error: "Clipr couldn't open this video. Try again in a moment.",
  kind: "unknown",
};

export function describeInfoFailure(raw: string, ctx: { jsRuntimeMissing?: boolean } = {}): InfoFailure {
  // "Requested format is not available" with no JavaScript runtime is the missing part, not the video.
  if (ctx.jsRuntimeMissing && /requested format is not available/i.test(raw)) return { error: `${JS_RUNTIME_SENTENCE}. Reinstall Clipr.`, kind: "tools" };
  const reason = ytReasonOf(raw);
  return reason ? { error: reason.sentence, kind: reason.kind } : { ...UNKNOWN };
}
