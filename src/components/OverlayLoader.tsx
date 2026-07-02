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
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4 border border-white px-8 py-6">
            <ArrowRepeat className="h-8 w-8 animate-spin" />
            <span className="text-xs uppercase tracking-widest">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}