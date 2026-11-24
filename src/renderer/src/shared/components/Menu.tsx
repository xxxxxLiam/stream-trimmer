/**
 * File: Menu.tsx
 * Path: src/renderer/src/shared/components/Menu.tsx
 * Description: The popup menu surface and its parts (label, radio/plain items, separator). Raised
 *   surface, strong hairline, 14px radius; items are 44px rows, the selected one sits on hover.
 *   Arrow-key movement belongs to the screen that owns the menu.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cx } from "../utils/cx";

export function Menu({ label, className, ...rest }: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={cx("box-border w-[300px] rounded-panel border border-hairlineStrong bg-raised p-1.5", className)}
      {...rest}
    />
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-1.5 text-meta text-fg-dim">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="mx-1 my-1.5 h-px bg-hairline" />;
}

export type MenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Radio items show a tick slot; plain items do not. */
  checked?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
};

export function MenuItem({ checked, leading, trailing, children, className, type = "button", ...rest }: MenuItemProps) {
  const radio = checked !== undefined;
  return (
    <div className={cx("rounded-control", checked && "bg-hover")}>
      <button
        type={type}
        role={radio ? "menuitemradio" : "menuitem"}
        aria-checked={radio ? checked : undefined}
        className={cx("flex h-target w-full items-center gap-2.5 rounded-control px-2.5 text-left text-body text-fg hover:bg-hover", className)}
        {...rest}
      >
        {radio ? <span className="inline-flex w-3.5 text-ice">{checked ? leading : null}</span> : leading}
        {children}
        {trailing ? <span className="ml-auto text-meta text-fg-dim">{trailing}</span> : null}
      </button>
    </div>
  );
}
