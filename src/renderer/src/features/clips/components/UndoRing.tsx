/**
 * File: UndoRing.tsx
 * Path: src/renderer/src/features/clips/components/UndoRing.tsx
 * Description: The Undo button on the clip just made: a thin Ice ring drains around the icon over
 *   8 seconds (look A on the board).
 */
import { IconUndo } from "../../../shared/components/rowIcons";
import { undoRingDash } from "../utils/exportRows";

export default function UndoRing({ secondsLeft, onUndo }: { secondsLeft: number; onUndo: () => void }) {
  const label = `Undo, ${Math.ceil(secondsLeft)} seconds left`;
  return (
    <button
      type="button"
      aria-label={label}
      title="Undo"
      onClick={onUndo}
      className="relative inline-flex size-btn items-center justify-center rounded-full text-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
    >
      <svg width={36} height={36} viewBox="0 0 36 36" className="absolute inset-0" aria-hidden="true">
        <circle cx={18} cy={18} r={15} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={2} />
        <circle
          cx={18}
          cy={18}
          r={15}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={undoRingDash(secondsLeft)}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <IconUndo />
    </button>
  );
}
