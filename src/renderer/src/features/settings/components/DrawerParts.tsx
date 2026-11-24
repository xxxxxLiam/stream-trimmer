/**
 * File: DrawerParts.tsx
 * Path: src/renderer/src/features/settings/components/DrawerParts.tsx
 * Description: The small pieces every Settings view is built from, as drawn on Settings.dc.html: the
 *   44px header with Back and Close, a section label, a chevron row, a switch row and the outlined
 *   button. Logic-free.
 */
import type { ReactNode } from "react";

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "right" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
  </svg>
);

export function DrawerHeader({ title, back, onBack, onClose }: { title: string; back?: string; onBack?: () => void; onClose: () => void }) {
  return (
    <div className="flex h-target items-center gap-2">
      {back && (
        <button type="button" aria-label={`Back to ${back}`} onClick={onBack} className="-ml-2 inline-flex h-target items-center gap-1 rounded-control px-2 text-meta text-fg-dim hover:bg-hover">
          <Chevron dir="left" />
          <span>{back}</span>
        </button>
      )}
      <h2 className="m-0 flex-1 truncate text-drawer-title">{title}</h2>
      <button type="button" aria-label="Close Settings" onClick={onClose} className="-mr-3 inline-flex h-target w-target items-center justify-center rounded-control text-fg-dim hover:bg-hover">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function SectionLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return <span className={`pb-1 text-meta text-fg-dim ${first ? "pt-2" : "pt-4"}`}>{children}</span>;
}

export function ChevronRow({ label, value, onOpen, divider }: { label: string; value: string; onOpen: () => void; divider?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={onOpen}
      className={`flex h-target items-center gap-2 bg-transparent text-left text-body text-fg ${divider ? "border-b border-hairline" : ""}`}
    >
      <span className="flex-1">{label}</span>
      <span className="text-meta text-fg-dim">{value}</span>
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

export const drawerFrame = "flex flex-col gap-1 rounded-panel border border-hairline bg-panel px-4 pb-5 pt-4";
