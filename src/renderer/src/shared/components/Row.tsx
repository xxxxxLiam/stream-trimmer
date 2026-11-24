/**
 * File: Row.tsx
 * Path: src/renderer/src/shared/components/Row.tsx
 * Description: Row shell and status dot shared by the video rows (left) and the bank rows (right).
 *   `state` carries the board's look: open = Ice border with the open glow, dimmed = a video in the
 *   Done group (fg at 55% as drawn on the board), made = the just-made Frost border and glow, cutting
 *   = the live row's Ice border and row glow, queued = Ice-tint fill with an Ice-50 border, idle = a
 *   plain raised row. Status is never colour alone: StatusDot differs by shape.
 */
import type { HTMLAttributes } from "react";
import { cx } from "../utils/cx";

export type RowState = "idle" | "open" | "dimmed" | "cutting" | "made" | "queued";

const states: Record<RowState, string> = {
  idle: "border-transparent",
  open: "border-ice shadow-open",
  dimmed: "border-transparent opacity-55",
  cutting: "border-ice shadow-row",
  made: "border-frost-tint-45 shadow-made",
  queued: "border-ice-tint-50 bg-ice-tint-06",
};

export type RowProps = HTMLAttributes<HTMLDivElement> & { state?: RowState };

export default function Row({ state = "idle", className, ...rest }: RowProps) {
  return (
    <div
      data-state={state}
      className={cx("relative box-border flex items-center gap-2.5 overflow-hidden rounded-control border bg-raised px-2 py-1.5", states[state], className)}
      {...rest}
    />
  );
}

export type DotKind = "saved" | "cutting" | "queued";

/** Filled = saved, ringed in Ice = cutting, hollow = queued. */
export function StatusDot({ kind }: { kind: DotKind }) {
  return (
    <span
      data-dot={kind}
      aria-hidden="true"
      className={cx(
        "box-border inline-block size-2 shrink-0 rounded-full",
        kind === "saved" && "bg-fg",
        kind === "cutting" && "border-[1.5px] border-ice shadow-range",
        kind === "queued" && "border border-fg-dim",
      )}
    />
  );
}
