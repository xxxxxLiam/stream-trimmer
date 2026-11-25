/**
 * File: useYouTubePlayerController.ts
 * Path: src/renderer/src/features/player/hooks/useYouTubePlayerController.ts
 * Description: Loads the YouTube IFrame API and exposes playhead + transport controls.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { SUSPEND_UNLOAD_MS, resumeStart } from "../../../shared/utils/tabOps";

const API_SRC = "https://www.youtube.com/iframe_api";
const POLL_MS = 200;

/**
 * How close the player has to get to a requested seek before a polled reading is believed
 * again. YouTube lands on a keyframe, not the exact second, so this is not zero.
 */
export const SEEK_SETTLE_SEC = 0.6;
/** Stop waiting for a seek to land after this, so a dropped seek cannot freeze the playhead. */
export const SEEK_TIMEOUT_MS = 1500;

export type PendingSeek = { target: number; until: number } | null;

/**
 * Whether a polled playhead reading should be believed.
 *
 * The IFrame API has no time-update event, so the playhead is polled every POLL_MS. A seek
 * is asynchronous: for a tick or two after it, getCurrentTime() still reports where the
 * video WAS. Believing that reading drags the playhead back to the old position and then
 * forward again a moment later — the visible double-jump on every click of the timeline.
 *
 * So while a seek is outstanding, a reading is only believed once the player has actually
 * arrived near the target, or once we have waited long enough that something clearly went
 * wrong and a stuck playhead would be worse than a jump.
 */
export function acceptPolledTime(polled: number, pending: PendingSeek, now: number): boolean {
  if (!pending) return true;
  if (now >= pending.until) return true;
  return Math.abs(polled - pending.target) <= SEEK_SETTLE_SEC;
}
const EMBED_BLOCKED_CODES = [101, 150, 153];

interface YTPlayer {
  destroy(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  mute(): void;
  unMute(): void;
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
  /** True once the video has played to its end, until it plays or is sought again. */
  ended: boolean;
  currentTime: number;
  seekTo: (seconds: number, autoplay?: boolean) => void;
  play: () => void;
  pause: () => void;
  speed: number;
  setSpeed: (rate: number) => void;
  muted: boolean;
  toggleMute: () => void;
}

export function useYouTubePlayerController(videoId: string | null): YouTubePlayerApi {
  const playerRef = useRef<YTPlayer | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [muted, setMuted] = useState(false);
  // Set while a seek is in flight; see acceptPolledTime.
  const pendingSeek = useRef<PendingSeek>(null);

  // A tab that is not on screen does not need a live player. The moment it is hidden the video
  // is paused and the poll stops; after SUSPEND_UNLOAD_MS the iframe is destroyed too, and the
  // position is kept so coming back re-creates the player at the same second. `tabActive` is
  // true when no tab provider is above (tests, a stray mount), so nothing changes there.
  const tabActive = useIsTabActive();
  // A tab that mounts hidden (every saved tab on launch but one) never builds a player at all.
  const [unloaded, setUnloaded] = useState(!tabActive);
  const lastTime = useRef<{ videoId: string; time: number } | null>(null);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const speedRef = useRef(1);
  speedRef.current = speed;
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  useEffect(() => {
    if (tabActive) {
      setUnloaded(false);
      return;
    }
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* not ready, or already gone */
    }
    const t = window.setTimeout(() => setUnloaded(true), SUSPEND_UNLOAD_MS);
    return () => window.clearTimeout(t);
  }, [tabActive]);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    nodeRef.current = el;
    setMountKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!videoId || !node) return;
    if (unloaded) {
      // Suspended: leave the last position showing, but nothing is live.
      setReady(false);
      setPlaying(false);
      return;
    }
    let cancelled = false;
    const startAt = resumeStart(lastTime.current, videoId);

    setReady(false);
    setBlocked(false);
    setPlaying(false);
    setCurrentTime(startAt);

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
            // Clipr has its own play, pause and seek bar, so YouTube's control bar is off. Its title strip and logo stay: the embed terms require them.
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
            ...(startAt > 0 ? { start: startAt } : null),
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              // A rebuilt player keeps the speed and mute the clipper chose.
              try {
                playerRef.current?.setPlaybackRate(speedRef.current);
                if (mutedRef.current) playerRef.current?.mute();
              } catch {
                /* the player is not ready to take settings */
              }
              setReady(true);
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              setPlaying(e.data === 1);
              setEnded(e.data === 0);
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
        // Remember where this video was, for a resume. Only trust a live reading.
        const t = readyRef.current ? playerRef.current?.getCurrentTime() : undefined;
        if (typeof t === "number" && Number.isFinite(t) && videoId)
          lastTime.current = { videoId, time: t };
      } catch {
        /* player not readable */
      }
      try {
        playerRef.current?.destroy();
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
    };
  }, [videoId, mountKey, unloaded]);

  // Poll the playhead — the IFrame API has no time-update event.
  useEffect(() => {
    if (!ready || !tabActive) return;
    const id = window.setInterval(() => {
      try {
        const t = playerRef.current?.getCurrentTime();
        if (typeof t === "number" && acceptPolledTime(t, pendingSeek.current, Date.now())) {
          pendingSeek.current = null;
          if (videoId) lastTime.current = { videoId, time: t };
          setCurrentTime(t);
        }
      } catch {
        /* transient during teardown */
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready, tabActive, videoId]);

  const seekTo = useCallback((seconds: number, autoplay = false) => {
    try {
      const target = Math.max(0, seconds);
      playerRef.current?.seekTo(target, true);
      // Show the new position at once, and ignore stale polls until the player catches up.
      pendingSeek.current = { target, until: Date.now() + SEEK_TIMEOUT_MS };
      setCurrentTime(target);
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

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate);
    try {
      playerRef.current?.setPlaybackRate(rate);
    } catch {
      /* applied when the player is ready */
    }
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    setMuted(next);
    try {
      if (next) playerRef.current?.mute();
      else playerRef.current?.unMute();
    } catch {
      /* applied when the player is ready */
    }
  }, []);

  return {
    containerRef,
    ready,
    blocked,
    playing,
    ended,
    currentTime,
    seekTo,
    play,
    pause,
    speed,
    setSpeed,
    muted,
    toggleMute,
  };
}
