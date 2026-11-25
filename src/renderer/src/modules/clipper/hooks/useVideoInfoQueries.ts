/**
 * File: useVideoInfoQueries.ts
 * Path: src/renderer/src/modules/clipper/hooks/useVideoInfoQueries.ts
 * Description: Loads video info for the pasted link, automatically (debounced) or on demand.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeYouTubeUrl, parseJson, apiUrl, type VideoInfo } from "../../../shared/utils/clip";
import { videoUrlProblem } from "../utils/downloadErrors";
import { cookiePayload } from "../../../shared/utils/youtubeConnection";

export function useVideoInfoQueries({
  url,
  videoId,
  setInfo,
  setStartText,
  setEndText,
  setError,
}: {
  url: string;
  videoId: string | null;
  setInfo: (info: VideoInfo | null) => void;
  setStartText: (v: string) => void;
  setEndText: (v: string) => void;
  setError: (v: string) => void;
}) {
  const [loadingInfo, setLoadingInfo] = useState(false);

  const loadInfo = useCallback(async () => {
    if (!url) return;
    const problem = videoUrlProblem(url);
    if (problem) {
      // Not a video: do not present it as a loaded source.
      setInfo(null);
      setError(problem);
      return;
    }
    setError("");
    setLoadingInfo(true);
    try {
      const res = await fetch(apiUrl("/api/info"), {
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
      const data = await parseJson<VideoInfo & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load video info");
      setInfo(data);
      setStartText("");
      // Nothing is picked on a fresh video: the first clip starts with an empty Source lane.
      setEndText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load video info");
      setInfo(null);
    } finally {
      setLoadingInfo(false);
    }
  }, [url]);

  // Auto-search: load video info as soon as the URL resolves to a new video
  // id. Debounced so typing doesn't spam the backend; re-entering the same
  // link is a no-op. Partial / invalid text is ignored silently.
  const loadInfoRef = useRef(loadInfo);
  loadInfoRef.current = loadInfo;
  const lastLoadedIdRef = useRef<string | null>(null);
  const autoLoadNowRef = useRef(false);

  useEffect(() => {
    if (!videoId) return;
    if (lastLoadedIdRef.current === videoId) return;
    const immediate = autoLoadNowRef.current;
    autoLoadNowRef.current = false;
    const run = () => {
      lastLoadedIdRef.current = videoId;
      void loadInfoRef.current();
    };
    if (immediate) {
      run();
      return;
    }
    const t = window.setTimeout(run, 450);
    return () => window.clearTimeout(t);
  }, [videoId]);

  /** Called by the URL bar on paste to skip the debounce. */
  const flushAutoLoad = useCallback(() => {
    autoLoadNowRef.current = true;
  }, []);

  /** Manual search (button / Enter) — always reloads the current URL. */
  const searchNow = useCallback(() => {
    lastLoadedIdRef.current = videoId;
    void loadInfoRef.current();
  }, [videoId]);

  return { loadingInfo, loadInfo, searchNow, flushAutoLoad };
}
