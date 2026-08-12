/**
 * File: useYouTubePlayer.ts
 * Path: src/hooks/useYouTubePlayer.ts
 * Description: Loads the YouTube IFrame API and exposes playhead + transport controls.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API_SRC = "https://www.youtube.com/iframe_api";
const POLL_MS = 200;
const EMBED_BLOCKED_CODES = [101, 150, 153];

interface YTPlayer {
  destroy(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: Record<string, unknown>,
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API failed to initialise"));
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = API_SRC;
      script.async = true;
      script.onerror = () =>
        reject(new Error("Could not reach the YouTube player"));
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

export interface YouTubePlayerApi {
  containerRef: (el: HTMLDivElement | null) => void;
  ready: boolean;
  blocked: boolean;
  playing: boolean;
  currentTime: number;
  seekTo: (seconds: number, autoplay?: boolean) => void;
  play: () => void;
  pause: () => void;
}

export function useYouTubePlayer(videoId: string | null): YouTubePlayerApi {
  const playerRef = useRef<YTPlayer | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    nodeRef.current = el;
    setMountKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!videoId || !node) return;
    let cancelled = false;

    setReady(false);
    setBlocked(false);
    setPlaying(false);
    setCurrentTime(0);

    loadApi()
      .then((YT) => {
        if (cancelled || !nodeRef.current) return;
        const host = document.createElement("div");
        host.style.width = "100%";
        host.style.height = "100%";
        nodeRef.current.replaceChildren(host);
        playerRef.current = new YT.Player(host, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => !cancelled && setReady(true),
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              setPlaying(e.data === 1);
            },
            onError: (e: { data: number }) => {
              if (cancelled) return;
              if (EMBED_BLOCKED_CODES.includes(Number(e.data)))
                setBlocked(true);
            },
          },
        });
      })
      .catch(() => !cancelled && setBlocked(true));

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
    };
  }, [videoId, mountKey]);

  // Poll the playhead — the IFrame API has no time-update event.
  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      try {
        const t = playerRef.current?.getCurrentTime();
        if (typeof t === "number") setCurrentTime(t);
      } catch {
        /* transient during teardown */
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  const seekTo = useCallback((seconds: number, autoplay = false) => {
    try {
      playerRef.current?.seekTo(Math.max(0, seconds), true);
      setCurrentTime(Math.max(0, seconds));
      if (autoplay) playerRef.current?.playVideo();
    } catch {
      /* not ready yet */
    }
  }, []);

  const play = useCallback(() => {
    try {
      playerRef.current?.playVideo();
    } catch {
      /* not ready yet */
    }
  }, []);

  const pause = useCallback(() => {
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* not ready yet */
    }
  }, []);

  return { containerRef, ready, blocked, playing, currentTime, seekTo, play, pause };
}
