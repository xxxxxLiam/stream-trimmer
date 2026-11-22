/**
 * File: MarkBar.tsx
 * Path: src/components/MarkBar.tsx
 * Description: Centre column, under the Timeline. In/out fields, Add segment, the segment
 *   list, the stitched total with the campaign band, the overlap warning and the one
 *   primary action, Cut as one file. See BUILD-SPEC sections 4, 5 and 12.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClipperContext } from "../context/ClipperContext";
import { useCampaign } from "../context/CampaignContext";
import { useIsTabActive } from "../context/WorkspaceContext";
import { useSegments } from "../hooks/useSegments";
import SegmentList from "./SegmentList";
import {
  bandStatus,
  checkRange,
  describeProblem,
  findSegmentOverlaps,
  formatLength,
  formatRange,
  formatTimecode,
  parseTimecode,
  totalDuration,
  type Band,
  type NamedRange,
  type Segment,
} from "../lib/segments";

export type MarkBarProps = {
  className?: string;
  /**
   * Cuts the clip. Receives the segments in join order. When omitted, Cut runs the
   * existing single-range download, and only while the clip has no segments yet.
   * TODO(Phase C): wire to the multi-segment cut route (B1).
   */
  onCut?: (segments: Segment[]) => void;
  /** Overrides the used ranges for this video (defaults to the active campaign's). */
  used?: readonly NamedRange[];
  /** "Show what used it": defaults to seeking the player. */
  onShowUsed?: (range: NamedRange) => void;
};

function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd font-mono">{children}</span>;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
}

/** The target band drawn as a small scale, with the marker where the total sits. */
function BandScale({ total, band }: { total: number; band: Band }) {
  const scaleMax = Math.max(band.hardMaxSec, total) * 1.1 || 1;
  const p = (v: number) => `${Math.min(100, Math.max(0, (v / scaleMax) * 100))}%`;
  return (
    <div
      className="relative h-2 w-full rounded-chip"
      style={{ background: "var(--c-raised)", boxShadow: "inset 0 0 0 1px var(--c-hairline)" }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-y-0"
        style={{
          left: p(band.targetMinSec),
          width: `calc(${p(band.targetMaxSec)} - ${p(band.targetMinSec)})`,
          background: "var(--c-hairline-strong)",
        }}
      />
      <div
        className="absolute -inset-y-0.5 w-px"
        style={{ left: p(band.hardMaxSec), background: "var(--c-fg-dim)" }}
      />
      {total > 0 && (
        <div
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-chip"
          style={{ left: p(total), background: "var(--c-fg)" }}
        />
      )}
    </div>
  );
}

function bandReadout(total: number, band: Band | null): { text: string; out: boolean } {
  const r = bandStatus(total, band);
  switch (r.status) {
    case "none":
      return { text: "No campaign band to check against", out: false };
    case "empty":
      return { text: "Nothing marked yet", out: false };
    case "in":
      return { text: "In band", out: false };
    case "under":
      return { text: `Out of band, ${formatLength(r.deltaSec)} short`, out: true };
    case "over":
      return { text: `Out of band, ${formatLength(r.deltaSec)} long`, out: true };
    case "over-hard":
      return { text: `Over the hard cap by ${formatLength(r.deltaSec)}`, out: true };
  }
}

export default function MarkBar({ className, onCut, used: usedProp, onShowUsed }: MarkBarProps) {
  const clipper = useClipperContext();
  const { active } = useCampaign();
  const tabActive = useIsTabActive();
  const store = useSegments();
  const {
    info,
    videoId,
    duration,
    startText,
    setStartText,
    endText,
    setEndText,
    start,
    end,
    transcript,
    requestSeek,
    downloading,
    validationError,
    download,
  } = clipper;

  // Segments belong to one video; a new video starts a clean clip.
  useEffect(() => {
    store.syncVideo(videoId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const [problem, setProblem] = useState("");
  // The range as it was just before Clear, so Cmd+Z can bring it back.
  const [cleared, setCleared] = useState<{ start: string; end: string } | null>(null);
  const [ackKey, setAckKey] = useState("");

  const marked = startText.trim() !== "" || endText.trim() !== "";
  const pendingRange = { start, end };
  const pendingCheck = checkRange(pendingRange, duration || undefined);
  const canAdd = !!info && marked && pendingCheck.ok && !downloading;

  const segments = store.segments;
  const hasSegments = segments.length > 0;
  // One segment (or just a mark) behaves exactly as before, with no join step.
  const stitched = hasSegments
    ? totalDuration(segments)
    : marked && pendingCheck.ok
      ? end - start
      : 0;
  const band: Band | null = active
    ? {
        targetMinSec: active.targetMinSec,
        targetMaxSec: active.targetMaxSec,
        hardMaxSec: active.hardMaxSec,
      }
    : null;
  const readout = bandReadout(stitched, band);

  // Overlap with ranges already used. Checks the clip's segments, or the pending mark
  // when nothing has been added yet.
  const used: readonly NamedRange[] =
    usedProp ?? (videoId && active ? (active.usedRanges[videoId] ?? []) : []);
  const toCheck: Segment[] = hasSegments
    ? segments
    : marked && pendingCheck.ok
      ? [pendingRange]
      : [];
  const overlaps = useMemo(() => findSegmentOverlaps(toCheck, used), [toCheck, used]);
  const usedIndexes = useMemo(
    () => (hasSegments ? new Set(overlaps.map((o) => o.index)) : new Set<number>()),
    [hasSegments, overlaps],
  );
  const overlapKey = overlaps
    .map((o) =>
      o.overlaps.map((h) => `${toCheck[o.index].start}-${toCheck[o.index].end}@${h.used.start}-${h.used.end}`).join(","),
    )
    .join("|");
  const overlapBlocking = overlaps.length > 0 && ackKey !== overlapKey;
  const firstHit = overlaps[0]?.overlaps[0];

  const cutSegments: Segment[] = hasSegments
    ? segments
    : marked && pendingCheck.ok
      ? [pendingRange]
      : [];
  const cutHandler = onCut ?? (!hasSegments ? () => void download() : undefined);
  const cutDisabled =
    !info ||
    downloading ||
    overlapBlocking ||
    !cutHandler ||
    (hasSegments ? false : Boolean(validationError));

  const addSegment = () => {
    if (!canAdd) return;
    const r = store.add(pendingRange, { duration: duration || undefined });
    if (!r.ok) {
      setProblem(describeProblem(r.reason));
      return;
    }
    setProblem("");
    setCleared(null);
    setStartText("");
    setEndText("");
  };

  const clearRange = () => {
    if (!marked) return;
    setCleared({ start: startText, end: endText });
    setStartText("");
    setEndText("");
    setProblem("");
  };

  const restoreRange = () => {
    if (!cleared) return;
    setStartText(cleared.start);
    setEndText(cleared.end);
    setCleared(null);
  };

  const cut = () => {
    if (cutDisabled || !cutHandler) return;
    cutHandler(cutSegments);
  };

  const showUsed = () => {
    if (!firstHit) return;
    if (onShowUsed) onShowUsed(firstHit.used);
    else requestSeek(firstHit.used.start);
  };

  // Keyboard map (section 12). Handlers read the latest closures through a ref so the
  // listener is attached once.
  const actions = useRef({ addSegment, clearRange, restoreRange, cut, hasCut: !!onCut });
  actions.current = { addSegment, clearRange, restoreRange, cut, hasCut: !!onCut };
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const a = actions.current;
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        a.addSegment();
      } else if (e.key === "Enter" && !e.shiftKey) {
        // The interim DownloadBar already owns Cmd+Enter until Phase C passes onCut.
        if (!a.hasCut) return;
        e.preventDefault();
        a.cut();
      } else if (e.key === "Backspace" && !isTyping(e.target)) {
        e.preventDefault();
        a.clearRange();
      } else if ((e.key === "z" || e.key === "Z") && !e.shiftKey && !isTyping(e.target)) {
        e.preventDefault();
        a.restoreRange();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabActive]);

  const startBad = startText.trim() !== "" && parseTimecode(startText) == null;
  const endBad = endText.trim() !== "" && parseTimecode(endText) == null;
  const disabledFields = !info;

  const overlapSummary = overlaps.slice(0, 3).map((o) => {
    const seg = toCheck[o.index];
    const hit = o.overlaps[0];
    const who = hit.used.clipId ? `clip ${hit.used.clipId}` : "a published clip";
    const where = formatRange({ start: hit.start, end: hit.end });
    return hasSegments
      ? `Segment ${o.index + 1} (${formatRange(seg)}) overlaps ${who} at ${where}.`
      : `This range (${formatRange(seg)}) overlaps ${who} at ${where}.`;
  });

  return (
    <div className={`surface-panel flex flex-col gap-3 p-4 ${className ?? ""}`}>
      {/* In / out */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[84px] flex-1 flex-col gap-1">
          <span className="flex items-center gap-1 text-meta text-fg-dim">
            In <Kbd>I</Kbd>
          </span>
          <input
            id="ui-mark-in"
            type="text"
            inputMode="numeric"
            className="field font-mono"
            placeholder="00:00:00"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            disabled={disabledFields}
            aria-invalid={startBad}
          />
        </label>
        <label className="flex min-w-[84px] flex-1 flex-col gap-1">
          <span className="flex items-center gap-1 text-meta text-fg-dim">
            Out <Kbd>O</Kbd>
          </span>
          <input
            id="ui-mark-out"
            type="text"
            inputMode="numeric"
            className="field font-mono"
            placeholder={info ? formatTimecode(duration) : "00:00:00"}
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            disabled={disabledFields}
            aria-invalid={endBad}
          />
        </label>
        <button
          id="ui-mark-whole"
          type="button"
          className="btn"
          onClick={clearRange}
          disabled={!marked}
          title="Clear the range (⌘⌫)"
        >
          Whole video
        </button>
        <button
          id="ui-add-segment"
          type="button"
          className="btn"
          onClick={addSegment}
          disabled={!canAdd}
          aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
        >
          Add segment
          <Kbd>⌘⇧↵</Kbd>
        </button>
      </div>

      {(problem || (marked && !pendingCheck.ok && info)) && (
        <p className="m-0 text-meta text-fg-dim" role="status">
          {problem ||
            (pendingCheck.ok ? "" : describeProblem(pendingCheck.reason))}
        </p>
      )}
      {cleared && (
        <p className="m-0 text-meta text-fg-dim">
          Range cleared.{" "}
          <button type="button" className="link-quiet" onClick={restoreRange}>
            Restore it <Kbd>⌘Z</Kbd>
          </button>
        </p>
      )}

      {/* Overlap warning: accent text on the accent tint, never a filled accent. */}
      {overlaps.length > 0 && (
        <div id="ui-overlap-warning" className="card-alert flex flex-col gap-3 p-3" role="alert">
          <div className="flex flex-col gap-1">
            <span className="text-body font-medium">Already used</span>
            {overlapSummary.map((line) => (
              <span key={line} className="text-meta">
                {line}
              </span>
            ))}
            {overlaps.length > overlapSummary.length && (
              <span className="text-meta">
                and {overlaps.length - overlapSummary.length} more.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={showUsed}>
              Show what used it
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setAckKey(overlapKey)}
              disabled={!overlapBlocking}
            >
              {overlapBlocking ? "Use it anyway" : "Using it anyway"}
            </button>
          </div>
        </div>
      )}

      {/* Stitched total, band, and the one primary action. It sits directly under In / Out
          and Add, in flow, and the segment list comes after it: the list is the part that
          grows, so Cut neither moves when segments are added nor covers anything. (It used
          to be sticky at the bottom of the column, which put it over the controls above it
          at 1100x760 and at every 600-660px window: B2-1, H2-1.) */}
      <div
        id="ui-cut-row"
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-2"
      >
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-meta text-fg-dim">
            {hasSegments
              ? `Stitched total, ${segments.length} ${segments.length === 1 ? "segment" : "segments"}`
              : "Length"}
          </span>
          <output
            id="ui-stitched-total"
            className="t-numeral text-fg"
            aria-live="polite"
            aria-label={`Stitched total ${formatTimecode(stitched)}`}
          >
            {formatTimecode(stitched)}
          </output>
          {band && <BandScale total={stitched} band={band} />}
          <span className="text-meta text-fg-dim">
            {readout.out ? <strong className="font-medium text-accent">{readout.text}</strong> : readout.text}
            {band && (
              <span className="font-mono">
                {" "}
                · target {formatLength(band.targetMinSec)} to {formatLength(band.targetMaxSec)}, cap{" "}
                {formatLength(band.hardMaxSec)}
              </span>
            )}
          </span>
        </div>
        <button
          id="ui-cut"
          type="button"
          className="btn-primary"
          onClick={cut}
          disabled={cutDisabled}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          title={
            overlapBlocking
              ? "Resolve the overlap warning first"
              : !cutHandler
                ? "Multi-segment cut is not wired yet"
                : undefined
          }
        >
          Cut as one file
          <span className="font-mono text-meta">⌘↵</span>
        </button>
      </div>

      {/* Segments */}
      {hasSegments ? (
        <SegmentList
          segments={segments}
          lines={transcript}
          onMove={store.move}
          onRemove={store.remove}
          onSeek={requestSeek}
          usedIndexes={usedIndexes}
        />
      ) : (
        <p className="m-0 text-meta text-fg-dim">
          No segments yet. Mark an in and out, then Add segment. Add as many as you like and they
          join, in order, into one file.
        </p>
      )}
    </div>
  );
}
