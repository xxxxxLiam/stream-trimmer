/**
 * File: DrawerRows.tsx
 * Path: src/renderer/src/shared/components/DrawerRows.tsx
 * Description: The small pieces every drawer view (Settings, Help) is built from, as drawn on Settings.dc.html: the
 *   44px header with Back and Close, a section label, a chevron row, a switch row and the outlined
 *   button. Logic-free.
 */
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "react-bootstrap-icons";
import { DrawerHeader as SharedHeader } from "./Drawer";

const Chevron = ({ dir }: { dir: "left" | "right" }) => {
  const Svg = dir === "right" ? ChevronRight : ChevronLeft;
  return <Svg width={16} height={16} aria-hidden="true" focusable="false" />;
};

const CloseIcon = () => <X width={16} height={16} aria-hidden="true" focusable="false" />;

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
  return <span className={`pb-[4px] text-meta text-fg-dim ${first ? "pt-[8px]" : "pt-[16px]"}`}>{children}</span>;
}

export function ChevronRow({ label, value, onOpen, divider, listItem }: { label: string; value: string; onOpen: () => void; divider?: boolean; /** Marks the row for arrow-key movement inside a list. */ listItem?: boolean }) {
  return (
    <button
      type="button"
      aria-label={value ? `${label}: ${value}` : label}
      data-help-item={listItem || undefined}
      onClick={onOpen}
      className={`flex items-center gap-[8px] bg-transparent text-left text-body leading-[normal] text-fg ${divider ? "h-target border-b border-hairline" : "h-target"}`}
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
      className={`flex items-center gap-[8px] bg-transparent text-left text-body leading-[normal] text-fg ${divider ? "h-target border-b border-hairline" : "h-target"}`}
    >
      <span className="flex-1">{label}</span>
      <span aria-hidden="true" className={`inline-flex h-[20px] w-[36px] flex-none rounded-[10px] p-[2px] ${on ? "justify-end bg-ice" : "justify-start bg-hover"}`}>
        <span className="h-[16px] w-[16px] rounded-full bg-bg" />
      </span>
    </button>
  );
}

export const outlineButton =
  "h-target rounded-control border border-hairlineStrong bg-raised px-[16px] text-body leading-[normal] text-fg hover:bg-hover";

export const drawerBody = "mt-[4px] flex flex-col gap-[4px]";
/** Text views (an answer, the report form): 12px between blocks. */
export const drawerBodyRoomy = "mt-[12px] flex flex-col gap-[12px]";
