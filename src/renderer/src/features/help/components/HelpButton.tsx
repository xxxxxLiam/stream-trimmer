/**
 * File: HelpButton.tsx
 * Path: src/renderer/src/features/help/components/HelpButton.tsx
 * Description: The "?" button. ALWAYS the last item top right of the header, on
 *   every screen (BUILD-SPEC section 7). Toggles the help drawer; shortcut ⌘/.
 *
 * Why the real button is portalled (F-3): the header is its own stacking context (z-30), so
 * nothing inside it can rise above the z-50 layers that are drawn over the app: the Copy blocks
 * and Symbols panels, the first-run sign-in modal and the restoring overlay. The "?" was
 * unreachable in exactly the moments a new user reaches for it. A placeholder keeps the slot in
 * the header's layout; the live button is drawn on document.body over the placeholder, above those
 * layers and below nothing.
 *
 * AF2-3: the sign-in gate is the one overlay it must NOT sit over. The gate marks the whole app
 * (the help drawer included) inert, so a "?" drawn above it opened a drawer that was fully
 * visible, dead, and click-through onto the gate beneath. While the gate is up the "?" is not
 * offered at all; the gate has its own way out, and help returns the moment it is dismissed. It follows the slot (resize, wrap, DOM changes), so it stays the last
 * item top right wherever the header puts it.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isSignInGateUp, useYouTubeConnection } from "../../../shared/utils/youtubeConnection";
import { IconHelp } from "../../../shared/components/icons";

/** Above every overlay (z-50) and the spotlight ring (z-60). */
export const HELP_BUTTON_Z = 70;

type Slot = { top: number; left: number; width: number; height: number };

function sameSlot(a: Slot | null, b: Slot): boolean {
  return !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** The label an "on" top bar button shows beside its icon. */
function HelpOnLabel() {
  return <span className="icon-label ml-2 text-body">Help</span>;
}

export default function HelpButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const gateUp = isSignInGateUp(useYouTubeConnection());

  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setSlot((prev) => (sameSlot(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(document.documentElement);
    if (el.parentElement) ro?.observe(el.parentElement);
    // The header wraps when a chip appears or grows (an update notice, a sign-in label).
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    mo?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      ro?.disconnect();
      mo?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <span ref={holder} aria-hidden="true" className="icon-btn pointer-events-none invisible">
        {open ? <HelpOnLabel /> : null}
      </span>
      {slot && !gateUp && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              id="ui-help-button"
              className="icon-btn"
              onClick={onToggle}
              aria-label="Help"
              aria-expanded={open}
              aria-controls="ui-help-drawer"
              title="Help (⌘/)"
              style={{
                position: "fixed",
                top: slot.top,
                left: slot.left,
                width: slot.width,
                height: slot.height,
                zIndex: HELP_BUTTON_Z,
              }}
            >
              <IconHelp />
              {open ? <HelpOnLabel /> : null}
            </button>,
            document.body,
          )
        : null}
    </>
  );
}
