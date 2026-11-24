/**
 * File: ClipButton.tsx
 * Path: src/renderer/src/features/player/components/ClipButton.tsx
 * Description: The split Clip button. The label always says Clip; the arrow opens where clips go
 *   (Save to folder or one editor, ticked, sticky). When Clip can't run it is dimmed but still
 *   focusable, and the reason shows on hover and on keyboard focus.
 */
import { useId } from "react";
import SplitButton from "../../../shared/components/SplitButton";
import Tooltip from "../../../shared/components/Tooltip";
import { Menu, MenuItem, MenuLabel } from "../../../shared/components/Menu";
import { useClipController } from "../hooks/useClipController";
import { CaretIcon } from "./TransportIcons";

export default function ClipButton({ openUp = false, listenForKey = false }: { openUp?: boolean; listenForKey?: boolean }) {
  const c = useClipController({ listenForKey });
  const tipId = useId();
  return (
    <span id="ui-cut" className="group relative inline-flex">
      <SplitButton
        label="Clip"
        onPress={c.clip}
        onOpenMenu={c.toggleMenu}
        menuIcon={<CaretIcon />}
        disabled={!!c.reason}
        glowing={c.hasRange && !c.reason}
        menuExpanded={c.menuOpen}
        describedBy={c.reason ? tipId : undefined}
      />
      {c.reason ? (
        <Tooltip
          id={tipId}
          className={`pointer-events-none absolute right-0 z-20 hidden group-focus-within:inline-flex group-hover:inline-flex ${openUp ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {c.reason}
        </Tooltip>
      ) : null}
      {c.menuOpen ? (
        <Menu
          label="Where clips go"
          onKeyDown={(e) => {
            if (e.key === "Escape") c.closeMenu();
          }}
          className={`absolute right-0 z-30 ${openUp ? "bottom-full mb-2" : "top-full mt-2"}`}
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
