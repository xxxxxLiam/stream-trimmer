/**
 * File: SourceLane.tsx
 * Path: src/renderer/src/features/player/components/SourceLane.tsx
 * Description: The Source lane: the filmstrip with unused footage dimmed, the picked range outlined
 *   in Ice with its glow, flags, the Frost playhead, and the fold. The lane is where the tools act:
 *   drag sets a range, the scissors click a start then an end, the flag tool drops flags.
 */
import type { TimelineController } from "../hooks/useTimelineController";
import { toX } from "../utils/timelineAxis";
import Filmstrip from "./Filmstrip";
import LaneLabel from "./LaneLabel";

const CURSORS = { pointer: "cursor-pointer", clip: "cursor-crosshair", flag: "cursor-cell", hand: "cursor-grab", zoom: "cursor-zoom-in" } as const;
const FIRST_CLIP_HINT = "Drag on the timeline, or press I and O, to pick the part you want. Then Clip.";

export default function SourceLane({ c }: { c: TimelineController }) {
  const covered = [...c.sections, ...c.used.filter((u) => u.end > u.start)].sort((a, b) => a.start - b.start);
  // Unused footage is dimmed: everything not under a picked range or a made clip.
  const dim: { start: number; end: number }[] = [];
  if (covered.length > 0 && c.duration > 0) {
    let at = c.axis.pieces[0]?.t0 ?? 0;
    for (const r of covered) {
      if (r.start > at) dim.push({ start: at, end: r.start });
      at = Math.max(at, r.end);
    }
    const end = c.axis.pieces[c.axis.pieces.length - 1]?.t1 ?? c.duration;
    if (at < end) dim.push({ start: at, end });
  }
  return (
    <div className="flex h-11 items-center">
      <LaneLabel>Source</LaneLabel>
      <div
        className={`relative h-full flex-1 touch-none select-none ${CURSORS[c.tool]}`}
        data-lane="source"
        onPointerDown={c.onLanePointerDown}
        onPointerMove={c.onLanePointerMove}
        onPointerUp={c.onLanePointerUp}
      >
        {c.opening ? null : (
          <>
            <Filmstrip axis={c.axis} levels={c.storyboards} height={32} />
            {dim.map((d) => {
              const x = toX(c.axis, d.start);
              return (
                <span
                  key={`${d.start}-${d.end}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute bg-bg-overlay-60"
                  style={{ left: x, width: toX(c.axis, d.end) - x, top: 6, bottom: 6 }}
                />
              );
            })}
            {c.sections.map((s) => {
              const x = toX(c.axis, s.start);
              return (
                <span
                  key={`${s.start}-${s.end}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-chip border-2 border-ice bg-ice-tint-12 shadow-range"
                  style={{ left: x, width: Math.max(4, toX(c.axis, s.end) - x), top: c.joined ? 12 : 4, bottom: c.joined ? 12 : 4 }}
                />
              );
            })}
            {c.flags.map((f) => (
              <span
                key={f}
                aria-hidden="true"
                className="pointer-events-none absolute top-1 h-[10px] w-0.5 bg-fg-dim"
                style={{ left: toX(c.axis, f) }}
              />
            ))}
            {c.duration > 0 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1 -top-1 border-l border-dashed border-frost"
                style={{ left: toX(c.axis, c.playhead) }}
              />
            ) : null}
            {c.fold.map((f) => (
              <button
                key={f.x}
                type="button"
                aria-label={`Open the folded ${Math.floor(f.skipped / 60)}:${String(Math.round(f.skipped % 60)).padStart(2, "0")}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={c.openFold}
                className="absolute inset-y-0 flex items-center justify-between border-x border-hairline-strong px-2 text-meta text-fg-dim"
                style={{ left: f.x, width: f.width }}
              >
                <span aria-hidden="true" className="my-1 w-[3px] self-stretch" style={{ background: "repeating-linear-gradient(180deg, var(--c-fg-dim) 0 3px, transparent 3px 6px)" }} />
                click to open
                <span aria-hidden="true" className="my-1 w-[3px] self-stretch" style={{ background: "repeating-linear-gradient(180deg, var(--c-fg-dim) 0 3px, transparent 3px 6px)" }} />
              </button>
            ))}
            {c.firstClipHint ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-meta text-fg-dim">
                <span className="rounded-chip bg-bg-overlay-80 px-2.5 py-1">{FIRST_CLIP_HINT}</span>
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
