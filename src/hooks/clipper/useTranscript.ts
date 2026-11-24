/**
 * File: useTranscript.ts
 * Path: src/hooks/clipper/useTranscript.ts
 * Description: The transcript: on-demand load, search, the range view, copy and click-to-set-range.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTimestamp, normalizeYouTubeUrl, parseJson, apiUrl, type TranscriptLine, type TranscriptResponse } from "../../lib/clip";
import { cookiePayload } from "../../lib/youtubeConnection";

export function useTranscript({
  url,
  videoId,
  start,
  end,
  setError,
  setStartText,
  setEndText,
}: {
  url: string;
  videoId: string | null;
  start: number;
  end: number;
  setError: (v: string) => void;
  setStartText: (v: string) => void;
  setEndText: (v: string) => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  // Seek requests are a counter-stamped channel so repeated seeks to the same
  // timestamp still reach the player.
  const [seekRequest, setSeekRequest] = useState<{
    time: number;
    nonce: number;
  } | null>(null);
  const requestSeek = useCallback((time: number) => {
    setSeekRequest((prev) => ({ time, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const [transcript, setTranscript] = useState<TranscriptLine[] | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");

  // Reset transcript whenever the video changes.
  useEffect(() => {
    setTranscript(null);
    setShowTranscript(false);
    setTranscriptQuery("");
  }, [videoId]);

  const loadTranscript = useCallback(async () => {
    if (!url) return;
    setLoadingTranscript(true);
    try {
      const res = await fetch(apiUrl("/api/transcript"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Metadata, captions and comments need the session as much as the
        // download does — without it YouTube answers "Sign in to confirm
        // you're not a bot" and the app looks signed out when it isn't.
        body: JSON.stringify({
          url: normalizeYouTubeUrl(url),
          ...cookiePayload(),
        }),
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

  /** Fetch the transcript once, on demand (used by the Transcript tab). */
  const ensureTranscript = useCallback(() => {
    if (transcript === null && !loadingTranscript) void loadTranscript();
  }, [transcript, loadingTranscript, loadTranscript]);

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

  return {
    showTranscript,
    toggleTranscript,
    ensureTranscript,
    loadingTranscript,
    transcript,
    rangeTranscript,
    filteredTranscript,
    displayTranscript,
    transcriptQuery,
    setTranscriptQuery,
    setStartFromLine,
    setEndFromLine,
    seekRequest,
    requestSeek,
    rangeTranscriptText,
    copyTranscript,
  };
}
