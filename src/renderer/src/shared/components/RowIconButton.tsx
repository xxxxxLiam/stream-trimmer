/**
 * File: RowIconButton.tsx
 * Path: src/renderer/src/shared/components/RowIconButton.tsx
 * Description: The 36px bordered icon button on Export and History rows. The label shows on hover
 *   (title) and is the spoken name; the icon itself is decorative.
 */
import type { ReactNode } from "react";

export type RowIconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
};

export default function RowIconButton({ label, onClick, children, disabled }: RowIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-btn flex-none items-center justify-center rounded-control border border-hairlineStrong text-fg-dim hover:bg-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost disabled:text-disabled"
    >
      {children}
    </button>
  );
}
