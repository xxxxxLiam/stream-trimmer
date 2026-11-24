/**
 * File: IconButton.tsx
 * Path: src/renderer/src/shared/components/IconButton.tsx
 * Description: 44 by 44 icon-only control (Panels, Help, Settings, transport, timeline tools). The
 *   glyph is drawn small, the target is not. `label` is required: it names the action and its key
 *   for assistive tech. `pressed` is the active tool/state: raised surface and an Ice glyph;
 *   `ringed` adds the 1px Ice-50 ring the Loop button wears.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../utils/cx";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  ringed?: boolean;
};

export default function IconButton({ label, icon, pressed, ringed, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        "inline-flex size-target items-center justify-center rounded-control border transition-colors",
        pressed ? "bg-raised text-ice" : "text-fg-dim hover:bg-hover hover:text-fg",
        ringed ? "border-ice-tint-50" : "border-transparent",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
