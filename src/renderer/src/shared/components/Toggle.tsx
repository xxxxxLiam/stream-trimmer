/**
 * File: Toggle.tsx
 * Path: src/renderer/src/shared/components/Toggle.tsx
 * Description: An on/off switch. A real `role="switch"` button, 44px target around a 36 by 20 track:
 *   on = Ice track, off = raised track with a strong hairline. The label sits beside it and is the
 *   accessible name.
 */
import { cx } from "../utils/cx";

export type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export default function Toggle({ label, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onChange(!checked)}
      className={cx("inline-flex h-target items-center gap-3 text-body", disabled ? "cursor-not-allowed text-disabled" : "text-fg")}
    >
      <span
        aria-hidden="true"
        className={cx(
          "relative inline-block h-5 w-9 rounded-full border",
          checked ? "border-ice bg-ice" : "border-hairlineStrong bg-raised",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-4 rounded-full transition-all",
            checked ? "left-[18px] bg-bg" : "left-0.5 bg-fg-dim",
          )}
        />
      </span>
      {label}
    </button>
  );
}
