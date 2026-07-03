/**
 * File: PreviewPanel.tsx
 * Path: src/components/PreviewPanel.tsx
 * Description: Right-column panel: video iframe and transcript view, swapped with animation.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  CameraVideo,
  FileText,
  ClipboardCheck,
  Search,
  ChevronBarLeft,
  ChevronBarRight,
  ExclamationTriangle,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { formatTimestamp } from "../lib/clip";

export default function PreviewPanel() {
  const {
    info,
    videoId,
    showTranscript,
    toggleTranscript,
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
  } = useClipperContext();

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
  // transcript re-renders. Effect runs on every render but only acts when
  // there's a pending target AND the search is empty.
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
  };

  // Detect embed-blocked videos. Primary: YT IFrame API postMessage onError
  // (101/150/153). Fallback: if the embed hasn't confirmed playback within a
  // few seconds, assume it's blocked (YouTube doesn't always post the error).
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [embedConfirmed, setEmbedConfirmed] = useState(false);

  useEffect(() => {
    setEmbedBlocked(false);
    setEmbedConfirmed(false);
    if (!videoId || showTranscript) return;
    const t = window.setTimeout(() => {
      setEmbedConfirmed((confirmed) => {
        if (!confirmed) setEmbedBlocked(true);
        return confirmed;
      });
    }, 3500);
    return () => window.clearTimeout(t);
  }, [videoId, showTranscript]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (typeof e.data !== "string") return;
      try {
        const data = JSON.parse(e.data);
        if (
          data?.event === "onError" &&
          [101, 150, 153].includes(Number(data.info))
        ) {
          setEmbedBlocked(true);
        }
        // Any ready/state signal means the embed is actually playing.
        if (data?.event === "onReady" || data?.event === "onStateChange") {
          setEmbedConfirmed(true);
          setEmbedBlocked(false);
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          onClick={toggleTranscript}
          disabled={!info}
          className="btn text-[12px]"
        >
          {showTranscript ? <CameraVideo size={12} /> : <FileText size={12} />}
          <span>{showTranscript ? "View video" : "View transcript"}</span>
        </button>
        {showTranscript && (
          <button
            type="button"
            onClick={copyTranscript}
            disabled={rangeTranscript.length === 0}
            className="btn text-[12px]"
          >
            <ClipboardCheck size={12} />
            <span>Copy</span>
          </button>
        )}
      </div>

      {showTranscript ? (
        <motion.div
          key="transcript"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-hairline bg-panel-raised"
        >
          {!loadingTranscript && transcript && transcript.length > 0 && (
            <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-bg-deep/40 px-3 py-2">
              <Search size={12} className="text-fg-faint" />
              <input
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
                No transcript loaded.
              </span>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="video"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="relative aspect-video w-full shrink-0 overflow-hidden rounded-panel border border-hairline bg-panel-raised"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {videoId ? (
              embedBlocked ? (
                <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center text-fg-muted">
                  <ExclamationTriangle size={22} className="text-accent" />
                  <span className="text-[13px] text-fg">Preview unavailable</span>
                  <span className="text-[12px] text-fg-faint">
                    The video owner disabled embedded playback. This has no
                    effect on downloading — clip and download still work.
                  </span>
                </div>
              ) : (
                <iframe
                  key={videoId}
                  src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1`}
                  title="YouTube preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                  onLoad={(e) => {
                    // Handshake so the embed emits onReady/onError events.
                    const win = (e.currentTarget as HTMLIFrameElement)
                      .contentWindow;
                    try {
                      win?.postMessage(
                        JSON.stringify({ event: "listening", id: videoId }),
                        "*",
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-fg-faint">
                <CameraVideo size={22} />
                <span className="text-[12px]">Preview will appear here</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
