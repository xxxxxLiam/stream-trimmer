/**
 * File: ClipPill.tsx
 * Path: src/renderer/src/features/player/components/ClipPill.tsx
 * Description: The split Clip button (Clip, and the arrow for where clips go), as drawn on the
 *   board. The label is always "Clip"; a reason, when Clip can't run, shows on hover and focus.
 */
import { CaretIcon } from "./TransportIcons";

type Props = {
  onClip: () => void;
  onMenu: () => void;
  /** Why Clip can't run right now; the button stays focusable and says it. */
  reason?: string | null;
  menuOpen?: boolean;
  labelBelow?: boolean;
};

export default function ClipPill({ onClip, onMenu, reason = null, menuOpen = false, labelBelow = false }: Props) {
  const dim = reason ? "opacity-50" : "";
  return (
    <span className="group relative inline-flex gap-0.5">
      <button
        type="button"
        aria-label={reason ? `Clip. ${reason}` : "Clip (Cmd or Ctrl Enter)"}
        aria-disabled={reason ? true : undefined}
        onClick={() => {
          if (!reason) onClip();
        }}
        className={`h-target rounded-l-full bg-ice px-[30px] text-body font-medium text-bg ${dim}`}
      >
        Clip
      </button>
      <button
        type="button"
        aria-label="Where clips go"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onMenu}
        className={`inline-flex h-target w-9 items-center justify-center rounded-r-full bg-ice text-bg ${dim}`}
      >
        <CaretIcon />
      </button>
      {reason ? (
        <span
          role="tooltip"
          className={`pointer-events-none absolute right-0 z-20 hidden whitespace-nowrap rounded-control border border-hairline-strong bg-raised px-2 py-1 text-meta text-fg group-focus-within:block group-hover:block ${labelBelow ? "top-full mt-1" : "bottom-full mb-1"}`}
        >
          {reason}
        </span>
      ) : null}
    </span>
  );
}
