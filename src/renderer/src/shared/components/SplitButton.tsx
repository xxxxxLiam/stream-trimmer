/**
 * File: SplitButton.tsx
 * Path: src/renderer/src/shared/components/SplitButton.tsx
 * Description: The Clip button: a label half and an arrow half that opens "where clips go".
 *   Ice fill; `glowing` adds the cut glow, which the board allows only while a valid range exists
 *   (at most one per screen). Disabled keeps both halves focusable (aria-disabled) so a tooltip can
 *   say why.
 */
import type { ReactNode } from "react";
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
}: SplitButtonProps) {
  const half = disabled
    ? "cursor-not-allowed bg-raised text-disabled"
    : cx("bg-ice text-bg hover:shadow-clip-hover", glowing && "shadow-cut");
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
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={menuExpanded}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onOpenMenu}
        className={cx("inline-flex h-target w-[34px] items-center justify-center rounded-r-pill", half)}
      >
        {menuIcon}
      </button>
    </span>
  );
}
