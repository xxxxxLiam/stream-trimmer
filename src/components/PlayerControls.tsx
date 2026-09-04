/**
 * File: PlayerControls.tsx
 * Path: src/components/PlayerControls.tsx
 * Description: Playhead readout, set in/out point buttons and looped selection playback.
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
  const { info, start, end, duration, setStartFromSeconds, setEndFromSeconds } =
    useClipperContext();
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

  const span = duration || 1;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / span) * 100))}%`;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {/* Selection overlay bar mirroring the video timeline. */}
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-chip bg-panel-hover"
        aria-hidden
      >
        <div
          className="absolute top-0 bottom-0 bg-accent/30"
          style={{ left: pct(start), width: pct(Math.max(0, end - start)) }}
        />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-fg"
          style={{ left: pct(currentTime) }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (playing ? pause() : play())}
          disabled={!ready}
          className="btn text-[12px]"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <PauseFill size={12} /> : <PlayFill size={12} />}
          <span>{playing ? "Pause" : "Play"}</span>
        </button>

        <button
          type="button"
          onClick={setIn}
          disabled={!info}
          className="btn text-[12px]"
          title="Set clip start at playhead (I)"
        >
          <ChevronBarLeft size={12} />
          <span>Set start</span>
          <span className="kbd">I</span>
        </button>

        <button
          type="button"
          onClick={setOut}
          disabled={!info}
          className="btn text-[12px]"
          title="Set clip end at playhead (O)"
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
          className={
            "btn text-[12px]" + (loopSelection ? " border-accent/60 text-accent" : "")
          }
          title="Play only the selected range, looped"
        >
          <Repeat size={12} />
          <span>{loopSelection ? "Looping selection" : "Play selection"}</span>
        </button>

        <span className="ml-auto text-[12px] tabular-nums text-fg-muted">
          {formatTimestamp(currentTime)}{" "}
          <span className="text-fg-faint">/ {formatTimestamp(duration)}</span>
        </span>
      </div>
    </div>
  );
}
