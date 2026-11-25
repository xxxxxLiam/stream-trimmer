/**
 * File: AudioLanes.tsx
 * Path: src/renderer/src/features/player/components/AudioLanes.tsx
 * Description: One 32px "Audio" lane per language ticked in the export bar (Original plus dubs),
 *   under Source. Each bar runs the whole video with its tag and name; the picked range shows
 *   brighter with a Frost edge on every lane. No audio is edited here and the preview stays on the
 *   original, so a lane only shows which language files the Clip will make.
 */
import type { TimelineController } from "../hooks/useTimelineController";
import { toX } from "../utils/timelineAxis";
import { languageTag } from "../../../shared/utils/audioLanguages";
import LaneLabel from "./LaneLabel";

export default function AudioLanes({ c }: { c: TimelineController }) {
  if (c.audioLanes.length === 0 || c.opening) return null;
  const first = Math.max(0, c.axis.pieces[0]?.t0 ?? 0);
  const last = Math.min(c.duration, c.axis.pieces[c.axis.pieces.length - 1]?.t1 ?? c.duration);
  const left = toX(c.axis, first);
  const width = Math.max(0, toX(c.axis, last) - left);
  return (
    <>
      {c.audioLanes.map((lane) => (
        <div key={lane.language} className="flex h-[32px] items-center" data-audio-lane={lane.language}>
          <LaneLabel>Audio</LaneLabel>
          <div className="relative h-[24px] flex-1">
            <span aria-hidden="true" className="absolute inset-y-0 rounded-chip bg-raised" style={{ left, width }} />
            {c.sections.map((s) => {
              const x = toX(c.axis, s.start);
              return (
                <span
                  key={`${s.start}-${s.end}`}
                  aria-hidden="true"
                  className="absolute inset-y-0 rounded-chip border border-frost bg-hover"
                  style={{ left: x, width: Math.max(4, toX(c.axis, s.end) - x) }}
                />
              );
            })}
            <span className="pointer-events-none absolute inset-y-0 flex items-center gap-[8px] pl-[8px] text-meta text-fg-dim" style={{ left }}>
              <span className="rounded-chip bg-hover px-[6px] text-fg">{languageTag(lane.language)}</span>
              {lane.name}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
