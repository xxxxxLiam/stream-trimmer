/**
 * File: Timeline.tsx
 * Path: src/components/Timeline.tsx
 * Description: Centre column, under the video. The scrub track: each segment of the clip
 *   being built as a numbered accent block, already-published ranges as grey hatch, banked
 *   ranges as hollow outlines, the pending in/out mark, and the playhead. Every position
 *   is a percentage of the video duration so the track stays fluid at any width.
 */
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useClipperContext } from "../context/ClipperContext";
import { useCampaign } from "../context/CampaignContext";
import { useSegments } from "../hooks/useSegments";
import {
  checkRange,
  formatTimecode,
  type NamedRange,
  type Range,
  type Segment,
} from "../lib/segments";

export type TimelineProps = {
  className?: string;
  /** Overrides, mainly for tests and previews. Defaults come from the contexts. */
  duration?: number;
  segments?: readonly Segment[];
  used?: readonly NamedRange[];
  banked?: readonly NamedRange[];
  playhead?: number;
  onSeek?: (seconds: number) => void;
};

const HATCH = "repeating-linear-gradient(45deg, #3A3A3D 0 3px, #252527 3px 6px)";

function pct(value: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(100, Math.max(0, (value / duration) * 100));
}

function spanStyle(r: Range, duration: number): CSSProperties {
  const left = pct(r.start, duration);
  const right = pct(r.end, duration);
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` };
}

export default function Timeline({
  className,
  duration: durationProp,
  segments: segmentsProp,
  used: usedProp,
  banked: bankedProp,
  playhead: playheadProp,
  onSeek,
}: TimelineProps) {
  const clipper = useClipperContext();
  const { active } = useCampaign();
  const store = useSegments();
  const trackRef = useRef<HTMLDivElement>(null);

  const duration = durationProp ?? clipper.duration;
  const segments = segmentsProp ?? store.segments;
  const videoId = clipper.videoId;
  const used: readonly NamedRange[] =
    usedProp ?? (videoId && active ? (active.usedRanges[videoId] ?? []) : []);
  const banked = bankedProp ?? store.banked;
  const playhead = playheadProp ?? store.playhead;
  const seek = onSeek ?? clipper.requestSeek;
  const enabled = duration > 0;

  // The pending mark is only drawn once the user has typed or set one.
  const marked = clipper.startText.trim() !== "" || clipper.endText.trim() !== "";
  const pending: Range = { start: clipper.start, end: clipper.end };
  const showPending = enabled && marked && checkRange(pending, duration).ok;

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !enabled) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(Math.round(f * duration));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled) return;
    let next: number | null = null;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = duration;
    else if (e.key === "PageUp") next = playhead - 30;
    else if (e.key === "PageDown") next = playhead + 30;
    if (next === null) return;
    e.preventDefault();
    seek(Math.min(duration, Math.max(0, next)));
  };

  const hasUsed = used.some((u) => checkRange(u).ok);
  const hasBanked = banked.some((b) => checkRange(b).ok);

  return (
    <div id="ui-timeline" className={`surface-panel flex flex-col gap-2 p-4 ${className ?? ""}`}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={enabled ? 0 : -1}
        aria-label="Video timeline"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(Math.min(playhead, duration || playhead))}
        aria-valuetext={formatTimecode(playhead)}
        aria-disabled={!enabled}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromPointer(e);
        }}
        className="relative h-row w-full touch-none select-none overflow-hidden rounded-chip border border-hairline"
        style={{
          background: "var(--c-raised)",
          cursor: enabled ? "pointer" : "default",
        }}
      >
        {enabled &&
          used.map((u, i) =>
            checkRange(u).ok ? (
              <div
                key={`used-${i}-${u.start}-${u.end}`}
                className="pointer-events-none absolute inset-y-0"
                style={{ ...spanStyle(u, duration), backgroundImage: HATCH, minWidth: 2 }}
                title={`Already used${u.clipId ? ` by ${u.clipId}` : ""}: ${formatTimecode(u.start)} to ${formatTimecode(u.end)}`}
              />
            ) : null,
          )}

        {enabled &&
          banked.map((b, i) =>
            checkRange(b).ok ? (
              <div
                key={`bank-${i}-${b.start}-${b.end}`}
                className="pointer-events-none absolute inset-y-0 rounded-chip"
                style={{
                  ...spanStyle(b, duration),
                  minWidth: 3,
                  boxShadow: "inset 0 0 0 1.5px var(--c-fg-dim)",
                }}
                title={`Banked${b.label ? `: ${b.label}` : ""} ${formatTimecode(b.start)} to ${formatTimecode(b.end)}`}
              />
            ) : null,
          )}

        {showPending && (
          <div
            className="pointer-events-none absolute inset-y-0 border-x"
            style={{
              ...spanStyle(pending, duration),
              minWidth: 2,
              background: "var(--accent-18)",
              borderColor: "var(--accent)",
            }}
            title={`Marked ${formatTimecode(pending.start)} to ${formatTimecode(pending.end)}`}
          />
        )}

        {enabled &&
          segments.map((s, i) =>
            checkRange(s).ok ? (
              <div
                key={`seg-${i}-${s.start}-${s.end}`}
                role="img"
                aria-label={`Segment ${i + 1}, ${formatTimecode(s.start)} to ${formatTimecode(s.end)}`}
                title={`Segment ${i + 1}: ${formatTimecode(s.start)} to ${formatTimecode(s.end)}`}
                className="pointer-events-none absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-chip bg-range-fill text-meta font-medium text-accent-on"
                style={{ ...spanStyle(s, duration), minWidth: 4 }}
              >
                <span className="font-mono">{i + 1}</span>
              </div>
            ) : null,
          )}

        {enabled && (
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
            style={{ left: `${pct(playhead, duration)}%`, background: "var(--c-fg)" }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-meta text-fg-dim">
        <span className="font-mono">{formatTimecode(0)}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {segments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded-chip bg-range-fill" aria-hidden="true" />
              This clip
            </span>
          )}
          {hasUsed && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded-chip"
                style={{ backgroundImage: HATCH }}
                aria-hidden="true"
              />
              Used
            </span>
          )}
          {hasBanked && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded-chip"
                style={{ boxShadow: "inset 0 0 0 1.5px var(--c-fg-dim)" }}
                aria-hidden="true"
              />
              Banked
            </span>
          )}
        </span>
        <span className="font-mono">{formatTimecode(duration)}</span>
      </div>
    </div>
  );
}
