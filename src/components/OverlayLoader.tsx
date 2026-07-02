/**
 * File: OverlayLoader.tsx
 * Path: src/components/OverlayLoader.tsx
 * Description: Full-viewport dim overlay with a spinner shown during fetches.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRepeat } from "react-bootstrap-icons";

interface OverlayLoaderProps {
  visible: boolean;
  label: string;
  progress?: number;
  phase?: "idle" | "downloading" | "processing" | "done" | "error";
}

export default function OverlayLoader({
  visible,
  label,
  progress,
  phase,
}: OverlayLoaderProps) {
  const showBar = typeof progress === "number" && phase && phase !== "idle";
  const indeterminate = phase === "processing";
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  const finishing = phase === "processing";
  const displayLabel = finishing
    ? "Finishing up"
    : phase === "downloading"
      ? `Downloading ${Math.floor(pct)}%`
      : label;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/70 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex min-w-[260px] flex-col gap-2 rounded-panel border border-hairline bg-panel px-5 py-3 shadow-panel"
          >
            <div className="flex items-center gap-3">
              <ArrowRepeat className="h-4 w-4 animate-spin text-accent" />
              <span className="text-[12px] text-fg-muted">{displayLabel}…</span>
            </div>
            {showBar && (
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-panel-raised">
                {indeterminate ? (
                  <motion.div
                    className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
                    animate={{ x: ["-100%", "300%"] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : (
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-accent"
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  />
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}