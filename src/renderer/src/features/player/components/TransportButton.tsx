/**
 * File: TransportButton.tsx
 * Path: src/renderer/src/features/player/components/TransportButton.tsx
 * Description: One 44px transport button. Its hover label (also shown on keyboard focus) says what
 *   it does and carries its key, so nothing is printed under the buttons.
 */
import type { ReactNode } from "react";
import Tooltip from "../../../shared/components/Tooltip";

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
  const [text, key] = label.split("  ");
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
      <Tooltip
        className={`pointer-events-none absolute left-1/2 z-20 hidden -translate-x-1/2 group-focus-within:inline-flex group-hover:inline-flex ${labelBelow ? "top-full mt-[4px]" : "bottom-full mb-[4px]"}`}
        keyHint={key}
      >
        {text}
      </Tooltip>
    </span>
  );
}
