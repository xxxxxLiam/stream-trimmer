/**
 * File: TranscriptLane.tsx
 * Path: src/renderer/src/features/player/components/TranscriptLane.tsx
 * Description: One line of the words said, above Source. Lines inside the picked range are tinted
 *   Ice. Shown or hidden from the Panels menu.
 */
import type { TimelineController } from "../hooks/useTimelineController";
import { toX } from "../utils/timelineAxis";
import LaneLabel from "./LaneLabel";

const MIN_WIDTH = 24;

export default function TranscriptLane({ c }: { c: TimelineController }) {
  const lines = c.opening ? [] : (c.lines ?? []);
  const first = c.axis.pieces[0]?.t0 ?? 0;
  const last = c.axis.pieces[c.axis.pieces.length - 1]?.t1 ?? 0;
  const shown = lines.filter((l) => l.end >= first && l.start <= last);
  const inRange = (start: number) => c.sections.some((s) => start >= s.start && start < s.end);
  return (
    <div className="flex h-[32px] items-center">
      <LaneLabel>Transcript</LaneLabel>
      <div className="relative h-full flex-1 overflow-hidden">
        {shown.map((l) => {
          const x = toX(c.axis, l.start);
          const w = toX(c.axis, l.end) - x;
          if (w < MIN_WIDTH) return null;
          const on = inRange(l.start);
          return (
            <span
              key={`${l.start}-${l.text}`}
              title={l.text}
              className={`absolute top-[5px] h-[22px] overflow-hidden text-ellipsis whitespace-nowrap rounded-chip px-[6px] text-meta leading-[22px] ${on ? "bg-ice-tint-15 text-fg shadow-[inset_0_0_0_1px_var(--ice-tint-50)]" : "text-fg-dim"}`}
              style={{ left: x, width: w }}
            >
              {l.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
