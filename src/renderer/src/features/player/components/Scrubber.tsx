/**
 * File: Scrubber.tsx
 * Path: src/renderer/src/features/player/components/Scrubber.tsx
 * Description: The preview's one thin track (scrubber C): the zoomed part is brighter, the range is
 *   Ice, flags are ticks and the playhead is a Frost line. Click or use arrow keys to move.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { clockTime } from "../utils/transport";

export type ScrubberProps = {
  duration: number;
  playhead: number;
  range: { start: number; end: number } | null;
  flags: readonly number[];
  /** The part of the video the timeline is zoomed to, when it is zoomed. */
  view: { start: number; end: number } | null;
  onSeek: (seconds: number) => void;
  /** The thicker, darker track used in full screen. */
  large?: boolean;
};

const pct = (v: number, d: number) => (d > 0 ? Math.min(100, Math.max(0, (v / d) * 100)) : 0);

export default function Scrubber({ duration, playhead, range, flags, view, onSeek, large = false }: ScrubberProps) {
  const seekFromPointer = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || duration <= 0) return;
    onSeek(Math.min(duration, Math.max(0, ((e.clientX - box.left) / box.width) * duration)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") onSeek(Math.max(0, playhead - 5));
    else if (e.key === "ArrowRight") onSeek(Math.min(duration, playhead + 5));
    else if (e.key === "Home") onSeek(0);
    else if (e.key === "End") onSeek(duration);
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      aria-valuenow={Math.floor(playhead)}
      aria-valuetext={clockTime(playhead)}
      onClick={seekFromPointer}
      onKeyDown={onKey}
      className={`relative flex-none cursor-pointer ${large ? "h-[4px] rounded-chip bg-hover" : "h-[5px] rounded-[3px] bg-raised"}`}
    >
      {view ? (
        <span
          className="absolute inset-y-[0px] rounded-[3px] bg-hover"
          style={{ left: `${pct(view.start, duration)}%`, width: `${pct(view.end - view.start, duration)}%` }}
        />
      ) : null}
      {range ? (
        <span
          className="absolute inset-y-[0px] rounded-[2px] bg-ice"
          style={{ left: `${pct(range.start, duration)}%`, width: `${pct(range.end - range.start, duration)}%` }}
        />
      ) : null}
      {flags.map((f) => (
        <span
          key={f}
          aria-hidden="true"
          className="absolute -top-[5px] h-[14px] w-[2px] bg-fg-dim"
          style={{ left: `${pct(f, duration)}%` }}
        />
      ))}
      <span
        aria-hidden="true"
        className={`absolute w-[2px] bg-frost shadow-playhead ${large ? "-top-[7px] h-[18px]" : "-top-[4px] h-[13px]"}`}
        style={{ left: `${pct(playhead, duration)}%` }}
      />
    </div>
  );
}
