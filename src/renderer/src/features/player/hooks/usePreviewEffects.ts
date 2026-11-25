/**
 * File: usePreviewEffects.ts
 * Path: src/renderer/src/features/player/hooks/usePreviewEffects.ts
 * Description: The preview's listeners and timers: publishing the playhead, seek requests, play-from,
 *   the loop, the J K L and Space keys, and the full-screen bar that hides after a few seconds.
 */
import { useEffect, useRef, type RefObject } from "react";
import { setPlayhead } from "../../../shared/hooks/useSegmentsState";
import { PLAY_FROM_EVENT } from "../../../shared/utils/playFrom";
import type { Range } from "../../../shared/utils/segments";
import type { YouTubePlayerApi } from "./useYouTubePlayerController";
import { BAR_HIDE_MS } from "./usePreviewState";
import { keyAction, loopSeek, stepTarget } from "../utils/transport";

type Args = {
  player: YouTubePlayerApi;
  videoId: string | null;
  tabActive: boolean;
  duration: number;
  seekRequest: { time: number; nonce: number } | null | undefined;
  loop: boolean;
  setLoop: (v: boolean | ((v: boolean) => boolean)) => void;
  sections: readonly Range[];
  fullScreen: boolean;
  setFullScreen: (v: boolean) => void;
  setBarVisible: (v: boolean) => void;
  frameRef: RefObject<HTMLDivElement | null>;
  toggleLoop: () => void;
  onNextVideo: () => void;
  setIn: () => void;
  setOut: () => void;
};

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
}

export function usePreviewEffects(a: Args) {
  const { player, videoId, tabActive, duration, seekRequest, loop, sections, fullScreen } = a;
  const playerRef = useRef(player);
  playerRef.current = player;
  // The key listener outlives a render, so it reads the latest handlers (I and O use the playhead
  // as it is now, not as it was when the listener was added).
  const argsRef = useRef(a);
  argsRef.current = a;

  // The transcript highlight and the timeline follow the playhead; only the visible tab writes.
  useEffect(() => {
    if (tabActive) setPlayhead(player.currentTime);
  }, [tabActive, player.currentTime]);

  // A line was clicked in the transcript, or the range slider moved.
  useEffect(() => {
    if (!seekRequest) return;
    playerRef.current.seekTo(seekRequest.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.nonce]);

  // A waiting moment was picked: jump to its start and play. That ends the loop.
  useEffect(() => {
    if (!tabActive) return;
    const onPlayFrom = (e: Event) => {
      const seconds = (e as CustomEvent<number>).detail;
      if (typeof seconds !== "number") return;
      a.setLoop(false);
      playerRef.current.seekTo(seconds, true);
      playerRef.current.play();
    };
    window.addEventListener(PLAY_FROM_EVENT, onPlayFrom);
    return () => window.removeEventListener(PLAY_FROM_EVENT, onPlayFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive]);

  // Loop: stay inside the clip; a joined clip plays its sections in order.
  useEffect(() => {
    if (!loop) return;
    const to = loopSeek(sections, player.currentTime);
    if (to !== null) player.seekTo(to, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, player.currentTime, sections]);

  useEffect(() => {
    a.setLoop(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // J K L, Space and Cmd/Ctrl L. Held J or L shuttle: forward at 2x, back by stepping.
  useEffect(() => {
    if (!tabActive || !videoId) return;
    let shuttleBack: number | null = null;
    let restore: number | null = null;
    const stopShuttle = () => {
      if (shuttleBack !== null) window.clearInterval(shuttleBack);
      shuttleBack = null;
      if (restore !== null) playerRef.current.setSpeed(restore);
      restore = null;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.altKey || typing(e)) return;
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === "N") {
        e.preventDefault();
        argsRef.current.onNextVideo();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        argsRef.current.setIn();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        argsRef.current.setOut();
        return;
      }
      const act = keyAction(e.key, e.metaKey || e.ctrlKey, e.repeat);
      if (!act) return;
      const p = playerRef.current;
      if (act.kind === "loop") {
        e.preventDefault();
        argsRef.current.toggleLoop();
      } else if (act.kind === "toggle") {
        e.preventDefault();
        if (!e.repeat) (p.playing ? p.pause : p.play)();
      } else if (act.kind === "pause") {
        e.preventDefault();
        p.pause();
      } else if (act.kind === "step") {
        e.preventDefault();
        p.seekTo(stepTarget(p.currentTime, act.by, duration));
      } else if (act.kind === "shuttle") {
        e.preventDefault();
        if (act.dir === 1 && restore === null) {
          restore = p.speed;
          p.setSpeed(2);
          p.play();
        } else if (act.dir === -1 && shuttleBack === null) {
          shuttleBack = window.setInterval(() => {
            const q = playerRef.current;
            q.seekTo(stepTarget(q.currentTime, -2, duration));
          }, 250);
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "l" || k === "j") stopShuttle();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    // A keyup can be lost (the window loses focus or is hidden while the key is down): stop then too.
    const onHidden = () => {
      if (document.visibilityState === "hidden") stopShuttle();
    };
    window.addEventListener("blur", stopShuttle);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      stopShuttle();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", stopShuttle);
      document.removeEventListener("visibilitychange", onHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, videoId, duration]);

  // Full screen follows the browser: Esc leaves it, and the state here follows.
  useEffect(() => {
    const onChange = () => a.setFullScreen(document.fullscreenElement === a.frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In full screen the bar slides up on movement and hides after about 3 seconds.
  useEffect(() => {
    if (!fullScreen) {
      a.setBarVisible(true);
      return;
    }
    let t: number | null = null;
    const show = () => {
      a.setBarVisible(true);
      if (t !== null) window.clearTimeout(t);
      t = window.setTimeout(() => a.setBarVisible(false), BAR_HIDE_MS);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      if (t !== null) window.clearTimeout(t);
      window.removeEventListener("mousemove", show);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullScreen]);
}
