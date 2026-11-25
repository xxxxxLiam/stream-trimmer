/**
 * File: Drawer.tsx
 * Path: src/renderer/src/shared/components/Drawer.tsx
 * Description: The right-hand drawer (Settings, Help): 440px, panel surface, strong hairline on its
 *   left edge, no shadow. DrawerHeader is the 44px title row with an optional back button (second
 *   view) and a close button.
 */
import type { ReactNode } from "react";

export function Drawer({ label, children, padClass = "pl-[16px] pr-[17px] pb-[20px] pt-[17px]" }: { label: string; children: ReactNode; /** Inner padding; the boards differ (Channel data pads 20). */ padClass?: string }) {
  return (
    <aside
      role="dialog"
      aria-label={label}
      className={`box-border flex h-full w-[440px] flex-col border-l border-hairlineStrong bg-panel ${padClass}`}
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
    <div>
      <div className="flex h-target items-center gap-[8px]">
        {back ? (
          <button
            type="button"
            aria-label={`Back to ${back.label}`}
            onClick={back.onBack}
            className="-ml-[8px] inline-flex h-target items-center gap-[4px] rounded-control px-[8px] text-meta text-fg-dim hover:bg-hover"
          >
            {back.icon}
            <span>{back.label}</span>
          </button>
        ) : null}
        <h3 className="text-drawer-title leading-[24px]">{title}</h3>
        <button
          type="button"
          aria-label={`Close ${closeName ?? title}`}
          onClick={onClose}
          className="-mr-[12px] ml-auto inline-flex size-target items-center justify-center rounded-control text-fg-dim hover:bg-hover"
        >
          {closeIcon}
        </button>
      </div>
    </div>
  );
}
