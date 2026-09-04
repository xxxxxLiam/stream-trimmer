/**
 * File: TranscriptDock.tsx
 * Path: src/components/TranscriptDock.tsx
 * Description: Collapsible transcript dock for the Clip tab, with a full-screen expand overlay.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ArrowsAngleExpand,
  X,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import TranscriptPanel from "./TranscriptPanel";

export default function TranscriptDock() {
  const { info, transcript, loadingTranscript } = useClipperContext();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Escape closes the overlay.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const count = transcript?.length ?? 0;
  const summary = !info
    ? "no video"
    : loadingTranscript
      ? "loading…"
      : transcript === null
        ? "not loaded"
        : count === 0
          ? "unavailable"
          : `${count} lines`;

  return (
    <>
      <div
        className={
          "flex min-h-0 flex-col overflow-hidden rounded-panel border border-hairline bg-panel-raised/40 " +
          (open ? "flex-1" : "shrink-0")
        }
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-bg-deep/40 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12px] text-fg-muted hover:text-fg"
            aria-expanded={open}
          >
            {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            <span className="font-medium text-fg">Transcript</span>
            <span className="truncate text-fg-faint">· {summary}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            disabled={!info}
            className="shrink-0 rounded-chip p-1 text-fg-faint transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-40"
            title="Expand transcript"
            aria-label="Expand transcript"
          >
            <ArrowsAngleExpand size={12} />
          </button>
        </div>

        {open && (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <TranscriptPanel compact />
          </div>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="transcript-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.98, y: 6 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-panel border border-hairline bg-panel shadow-panel"
              role="dialog"
              aria-label="Transcript"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-2.5">
                <span className="text-[13px] font-medium text-fg">
                  Transcript
                </span>
                <span className="text-[12px] text-fg-faint">· {summary}</span>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="ml-auto rounded-chip p-1 text-fg-faint hover:bg-panel-hover hover:text-fg"
                  aria-label="Close transcript"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <TranscriptPanel />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
