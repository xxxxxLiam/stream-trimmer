/**
 * File: SourceLane.tsx
 * Path: src/renderer/src/features/player/components/SourceLane.tsx
 * Description: The Source lane: the filmstrip with unused footage dimmed, the picked range outlined
 *   in Ice with its glow, flags, the Frost playhead, and the fold. The lane is where the tools act:
 *   the pointer moves the playhead (click or drag), the scissors drag a range or click a start then an end, the wheel pans, the flag tool drops flags.
 */
import type { TimelineController } from "../hooks/useTimelineController";
import { pickHintLead } from "../utils/laneTools";
import { clockTime } from "../utils/transport";
import { toX } from "../utils/timelineAxis";
import { KeyHint } from "../../../shared/components/Tooltip";
import Filmstrip from "./Filmstrip";
import LaneLabel from "./LaneLabel";

/** The picture strip's top and bottom inset in the lane: the selection outline sits exactly on it. */
export const STRIP_INSET = 6;

/**
 * The grip on a section's edge: what the Pointer and the Range tool grab to resize it. At rest a slim Ice bar;
 * over it, it widens and turns Frost so it reads as clickable; held down, it narrows and shortens a touch so it
 * reads as pressed.
 */
function Grip({ x, state = "rest" }: { x: number; state?: "rest" | "hover" | "pressed" }) {
  const look =
    state === "pressed" ? "w-[3px] scale-y-90 bg-ice" : state === "hover" ? "w-[6px] bg-frost" : "w-[4px] bg-ice";
  return (
    <span
      aria-hidden="true"
      data-grip
      data-grip-state={state}
      className={`pointer-events-none absolute -translate-x-1/2 rounded-chip transition-[width,transform] duration-100 ${look}`}
      style={{ left: x, top: STRIP_INSET + 6, bottom: STRIP_INSET + 6 }}
    />
  );
}

/** A small pill over the strip that shows the times of a range being moved, live. */
function TimePill({ at, text }: { at: number; text: string }) {
  return (
    <span
      role="status"
      className="pointer-events-none absolute top-[8px] z-10 -translate-x-1/2 whitespace-nowrap rounded-chip bg-overlay-75 px-[8px] text-meta leading-[18px] text-fg"
      style={{ left: at }}
    >
      {text}
    </span>
  );
}

export default function SourceLane({ c, height = 44 }: { c: TimelineController; height?: number }) {
  const gripState = (t: number) => (c.pressedGrip === t ? "pressed" : c.pressedGrip === null && c.hoverGrip === t ? "hover" : "rest");
  const covered = [...c.sections, ...c.used.filter((u) => u.end > u.start)].sort((a, b) => a.start - b.start);
  // Unused footage is dimmed: everything not under a picked range or a made clip.
  const dim: { start: number; end: number }[] = [];
  if (covered.length > 0 && c.duration > 0) {
    let at = Math.max(0, c.axis.pieces[0]?.t0 ?? 0);
    for (const r of covered) {
      if (r.start > at) dim.push({ start: at, end: r.start });
      at = Math.max(at, r.end);
    }
    const end = Math.min(c.duration, c.axis.pieces[c.axis.pieces.length - 1]?.t1 ?? c.duration);
    if (at < end) dim.push({ start: at, end });
  }
  return (
    <div className="flex items-center" style={{ height }}>
      <LaneLabel>Source</LaneLabel>
      <div
        className={`relative h-full flex-1`}
        data-lane="source"
      >
        {c.opening ? null : (
          <>
            {/* The picture strip shows the moment the video opens, ready to scrub; no range is needed first. */}
            <Filmstrip axis={c.axis} levels={c.storyboards} height={height - 12} duration={c.duration} />
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
            {c.sections
              .filter((s) => !(c.mergeHint && s.start >= c.mergeHint.start && s.end <= c.mergeHint.end))
              .map((s) => {
                const x = toX(c.axis, s.start);
                const w = Math.max(4, toX(c.axis, s.end) - x);
                return (
                  <span key={`${s.start}-${s.end}`}>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute rounded-chip border-2 border-ice bg-ice-tint-12 shadow-range"
                      // The outline's outer edge sits exactly on the picture strip's top and bottom lines.
                      style={{ left: x, width: w, top: STRIP_INSET, bottom: STRIP_INSET }}
                    />
                    <Grip x={x} state={gripState(s.start)} />
                    <Grip x={x + w} state={gripState(s.end)} />
                  </span>
                );
              })}
            {c.mergeHint ? (
              <>
                <span
                  aria-hidden="true"
                  data-merge-outline
                  className="pointer-events-none absolute rounded-chip border-2 border-frost bg-ice-tint-12"
                  style={{
                    left: toX(c.axis, c.mergeHint.start),
                    width: Math.max(4, toX(c.axis, c.mergeHint.end) - toX(c.axis, c.mergeHint.start)),
                    top: STRIP_INSET,
                    bottom: STRIP_INSET,
                  }}
                />
                <Grip x={toX(c.axis, c.mergeHint.start)} state={gripState(c.mergeHint.start)} />
                <Grip x={toX(c.axis, c.mergeHint.end)} state={gripState(c.mergeHint.end)} />
                <TimePill
                  at={(toX(c.axis, c.mergeHint.start) + toX(c.axis, c.mergeHint.end)) / 2}
                  text={`Joins when you let go · ${clockTime(c.mergeHint.start)}–${clockTime(c.mergeHint.end)}`}
                />
              </>
            ) : c.moving && c.range ? (
              <TimePill
                at={(toX(c.axis, c.range.start) + toX(c.axis, c.range.end)) / 2}
                text={`${clockTime(c.range.start)}–${clockTime(c.range.end)}`}
              />
            ) : null}
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
                <span className="rounded-chip bg-bg-overlay-50 px-[12px] py-[4px] text-fg">
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
