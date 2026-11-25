/**
 * File: ActionRow.tsx
 * Path: src/renderer/src/shared/components/ActionRow.tsx
 * Description: The one list row for Videos, Export and History ("List rows", option C). The row's content sits
 *   at the left and an always-visible ⋯ (32px, fg-dim) at the right; nothing appears or moves on hover. Opening
 *   the ⋯ makes the row taller: a hairline divider under the content, then the row's actions, one 44px line each
 *   (icon fg-dim, word fg; a destructive action is red text and icon, never a red fill). One row is open at a time;
 *   Esc or the ⋯ again closes it, and choosing an action closes it first.
 */
import { useEffect, type ReactNode } from "react";
import { cx } from "../utils/cx";
import { setOpenRow, useRowOpen } from "../utils/openRowStore";
import { IconMore } from "./rowIcons";

export type RowAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Red text and icon (Remove). */
  danger?: boolean;
  disabled?: boolean;
};

export type ActionRowProps = {
  /** Unique across the app ("video:abc", "clip:B01", "history:xyz"). */
  id: string;
  /** What the ⋯ speaks: "More for Big Deal". */
  name: string;
  actions: RowAction[];
  /** The row's own look (state border, fill, margins). */
  className?: string;
  children: ReactNode;
};

export default function ActionRow({ id, name, actions, className, children }: ActionRowProps) {
  const open = useRowOpen(id);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div data-open={open || undefined} className={cx("relative box-border rounded-control bg-raised", className)}>
      <div className="flex items-center">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          aria-label={`More for ${name}`}
          aria-expanded={open}
          onClick={() => setOpenRow(open ? null : id)}
          className="mr-[4px] inline-flex size-[32px] flex-none items-center justify-center rounded-control text-fg-dim hover:bg-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
        >
          <IconMore />
        </button>
      </div>
      {open && (
        <div role="menu" aria-label={`Actions for ${name}`} className="mx-[8px] border-t border-hairline pb-[4px] pt-[4px]">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpenRow(null);
                a.onSelect();
              }}
              className={cx(
                "flex h-[44px] w-full items-center gap-[10px] rounded-control px-[4px] text-left text-body leading-[normal] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost disabled:text-disabled",
                a.danger ? "text-error" : "text-fg",
                !a.danger && !a.disabled && "[&>svg]:text-fg-dim",
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
