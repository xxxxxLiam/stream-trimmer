/**
 * File: ClipsLane.tsx
 * Path: src/renderer/src/features/player/components/ClipsLane.tsx
 * Description: The Clips lane (the lane keeps this name): made clips bright with a Frost edge and
 *   their name, moments waiting as quiet outlines, and the clip being built. A joined clip is one
 *   connected bar: solid section buttons, the name in the first, the total in the last, and a
 *   dashed "skipped" stretch between. Names sit exactly as wide as their range, with an ellipsis
 *   and a tooltip.
 */
import { playFrom } from "../../../shared/utils/playFrom";
import type { TimelineController } from "../hooks/useTimelineController";
import { lengthLabel } from "../hooks/useTimelineController";
import { toX } from "../utils/timelineAxis";
import { clockTime } from "../utils/transport";
import LaneLabel from "./LaneLabel";

const BAR = "absolute top-[5px] h-6 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-meta leading-[22px]";

/** No suggested name yet (the engine's suggestion isn't offered to the renderer): a time-based one. */
export function timeName(start: number): string {
  return `Clip ${clockTime(start)}`;
}

export function skippedLabel(seconds: number): string {
  const s = Math.round(seconds);
  return `skipped ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ClipsLane({ c }: { c: TimelineController }) {
  const span = (start: number, end: number) => {
    const x = toX(c.axis, start);
    return { left: x, width: Math.max(6, toX(c.axis, end) - x) };
  };
  const sections = c.sections;
  return (
    <div className="flex h-[34px] items-center">
      <LaneLabel>Clips</LaneLabel>
      <div className="relative h-full flex-1">
        {c.opening
          ? null
          : (
            <>
              {c.used.map((u, i) =>
                u.end > u.start ? (
                  <button
                    key={`used-${i}-${u.start}`}
                    type="button"
                    title={u.label ?? u.clipId ?? timeName(u.start)}
                    onClick={() => playFrom(u.start)}
                    className={`${BAR} rounded-chip border border-frost text-center font-medium text-fg`}
                    style={span(u.start, u.end)}
                  >
                    {u.label ?? u.clipId ?? timeName(u.start)}
                  </button>
                ) : null,
              )}
              {c.waiting.map((b, i) =>
                b.end > b.start ? (
                  <button
                    key={`wait-${i}-${b.start}`}
                    type="button"
                    title={b.label ?? timeName(b.start)}
                    onClick={() => playFrom(b.start)}
                    className={`${BAR} rounded-chip border border-hairline-strong text-center text-fg-dim`}
                    style={span(b.start, b.end)}
                  >
                    {b.label ?? timeName(b.start)}
                  </button>
                ) : null,
              )}
              {sections.length === 1 ? (
                <span
                  className={`${BAR} rounded-chip border border-frost text-center font-medium text-fg`}
                  style={span(sections[0].start, sections[0].end)}
                  title={timeName(sections[0].start)}
                >
                  {timeName(sections[0].start)}
                </span>
              ) : null}
              {sections.length > 1
                ? sections.map((s, i) => {
                    const first = i === 0;
                    const last = i === sections.length - 1;
                    const prev = sections[i - 1];
                    return (
                      <span key={`${s.start}-${s.end}`}>
                        {prev ? (
                          <span
                            className={`${BAR} border-y border-dashed border-frost text-center text-fg-dim`}
                            style={{ left: toX(c.axis, prev.end), width: Math.max(0, toX(c.axis, s.start) - toX(c.axis, prev.end)) }}
                          >
                            {skippedLabel(s.start - prev.end)}
                          </span>
                        ) : null}
                        <span
                          className={`${BAR} border border-frost ${first ? "rounded-l-chip font-medium text-fg" : ""} ${last ? "rounded-r-chip text-fg-dim" : ""}`}
                          style={span(s.start, s.end)}
                          title={first ? timeName(s.start) : undefined}
                        >
                          {first ? timeName(s.start) : last ? `${lengthLabel(c.total)} total` : ""}
                        </span>
                      </span>
                    );
                  })
                : null}
            </>
          )}
      </div>
    </div>
  );
}
