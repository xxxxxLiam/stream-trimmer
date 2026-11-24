/**
 * File: UndoRing.tsx
 * Path: src/renderer/src/shared/components/UndoRing.tsx
 * Description: The 8 second Undo button on a just-made row: an Undo glyph inside a ring that drains
 *   as time runs out. Pure drawing: the owner passes the seconds left (see useCountdown). The ring
 *   stops animating under reduced motion because it is redrawn per tick, not animated by CSS.
 */
import type { ReactNode } from "react";

export const UNDO_SECONDS = 8;

export type UndoRingProps = {
  secondsLeft: number;
  total?: number;
  onUndo: () => void;
  icon: ReactNode;
};

const R = 13;
const C = 2 * Math.PI * R;

export default function UndoRing({ secondsLeft, total = UNDO_SECONDS, onUndo, icon }: UndoRingProps) {
  const fraction = Math.max(0, Math.min(1, secondsLeft / total));
  return (
    <button
      type="button"
      aria-label={`Undo, ${Math.ceil(secondsLeft)} seconds left`}
      onClick={onUndo}
      className="relative inline-flex size-[30px] shrink-0 items-center justify-center rounded-control text-fg"
    >
      {icon}
      <svg viewBox="0 0 30 30" className="absolute inset-0 -rotate-90" aria-hidden="true" focusable="false">
        <circle
          data-ring
          cx="15"
          cy="15"
          r={R}
          fill="none"
          stroke="var(--frost)"
          strokeWidth="1.5"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
        />
      </svg>
    </button>
  );
}
