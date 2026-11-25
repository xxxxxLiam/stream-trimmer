/**
 * File: SourceLane.tsx
 * Path: src/renderer/src/features/player/components/SourceLane.tsx
 * Description: The Source lane: the filmstrip with unused footage dimmed, the picked range outlined
 *   in Ice with its glow, flags, the Frost playhead, and the fold. The lane is where the tools act:
 *   the pointer moves the playhead (click or drag), the scissors drag a range or click a start then an end, the wheel pans, the flag tool drops flags.
 */
import { useEffect, useRef } from "react";
import type { TimelineController } from "../hooks/useTimelineController";
import { pickHintLead } from "../utils/laneTools";
import { toX } from "../utils/timelineAxis";
import { KeyHint } from "../../../shared/components/Tooltip";
import Filmstrip from "./Filmstrip";
import LaneLabel from "./LaneLabel";

const CURSORS = { pointer: "cursor-pointer", clip: "cursor-crosshair", flag: "cursor-cell", hand: "cursor-grab", zoom: "cursor-zoom-in" } as const;

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
  const laneRef = useRef<HTMLDivElement>(null);
  const onWheel = c.onLaneWheel;
  // A native listener: React's wheel handler is passive and cannot stop the page from scrolling.
  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (onWheel(e, el.getBoundingClientRect().left)) e.preventDefault();
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  });
  return (
    <div className="flex h-[44px] items-center">
      <LaneLabel>Source</LaneLabel>
      <div
        className={`relative h-full flex-1 touch-none select-none ${CURSORS[c.tool]}`}
        data-lane="source"
        ref={laneRef}
        onPointerDown={c.onLanePointerDown}
        onPointerMove={c.onLanePointerMove}
        onPointerUp={c.onLanePointerUp}
      >
        {c.opening ? null : (
          <>
            {c.firstClipHint ? null : <Filmstrip axis={c.axis} levels={c.storyboards} height={32} />}
            {dim.map((d) => {
              const x = toX(c.axis, d.start);
              return (
                <span
                  key={`${d.start}-${d.end}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute bg-bg-overlay-50"
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
                className="pointer-events-none absolute top-[4px] h-[10px] w-[2px] bg-fg-dim"
                style={{ left: toX(c.axis, f) }}
              />
            ))}
            {c.duration > 0 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-[4px] -top-[4px] border-l border-dashed border-frost"
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
                className="absolute inset-y-[0px] flex items-center justify-between border-x border-hairlineStrong px-[8px] text-meta text-fg-dim"
                style={{ left: f.x, width: f.width }}
              >
                <span aria-hidden="true" className="my-[4px] w-[3px] self-stretch" style={{ background: "repeating-linear-gradient(180deg, var(--c-fg-dim) 0 3px, transparent 3px 6px)" }} />
                click to open
                <span aria-hidden="true" className="my-[4px] w-[3px] self-stretch" style={{ background: "repeating-linear-gradient(180deg, var(--c-fg-dim) 0 3px, transparent 3px 6px)" }} />
              </button>
            ))}
            {c.firstClipHint ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-fg-dim">
                <span>
                  {pickHintLead(c.tool)}, or press <KeyHint>I</KeyHint> and <KeyHint>O</KeyHint>, to pick the part you want. Then Clip.
                </span>
              </span>
            ) : null}
            {c.startPicked && c.duration > 0 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute w-[3px] bg-ice"
                style={{ left: toX(c.axis, c.start) - 1, top: 2, bottom: 2 }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
