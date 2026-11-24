/**
 * File: Button.tsx
 * Path: src/renderer/src/shared/components/Button.tsx
 * Description: The Components board's pill buttons. primary = Ice fill (the cut and next-video
 *   actions), secondary = raised with a strong hairline, tip = secondary with the dotted Ice ring a
 *   tip card points at. 44px tall (target size). Disabled is `aria-disabled` with the disabled
 *   token and no fill, so the button stays focusable and its tooltip can say why.
 */
import type { ButtonHTMLAttributes } from "react";
import { cx } from "../utils/cx";

export type ButtonVariant = "primary" | "secondary" | "tip";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Blocks the action but keeps focus and hover, so a tooltip can explain why. */
  disabled?: boolean;
};

const base =
  "inline-flex h-target items-center justify-center gap-2 rounded-pill px-6 text-body font-medium transition-colors";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ice text-bg hover:shadow-clip-hover",
  secondary: "border border-hairlineStrong bg-raised text-fg hover:bg-hover",
  tip: "border border-dotted border-ice bg-raised text-fg",
};

export default function Button({
  variant = "secondary",
  disabled = false,
  className,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={disabled || undefined}
      onClick={disabled ? (e) => e.preventDefault() : onClick}
      className={cx(
        base,
        disabled ? "cursor-not-allowed bg-raised text-disabled" : variants[variant],
        className,
      )}
      {...rest}
    />
  );
}
