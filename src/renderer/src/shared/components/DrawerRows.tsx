/**
 * File: DrawerRows.tsx
 * Path: src/renderer/src/shared/components/DrawerRows.tsx
 * Description: The small pieces every drawer view (Settings, Help) is built from, as drawn on Settings.dc.html: the
 *   44px header with Back and Close, a section label, a chevron row, a switch row and the outlined
 *   button. Logic-free.
 */
import type { ReactNode } from "react";
import { DrawerHeader as SharedHeader } from "./Drawer";

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "right" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** The shared drawer header with its icons. `closeName` is what every view's close button announces. */
export function DrawerHeader({ title, back, onBack, onClose, closeName }: { title: string; back?: string; onBack?: () => void; onClose: () => void; closeName: string }) {
  return (
    <SharedHeader
      title={title}
      closeName={closeName}
      onClose={onClose}
      closeIcon={<CloseIcon />}
      back={back && onBack ? { label: back, onBack, icon: <Chevron dir="left" /> } : undefined}
    />
  );
}

export function SectionLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return <span className={`pb-1 text-meta text-fg-dim ${first ? "pt-2" : "pt-4"}`}>{children}</span>;
}

export function ChevronRow({ label, value, onOpen, divider, listItem }: { label: string; value: string; onOpen: () => void; divider?: boolean; /** Marks the row for arrow-key movement inside a list. */ listItem?: boolean }) {
  return (
    <button
      type="button"
      aria-label={value ? `${label}: ${value}` : label}
      data-help-item={listItem || undefined}
      onClick={onOpen}
      className={`flex h-target items-center gap-2 bg-transparent text-left text-body text-fg ${divider ? "border-b border-hairline" : ""}`}
    >
      <span className="flex-1">{label}</span>
      {value && <span className="text-meta text-fg-dim">{value}</span>}
      <span className="text-fg-dim"><Chevron dir="right" /></span>
    </button>
  );
}

export function SwitchRow({ label, on, onFlip, divider }: { label: string; on: boolean; onFlip: () => void; divider?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onFlip}
      className={`flex h-target items-center gap-2 bg-transparent text-left text-body text-fg ${divider ? "border-b border-hairline" : ""}`}
    >
      <span className="flex-1">{label}</span>
      <span aria-hidden="true" className={`inline-flex h-5 w-9 flex-none rounded-[10px] p-0.5 ${on ? "justify-end bg-ice" : "justify-start bg-hover"}`}>
        <span className="h-4 w-4 rounded-full bg-bg" />
      </span>
    </button>
  );
}

export const outlineButton =
  "h-target rounded-control border border-hairlineStrong bg-raised px-4 text-body text-fg hover:bg-hover";

export const drawerBody = "flex flex-col gap-1 px-5 pb-5 pt-3";
