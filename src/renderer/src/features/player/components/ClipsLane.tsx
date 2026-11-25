/**
 * File: ClipsLane.tsx
 * Path: src/renderer/src/features/player/components/ClipsLane.tsx
 * Description: The Clips lane (the lane keeps this name): made clips bright with a Frost edge and
 *   their name, moments waiting as quiet outlines, and the clip being built. A joined clip is one
 *   connected bar: solid section buttons, the name in the first, the total in the last, and a
 *   dashed "skipped" stretch between. Names sit exactly as wide as their range, with an ellipsis
 *   and a tooltip.
 */
import { useEffect, useState } from "react";
import { setNextClipName } from "../../../modules/layout/hooks/useNextClipName";
import { playFrom } from "../../../shared/utils/playFrom";
import type { TimelineController } from "../hooks/useTimelineController";
import { lengthLabel } from "../hooks/useTimelineController";
import { placeLabels } from "../utils/laneTools";
import { toX } from "../utils/timelineAxis";
import { clockTime } from "../utils/transport";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import ClipNameField from "./ClipNameField";
import LaneLabel from "./LaneLabel";

const BAR =
  "absolute top-[5px] h-[24px] overflow-hidden text-ellipsis whitespace-nowrap px-[8px] text-meta leading-[22px]";

/** No suggested name yet (no suggestion yet): a time-based one. */
export function timeName(start: number): string {
  return `Clip ${clockTime(start)}`;
}

export function skippedLabel(seconds: number): string {
  const s = Math.round(seconds);
  return `skipped ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ClipsLane({ c }: { c: TimelineController }) {
  const shown = (start: number, end: number) =>
    end > start &&
    c.axis.pieces.some((p) => !p.folded && end >= p.t0 && start <= p.t1);
  const span = (start: number, end: number) => {
    const x = toX(c.axis, start);
    return { left: x, width: Math.max(6, toX(c.axis, end) - x) };
  };
  // Drawn left to right as they sit in the video; the clip itself plays them in the order locked.
  // A section that is exactly a banked moment carries that moment's name; otherwise the suggestion.
  const sections = [...c.sections].sort((a, b) => a.start - b.start);
  // A name typed on the lane belongs to the clip being built (its sections); it is the clip's name, its
  // file's name and its project's name. A different clip starts from its own suggestion again.
  const sectionsKey = sections.map((s) => `${s.start}-${s.end}`).join(",");
  const [typed, setTyped] = useState<{ key: string; name: string } | null>(
    null,
  );
  const building = (start: number) => {
    if (typed && typed.key === sectionsKey) return typed.name;
    const banked =
      c.sections.length === 1
        ? c.waiting.find(
            (b) =>
              b.start === c.sections[0].start && b.end === c.sections[0].end,
          )
        : undefined;
    return banked?.label ?? c.suggestedName ?? timeName(start);
  };
  // The bottom bar's audio-language menu lists the files the next Clip makes by this name, and the cut
  // reads it too. Only the open tab publishes it.
  const tabActive = useIsTabActive();
  const nextName = sections.length ? building(sections[0].start) : null;
  useEffect(() => {
    if (tabActive) setNextClipName(nextName);
  }, [nextName, tabActive]);
  useEffect(() => () => setNextClipName(null), []);
  const rename = (name: string) => setTyped({ key: sectionsKey, name });

  // Names that do not fit their bar continue into the free space after it (cut only when that runs out).
  const isBuilt = (b: { start: number; end: number }) =>
    sections.length === 1 &&
    b.start === sections[0].start &&
    b.end === sections[0].end;
  const named = [
    ...c.used.map((u) => ({
      key: `used-${u.start}-${u.end}`,
      start: u.start,
      end: u.end,
      label: u.label ?? u.clipId ?? timeName(u.start),
    })),
    ...c.waiting
      .filter((b) => !isBuilt(b))
      .map((b) => ({
        key: `wait-${b.start}-${b.end}`,
        start: b.start,
        end: b.end,
        label: b.label ?? timeName(b.start),
      })),
  ].filter((n) => shown(n.start, n.end));
  // The clip being built gets the same free-space naming (an 18 px bar on a long video would show "P").
  if (sections.length === 1 && shown(sections[0].start, sections[0].end)) {
    named.push({ key: "built", start: sections[0].start, end: sections[0].end, label: building(sections[0].start) });
  }
  const others = (sections.length === 1 ? [] : sections).map((x) => ({ ...span(x.start, x.end), label: "" }));
  const bars = [
    ...named.map((n) => ({ ...span(n.start, n.end), label: n.label })),
    ...others,
  ];
  const places = placeLabels(bars, c.width);
  const placeOf = (key: string) => {
    const i = named.findIndex((n) => n.key === key);
    return i < 0 ? { inside: true, outsideWidth: 0 } : places[i];
  };
  const outside = (key: string, start: number, end: number, label: string) => {
    const pl = placeOf(key);
    if (pl.inside) return null;
    const sp = span(start, end);
    return (
      <span
        key={`${key}-label`}
        aria-hidden="true"
        className="pointer-events-none absolute top-[5px] overflow-hidden text-ellipsis whitespace-nowrap text-meta leading-[24px] text-fg-dim"
        style={{ left: sp.left + sp.width + 4, width: pl.outsideWidth }}
      >
        {label}
      </span>
    );
  };
  return (
    <div className="flex h-[34px] items-center">
      <LaneLabel>Clips</LaneLabel>
      <div className="relative h-full flex-1 overflow-x-clip overflow-y-visible">
        {c.opening ? null : (
          <>
            {c.used.map((u, i) =>
              shown(u.start, u.end) ? (
                <span key={`used-${i}-${u.start}`}>
                  <button
                    type="button"
                    title={u.label ?? u.clipId ?? timeName(u.start)}
                    onClick={() => playFrom(u.start)}
                    className={`${BAR} rounded-chip border border-frost text-center font-medium text-fg`}
                    style={span(u.start, u.end)}
                  >
                    {placeOf(`used-${u.start}-${u.end}`).inside
                      ? (u.label ?? u.clipId ?? timeName(u.start))
                      : ""}
                  </button>
                  {outside(
                    `used-${u.start}-${u.end}`,
                    u.start,
                    u.end,
                    u.label ?? u.clipId ?? timeName(u.start),
                  )}
                </span>
              ) : null,
            )}
            {c.waiting.map((b, i) =>
              shown(b.start, b.end) && !isBuilt(b) ? (
                <span key={`wait-${i}-${b.start}`}>
                  <button
                    type="button"
                    title={b.label ?? timeName(b.start)}
                    onClick={() => playFrom(b.start)}
                    className={`${BAR} rounded-chip border text-center ${
                      c.range &&
                      b.start === c.range.start &&
                      b.end === c.range.end
                        ? "border-frost text-fg"
                        : "border-hairlineStrong text-fg-dim"
                    }`}
                    style={span(b.start, b.end)}
                  >
                    {placeOf(`wait-${b.start}-${b.end}`).inside
                      ? (b.label ?? timeName(b.start))
                      : ""}
                  </button>
                  {outside(
                    `wait-${b.start}-${b.end}`,
                    b.start,
                    b.end,
                    b.label ?? timeName(b.start),
                  )}
                </span>
              ) : null,
            )}
            {sections.length === 1 ? (
              <>
                <ClipNameField
                  name={building(sections[0].start)}
                  onRename={rename}
                  className={`${BAR} rounded-chip border border-frost text-center font-medium ${placeOf("built").inside ? "text-fg" : "text-transparent focus:text-fg"}`}
                  style={span(sections[0].start, sections[0].end)}
                />
                {outside("built", sections[0].start, sections[0].end, building(sections[0].start))}
              </>
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
                          style={{
                            left: toX(c.axis, prev.end),
                            width: Math.max(
                              0,
                              toX(c.axis, s.start) - toX(c.axis, prev.end),
                            ),
                          }}
                        >
                          {skippedLabel(s.start - prev.end)}
                        </span>
                      ) : null}
                      {first ? (
                        <ClipNameField
                          name={building(s.start)}
                          onRename={rename}
                          className={`${BAR} rounded-l-chip border border-frost font-medium text-fg`}
                          style={span(s.start, s.end)}
                        />
                      ) : (
                        <span
                          className={`${BAR} border border-frost ${last ? "rounded-r-chip text-fg-dim" : ""}`}
                          style={span(s.start, s.end)}
                        >
                          {last ? `${lengthLabel(c.total)} total` : ""}
                        </span>
                      )}
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
