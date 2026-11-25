/**
 * File: infoFailure.ts
 * Path: src/main/features/engine/utils/infoFailure.ts
 * Description: What /api/info sends when opening a video fails: a plain sentence and a kind, never the raw
 *   yt-dlp text or an exit code. The raw text stays in the log.
 */
import { ytReasonOf, type YtReasonKind } from "./ytReasons";

export type InfoFailureKind = YtReasonKind | "unknown";

export interface InfoFailure {
  error: string;
  kind: InfoFailureKind;
}

const UNKNOWN: InfoFailure = {
  error: "Clipr couldn't open this video. Try again in a moment.",
  kind: "unknown",
};

export function describeInfoFailure(raw: string): InfoFailure {
  const reason = ytReasonOf(raw);
  return reason ? { error: reason.sentence, kind: reason.kind } : { ...UNKNOWN };
}
