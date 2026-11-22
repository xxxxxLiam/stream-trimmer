/**
 * File: SegmentList.tsx
 * Path: src/components/SegmentList.tsx
 * Description: Numbered rows for the segments of the clip being built. Drag a row to
 *   reorder (Alt+Up / Alt+Down from the keyboard), x removes (Delete from the keyboard).
 *   Each row shows its range, its length and the transcript text at its start.
 */
import { useState } from "react";
import { useSegments } from "../hooks/useSegments";
import {
  formatLength,
  formatTimecode,
  lineAtTime,
  rangeLength,
  type Segment,
} from "../lib/segments";

export type SegmentListProps = {
  segments: readonly Segment[];
  /** Whole transcript, used to show the words at each segment's start. */
  lines?: ReadonlyArray<{ start: number; end: number; text: string }> | null;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onSeek?: (seconds: number) => void;
  /** Indexes of segments that run into an already-used range. */
  usedIndexes?: ReadonlySet<number>;
  className?: string;
};

function IconGrip() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 4.5h.01M10 4.5h.01M6 8h.01M10 8h.01M6 11.5h.01M10 11.5h.01" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

export default function SegmentList({
  segments,
  lines,
  onMove,
  onRemove,
  onSeek,
  usedIndexes,
  className,
}: SegmentListProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  // While a cut runs the list is frozen: the cut was launched with a snapshot, so a row
  // removed now would still be in the file (B-7). The store refuses the edit as well.
  const { locked } = useSegments();

  if (segments.length === 0) return null;

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div className={className}>
      {/* The list scrolls inside itself (styles.css .seg-scroll) so a long clip cannot push
          Cut or the fields above it around. Every row is a button, so Tab reaches them all. */}
      <div className="seg-scroll">
      <ol id="ui-segment-list" className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Segments, in the order they are joined">
        {segments.map((seg, i) => {
          const line = lineAtTime(lines, seg.start);
          const used = usedIndexes?.has(i) ?? false;
          const dropAbove = dragOver === i && dragFrom !== null && dragFrom > i;
          const dropBelow = dragOver === i && dragFrom !== null && dragFrom < i;
          return (
            <li
              key={`${i}-${seg.start}-${seg.end}`}
              draggable={!locked}
              onDragStart={(e) => {
                if (locked) {
                  e.preventDefault();
                  return;
                }
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== i) setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!locked && dragFrom !== null && dragFrom !== i) {
                  onMove(dragFrom, i);
                  setAnnounce(`Segment moved to position ${i + 1} of ${segments.length}`);
                }
                endDrag();
              }}
              onDragEnd={endDrag}
              className="surface-raised flex min-h-row items-center gap-2 rounded-control border border-hairline py-2 pl-2 pr-1"
              style={{
                opacity: dragFrom === i ? 0.5 : 1,
                // Inset shadow, not a border: the drop marker must not move anything.
                boxShadow: dropAbove
                  ? "inset 0 2px 0 var(--accent)"
                  : dropBelow
                    ? "inset 0 -2px 0 var(--accent)"
                    : undefined,
              }}
            >
              <span className="shrink-0 cursor-grab text-fg-dim" aria-hidden="true">
                <IconGrip />
              </span>
              <span className="t-timecode inline-flex size-5 shrink-0 items-center justify-center rounded-chip border border-hairline-strong text-fg">
                {i + 1}
              </span>
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-chip border border-transparent px-1 text-left"
                aria-label={`Segment ${i + 1}, ${formatTimecode(seg.start)} to ${formatTimecode(seg.end)}. Jump to it. Alt and the arrow keys reorder, Delete removes.`}
                onClick={() => onSeek?.(seg.start)}
                onKeyDown={(e) => {
                  if (locked && (e.key === "Delete" || e.altKey)) return;
                  if (e.altKey && e.key === "ArrowUp" && i > 0) {
                    e.preventDefault();
                    onMove(i, i - 1);
                    setAnnounce(`Segment moved to position ${i} of ${segments.length}`);
                  } else if (e.altKey && e.key === "ArrowDown" && i < segments.length - 1) {
                    e.preventDefault();
                    onMove(i, i + 1);
                    setAnnounce(`Segment moved to position ${i + 2} of ${segments.length}`);
                  } else if (e.key === "Delete") {
                    e.preventDefault();
                    onRemove(i);
                    setAnnounce(`Segment ${i + 1} removed`);
                  }
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="t-timecode text-fg">
                    {formatTimecode(seg.start)} to {formatTimecode(seg.end)}
                  </span>
                  <span className="t-timecode text-fg-dim">{formatLength(rangeLength(seg))}</span>
                  {used && (
                    <span className="chip" title="This segment overlaps a range already used">
                      used
                    </span>
                  )}
                </span>
                {line && (
                  <span className="truncate w-full text-meta text-fg-dim">{line.text}</span>
                )}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove segment ${i + 1}`}
                disabled={locked}
                title={locked ? "Segments are locked while the cut runs" : undefined}
                onClick={() => {
                  if (locked) return;
                  onRemove(i);
                  setAnnounce(`Segment ${i + 1} removed`);
                }}
              >
                <IconClose />
              </button>
            </li>
          );
        })}
      </ol>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
