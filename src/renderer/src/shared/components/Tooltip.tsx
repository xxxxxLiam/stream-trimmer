/**
 * File: Tooltip.tsx
 * Path: src/renderer/src/shared/components/Tooltip.tsx
 * Description: The tooltip bubble, and the key hint inside it: the action first, then its key. It is
 *   the visual only; the owner shows it on hover and on keyboard focus and points
 *   `aria-describedby` at its `id`. Used for "why is Clip dimmed" as well as transport labels.
 */
import type { ReactNode } from "react";
import { cx } from "../utils/cx";

export function KeyHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-chip border border-hairlineStrong bg-raised px-[5px] text-meta font-semibold text-fg">
      {children}
    </span>
  );
}

export type TooltipProps = {
  id?: string;
  children: ReactNode;
  /** Key shown after the text, e.g. "L". */
  keyHint?: string;
  className?: string;
};

export default function Tooltip({ id, children, keyHint, className }: TooltipProps) {
  return (
    <span
      id={id}
      role="tooltip"
      className={cx(
        "inline-flex items-center gap-[8px] whitespace-nowrap rounded-control border border-hairlineStrong bg-hover py-[6px] pl-[10px] pr-[8px] text-meta text-fg",
        className,
      )}
    >
      {children}
      {keyHint ? <KeyHint>{keyHint}</KeyHint> : null}
    </span>
  );
}
