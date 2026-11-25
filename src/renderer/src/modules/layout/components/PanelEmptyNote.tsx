/**
 * File: PanelEmptyNote.tsx
 * Path: src/renderer/src/modules/layout/components/PanelEmptyNote.tsx
 * Description: What a panel with nothing in it shows (board 03.2.14): one dim, centred sentence
 *   that says how the panel fills, with its key in a KeyChip. Gone the moment something arrives.
 *   No illustration, no heading that repeats the tab name, no button.
 */
import type { ReactNode } from "react";

export function KeyChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-chip border border-hairlineStrong bg-raised px-[5px] text-meta font-semibold text-fg">
      {children}
    </span>
  );
}

export default function PanelEmptyNote({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex min-h-0 flex-1 items-center justify-center px-[32px] text-center text-body leading-[1.6] text-fg-dim">
      <span>{children}</span>
    </div>
  );
}
