/**
 * File: Spotlight.tsx
 * Path: src/renderer/src/features/help/components/Spotlight.tsx
 * Description: Highlights the real control for the current help step (BUILD-SPEC
 *   section 7): a 2px accent ring, a soft accent glow and a numbered badge, anchored
 *   to a DOM element by id. It is a fixed, pointer-events-none layer: no dimming, no
 *   modal, nothing that intercepts a click, and the ring sits OUTSIDE the element's
 *   box so it neither reflows nor covers it. If the anchor is absent or hidden it
 *   renders nothing and reports that through `onPresence`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Box = { top: number; left: number; width: number; height: number };

/** Gap between the element and the ring, so the ring never covers the control. */
const GAP = 4;

function measure(id: string): Box | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function same(a: Box | null, b: Box | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** Live viewport rect of the element with this id, or null when absent/hidden. */
export function useAnchorBox(anchorId: string | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    if (!anchorId) {
      setBox(null);
      return;
    }
    const update = () => {
      frame.current = 0;
      const next = measure(anchorId);
      setBox((prev) => (same(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frame.current) frame.current = requestAnimationFrame(update);
    };
    update();

    const el = document.getElementById(anchorId);
    // Bring an off-screen control into view without animating.
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });

    window.addEventListener("resize", schedule);
    // Capture so scrolling any inner panel re-measures.
    window.addEventListener("scroll", schedule, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (el) ro?.observe(el);
    // The control may render later (another screen, a tab); watch the DOM for it.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      ro?.disconnect();
      mo.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [anchorId]);

  return box;
}

export type SpotlightProps = {
  /** DOM id of the control to highlight. */
  anchorId: string | null;
  /** Step number shown in the badge. */
  n: number;
  /** Called whenever the anchor appears or disappears. */
  onPresence?: (present: boolean) => void;
};

export default function Spotlight({ anchorId, n, onPresence }: SpotlightProps) {
  const box = useAnchorBox(anchorId);
  const present = box !== null;

  const cb = useRef(onPresence);
  cb.current = onPresence;
  useEffect(() => {
    cb.current?.(present);
  }, [present, anchorId]);

  if (!box) return null;

  // Badge sits on the top-left corner, flipped inside the viewport if it would clip.
  const badgeSize = 20;
  const badgeTop = Math.max(2, box.top - GAP - badgeSize / 2 - 2);
  const badgeLeft = Math.max(2, box.left - GAP - badgeSize / 2 - 2);

  return (
    <div aria-hidden="true" data-help-spotlight={anchorId ?? ""} className="pointer-events-none fixed inset-0 z-[60]">
      <div
        className="absolute rounded-[10px]"
        style={{
          top: box.top - GAP,
          left: box.left - GAP,
          width: box.width + GAP * 2,
          height: box.height + GAP * 2,
          // Ring and glow only: the middle stays transparent and untouched.
          boxShadow: "0 0 0 2px var(--accent), 0 0 18px 2px var(--accent-50)",
        }}
      />
      <span
        className="absolute flex items-center justify-center rounded-full font-mono text-meta font-medium"
        style={{
          top: badgeTop,
          left: badgeLeft,
          width: badgeSize,
          height: badgeSize,
          background: "var(--accent)",
          color: "var(--c-on-accent)",
          boxShadow: "0 0 0 2px var(--c-bg)",
        }}
      >
        {n}
      </span>
    </div>
  );
}
