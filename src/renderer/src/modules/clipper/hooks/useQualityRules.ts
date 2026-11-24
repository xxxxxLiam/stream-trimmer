/**
 * File: useQualityRules.ts
 * Path: src/renderer/src/modules/clipper/hooks/useQualityRules.ts
 * Description: Keeps the quality valid for the format and holds it at 360p while signed out.
 */
import { useEffect, useRef } from "react";
import { type ClipFormat } from "../../../shared/utils/clip";
import { isSignedOut, signedOutQuality, useYouTubeConnection } from "../../../shared/utils/youtubeConnection";
import { AUDIO_QUALITIES, VIDEO_QUALITIES } from "../utils/clipperTypes";

export function useQualityRules({
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
  // AF2-2: signed out, the engine only serves 360p, so hold the quality there (and give the
  // user's choice back when they sign in) instead of failing the first Cut at the default Best.
  const heldQuality = useRef<string | null>(null);
  const signedOut = isSignedOut(connection);
  useEffect(() => {
    const next = signedOutQuality({ signedOut, format, quality, held: heldQuality.current });
    heldQuality.current = next.held;
    if (next.quality !== quality) setQuality(next.quality);
  }, [signedOut, format, quality]);

  // Keep quality valid when switching format (resolutions vs bitrates).
  useEffect(() => {
    const allowed: readonly string[] =
      format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
    if (!allowed.includes(quality)) setQuality(allowed[0]);
  }, [format, quality]);
}
