import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_CLIP_SECONDS,
  formatTimestamp,
  parseTimestamp,
  extractVideoId,
  parseJson,
} from "../lib/clip.js";

// Quality options swap based on the chosen output format.
export const VIDEO_QUALITIES = ["best", "1080", "720", "480", "360"];
export const AUDIO_QUALITIES = ["320", "192", "128"];

export function useClipper() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState(null);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [format, setFormat] = useState("mp4"); // "mp4" | "mp3"
  const [quality, setQuality] = useState("best");
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  // Transcript state
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState(null); // null = not loaded, [] = none
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const videoId = useMemo(() => extractVideoId(url), [url]);
  const duration = info?.duration || 0;

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
    const allowed = format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
    if (!allowed.includes(quality)) setQuality(allowed[0]);
  }, [format, quality]);

  // Seamless load: auto-fetch info as soon as a valid YouTube URL is present, debounced.
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!videoId) {
      setInfo(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadInfo();
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Reset transcript whenever the video changes.
  useEffect(() => {
    setTranscript(null);
    setShowTranscript(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  async function pasteInto(setter) {
    try {
      const text = await navigator.clipboard.readText();
      setter(text.trim());
    } catch {
      setError(
        "Couldn't read clipboard. Paste manually or allow clipboard access.",
      );
    }
  }

  function setStartFromSeconds(value) {
    setStartText(formatTimestamp(Math.min(value, end - 1)));
  }
  function setEndFromSeconds(value) {
    setEndText(formatTimestamp(Math.max(value, start + 1)));
  }

  async function loadInfo() {
    if (!url) return;
    setError("");
    setLoadingInfo(true);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to load video info");
      setInfo(data);
      setStartText("");
      setEndText(formatTimestamp(Math.min(data.duration, MAX_CLIP_SECONDS)));
    } catch (e) {
      setError(e.message || "Failed to load video info");
      setInfo(null);
    } finally {
      setLoadingInfo(false);
    }
  }

  async function loadTranscript() {
    if (!url) return;
    setLoadingTranscript(true);
    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await parseJson(res);
      setTranscript(data.available ? data.lines : []);
    } catch {
      setTranscript([]);
    } finally {
      setLoadingTranscript(false);
    }
  }

  function toggleTranscript() {
    const next = !showTranscript;
    setShowTranscript(next);
    if (next && transcript === null) loadTranscript(); // fetch on first open
  }

  // Lines overlapping the selected range (re-filters live as start/end change).
  const rangeTranscript = useMemo(() => {
    if (!transcript) return [];
    return transcript.filter((l) => l.end > start && l.start < end);
  }, [transcript, start, end]);

  const rangeTranscriptText = useMemo(
    () => rangeTranscript.map((l) => l.text).join(" "),
    [rangeTranscript],
  );

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(rangeTranscriptText);
    } catch {
      setError("Couldn't copy. Select the text and copy manually.");
    }
  }

  async function download() {
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
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, start, end, format, quality }),
      });
      if (!res.ok) {
        const data = await parseJson(res).catch(() => ({}));
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
      setError(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }

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
    // transcript
    showTranscript,
    toggleTranscript,
    loadingTranscript,
    transcript,
    rangeTranscript,
    rangeTranscriptText,
    copyTranscript,
  };
}
