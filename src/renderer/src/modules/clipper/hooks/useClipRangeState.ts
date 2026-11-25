/**
 * File: useClipRangeState.ts
 * Path: src/renderer/src/modules/clipper/hooks/useClipRangeState.ts
 * Description: The in/out range: parsed start and end, their validation and the helpers that set them.
 */
import { useCallback, useEffect, useMemo } from "react";
import { applyIn, applyOut, formatTimestamp, overCapMessage, parseTimestamp, type VideoInfo } from "../../../shared/utils/clip";

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
    return overCapMessage(end - start);
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

  // The point just set is never moved: an In past the Out starts a fresh range there (Out cleared), and
  // an Out before the In does the mirror.
  const setStartFromSeconds = useCallback(
    (value: number) => {
      const r = applyIn(value, parseTimestamp(endText));
      setStartText(formatTimestamp(r.start));
      if (r.clearEnd) setEndText("");
    },
    [endText],
  );
  const setEndFromSeconds = useCallback(
    (value: number) => {
      const r = applyOut(value, parseTimestamp(startText));
      setEndText(formatTimestamp(r.end));
      if (r.clearStart) setStartText("");
    },
    [startText],
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
