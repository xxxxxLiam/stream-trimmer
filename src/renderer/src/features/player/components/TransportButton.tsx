/**
 * File: TransportButton.tsx
 * Path: src/renderer/src/features/player/components/TransportButton.tsx
 * Description: One 44px transport button. Its hover label (also shown on keyboard focus) says what
 *   it does and carries its key, so nothing is printed under the buttons.
 */
import type { ReactNode } from "react";

export type TransportButtonProps = {
  label: string;
  /** Accessible name; defaults to the label up to the double space before the key. */
  name?: string;
  onClick: () => void;
  children: ReactNode;
  /** "ghost" has no fill (back, forward); "tile" sits on a raised tile; "play" is the Frost disc. */
  look?: "tile" | "ghost" | "play";
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  labelBelow?: boolean;
};

const LOOKS = {
  tile: "rounded-control border bg-raised",
  ghost: "rounded-control border border-transparent",
  play: "rounded-full bg-frost text-bg",
} as const;

export default function TransportButton({
  label,
  name,
  onClick,
  children,
  look = "tile",
  active = false,
  pressed,
  disabled = false,
  labelBelow = false,
}: TransportButtonProps) {
  const tone =
    look === "play"
      ? ""
      : active
        ? "border-ice-tint-50 text-ice"
        : look === "tile"
          ? "border-transparent text-fg-dim hover:text-fg"
          : "text-fg-dim hover:text-fg";
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={name ?? label.split("  ")[0]}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex size-target items-center justify-center text-meta transition-colors disabled:text-disabled ${LOOKS[look]} ${tone}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-hairline-strong bg-raised px-2 py-1 text-meta text-fg group-focus-within:block group-hover:block ${labelBelow ? "top-full mt-1" : "bottom-full mb-1"}`}
      >
        {label}
      </span>
    </span>
  );
}
