/**
 * File: Scrubber.tsx
 * Path: src/renderer/src/features/player/components/Scrubber.tsx
 * Description: The preview's one thin track (scrubber C): the zoomed part is brighter, the range is
 *   Ice, flags are ticks and the playhead is a Frost line. Click or use arrow keys to move.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { clipPosition, clipToVideo, clockTime } from "../utils/transport";

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
  /** A joined clip's sections, in play order: the track is the clip, counted in clip time. */
  joined?: readonly { start: number; end: number }[];
};

const pct = (v: number, d: number) => (d > 0 ? Math.min(100, Math.max(0, (v / d) * 100)) : 0);

export default function Scrubber({ duration, playhead, range, flags, view, onSeek, large = false, joined }: ScrubberProps) {
  const clip = joined && joined.length >= 2 ? joined : null;
  const pos = clip ? clipPosition(clip, playhead) : null;
  const seekFromPointer = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || duration <= 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onSeek(clip && pos ? clipToVideo(clip, f * pos.total) : Math.min(duration, f * duration));
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
      {clip && pos ? <JoinedTrack sections={clip} at={pos.at} total={pos.total} playhead={playhead} large={large} /> : null}
      {!clip && view ? (
        <span
          className="absolute inset-y-[0px] rounded-[3px] bg-hover"
          style={{ left: `${pct(view.start, duration)}%`, width: `${pct(view.end - view.start, duration)}%` }}
        />
      ) : null}
      {!clip && range ? (
        <span
          className="absolute inset-y-[0px] rounded-[2px] bg-ice"
          style={{ left: `${pct(range.start, duration)}%`, width: `${pct(range.end - range.start, duration)}%` }}
        />
      ) : null}
      {(clip ? [] : flags).map((f) => (
        <span
          key={f}
          aria-hidden="true"
          className="absolute -top-[5px] h-[14px] w-[2px] bg-fg-dim"
          style={{ left: `${pct(f, duration)}%` }}
        />
      ))}
      {clip ? null : (
        <span
          aria-hidden="true"
          className={`absolute w-[2px] bg-frost shadow-playhead ${large ? "-top-[7px] h-[18px]" : "-top-[4px] h-[13px]"}`}
          style={{ left: `${pct(playhead, duration)}%` }}
        />
      )}
    </div>
  );
}

/** The track of a joined clip: one stretch per section, every one solid Ice as the board draws it, a tick between, the playhead over it. */
function JoinedTrack({
  sections,
  at,
  total,
  playhead,
  large,
}: {
  sections: readonly { start: number; end: number }[];
  at: number;
  total: number;
  playhead: number;
  large: boolean;
}) {
  let offset = 0;
  return (
    <>
      {sections.map((s, i) => {
        const len = Math.max(0, s.end - s.start);
        const left = (offset / total) * 100;
        const width = (len / total) * 100;
        offset += len;
        return (
          <span key={`${s.start}-${s.end}`}>
            <span
              aria-hidden="true"
              className={`absolute inset-y-[0px] rounded-[3px] bg-ice`}
              style={{ left: `${left}%`, width: `calc(${width}% - ${i < sections.length - 1 ? 3 : 0}px)` }}
            />
            {i < sections.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -top-[3px] h-[11px] w-[2px] bg-fg"
                style={{ left: `calc(${left + width}% - 3px)` }}
              />
            ) : null}
          </span>
        );
      })}
      <span
        aria-hidden="true"
        className={`absolute w-[2px] bg-fg ${large ? "-top-[7px] h-[18px]" : "-top-[4px] h-[13px]"}`}
        style={{ left: `${(at / total) * 100}%` }}
      />
    </>
  );
}
