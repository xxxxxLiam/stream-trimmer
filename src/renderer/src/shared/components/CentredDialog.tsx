/**
 * File: CentredDialog.tsx
 * Path: src/renderer/src/shared/components/CentredDialog.tsx
 * Description: The one overlay shape in the app. Symbols, Copy blocks and Help are centred
 *   dialogs over the workspace rather than panels pinned to the right edge. A 400–560px
 *   column squeezes its contents into a strip while most of a desktop screen sits empty,
 *   and three panels that could overlap needed clearance maths between them
 *   (useDrawerClearance) to stay out of each other's way. One centred shape, one at a time,
 *   removes both problems.
 *
 *   Owns the scrim, Esc, click-outside, initial focus and a focusable scroll region — the
 *   last of these because the scrollbar is hidden app-wide, so every scrollable area still
 *   needs a keyboard route to what is inside it.
 */
import { useEffect, useRef, type ReactNode } from "react";

export type CentredDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Shown as the dialog's heading and its accessible name. */
  title: string;
  /** Optional controls shown in the header, between the title and Close. */
  aside?: ReactNode;
  /** Tailwind max-width class for the panel. */
  widthClass?: string;
  /** Put on the panel, for tests and for the help catalogue's anchors. */
  id?: string;
  /**
   * False keeps the app behind usable: no scrim, clicks pass through everywhere except the
   * panel, and an outside click does not close. Symbols uses this for "Keep on top", which
   * exists precisely so you can click into the transcript with the palette still up.
   */
  modal?: boolean;
  children: ReactNode;
};

export default function CentredDialog({
  open,
  onClose,
  title,
  aside,
  widthClass = "max-w-[720px]",
  id,
  modal = true,
  children,
}: CentredDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Capture, so a dialog closes before any Esc handler deeper in the app reacts.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    // A field that asked for focus (autoFocus) keeps it; the panel takes it only when nothing inside does.
    if (open && !panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-covers-app=""
      className={`fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto p-4 sm:p-8 ${
        modal ? "bg-bg-overlay-50" : "pointer-events-none"
      }`}
      onMouseDown={(e) => {
        if (modal && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal={modal || undefined}
        aria-label={title}
        tabIndex={-1}
        className={`surface-panel pointer-events-auto my-auto flex max-h-[88vh] w-full ${widthClass} flex-col rounded-panel border border-hairline shadow-drawer outline-none`}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3">
          <h2 className="text-section font-medium text-fg">{title}</h2>
          <div className="min-w-0 flex-1">{aside}</div>
          <button
            type="button"
            className="icon-btn shrink-0"
            aria-label={`Close ${title}`}
            title="Close (Esc)"
            onClick={onClose}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div
          tabIndex={0}
          aria-label={`${title}, scrollable`}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 outline-none"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
