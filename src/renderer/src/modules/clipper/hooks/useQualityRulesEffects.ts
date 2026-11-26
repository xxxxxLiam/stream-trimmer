/**
 * File: useQualityRulesEffects.ts
 * Path: src/renderer/src/modules/clipper/hooks/useQualityRulesEffects.ts
 * Description: Sets the quality a request asks for from the sign-in state (360p signed out, 1080p signed in) and
 *   keeps it valid for the format. Nothing here is stored per campaign.
 */
import { useEffect } from "react";
import { isAudioFormat, type ClipFormat } from "../../../shared/utils/clip";
import { isSignedOut, requestedQuality, useYouTubeConnection } from "../../../shared/utils/youtubeConnection";
import { AUDIO_QUALITIES } from "../utils/clipperTypes";

export function useQualityRulesEffects({
  connection,
  format,
  quality,
  setQuality,
}: {
  connection: ReturnType<typeof useYouTubeConnection>;
  format: ClipFormat;
  quality: string;
  setQuality: (q: string) => void;
}) {
  const signedOut = isSignedOut(connection);
  useEffect(() => {
    const next = requestedQuality({ signedOut, format, quality });
    if (next !== quality) setQuality(next);
  }, [signedOut, format, quality]);

  // Audio keeps its bitrate list when the format is audio.
  useEffect(() => {
    if (isAudioFormat(format) && !(AUDIO_QUALITIES as readonly string[]).includes(quality)) setQuality(AUDIO_QUALITIES[0]);
  }, [format, quality]);
}
