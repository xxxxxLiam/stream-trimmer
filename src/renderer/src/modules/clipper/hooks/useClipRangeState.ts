/**
 * File: useClipRangeState.ts
 * Path: src/renderer/src/modules/clipper/hooks/useClipRangeState.ts
 * Description: The in/out range: parsed start and end, their validation and the helpers that set them.
 */
import { useCallback, useEffect, useMemo } from "react";
import { applyIn, applyOut, formatPrecise, formatTimestamp, orderedRange, overCapMessage, parseTimestamp, type VideoInfo } from "../../../shared/utils/clip";

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

  // The point just set is never moved: an In past the Out starts a fresh range there (Out cleared), but
  // an Out before the In is stored beside it and the In stays (B3-1).
  const setStartFromSeconds = useCallback(
    (value: number) => {
      const r = applyIn(value, parseTimestamp(endText));
      setStartText(formatPrecise(r.start));
      if (r.clearEnd) setEndText("");
    },
    [endText],
  );
  const setEndFromSeconds = useCallback(
    (value: number) => {
      setEndText(formatPrecise(applyOut(value).end));
    },
    [],
  );

  // Both ends at once, in order. Setting them one after the other reads the other end's old text, so a
  // second click before the first (or an edge pulled past the other) used to wipe the range.
  const setRangeFromSeconds = useCallback((a: number, b: number) => {
    const r = orderedRange(a, b);
    setStartText(formatPrecise(r.start));
    setEndText(formatPrecise(r.end));
  }, []);

  return {
    duration,
    start,
    end,
    validationError,
    pasteInto,
    setStartFromSeconds,
    setEndFromSeconds,
    setRangeFromSeconds,
  };
}
