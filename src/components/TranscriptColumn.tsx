/**
 * File: TranscriptColumn.tsx
 * Path: src/components/TranscriptColumn.tsx
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
  type SVGProps,
} from "react";
import { useCampaign } from "../context/CampaignContext";
import { useClipperContext } from "../context/ClipperContext";
import { formatTimestamp } from "../lib/clip";
import {
  WINDOW_SIZE,
  isLineUsed,
  snapRangeByIndex,
  type TimeRange,
} from "../lib/transcript";
import { useTranscriptWindow } from "../hooks/useTranscriptWindow";

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

/** Spec section 6: grey hatch for used material. */
const HATCH: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(45deg, #3A3A3D 0 3px, #252527 3px 6px)",
};
const NO_RANGES: readonly TimeRange[] = [];

const Icon = (p: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...p}
  />
);
const IconSearch = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2L13.5 13.5" />
  </Icon>
);
const IconUp = () => (
  <Icon>
    <path d="M4 10l4-4 4 4" />
  </Icon>
);
const IconDown = () => (
  <Icon>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);

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
      <mark key={hit} className="rounded-chip bg-accent-soft text-fg">
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

  const w = useTranscriptWindow({ lines: transcript, playhead: head });

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
      <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="text-body font-medium text-fg">Transcript</h2>
        <span className="min-w-0 flex-1 truncate font-mono text-meta text-fg-dim" aria-live="polite">
          {hasTranscript
            ? `${fmt(w.total)} lines · ${fmt(w.drawn)} drawn`
            : loadingTranscript
              ? "loading…"
              : ""}
        </span>
        <button
          type="button"
          className="chip aria-pressed:border-accent"
          aria-pressed={follow}
          onClick={() => setFollow((v) => !v)}
          title="Keep the current line in view while the video plays"
        >
          Follow
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-1 px-4 pb-2">
        <label htmlFor="ui-transcript-search" className="relative min-w-0 flex-1">
          <span className="sr-only">Search the transcript</span>
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-dim">
            <IconSearch />
          </span>
          <input
            id="ui-transcript-search"
            ref={searchRef}
            type="text"
            value={w.query}
            onChange={(e) => w.setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            disabled={!hasTranscript}
            placeholder="Find what was said"
            autoComplete="off"
            spellCheck={false}
            className="surface-raised h-btn w-full rounded-control border border-hairline pl-8 pr-2 text-body text-fg outline-none placeholder:text-fg-dim hover:border-hairlineStrong focus-visible:border-accent disabled:text-disabled disabled:placeholder:text-disabled"
          />
        </label>
        <span
          className="w-12 shrink-0 text-right font-mono text-meta text-fg-dim"
          aria-live="polite"
          aria-label={w.counter ? `Match ${w.counter}` : undefined}
        >
          {w.counter}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={w.matches.length === 0}
          onClick={w.prevMatch}
        >
          <IconUp />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={w.matches.length === 0}
          onClick={w.nextMatch}
        >
          <IconDown />
        </button>
      </div>

      <div
        id="ui-transcript-lines"
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto border-t border-hairline px-2 py-2"
      >
        {loadingTranscript ? (
          <p className="px-2 py-2 text-body text-fg-dim">Loading transcript…</p>
        ) : !hasTranscript ? (
          <p className="px-2 py-2 text-body text-fg-dim">
            {transcript && transcript.length === 0
              ? "No transcript available for this video."
              : info
                ? "No transcript loaded."
                : "Load a video to see its transcript."}
          </p>
        ) : (
          <>
            {w.hasEarlier ? (
              <button type="button" className="btn mb-2 w-full" onClick={loadEarlier}>
                Earlier in the video
              </button>
            ) : (
              <p className="px-2 pb-2 text-meta text-fg-dim">Start of the transcript</p>
            )}

            {noMatches && (
              <p className="px-2 pb-2 text-meta text-fg-dim">
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
                const surface = inDrag
                  ? "bg-accent-soft"
                  : isUsed
                    ? ""
                    : isCurrent
                      ? "bg-row-wash"
                      : "hover:bg-hover";
                return (
                  <li key={i} className="m-0 p-0">
                    <button
                      type="button"
                      data-line={i}
                      aria-current={isCurrent ? "true" : undefined}
                      onPointerDown={(e) => onRowPointerDown(e, i)}
                      onPointerEnter={() => onRowPointerEnter(i)}
                      onClick={(e) => onRowClick(e, i)}
                      style={isUsed && !inDrag ? HATCH : undefined}
                      className={
                        "flex w-full select-none items-start gap-3 rounded-chip px-2 py-1 text-left text-body text-fg transition-colors " +
                        surface +
                        (isCurrent ? " shadow-[inset_2px_0_0_var(--accent)]" : "") +
                        (isActiveMatch ? " ring-1 ring-inset ring-accent" : "")
                      }
                    >
                      <span
                        className={
                          "w-[68px] shrink-0 pt-px font-mono text-meta " +
                          (isCurrent ? "text-accent" : isUsed ? "text-fg" : "text-fg-dim")
                        }
                      >
                        {formatTimestamp(line.start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        {matchLines.has(i) ? highlight(line.text, w.query) : line.text}
                      </span>
                      {isUsed && (
                        <span className="shrink-0 rounded-chip border border-hairlineStrong bg-bg px-1.5 text-meta text-fg-dim">
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
                <button type="button" className="btn w-full text-fg-dim" onClick={loadLater}>
                  drawing the next {WINDOW_SIZE} lines
                </button>
              </div>
            ) : (
              <p className="px-2 pt-2 text-meta text-fg-dim">
                End of the transcript. Auto-generated by YouTube, may contain errors.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
