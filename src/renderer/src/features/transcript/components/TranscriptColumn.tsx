/**
 * File: TranscriptColumn.tsx
 * Path: src/renderer/src/features/transcript/components/TranscriptColumn.tsx
 * Description: Left column (FIND). Windowed transcript: the whole transcript is searchable in
 *   memory, only ~40 lines are drawn. Click a line to seek, drag across lines to set a range
 *   snapped to whole caption lines, used ranges render hatched with a "used" tag.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { formatTimestamp, parseTimestamp } from "../../../shared/utils/clip";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import {
  WINDOW_SIZE,
  isLineUsed,
  lineOverlaps,
  snapRangeByIndex,
  type TimeRange,
} from "../utils/transcript";
import { useTranscriptWindowState } from "../hooks/useTranscriptWindowState";

import { IconChevronDown, IconChevronUp, IconSearch } from "../../../shared/components/PanelIcons";
import TranscriptCopyMenu from "./TranscriptCopyMenu";
export type TranscriptColumnProps = {
  className?: string;
  /** Playhead seconds. Defaults to the last seek the transcript asked for. */
  playhead?: number;
  /** Already-published ranges for this video. Defaults to the active campaign's. */
  usedRanges?: readonly TimeRange[];
  /** Seek the player. Defaults to the clipper's requestSeek. */
  onSeek?: (seconds: number) => void;
  /** Set the in/out range (seconds, already snapped to line edges). Defaults to the clipper's in/out. */
  onRangeChange?: (start: number, end: number) => void;
};

const NO_RANGES: readonly TimeRange[] = [];

const fmt = (n: number) => n.toLocaleString("en-US");

/** Wrap occurrences of `q` inside one line in <mark>. Cross-line hits are marked by the row ring. */
function highlight(text: string, q: string): ReactNode {
  const needle = q.trim().toLowerCase();
  if (!needle) return text;
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return text; // case-mapping changed length; skip rather than misplace
  const out: ReactNode[] = [];
  let at = 0;
  for (;;) {
    const hit = lower.indexOf(needle, at);
    if (hit < 0) break;
    if (hit > at) out.push(text.slice(at, hit));
    out.push(
      <mark key={hit} className="rounded-chip bg-ice-tint-30 text-fg">
        {text.slice(hit, hit + needle.length)}
      </mark>,
    );
    at = hit + needle.length;
  }
  if (out.length === 0) return text;
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * The match the search is on, or null. `active` is reset in an effect, so for one render
 * after the result set shrinks (typing one more character, clearing the box, Escape) it can
 * point past the end of `matches`. Reading `.line` off that undefined threw, and with no
 * error boundary React unmounted the whole app (B-1).
 */
export function pickActiveMatch<T>(matches: readonly T[], active: number): T | null {
  return active >= 0 && active < matches.length ? matches[active] : null;
}

function isInMarkedRange(line: Parameters<typeof lineOverlaps>[0], ranges: readonly TimeRange[]): boolean {
  return ranges.some((r) => lineOverlaps(line, r));
}

export default function TranscriptColumn({
  className,
  playhead,
  usedRanges,
  onSeek,
  onRangeChange,
}: TranscriptColumnProps) {
  const clipper = useClipperContext();
  const { active: campaign } = useCampaign();
  const { info, videoId, transcript, loadingTranscript, ensureTranscript, seekRequest } = clipper;

  // Load lazily the first time a video is present.
  useEffect(() => {
    if (info) ensureTranscript();
  }, [info, ensureTranscript]);

  const head = playhead ?? seekRequest?.time ?? 0;
  const seek = onSeek ?? clipper.requestSeek;
  const setRange = useMemo(
    () =>
      onRangeChange ??
      ((s: number, e: number) => {
        // Floor the in, ceil the out: whole-second text must still cover the whole caption lines.
        clipper.setStartText(formatTimestamp(Math.floor(s)));
        clipper.setEndText(formatTimestamp(Math.ceil(e)));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onRangeChange, clipper.setStartText, clipper.setEndText],
  );
  const campaignRanges = videoId ? campaign?.usedRanges[videoId] : undefined;
  const used: readonly TimeRange[] = usedRanges ?? campaignRanges ?? NO_RANGES;

  const { segments: markedSegments } = useSegmentsState();
  const inSec = parseTimestamp(clipper.startText);
  const outSec = parseTimestamp(clipper.endText);
  const marked = useMemo<readonly TimeRange[]>(() => {
    const out: TimeRange[] = markedSegments.map((s) => ({ start: s.start, end: s.end }));
    if (inSec != null && outSec != null && outSec > inSec) out.push({ start: inSec, end: outSec });
    return out;
  }, [markedSegments, inSec, outSec]);

  const w = useTranscriptWindowState({ lines: transcript, playhead: head });

  // ---- scrolling -------------------------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rowEl = (line: number) =>
    scrollRef.current?.querySelector<HTMLElement>(`[data-line="${line}"]`) ?? null;

  // Keep the viewport still when lines are added above, or trimmed from the top.
  const anchor = useRef<{ line: number; delta: number } | null>(null);
  const withAnchor = useCallback((fn: () => void) => {
    const sc = scrollRef.current;
    if (sc) {
      const rows = sc.querySelectorAll<HTMLElement>("[data-line]");
      for (const el of rows) {
        if (el.offsetTop + el.offsetHeight > sc.scrollTop) {
          anchor.current = { line: Number(el.dataset.line), delta: el.offsetTop - sc.scrollTop };
          break;
        }
      }
    }
    fn();
  }, []);
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    const sc = scrollRef.current;
    if (!a || !sc) return;
    const el = sc.querySelector<HTMLElement>(`[data-line="${a.line}"]`);
    if (el) sc.scrollTop = el.offsetTop - a.delta;
  }, [w.win.from, w.win.to]);

  const loadEarlier = useCallback(() => withAnchor(w.loadEarlier), [withAnchor, w.loadEarlier]);
  const loadLater = useCallback(() => withAnchor(w.loadLater), [withAnchor, w.loadLater]);

  // Bottom sentinel draws the next lines when it scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadLaterRef = useRef(loadLater);
  loadLaterRef.current = loadLater;
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root || !w.hasLater || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadLaterRef.current();
      },
      { root, rootMargin: "0px 0px 80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [w.hasLater, w.win.to]);

  // Jump to a search match: centre it.
  useEffect(() => {
    if (!w.focus) return;
    rowEl(w.focus.line)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.focus?.nonce]);

  // Follow the playhead.
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (!follow || w.playheadIndex < 0) return;
    rowEl(w.playheadIndex)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, w.playheadIndex]);

  // Cmd/Ctrl+F focuses the search box.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- click to seek, drag to set a range -------------------------------------------------
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragRef = useRef<{ a: number; b: number } | null>(null);
  const lastAnchor = useRef<number | null>(null);
  const dragging = drag !== null;

  const finish = useCallback(
    (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !commit) return;
      if (d.a === d.b) {
        const line = w.all[d.a];
        if (line) {
          lastAnchor.current = d.a;
          setFollow(true);
          seek(line.start);
        }
        return;
      }
      const r = snapRangeByIndex(w.all, d.a, d.b);
      if (r) {
        lastAnchor.current = Math.min(d.a, d.b);
        setRange(r.start, r.end);
      }
    },
    [w.all, seek, setRange],
  );

  useEffect(() => {
    if (!dragging) return;
    const up = () => finish(true);
    const cancel = () => finish(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, finish]);

  const onRowPointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0) return;
    // Touch pointers are implicitly captured to the first element; release so enter fires on rows.
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    const a = e.shiftKey && lastAnchor.current != null ? lastAnchor.current : i;
    dragRef.current = { a, b: i };
    setDrag({ a, b: i });
  };
  const onRowPointerEnter = (i: number) => {
    const d = dragRef.current;
    if (!d || d.b === i) return;
    dragRef.current = { a: d.a, b: i };
    setDrag({ a: d.a, b: i });
  };
  // Keyboard: Enter/Space seeks; Shift+Enter/Space extends a range from the last line chosen.
  const onRowClick = (e: MouseEvent<HTMLButtonElement>, i: number) => {
    if (e.detail !== 0) return; // pointer clicks are handled by the drag path
    const line = w.all[i];
    if (!line) return;
    if (e.shiftKey && lastAnchor.current != null) {
      const r = snapRangeByIndex(w.all, lastAnchor.current, i);
      if (r) setRange(r.start, r.end);
      return;
    }
    lastAnchor.current = i;
    setFollow(true);
    seek(line.start);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) w.prevMatch();
      else w.nextMatch();
    } else if (e.key === "Escape" && w.query) {
      e.preventDefault();
      w.setQuery("");
    }
  };

  // ---- derived view state ----------------------------------------------------------------
  const selected = drag ? snapRangeByIndex(w.all, drag.a, drag.b) : null;
  const activeMatch = pickActiveMatch(w.matches, w.active);
  const matchLines = useMemo(() => {
    const s = new Set<number>();
    for (const m of w.matches) if (m.line >= w.win.from && m.line < w.win.to) s.add(m.line);
    return s;
  }, [w.matches, w.win.from, w.win.to]);

  const hasTranscript = w.total > 0;
  const noMatches = w.query.trim() !== "" && w.matches.length === 0;

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className ?? ""}`}>
      <div className="mx-[10px] mb-[6px] mt-[10px] flex flex-none items-center gap-1">
        <label
          htmlFor="ui-transcript-search"
          className="flex h-target min-w-0 flex-1 items-center gap-2 rounded-[22px] bg-raised px-[14px] text-fg-dim"
        >
          <span className="sr-only">Search the transcript</span>
          <IconSearch />
          <input
            id="ui-transcript-search"
            ref={searchRef}
            type="text"
            value={w.query}
            onChange={(e) => w.setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            disabled={!hasTranscript}
            placeholder="Search, or click a line"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-dim disabled:text-disabled disabled:placeholder:text-disabled"
          />
          {w.counter && (
            <span className="flex-none text-meta text-fg-dim" aria-live="polite" aria-label={`Match ${w.counter}`}>
              {w.counter}
            </span>
          )}
          {w.matches.length > 0 && (
            <>
              <button type="button" className="flex-none text-fg-dim hover:text-fg" aria-label="Previous match" title="Previous match (Shift+Enter)" onClick={w.prevMatch}>
                <IconChevronUp />
              </button>
              <button type="button" className="flex-none text-fg-dim hover:text-fg" aria-label="Next match" title="Next match (Enter)" onClick={w.nextMatch}>
                <IconChevronDown />
              </button>
            </>
          )}
        </label>
        <TranscriptCopyMenu lines={w.all} />
      </div>

      <div
        id="ui-transcript-lines"
        ref={scrollRef}
        tabIndex={0}
        aria-label="Transcript lines"
        onWheel={() => setFollow(false)}
        className="relative min-h-0 flex-1 overflow-y-auto outline-none"
      >
        {loadingTranscript ? (
          <p className="m-0 px-[14px] py-2 text-meta text-fg-dim">Loading transcript…</p>
        ) : !hasTranscript ? (
          <p className="m-0 px-[14px] py-2 text-meta text-fg-dim">
            {transcript && transcript.length === 0
              ? "No transcript available for this video."
              : info
                ? "No transcript loaded."
                : "Load a video to see its transcript."}
          </p>
        ) : (
          <>
            {w.hasEarlier && (
              <button type="button" className="mx-[10px] mb-1 h-8 w-[calc(100%-20px)] text-meta text-fg-dim hover:text-fg" onClick={loadEarlier}>
                Earlier in the video
              </button>
            )}

            {noMatches && (
              <p className="m-0 px-[14px] pb-2 text-meta text-fg-dim">
                No lines match “{w.query.trim()}” anywhere in the transcript.
              </p>
            )}

            <ul className="m-0 list-none p-0">
              {w.visible.map((line, k) => {
                const i = w.win.from + k;
                const isUsed = isLineUsed(line, used);
                const isCurrent = i === w.playheadIndex;
                const inDrag = selected !== null && i >= selected.first && i <= selected.last;
                const isActiveMatch =
                  activeMatch !== null && i >= activeMatch.line && i <= activeMatch.endLine;
                const inRange = inDrag || (!isUsed && isInMarkedRange(line, marked));
                return (
                  <li key={i} className="m-0 p-0">
                    <button
                      type="button"
                      data-line={i}
                      aria-current={isCurrent ? "true" : undefined}
                      onPointerDown={(e) => onRowPointerDown(e, i)}
                      onPointerEnter={() => onRowPointerEnter(i)}
                      onClick={(e) => onRowClick(e, i)}
                      className={
                        "mx-[10px] my-[3px] flex min-h-target w-[calc(100%-20px)] select-none items-baseline gap-2 rounded-control px-[10px] py-2 text-left text-body text-fg " +
                        (inRange ? "bg-ice-tint-10" : "bg-raised") +
                        (isCurrent ? " shadow-[inset_2px_0_0_var(--frost)]" : "") +
                        (isActiveMatch ? " ring-1 ring-inset ring-ice" : "")
                      }
                    >
                      <span className="flex-none text-meta tabular-nums text-fg-dim">
                        {formatTimestamp(line.start)}
                      </span>
                      <span className={"min-w-0 flex-1 " + (isUsed ? "text-fg-dim" : "")}>
                        {matchLines.has(i) ? highlight(line.text, w.query) : line.text}
                      </span>
                      {isUsed && (
                        <span className="flex-none rounded-chip border border-hairlineStrong px-1.5 text-meta text-fg-dim">
                          used
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {w.hasLater ? (
              <div ref={sentinelRef} className="mt-2">
                <button type="button" className="mx-[10px] h-8 w-[calc(100%-20px)] text-meta text-fg-dim hover:text-fg" onClick={loadLater}>
                  Later in the video
                </button>
              </div>
            ) : (
              <p className="m-0 px-[14px] py-2 text-meta text-fg-dim">
                End of the transcript. Auto-generated by YouTube, may contain errors.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
