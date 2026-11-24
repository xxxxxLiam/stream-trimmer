/**
 * File: Drawer.tsx
 * Path: src/renderer/src/shared/components/Drawer.tsx
 * Description: The right-hand drawer (Settings, Help): 440px, panel surface, strong hairline on its
 *   left edge, no shadow. DrawerHeader is the 44px title row with an optional back button (second
 *   view) and a close button.
 */
import type { ReactNode } from "react";

export function Drawer({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside
      role="dialog"
      aria-label={label}
      className="box-border flex h-full w-[440px] flex-col border-l border-hairlineStrong bg-panel"
    >
      {children}
    </aside>
  );
}

export type DrawerHeaderProps = {
  title: string;
  onClose: () => void;
  closeIcon: ReactNode;
  back?: { label: string; onBack: () => void; icon: ReactNode };
  /** Name the close button announces ("Settings" on every view). Defaults to the title. */
  closeName?: string;
};

export function DrawerHeader({ title, onClose, closeIcon, back, closeName }: DrawerHeaderProps) {
  return (
    <div className="box-border border-b border-hairline px-5 py-3">
      <div className="flex h-target items-center gap-2">
        {back ? (
          <button
            type="button"
            aria-label={`Back to ${back.label}`}
            onClick={back.onBack}
            className="-ml-2 inline-flex h-target items-center gap-1 rounded-control px-2 text-meta text-fg-dim hover:bg-hover"
          >
            {back.icon}
            <span>{back.label}</span>
          </button>
        ) : null}
        <h3 className="text-drawer-title">{title}</h3>
        <button
          type="button"
          aria-label={`Close ${closeName ?? title}`}
          onClick={onClose}
          className="-mr-3 ml-auto inline-flex size-target items-center justify-center rounded-control text-fg-dim hover:bg-hover"
        >
          {closeIcon}
        </button>
      </div>
    </div>
  );
}
