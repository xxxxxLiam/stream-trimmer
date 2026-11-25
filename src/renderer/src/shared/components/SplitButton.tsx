/**
 * File: SplitButton.tsx
 * Path: src/renderer/src/shared/components/SplitButton.tsx
 * Description: The Clip button: a label half and an arrow half that opens "where clips go".
 *   Ice fill; `glowing` adds the cut glow, which the board allows only while a valid range exists
 *   (at most one per screen). Disabled dims Clip (aria-disabled, focusable so a tooltip can say why); the arrow stays usable.
 */
import type { ReactNode, Ref } from "react";
import { cx } from "../utils/cx";

export type SplitButtonProps = {
  label: string;
  onPress: () => void;
  onOpenMenu: () => void;
  menuLabel?: string;
  menuIcon: ReactNode;
  disabled?: boolean;
  glowing?: boolean;
  menuExpanded?: boolean;
  describedBy?: string;
  /** Lets the owner focus the arrow (after the menu closes). */
  menuRef?: Ref<HTMLButtonElement>;
};

export default function SplitButton({
  label,
  onPress,
  onOpenMenu,
  menuLabel = "Where clips go",
  menuIcon,
  disabled = false,
  glowing = false,
  menuExpanded,
  describedBy,
  menuRef,
}: SplitButtonProps) {
  const half = disabled
    ? "cursor-not-allowed border border-hairlineStrong bg-raised text-disabled"
    : cx("bg-ice text-bg hover:shadow-clip-hover", glowing && "shadow-cut");
  // The destination is a setting, so the arrow stays usable while Clip is dimmed: it keeps the dimmed
  // surface but is not disabled, and reads in the normal text colour.
  const arrow = disabled
    ? "cursor-pointer border border-hairlineStrong bg-raised text-fg hover:bg-hover"
    : half;
  return (
    <span className="inline-flex gap-0.5">
      <button
        type="button"
        aria-disabled={disabled || undefined}
        aria-describedby={describedBy}
        onClick={disabled ? undefined : onPress}
        className={cx("inline-flex h-target items-center rounded-l-pill px-[30px] text-body font-semibold", half)}
      >
        {label}
      </button>
      <button
        type="button"
        ref={menuRef}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={menuExpanded}
        onClick={onOpenMenu}
        className={cx("inline-flex h-target w-[36px] items-center justify-center rounded-r-pill", arrow)}
      >
        {menuIcon}
      </button>
    </span>
  );
}
