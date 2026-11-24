/**
 * File: PopoverMenu.tsx
 * Path: src/renderer/src/modules/layout/components/PopoverMenu.tsx
 * Description: A small button-and-menu used by the tab strips (+ and the group menu) and the
 *   Panels menu. Keyboard: Enter or arrow opens, arrows move, Enter picks, Esc closes.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "react-bootstrap-icons";
import { useDismissEffects } from "../../../shared/hooks/useDismissEffects";

export type MenuItem =
  | { kind: "separator"; key: string }
  | {
      kind?: "item";
      key: string;
      label: string;
      /** A tick shows when set (true or false keeps the room so labels line up). */
      checked?: boolean;
      disabled?: boolean;
      /** Keep the menu open after picking, for a list of ticks. */
      keepOpen?: boolean;
      onSelect: () => void;
    };

export type PopoverMenuProps = {
  /** DOM id of the trigger button (help tour anchors). */
  id?: string;
  /** Accessible name of the trigger button. */
  label: string;
  /** What the trigger shows (an icon). */
  children: ReactNode;
  items: MenuItem[];
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  /** Where the menu opens relative to the trigger. Default below. */
  side?: "below" | "above";
  triggerClassName?: string;
  /** Shown above the items in the open menu. */
  heading?: string;
  /** Marks the trigger as pressed while the menu is open (top bar active state). */
  pressedWhenOpen?: boolean;
  /** Show the label beside the icon while the menu is open (the top bar's "on" look). */
  labelWhenOpen?: boolean;
};

export default function PopoverMenu({
  id,
  label,
  children,
  items,
  align = "end",
  side = "below",
  triggerClassName = "icon-btn",
  heading,
  pressedWhenOpen = true,
  labelWhenOpen = false,
}: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissEffects(root, open, close);

  const rows = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
  useEffect(() => {
    if (open) rows()[0]?.focus();
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = rows();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") list[(at + 1) % list.length]?.focus();
    else if (e.key === "ArrowUp") list[(at - 1 + list.length) % list.length]?.focus();
    else if (e.key === "Home") list[0]?.focus();
    else if (e.key === "End") list[list.length - 1]?.focus();
    else if (e.key === "Escape") {
      close();
      trigger.current?.focus();
      e.stopPropagation();
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className="relative flex">
      <button
        ref={trigger}
        id={id}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-pressed={pressedWhenOpen ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
        {open && labelWhenOpen ? <span className="icon-label ml-2 text-body">{label}</span> : null}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`surface-raised absolute z-40 min-w-[200px] border border-hairlineStrong py-1 ${
            side === "below" ? "top-full mt-1" : "bottom-full mb-1"
          } ${align === "end" ? "right-0" : "left-0"}`}
        >
          {heading ? <div className="px-3 py-1 text-meta text-fg-dim">{heading}</div> : null}
          {items.map((item) =>
            item.kind === "separator" ? (
              <div key={item.key} role="separator" className="my-1 border-t border-hairline" />
            ) : (
              <button
                key={item.key}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={item.checked}
                disabled={item.disabled}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-fg hover:bg-hover disabled:text-disabled"
                onClick={() => {
                  item.onSelect();
                  if (item.keepOpen) return;
                  close();
                  trigger.current?.focus();
                }}
              >
                {item.checked === undefined ? null : (
                  <span className="flex w-4 shrink-0 justify-center text-ice">{item.checked ? <Check size={16} /> : null}</span>
                )}
                <span>{item.label}</span>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
