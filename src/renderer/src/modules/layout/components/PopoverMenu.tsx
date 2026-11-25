/**
 * File: PopoverMenu.tsx
 * Path: src/renderer/src/modules/layout/components/PopoverMenu.tsx
 * Description: A small button-and-menu used by the tab strips (+ and the group menu) and the
 *   Panels menu. Keyboard: Enter or arrow opens, arrows move, Enter picks, Esc closes.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check2 } from "react-bootstrap-icons";
import { useDismissEffects } from "../../../shared/hooks/useDismissEffects";

export type MenuItem =
  | { kind: "separator"; key: string }
  | { kind: "heading"; key: string; label: string }
  | { kind: "note"; key: string; label: string }
  | {
      kind?: "item";
      key: string;
      label: string;
      /** A tick shows when set (true or false keeps the room so labels line up). */
      checked?: boolean;
      disabled?: boolean;
      /** A small icon before the label. */
      icon?: ReactNode;
      /** Dim text at the right edge of the row. */
      detail?: string;
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
  align?: "start" | "end" | "center";
  /** Where the menu opens relative to the trigger. Default below. */
  side?: "below" | "above";
  triggerClassName?: string;
  /** Shown above the items in the open menu. */
  heading?: string;
  /** Fixed menu width in px (the Panels menu is 260 on the board); default is a 200px minimum. */
  menuWidth?: number;
  /** Ticks drawn as boxes (filled Ice when on) instead of a bare tick, for a list of choices. */
  boxes?: boolean;
  /** Marks the trigger as pressed while the menu is open (top bar active state). */
  pressedWhenOpen?: boolean;
  /** Show the label beside the icon while the menu is open (the top bar's "on" look). */
  labelWhenOpen?: boolean;
  /** The small-menu look (4px padding, 8px corners, 5px item corners) used by Export's + menu. */
  tight?: boolean;
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
  menuWidth,
  boxes = false,
  pressedWhenOpen = true,
  tight = false,
  labelWhenOpen = false,
}: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const hasTicks = items.some((i) => i.kind !== "separator" && i.kind !== "heading" && i.kind !== "note" && i.checked !== undefined);
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
        {open && labelWhenOpen ? <span className="icon-label ml-[8px] text-body">{label}</span> : null}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={menuWidth ? { width: menuWidth } : undefined}
          className={`absolute z-40 border border-hairlineStrong bg-raised ${tight ? "rounded-control p-[4px]" : "rounded-panel p-[6px]"} ${menuWidth ? "" : "min-w-[200px]"} ${
            side === "below" ? "top-full mt-[2px]" : "bottom-full mb-[2px]"
          } ${align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"}`}
        >
          {heading ? <div className="px-[10px] pb-[4px] pt-[6px] text-meta text-fg-dim">{heading}</div> : null}
          {items.map((item) =>
            item.kind === "separator" ? (
              <div key={item.key} role="separator" className="mx-[4px] my-[6px] h-px bg-hairline" />
            ) : item.kind === "note" ? (
              <div key={item.key} className="px-[10px] pb-[6px] pt-[4px] text-meta leading-[1.5] text-fg-dim">
                {item.label}
              </div>
            ) : item.kind === "heading" ? (
              <div key={item.key} className="px-[10px] pb-[4px] pt-[6px] text-meta text-fg-dim">
                {item.label}
              </div>
            ) : (
              <button
                key={item.key}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={item.checked}
                disabled={item.disabled}
                className={`flex h-[44px] w-full items-center gap-[10px] ${tight ? "rounded-chip" : "rounded-control"} pr-[10px] text-left text-body text-fg hover:bg-hover disabled:text-disabled ${
                  item.checked === undefined && hasTicks ? "pl-[36px]" : "pl-[10px]"
                }`}
                onClick={() => {
                  item.onSelect();
                  if (item.keepOpen) return;
                  close();
                  trigger.current?.focus();
                }}
              >
                {item.checked === undefined ? null : (
                  boxes ? (
                    <span
                      aria-hidden
                      className={`inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-chip ${
                        item.checked ? "bg-ice" : "border-[1.5px] border-hairlineStrong"
                      }`}
                    >
                      {item.checked ? (
                        <Check2 width={11} height={11} className="text-bg" aria-hidden="true" focusable="false" />
                      ) : null}
                    </span>
                  ) : (
                  <span className="flex w-[16px] shrink-0 justify-center">
                    {item.checked ? (
                      <Check2 width={12} height={12} className="text-ice" aria-hidden="true" focusable="false" />
                    ) : null}
                  </span>
                  )
                )}
                {item.icon ? <span aria-hidden className="flex-none">{item.icon}</span> : null}
                <span>{item.label}</span>
                {item.detail ? <span className="ml-auto text-meta text-fg-dim">{item.detail}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
