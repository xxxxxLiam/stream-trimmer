/**
 * File: PlayerControls.tsx
 * Path: src/components/PlayerControls.tsx
 * Description: Playhead readout, set start/end buttons and looped selection playback.
 */
import { useEffect } from "react";
import {
  PlayFill,
  PauseFill,
  ChevronBarLeft,
  ChevronBarRight,
  Repeat,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { useIsTabActive } from "../context/WorkspaceContext";
import { formatTimestamp } from "../lib/clip";
import type { YouTubePlayerApi } from "../hooks/useYouTubePlayer";

export default function PlayerControls({
  player,
  loopSelection,
  onToggleLoop,
}: {
  player: YouTubePlayerApi;
  loopSelection: boolean;
  onToggleLoop: () => void;
}) {
  const { info, start, duration, setStartFromSeconds, setEndFromSeconds } = useClipperContext();
  const isTabActive = useIsTabActive();
  const { currentTime, playing, play, pause, seekTo, ready } = player;

  const setIn = () => setStartFromSeconds(Math.floor(currentTime));
  const setOut = () => setEndFromSeconds(Math.ceil(currentTime));

  // I / O keyboard shortcuts, ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isTabActive || !info || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setIn();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setOut();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The selection and playhead are drawn once, on the Timeline below the video.
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => (playing ? pause() : play())}
        disabled={!ready}
        className="btn"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseFill size={12} /> : <PlayFill size={12} />}
        <span>{playing ? "Pause" : "Play"}</span>
      </button>

      <button
        type="button"
        onClick={setIn}
        disabled={!info}
        className="btn"
        title="Start the clip at the playhead (I)"
      >
        <ChevronBarLeft size={12} />
        <span>Set start</span>
        <span className="kbd">I</span>
      </button>

      <button
        type="button"
        onClick={setOut}
        disabled={!info}
        className="btn"
        title="End the clip at the playhead (O)"
      >
        <ChevronBarRight size={12} />
        <span>Set end</span>
        <span className="kbd">O</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onToggleLoop();
          if (!loopSelection) seekTo(start, true);
        }}
        disabled={!ready || !info}
        className={"btn" + (loopSelection ? " border-accent/60 text-accent" : "")}
        title="Play only the range between start and end, on repeat"
      >
        <Repeat size={12} />
        <span>{loopSelection ? "Stop looping" : "Loop clip"}</span>
      </button>

      <span className="ml-auto text-meta tabular-nums text-fg-dim">
        {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
      </span>
    </div>
  );
}
