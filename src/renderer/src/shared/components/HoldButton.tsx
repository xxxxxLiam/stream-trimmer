/**
 * File: HoldButton.tsx
 * Path: src/renderer/src/shared/components/HoldButton.tsx
 * Description: A button that acts only after being held for 3 seconds (deleting moments, Design v152). While held a
 *   neutral sweep (hairlineStrong) fills left to right and the label reads "Keep holding"; letting go early cancels.
 *   Pointer, or Enter and Space held. Red is the border and the text only, never a fill.
 */
import type { ReactNode } from "react";
import { HOLD_MS, useHold } from "../hooks/useHold";

export type HoldButtonProps = {
  label: string;
  onDone: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  /** The look of the button itself (size, border, text colour). */
  className: string;
  role?: string;
  ms?: number;
};

export default function HoldButton({ label, onDone, disabled, icon, className, role, ms = HOLD_MS }: HoldButtonProps) {
  const hold = useHold(onDone, ms);
  return (
    <button
      type="button"
      role={role}
      disabled={disabled}
      aria-label={label}
      title="Press and hold for 3 seconds"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        hold.start();
      }}
      onPointerUp={hold.cancel}
      onPointerCancel={hold.cancel}
      onLostPointerCapture={hold.cancel}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          hold.start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") hold.cancel();
      }}
      onBlur={hold.cancel}
      className={`relative select-none overflow-hidden ${className}`}
    >
      {hold.holding ? <span aria-hidden="true" data-hold-sweep className="pointer-events-none absolute inset-y-0 left-0 bg-hairlineStrong" style={{ width: `${hold.progress * 100}%` }} /> : null}
      <span className="relative flex items-center justify-center gap-[8px]">
        {icon}
        {hold.holding ? "Keep holding" : label}
      </span>
    </button>
  );
}
