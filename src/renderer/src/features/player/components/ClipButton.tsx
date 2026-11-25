/**
 * File: ClipButton.tsx
 * Path: src/renderer/src/features/player/components/ClipButton.tsx
 * Description: The split Clip button. The label always says Clip; the arrow opens where clips go
 *   (Save to folder or one editor, ticked, sticky). When Clip can't run it is dimmed but still
 *   focusable, and the reason shows on hover and on keyboard focus.
 */
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import SplitButton from "../../../shared/components/SplitButton";
import Tooltip from "../../../shared/components/Tooltip";
import { Menu, MenuItem, MenuLabel } from "../../../shared/components/Menu";
import { useClipController } from "../hooks/useClipController";
import { menuTarget } from "../utils/menuKeys";
import { CaretIcon } from "./TransportIcons";

export default function ClipButton({ openUp = false, listenForKey = false }: { openUp?: boolean; listenForKey?: boolean }) {
  const c = useClipController({ listenForKey });
  const tipId = useId();
  const arrowRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);

  // Opening moves focus to the ticked item; closing returns it to the arrow.
  useEffect(() => {
    if (c.menuOpen) {
      const rows = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
      const ticked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      (ticked ?? rows?.[0])?.focus();
    } else if (wasOpen.current && (!document.activeElement || document.activeElement === document.body)) {
      arrowRef.current?.focus();
    }
    wasOpen.current = c.menuOpen;
  }, [c.menuOpen]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!c.menuOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      c.closeMenu();
      arrowRef.current?.focus();
      return;
    }
    const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const to = menuTarget(rows.indexOf(document.activeElement as HTMLElement), rows.length, e.key);
    if (to !== null) {
      e.preventDefault();
      rows[to]?.focus();
    }
  };

  return (
    <span id="ui-cut" className="group relative inline-flex" onKeyDown={onKeyDown}>
      <SplitButton
        label="Clip"
        onPress={c.clip}
        onOpenMenu={c.toggleMenu}
        menuIcon={<CaretIcon />}
        disabled={!!c.reason}
        glowing={c.hasRange && !c.reason}
        menuExpanded={c.menuOpen}
        menuRef={arrowRef}
        describedBy={c.reason ? tipId : undefined}
      />
      {c.reason ? (
        <Tooltip
          id={tipId}
          className={`pointer-events-none absolute right-[0px] z-20 hidden group-focus-within:inline-flex group-hover:inline-flex ${openUp ? "bottom-full mb-[10px]" : "top-full mt-[4px]"}`}
        >
          {c.reason}
        </Tooltip>
      ) : null}
      {c.menuOpen ? (
        <Menu
          ref={menuRef}
          label="Where clips go"
          className={`absolute right-[0px] z-30 ${openUp ? "bottom-full mb-[8px]" : "top-full mt-[8px]"}`}
        >
          <MenuLabel>Where clips go</MenuLabel>
          {c.destinations.map((d) => (
            <MenuItem
              key={d.id}
              checked={c.destination === d.id}
              leading={
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
              }
              onClick={() => c.setDestination(d.id)}
            >
              {d.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </span>
  );
}
