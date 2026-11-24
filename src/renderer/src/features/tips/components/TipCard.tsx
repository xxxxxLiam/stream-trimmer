/**
 * File: TipCard.tsx
 * Path: src/renderer/src/features/tips/components/TipCard.tsx
 * Description: The first-use pointer card: a dotted Ice ring on the control, and a small card beside
 *   it with one sentence, "1 of 3", Next or Got it, and a "Turn off tips" link on every tip. Esc
 *   closes; Enter and the arrow keys move between steps.
 */
import { useEffect, useLayoutEffect, useState } from "react";

export type TipCardProps = {
  step: number;
  total: number;
  text: string;
  target: string;
  onNext: () => void;
  onBack: () => void;
  onDone: () => void;
  onTurnOff: () => void;
};

type Box = { top: number; left: number; width: number; height: number };

export default function TipCard({ step, total, text, target, onNext, onBack, onDone, onTurnOff }: TipCardProps) {
  const [box, setBox] = useState<Box | null>(null);
  const last = step + 1 >= total;

  useLayoutEffect(() => {
    const el = document.querySelector(target);
    if (!el) return setBox(null);
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      else if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onBack, onDone]);

  if (!box) return null;
  const below = box.top + box.height + 8;
  const top = below + 150 > window.innerHeight ? Math.max(8, box.top - 150) : below;
  const left = Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - 288));
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[60] rounded-control border border-dotted border-ice"
        style={{ top: box.top - 3, left: box.left - 3, width: box.width + 6, height: box.height + 6 }}
      />
      <div
        role="dialog"
        aria-label="Tip"
        className="fixed z-[60] flex w-[280px] flex-col gap-2 rounded-panel border border-hairlineStrong bg-raised p-4"
        style={{ top, left }}
      >
        <span className="text-meta text-fg-dim">
          {step + 1} of {total}
        </span>
        <p className="m-0 text-body text-fg">{text}</p>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="h-target text-meta text-fg-dim hover:text-fg" onClick={onTurnOff}>
            Turn off tips
          </button>
          <button
            type="button"
            autoFocus
            className="h-target rounded-control border border-hairlineStrong px-4 text-body text-fg hover:bg-hover"
            onClick={onNext}
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
