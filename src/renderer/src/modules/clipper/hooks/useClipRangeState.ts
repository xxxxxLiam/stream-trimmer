/**
 * File: useClipRangeState.ts
 * Path: src/renderer/src/modules/clipper/hooks/useClipRangeState.ts
 * Description: The in/out range: parsed start and end, their validation and the helpers that set them.
 */
import { useCallback, useEffect, useMemo } from "react";
import { MAX_CLIP_SECONDS, formatTimestamp, parseTimestamp, type VideoInfo } from "../../../shared/utils/clip";

export function useClipRangeState({
  url,
  info,
  startText,
  endText,
  setStartText,
  setEndText,
  setError,
}: {
  url: string;
  info: VideoInfo | null;
  startText: string;
  endText: string;
  setStartText: (v: string) => void;
  setEndText: (v: string) => void;
  setError: (v: string) => void;
}) {
  const duration = info?.duration ?? 0;

  const start = useMemo(() => {
    const parsed = parseTimestamp(startText);
    return parsed == null ? 0 : parsed;
  }, [startText]);

  const end = useMemo(() => {
    const parsed = parseTimestamp(endText);
    return parsed == null ? duration : parsed;
  }, [endText, duration]);

  const startInvalid =
    startText.trim() !== "" && parseTimestamp(startText) == null;
  const endInvalid = endText.trim() !== "" && parseTimestamp(endText) == null;

  const validationError = useMemo(() => {
    if (!url || !info) return "";
    if (startInvalid || endInvalid) return "Timestamp must look like HH:MM:SS";
    if (start >= end) return "Start must be before end";
    if (end > info.duration) return "End exceeds video duration";
    if (end - start > MAX_CLIP_SECONDS)
      return "Clip length capped at 10 minutes";
    return "";
  }, [url, info, start, end, startInvalid, endInvalid]);

  useEffect(() => {
    setError(validationError || "");
  }, [validationError]);

  const pasteInto = useCallback(async (setter: (v: string) => void) => {
    try {
      const text = await navigator.clipboard.readText();
      setter(text.trim());
    } catch {
      setError(
        "Couldn't read clipboard. Paste manually or allow clipboard access.",
      );
    }
  }, []);

  const setStartFromSeconds = useCallback(
    (value: number) => setStartText(formatTimestamp(Math.min(value, end - 1))),
    [end],
  );
  const setEndFromSeconds = useCallback(
    (value: number) => setEndText(formatTimestamp(Math.max(value, start + 1))),
    [start],
  );

  return {
    duration,
    start,
    end,
    validationError,
    pasteInto,
    setStartFromSeconds,
    setEndFromSeconds,
  };
}
