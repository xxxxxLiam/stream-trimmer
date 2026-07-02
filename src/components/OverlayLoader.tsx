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
}

export default function OverlayLoader({ visible, label }: OverlayLoaderProps) {
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
            className="flex items-center gap-3 rounded-panel border border-hairline bg-panel px-5 py-3 shadow-panel"
          >
            <ArrowRepeat className="h-4 w-4 animate-spin text-accent" />
            <span className="text-[12px] text-fg-muted">{label}…</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}