/**
 * File: ClipsLane.tsx
 * Path: src/renderer/src/features/player/components/ClipsLane.tsx
 * Description: The Clips lane (the lane keeps this name): made clips bright with a Frost edge and
 *   their name, moments waiting as quiet outlines, and the clip being built. A joined clip is one
 *   connected bar: solid section buttons, the name in the first, the total in the last, and a
 *   dashed "skipped" stretch between. Names sit exactly as wide as their range, with an ellipsis
 *   and a tooltip.
 */
import { useEffect } from "react";
import { setNextClipName } from "../../../modules/layout/hooks/useNextClipName";
import { playFrom } from "../../../shared/utils/playFrom";
import type { TimelineController } from "../hooks/useTimelineController";
import { lengthLabel } from "../hooks/useTimelineController";
import { toX } from "../utils/timelineAxis";
import { clockTime } from "../utils/transport";
import LaneLabel from "./LaneLabel";

const BAR = "absolute top-[5px] h-6 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-meta leading-[22px]";

/** No suggested name yet (no suggestion yet): a time-based one. */
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
  // Drawn left to right as they sit in the video; the clip itself plays them in the order locked.
  // A section that is exactly a banked moment carries that moment's name; otherwise the suggestion.
  const building = (start: number) => {
    const banked = c.sections.length === 1 ? c.waiting.find((b) => b.start === c.sections[0].start && b.end === c.sections[0].end) : undefined;
    return banked?.label ?? c.suggestedName ?? timeName(start);
  };
  const sections = [...c.sections].sort((a, b) => a.start - b.start);
  // The bottom bar's audio-language menu lists the files the next Clip makes by this name.
  const nextName = sections.length ? building(sections[0].start) : null;
  useEffect(() => {
    setNextClipName(nextName);
  }, [nextName]);
  useEffect(() => () => setNextClipName(null), []);
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
                    className={`${BAR} rounded-chip border text-center ${
                      c.range && b.start === c.range.start && b.end === c.range.end
                        ? "border-fg text-fg"
                        : "border-hairline-strong text-fg-dim"
                    }`}
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
                  title={building(sections[0].start)}
                >
                  {building(sections[0].start)}
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
                          title={first ? building(s.start) : undefined}
                        >
                          {first ? building(s.start) : last ? `${lengthLabel(c.total)} total` : ""}
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
