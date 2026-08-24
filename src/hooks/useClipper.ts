/**
 * File: useClipper.ts
 * Path: src/hooks/useClipper.ts
 * Description: Central clipper state — URL, info, range, format/quality, transcript, download.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_CLIP_SECONDS,
  formatTimestamp,
  parseTimestamp,
  extractVideoId,
  normalizeYouTubeUrl,
  parseJson,
  estimateBytes,
  apiUrl,
  buildClipFilename,
  commentsToCsv,
  sanitizeFilename,
  type ClipFormat,
  type TranscriptLine,
  type TranscriptResponse,
  type VideoInfo,
  type CommentsResponse,
  type CookieBrowser,
  type YouTubeAuthState,
  type YouTubeAuthStatus,
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
  // Optional sign-in: when enabled, yt-dlp reuses the chosen browser's
  // logged-in YouTube session to try for higher-quality renditions.
  const [useBrowserCookies, setUseBrowserCookies] = useState(false);
  const [cookieBrowser, setCookieBrowserState] = useState<CookieBrowser>(() => {
    if (typeof window === "undefined") return "chrome";
    const saved = window.localStorage.getItem("clipper.cookieBrowser");
    return saved === "chrome" || saved === "safari" || saved === "edge" ||
      saved === "firefox" || saved === "brave" || saved === "chromium"
      ? saved
      : "chrome";
  });
  const setCookieBrowser = useCallback((browser: CookieBrowser) => {
    setCookieBrowserState(browser);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("clipper.cookieBrowser", browser);
    }
  }, []);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState<
    "idle" | "downloading" | "processing" | "done" | "error"
  >("idle");
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  // Confirmation notice for a completed save (clip or comments CSV).
  const [savedNotice, setSavedNotice] = useState<{
    kind: "clip" | "comments";
    path: string;
    label: string;
    /** Informational line, e.g. the resolution actually delivered. */
    detail?: string;
  } | null>(null);
  const dismissSavedNotice = useCallback(() => setSavedNotice(null), []);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState("");

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

  // Comment export state.
  const [exportingComments, setExportingComments] = useState(false);
  const [commentsNote, setCommentsNote] = useState<string>("");

  const isElectron =
    typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
  const [saveDir, setSaveDirState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("clipper.saveDir");
  });
  const setSaveDir = useCallback((dir: string | null) => {
    setSaveDirState(dir);
    if (typeof window === "undefined") return;
    if (dir) window.localStorage.setItem("clipper.saveDir", dir);
    else window.localStorage.removeItem("clipper.saveDir");
  }, []);
  const pickSaveDir = useCallback(async () => {
    if (!window.electronAPI) return;
    const chosen = await window.electronAPI.pickDirectory();
    if (chosen) setSaveDir(chosen);
  }, [setSaveDir]);

  // --- Guided YouTube sign-in --------------------------------------------
  // Opens YouTube's sign-in page in the user's default browser, then polls
  // the local backend, which auto-detects (via yt-dlp) which browser now
  // holds a logged-in session. Fully local and free — no OAuth app, no
  // tokens; cookie contents never leave the browser's own store.
  const [ytAuth, setYtAuth] = useState<{
    status: YouTubeAuthState;
    message?: string;
    /** Browser the session was detected in (set on signed_in). */
    browser?: CookieBrowser;
  }>({ status: "idle" });
  // Checks the one browser selected by the user. A visible browser login is
  // not a redirect back to this app; yt-dlp must be able to read its cookies.
  const checkYouTubeAuth = useCallback(async (): Promise<YouTubeAuthState> => {
    setYtAuth({ status: "checking", browser: cookieBrowser });
    try {
      const res = await fetch(apiUrl("/api/auth/youtube/status"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browser: cookieBrowser }),
      });
      const data = await parseJson<YouTubeAuthStatus>(res);
      // Guard against non-probe responses (e.g. a proxy error body) so a
      // missing/invalid status can never blank out the UI state.
      if (
        data.status !== "signed_in" &&
        data.status !== "signed_out" &&
        data.status !== "profile_missing" &&
        data.status !== "locked" &&
        data.status !== "decrypt_failed" &&
        data.status !== "timeout" &&
        data.status !== "extractor_error"
      ) {
        throw new Error("Unexpected probe response");
      }
      if (data.status === "signed_in") {
        setCookieBrowser(data.browser);
        setUseBrowserCookies(true);
        setYtAuth({ status: "signed_in", browser: data.browser });
      } else {
        setYtAuth({
          status: data.status,
          message: data.message,
          browser: data.browser,
        });
      }
      return data.status;
    } catch {
      setYtAuth({
        status: "extractor_error",
        browser: cookieBrowser,
        message: "Couldn't reach the local backend.",
      });
      return "extractor_error";
    }
  }, [cookieBrowser, setCookieBrowser]);

  const beginYouTubeSignIn = useCallback(async () => {
    if (isElectron && window.electronAPI?.openYouTubeSignIn) {
      await window.electronAPI.openYouTubeSignIn();
    } else {
      window.open("https://www.youtube.com/signin", "_blank", "noopener");
    }
    setYtAuth({
      status: "ready",
      browser: cookieBrowser,
      message: `When you return, check the ${cookieBrowser} session.`,
    });
  }, [isElectron, cookieBrowser]);

  const revealLastSaved = useCallback(() => {
    if (isElectron && window.electronAPI?.showInFolder && lastSavedPath) {
      void window.electronAPI.showInFolder(lastSavedPath);
    }
  }, [isElectron, lastSavedPath]);

  const revealSaved = useCallback(() => {
    if (isElectron && window.electronAPI?.showInFolder && savedNotice?.path) {
      void window.electronAPI.showInFolder(savedNotice.path);
    }
    setSavedNotice(null);
  }, [isElectron, savedNotice]);

  const exportComments = useCallback(async () => {
    if (!info) {
      setError("Load a video first");
      return;
    }
    setError("");
    setCommentsNote("");
    setExportingComments(true);
    try {
      const res = await fetch(apiUrl("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizeYouTubeUrl(url) }),
      });
      const data = await parseJson<CommentsResponse & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to fetch comments");
      if (data.commentsDisabled) {
        setCommentsNote("Comments are disabled for this video");
        return;
      }
      if (!data.comments || data.comments.length === 0) {
        setCommentsNote("No comments found for this video");
        return;
      }
      const csv = commentsToCsv(data.comments);
      const filename = `${sanitizeFilename(info.title)}-comments.csv`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      if (isElectron && window.electronAPI && saveDir) {
        const arr = await blob.arrayBuffer();
        const result = await window.electronAPI.saveFile({
          dirPath: saveDir,
          filename,
          data: arr,
        });
        if (!result.ok) throw new Error(result.error);
        setLastSavedPath(result.path ?? null);
        setSavedNotice({
          kind: "comments",
          path: result.path ?? "",
          label: filename,
        });
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
        setSavedNotice({ kind: "comments", path: "", label: filename });
      }
      setCommentsNote(
        `Exported ${data.comments.length} comments (dislikes unavailable from YouTube)`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export comments");
    } finally {
      setExportingComments(false);
    }
  }, [info, url, isElectron, saveDir]);

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
        body: JSON.stringify({ url: normalizeYouTubeUrl(url) }),
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
        body: JSON.stringify({ url: normalizeYouTubeUrl(url) }),
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

  const cancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
  }, []);

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
    setDownloadProgress(0);
    setDownloadPhase("downloading");
    setSavedNotice(null);
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(
        apiUrl(`/api/download/progress?jobId=${encodeURIComponent(jobId)}`),
      );
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as {
            phase: "downloading" | "processing" | "done" | "error";
            percent: number;
          };
          setDownloadPhase(data.phase);
          if (typeof data.percent === "number") {
            setDownloadProgress((prev) =>
              data.phase === "downloading"
                ? Math.max(prev, data.percent)
                : data.percent,
            );
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* EventSource unavailable — proceed without progress */
    }
    try {
      const res = await fetch(
        apiUrl(`/api/download?jobId=${encodeURIComponent(jobId)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            url: normalizeYouTubeUrl(url),
            start,
            end,
            format,
            quality,
            ...(useBrowserCookies ? { cookiesFromBrowser: cookieBrowser } : {}),
          }),
        },
      );
      if (!res.ok) {
        const data = await parseJson<{ error?: string }>(res).catch(
          () => ({}) as { error?: string },
        );
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const ext = format === "mp3" ? "mp3" : "mp4";
      const filename = buildClipFilename(info.title, start, end, ext);
      // What the server actually produced — YouTube may only serve renditions
      // below the requested height, in which case the clip is still valid.
      const deliveredHeight = Number(res.headers.get("X-Delivered-Height"));
      const deliveredKbps = Number(res.headers.get("X-Delivered-Audio-Kbps"));
      const requestedHeight = Number(quality);
      let detail: string | undefined;
      if (format === "mp3") {
        detail = deliveredKbps ? `Downloaded at ${deliveredKbps} kbps.` : undefined;
      } else if (deliveredHeight) {
        detail =
          requestedHeight && deliveredHeight < requestedHeight
            ? `Downloaded at ${deliveredHeight}p — ${requestedHeight}p isn't available for this video.`
            : `Downloaded at ${deliveredHeight}p.`;
      }
      if (isElectron && window.electronAPI && saveDir) {
        const arr = await blob.arrayBuffer();
        const result = await window.electronAPI.saveFile({
          dirPath: saveDir,
          filename,
          data: arr,
        });
        if (!result.ok) throw new Error(result.error);
        setLastSavedPath(result.path ?? null);
        setSavedNotice({
          kind: "clip",
          path: result.path ?? "",
          label: filename,
          detail,
        });
      } else {
        setLastSavedPath(null);
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
        setSavedNotice({ kind: "clip", path: "", label: filename, detail });
      }
      setDownloadProgress(100);
      setDownloadPhase("done");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setDownloadPhase("idle");
      } else {
        setError(e instanceof Error ? e.message : "Download failed");
        setDownloadPhase("error");
      }
    } finally {
      es?.close();
      downloadAbortRef.current = null;
      setDownloading(false);
      window.setTimeout(() => {
        setDownloadPhase("idle");
        setDownloadProgress(0);
      }, 1200);
    }
  }, [
    info,
    validationError,
    url,
    start,
    end,
    format,
    quality,
    isElectron,
    saveDir,
    useBrowserCookies,
    cookieBrowser,
  ]);

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
    useBrowserCookies,
    setUseBrowserCookies,
    cookieBrowser,
    setCookieBrowser,
    ytAuth,
    beginYouTubeSignIn,
    checkYouTubeAuth,
    loadingInfo,
    downloading,
    downloadProgress,
    downloadPhase,
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
    seekRequest,
    requestSeek,
    rangeTranscriptText,
    copyTranscript,
    estimatedBytes,
    isElectron,
    saveDir,
    setSaveDir,
    pickSaveDir,
    lastSavedPath,
    revealLastSaved,
    savedNotice,
    dismissSavedNotice,
    revealSaved,
    cancelDownload,
    exportComments,
    exportingComments,
    commentsNote,
  };
}

export type ClipperState = ReturnType<typeof useClipper>;
