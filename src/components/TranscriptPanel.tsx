/**
 * File: TranscriptPanel.tsx
 * Path: src/components/TranscriptPanel.tsx
 * Description: Transcript tab — searchable transcript with jump-to-line and range in/out setting.
 */
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  Search,
  ChevronBarLeft,
  ChevronBarRight,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { formatTimestamp } from "../lib/clip";

export default function TranscriptPanel({
  compact = false,
}: {
  /** Docked variant inside the Clip tab — hides the redundant title row. */
  compact?: boolean;
}) {
  const {
    info,
    loadingTranscript,
    transcript,
    rangeTranscript,
    displayTranscript,
    start,
    end,
    transcriptQuery,
    setTranscriptQuery,
    setStartFromLine,
    setEndFromLine,
    copyTranscript,
    requestSeek,
    ensureTranscript,
  } = useClipperContext();

  // Load lazily the first time this tab is opened for a video.
  useEffect(() => {
    if (info) ensureTranscript();
  }, [info, ensureTranscript]);

  // Cmd/Ctrl+F focuses the transcript search box while this panel is mounted.
  const searchRef = useRef<HTMLInputElement | null>(null);
  const isTabActive = useIsTabActive();
  useEffect(() => {
    if (!isTabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        if (!searchRef.current) return;
        e.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTabActive]);


  const firstInRangeRef = useRef<HTMLDivElement | null>(null);
  const firstInRangeKey = displayTranscript.find(
    (l) => l.end > start && l.start < end,
  );
  useEffect(() => {
    firstInRangeRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [firstInRangeKey?.start]);

  // Stable per-line refs keyed by line.start so filtering / clearing search
  // doesn't invalidate the target.
  const rowRefs = useRef(new Map<number, HTMLDivElement | null>());
  const [flashKey, setFlashKey] = useState<number | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);

  // Clear search first (state update), then scroll after the unfiltered
  // transcript re-renders.
  useEffect(() => {
    if (pendingScrollId == null) return;
    if (transcriptQuery.trim() !== "") return;
    const el = rowRefs.current.get(pendingScrollId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashKey(pendingScrollId);
    const target = pendingScrollId;
    setPendingScrollId(null);
    const t = window.setTimeout(
      () => setFlashKey((k) => (k === target ? null : k)),
      600,
    );
    return () => window.clearTimeout(t);
  }, [pendingScrollId, transcriptQuery, displayTranscript]);

  const handleRowJump = (lineStart: number) => {
    setPendingScrollId(lineStart);
    setTranscriptQuery("");
    requestSeek(lineStart);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {!compact && (
        <div className="flex shrink-0 items-center gap-3">
          <span className="min-w-0 truncate text-[12px] text-fg-muted">
            {info ? info.title : "Load a video in the Clip tab first"}
          </span>
          <button
            type="button"
            onClick={copyTranscript}
            disabled={rangeTranscript.length === 0}
            className="btn ml-auto shrink-0 text-[12px]"
            title="Copy the transcript for the selected range"
          >
            <ClipboardCheck size={12} />
            <span>Copy selection</span>
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-hairline bg-panel-raised"
      >
        {!loadingTranscript && transcript && transcript.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-bg-deep/40 px-3 py-2">
            <Search size={12} className="text-fg-faint" />
            <input
              ref={searchRef}
              type="text"
              value={transcriptQuery}
              onChange={(e) => setTranscriptQuery(e.target.value)}
              placeholder="Search transcript…"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none"
            />

            {transcriptQuery && (
              <button
                type="button"
                onClick={() => setTranscriptQuery("")}
                className="rounded-chip px-1.5 py-0.5 text-[11px] text-fg-faint hover:bg-panel-hover hover:text-fg"
              >
                Clear
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingTranscript ? (
            <span className="block px-2 py-2 text-fg-muted">
              Loading transcript…
            </span>
          ) : transcript && transcript.length > 0 ? (
            displayTranscript.length > 0 ? (
              <>
                {displayTranscript.map((l, i) => {
                  const inRange = l.end > start && l.start < end;
                  const isFirstInRange = inRange && l === firstInRangeKey;
                  const isFlashing = flashKey === l.start;
                  return (
                    <div
                      key={`${l.start}-${i}`}
                      ref={(el) => {
                        rowRefs.current.set(l.start, el);
                        if (isFirstInRange) firstInRangeRef.current = el;
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowJump(l.start)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowJump(l.start);
                        }
                      }}
                      className={
                        "group relative flex cursor-pointer items-start gap-3 pl-3 pr-2 py-1.5 transition-colors " +
                        (inRange
                          ? "bg-accent/10 hover:bg-accent/15"
                          : "opacity-50 hover:bg-panel-hover hover:opacity-100") +
                        (isFlashing ? " ring-1 ring-accent/60" : "")
                      }
                    >
                      {inRange && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-accent"
                        />
                      )}
                      <span
                        className={
                          "w-14 shrink-0 pt-[1px] text-[11px] tabular-nums " +
                          (inRange ? "text-accent" : "text-fg-faint")
                        }
                      >
                        {formatTimestamp(l.start)}
                      </span>
                      <span
                        className={
                          "min-w-0 flex-1 text-[13px] leading-relaxed " +
                          (inRange ? "text-fg" : "text-fg-muted")
                        }
                      >
                        {l.text}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStartFromLine(l);
                          }}
                          className="rounded-chip p-1 text-fg-faint hover:bg-accent/15 hover:text-accent"
                          title="Set as clip start"
                          aria-label="Set as clip start"
                        >
                          <ChevronBarLeft size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEndFromLine(l);
                          }}
                          className="rounded-chip p-1 text-fg-faint hover:bg-accent/15 hover:text-accent"
                          title="Set as clip end"
                          aria-label="Set as clip end"
                        >
                          <ChevronBarRight size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="mt-3 px-2 text-[11px] text-fg-faint">
                  Auto-generated by YouTube — may contain errors.
                </p>
              </>
            ) : (
              <span className="block px-2 py-2 text-fg-muted">
                No lines match “{transcriptQuery}”.
              </span>
            )
          ) : transcript && transcript.length === 0 ? (
            <span className="block px-2 py-2 text-fg-muted">
              No transcript available for this video.
            </span>
          ) : (
            <span className="block px-2 py-2 text-fg-muted">
              {info
                ? "No transcript loaded."
                : "Search a video in the Clip tab to see its transcript."}
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
