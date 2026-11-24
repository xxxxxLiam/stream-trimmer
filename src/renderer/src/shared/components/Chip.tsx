/**
 * File: Chip.tsx
 * Path: src/renderer/src/shared/components/Chip.tsx
 * Description: A value chip that opens a menu: the campaign chip in the top bar (md, 44px) and the
 *   footer's audio and folder values (sm, 28px). Open state is an Ice border with the 18% Ice ring.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../utils/cx";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  size?: "md" | "sm";
  open?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
};

export default function Chip({ size = "md", open = false, trailing, children, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cx(
        "inline-flex items-center gap-2 rounded-control border bg-raised text-fg",
        size === "md" ? "h-target pl-3 pr-2.5 text-body font-medium" : "h-row px-2.5 text-meta",
        open ? "border-ice ring-[3px] ring-ice-tint-18" : size === "md" ? "border-hairline" : "border-hairlineStrong",
        className,
      )}
      {...rest}
    >
      {children}
      {trailing ? <span className="inline-flex text-fg-dim">{trailing}</span> : null}
    </button>
  );
}
