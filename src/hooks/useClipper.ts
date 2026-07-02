/**
 * File: useClipper.ts
 * Path: src/hooks/useClipper.ts
 * Description: Central clipper state — URL, info, range, format/quality, transcript, download.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MAX_CLIP_SECONDS,
  formatTimestamp,
  parseTimestamp,
  extractVideoId,
  parseJson,
  estimateBytes,
  apiUrl,
  type ClipFormat,
  type TranscriptLine,
  type TranscriptResponse,
  type VideoInfo,
} from "../lib/clip";

export const VIDEO_QUALITIES = ["best", "1080", "720", "480", "360"] as const;
export const AUDIO_QUALITIES = ["320", "192", "128"] as const;

export type Quality =
  | (typeof VIDEO_QUALITIES)[number]
  | (typeof AUDIO_QUALITIES)[number];

export function useClipper() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [format, setFormat] = useState<ClipFormat>("mp4");
  const [quality, setQuality] = useState<string>("best");
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[] | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");

  const videoId = useMemo(() => extractVideoId(url), [url]);
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

  // Keep quality valid when switching format (resolutions vs bitrates).
  useEffect(() => {
    const allowed: readonly string[] =
      format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
    if (!allowed.includes(quality)) setQuality(allowed[0]);
  }, [format, quality]);

  // Reset transcript whenever the video changes.
  useEffect(() => {
    setTranscript(null);
    setShowTranscript(false);
    setTranscriptQuery("");
  }, [videoId]);

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

  const loadInfo = useCallback(async () => {
    if (!url) return;
    setError("");
    setLoadingInfo(true);
    try {
      const res = await fetch(apiUrl("/api/info"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await parseJson<VideoInfo & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load video info");
      setInfo(data);
      setStartText("");
      setEndText(formatTimestamp(Math.min(data.duration, MAX_CLIP_SECONDS)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load video info");
      setInfo(null);
    } finally {
      setLoadingInfo(false);
    }
  }, [url]);

  const loadTranscript = useCallback(async () => {
    if (!url) return;
    setLoadingTranscript(true);
    try {
      const res = await fetch(apiUrl("/api/transcript"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await parseJson<TranscriptResponse>(res);
      setTranscript(data.available ? data.lines : []);
    } catch {
      setTranscript([]);
    } finally {
      setLoadingTranscript(false);
    }
  }, [url]);

  const toggleTranscript = useCallback(() => {
    setShowTranscript((prev) => {
      const next = !prev;
      if (next && transcript === null) void loadTranscript();
      return next;
    });
  }, [transcript, loadTranscript]);

  const rangeTranscript = useMemo(() => {
    if (!transcript) return [];
    return transcript.filter((l) => l.end > start && l.start < end);
  }, [transcript, start, end]);

  const filteredTranscript = useMemo(() => {
    const q = transcriptQuery.trim().toLowerCase();
    if (!q) return rangeTranscript;
    return rangeTranscript.filter((l) => l.text.toLowerCase().includes(q));
  }, [rangeTranscript, transcriptQuery]);

  // Full transcript view (search narrows; range only highlights).
  const displayTranscript = useMemo(() => {
    if (!transcript) return [];
    const q = transcriptQuery.trim().toLowerCase();
    if (!q) return transcript;
    return transcript.filter((l) => l.text.toLowerCase().includes(q));
  }, [transcript, transcriptQuery]);

  const rangeTranscriptText = useMemo(
    () => rangeTranscript.map((l) => l.text).join(" "),
    [rangeTranscript],
  );

  const copyTranscript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rangeTranscriptText);
    } catch {
      setError("Couldn't copy. Select the text and copy manually.");
    }
  }, [rangeTranscriptText]);

  // Click a transcript line → set its start as clip start, or its end as clip end.
  // Choice: end button uses line.end so "set as end" includes the whole spoken line.
  const setStartFromLine = useCallback(
    (line: TranscriptLine) => setStartText(formatTimestamp(line.start)),
    [],
  );
  const setEndFromLine = useCallback(
    (line: TranscriptLine) => setEndText(formatTimestamp(line.end)),
    [],
  );

  // Live size estimate (bytes) for the selected range/format/quality.
  const estimatedBytes = useMemo(() => {
    if (!info?.bitrates) return 0;
    const table = format === "mp3" ? info.bitrates.mp3 : info.bitrates.mp4;
    const kbps = table?.[quality] ?? 0;
    return estimateBytes(kbps, Math.max(0, end - start));
  }, [info, format, quality, start, end]);

  const download = useCallback(async () => {
    if (!info) {
      setError("Load a video first");
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setDownloading(true);
    try {
      const res = await fetch(apiUrl("/api/download"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, start, end, format, quality }),
      });
      if (!res.ok) {
        const data = await parseJson<{ error?: string }>(res).catch(
          () => ({}) as { error?: string },
        );
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const ext = format === "mp3" ? "mp3" : "mp4";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `clip-${formatTimestamp(start).replaceAll(":", "")}-${formatTimestamp(end).replaceAll(":", "")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [info, validationError, url, start, end, format, quality]);

  return {
    url,
    setUrl,
    info,
    startText,
    setStartText,
    endText,
    setEndText,
    format,
    setFormat,
    quality,
    setQuality,
    loadingInfo,
    downloading,
    error,
    videoId,
    duration,
    start,
    end,
    validationError,
    loadInfo,
    download,
    pasteInto,
    setStartFromSeconds,
    setEndFromSeconds,
    showTranscript,
    toggleTranscript,
    loadingTranscript,
    transcript,
    rangeTranscript,
    filteredTranscript,
    displayTranscript,
    transcriptQuery,
    setTranscriptQuery,
    setStartFromLine,
    setEndFromLine,
    rangeTranscriptText,
    copyTranscript,
    estimatedBytes,
  };
}

export type ClipperState = ReturnType<typeof useClipper>;