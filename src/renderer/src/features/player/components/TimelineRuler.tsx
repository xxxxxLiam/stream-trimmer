/**
 * File: TimelineRuler.tsx
 * Path: src/renderer/src/features/player/components/TimelineRuler.tsx
 * Description: The ruler row: round times along the shown stretch, and across a fold a marked
 *   "8:34 folded" label where the times jump.
 */
import type { TimelineController } from "../hooks/useTimelineController";
import LaneLabel from "./LaneLabel";

export function foldLabel(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} folded`;
}

export default function TimelineRuler({ c }: { c: TimelineController }) {
  return (
    <div className="flex h-[18px] items-start">
      <LaneLabel />
      <div className="relative h-full flex-1">
        {c.opening ? null : c.ticks.map((t) => (
          <span key={`${t.t}-${t.x}`} className="absolute text-meta leading-[15px] tabular-nums text-fg-dim" style={{ left: t.x }}>
            {t.label}
          </span>
        ))}
        {c.fold.map((f) => (
          <span key={f.x} className="absolute text-center text-meta font-medium text-fg" style={{ left: f.x, width: f.width }}>
            {foldLabel(f.skipped)}
          </span>
        ))}
      </div>
    </div>
  );
}
