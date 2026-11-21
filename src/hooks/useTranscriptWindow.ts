/**
 * File: useTranscriptWindow.ts
 * Path: src/hooks/useTranscriptWindow.ts
 * Description: Windowing hook for the transcript column (BUILD-SPEC section 6). Holds the whole
 *   transcript indexed in memory, exposes ~40 lines around the playhead, grows on loadEarlier /
 *   loadLater, searches the entire transcript, and re-centres when a match is jumped to.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  WINDOW_SIZE,
  computeWindow,
  extendEarlier,
  extendLater,
  followWindow,
  formatMatchCounter,
  lineIndexAt,
  normalizeTranscript,
  searchTranscript,
  stepMatch,
  type Line,
  type Match,
  type Win,
} from "../lib/transcript";

export type UseTranscriptWindowOptions = {
  lines: readonly Line[] | null | undefined;
  /** Playhead in seconds. */
  playhead: number;
  size?: number;
};

export type TranscriptWindow = {
  /** The whole transcript, normalized (sorted). */
  all: Line[];
  total: number;
  /** Half-open indices of what is drawn. */
  win: Win;
  /** Only these lines are rendered. visible[k] is all[win.from + k]. */
  visible: Line[];
  drawn: number;
  /** Line the playhead is on, -1 when the transcript is empty. */
  playheadIndex: number;
  hasEarlier: boolean;
  hasLater: boolean;
  loadEarlier: () => void;
  loadLater: () => void;
  query: string;
  setQuery: (q: string) => void;
  /** Every match across the WHOLE transcript. */
  matches: Match[];
  /** Zero-based active match, -1 when none. */
  active: number;
  /** "3/9" while there are matches, "0/0" for a query with none, "" without a query. */
  counter: string;
  nextMatch: () => void;
  prevMatch: () => void;
  /** Bumps every time something asks the view to scroll to a line (a match jump). */
  focus: { line: number; nonce: number } | null;
  jumpToLine: (index: number) => void;
};

type State = { win: Win; idx: number; lines: Line[] };

export function useTranscriptWindow({
  lines: raw,
  playhead,
  size = WINDOW_SIZE,
}: UseTranscriptWindowOptions): TranscriptWindow {
  const all = useMemo(() => normalizeTranscript(raw), [raw]);
  const total = all.length;
  const playheadIndex = useMemo(() => lineIndexAt(all, playhead), [all, playhead]);

  const [state, setState] = useState<State>(() => ({
    win: computeWindow(total, playheadIndex, size),
    idx: playheadIndex,
    lines: all,
  }));

  // Adjust during render (React-sanctioned) so the first frame already has the right window.
  // The window follows the playhead only when the playhead LINE changes, so lines the user
  // loaded manually are not yanked away while the same line is playing.
  let current = state;
  if (state.lines !== all) {
    current = { win: computeWindow(total, playheadIndex, size), idx: playheadIndex, lines: all };
    setState(current);
  } else if (state.idx !== playheadIndex) {
    current = {
      win: followWindow(state.win, total, playheadIndex, size),
      idx: playheadIndex,
      lines: all,
    };
    setState(current);
  }
  const win = current.win;

  const loadEarlier = useCallback(
    () => setState((s) => ({ ...s, win: extendEarlier(s.win, s.lines.length, size) })),
    [size],
  );
  const loadLater = useCallback(
    () => setState((s) => ({ ...s, win: extendLater(s.win, s.lines.length, size) })),
    [size],
  );

  // ---- search over the whole transcript ----
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => searchTranscript(all, deferredQuery), [all, deferredQuery]);
  const [active, setActive] = useState(-1);
  const [focus, setFocus] = useState<{ line: number; nonce: number } | null>(null);

  const centreOn = useCallback(
    (line: number) => {
      setState((s) => ({ ...s, win: computeWindow(s.lines.length, line, size) }));
      setFocus((f) => ({ line, nonce: (f?.nonce ?? 0) + 1 }));
    },
    [size],
  );

  const jump = useCallback(
    (i: number) => {
      if (i < 0 || i >= matches.length) return;
      setActive(i);
      centreOn(matches[i].line);
    },
    [matches, centreOn],
  );

  // A new set of results starts at the first match and re-centres on it.
  useEffect(() => {
    if (matches.length === 0) {
      setActive(-1);
      return;
    }
    setActive(0);
    centreOn(matches[0].line);
  }, [matches, centreOn]);

  const nextMatch = useCallback(() => jump(stepMatch(active, matches.length, 1)), [jump, active, matches.length]);
  const prevMatch = useCallback(() => jump(stepMatch(active, matches.length, -1)), [jump, active, matches.length]);

  const jumpToLine = useCallback((index: number) => centreOn(index), [centreOn]);

  const visible = useMemo(() => all.slice(win.from, win.to), [all, win.from, win.to]);

  const counter =
    query.trim() === ""
      ? ""
      : formatMatchCounter(active, matches.length);

  return {
    all,
    total,
    win,
    visible,
    drawn: visible.length,
    playheadIndex,
    hasEarlier: win.from > 0,
    hasLater: win.to < total,
    loadEarlier,
    loadLater,
    query,
    setQuery,
    matches,
    active,
    counter,
    nextMatch,
    prevMatch,
    focus,
    jumpToLine,
  };
}
