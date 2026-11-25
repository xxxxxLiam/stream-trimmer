/**
 * File: PreparingLine.tsx
 * Path: src/renderer/src/features/player/components/PreparingLine.tsx
 * Description: The Preparing line: a short Ice line sliding along an edge while something opens.
 *   No percentage, no spinner. Holds still when the system asks for reduced motion.
 */
import { motion, useReducedMotion } from "framer-motion";

export default function PreparingLine() {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden="true" className="absolute inset-x-[0px] bottom-[0px] h-[2px] overflow-hidden">
      <motion.span
        className="absolute inset-y-[0px] w-1/4 bg-ice"
        initial={{ left: reduce ? "37%" : "-25%" }}
        animate={reduce ? undefined : { left: "100%" }}
        transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
      />
    </span>
  );
}
