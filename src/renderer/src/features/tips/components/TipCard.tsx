/**
 * File: TipCard.tsx
 * Path: src/renderer/src/features/tips/components/TipCard.tsx
 * Description: The first-use pointer card: everything else dimmed, an Ice ring on the control, and a small card beside
 *   it with one sentence, "1 of 3", Next or Got it, "Skip step" and Next or Got it, and a "Turn off tips" link on every tip. A step that names a
 *   key or a control finishes when the person does it. Keys act only while focus is inside the card, so
 *   Enter on any other button keeps its own job.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TipStep } from "../utils/tipRegistry";
import { findTarget } from "../utils/findTarget";
import { clickAdvances, keyAdvances, typingInField } from "../utils/tipAdvance";

export type TipCardProps = {
  step: number;
  total: number;
  text: string;
  target: string;
  withText?: string;
  /** Help's Show me names its steps "Step 1 of 2"; a first-use tip says "1 of 3". */
  longLabel?: boolean;
  advanceOn?: TipStep["advanceOn"];
  onNext: () => void;
  onBack: () => void;
  onDone: () => void;
  onTurnOff: () => void;
};

type Box = { top: number; left: number; width: number; height: number };

export default function TipCard({
  step,
  total,
  text,
  target,
  withText,
  longLabel,
  advanceOn,
  onNext,
  onBack,
  onDone,
  onTurnOff,
}: TipCardProps) {
  const [box, setBox] = useState<Box | null>(null);
  const last = step + 1 >= total;

  // Measure now, then keep looking: a menu the step opens, or a panel that moves, changes where the control is.
  useLayoutEffect(() => {
    let first = true;
    const measure = () => {
      const el = findTarget(target, withText);
      if (!el) return setBox((b) => (b ? null : b));
      if (first) el.scrollIntoView({ block: "nearest" });
      first = false;
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height ? b : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    measure();
    const t = window.setInterval(measure, 300);
    return () => window.clearInterval(t);
  }, [target, withText]);

  const next = useRef(onNext);
  next.current = onNext;

  // The real action finishes the step. The action itself is never cancelled; the card moves on a beat later.
  useEffect(() => {
    if (!advanceOn) return;
    const step: TipStep = { target, withText, text, advanceOn };
    let t: number | undefined;
    const go = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => next.current(), 150);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!typingInField(e.target) && keyAdvances(step, e)) go();
    };
    const onClick = (e: MouseEvent) => {
      if (clickAdvances(step, e.target as Element | null, findTarget(target, withText))) go();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [advanceOn, target, withText, text]);

  // Only while focus is inside the card. Enter needs no handler: it presses the focused button.
  const onCardKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onDone();
    } else if (e.key === "ArrowRight") onNext();
    else if (e.key === "ArrowLeft") onBack();
  };

  if (!box) return null;
  const below = box.top + box.height + 8;
  const top =
    below + 150 > window.innerHeight ? Math.max(8, box.top - 150) : below;
  const left = Math.min(
    Math.max(8, box.left),
    Math.max(8, window.innerWidth - 288),
  );
  return (
    <>
      {/* Liam, 25 Nov: everything but the focused control is dimmed, so the step is noticed. Four flat panels leave a
          cut-out round the control; none takes a click, so the control and the page stay usable. */}
      {[
        { top: 0, left: 0, width: "100%", height: Math.max(0, box.top - 3) },
        { top: box.top + box.height + 3, left: 0, width: "100%", height: "100%" },
        { top: box.top - 3, left: 0, width: Math.max(0, box.left - 3), height: box.height + 6 },
        { top: box.top - 3, left: box.left + box.width + 3, width: "100%", height: box.height + 6 },
      ].map((r, i) => (
        <div key={i} data-tip-scrim="" aria-hidden="true" className="pointer-events-none fixed z-[59] bg-bg-overlay-75" style={r} />
      ))}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[60] rounded-control border-2 border-ice"
        style={{
          top: box.top - 3,
          left: box.left - 3,
          width: box.width + 6,
          height: box.height + 6,
        }}
      />
      <div
        role="dialog"
        data-nonblocking=""
        aria-label="Tip"
        className="fixed z-[60] flex w-[280px] flex-col gap-[8px] rounded-panel border border-hairlineStrong bg-raised p-[16px]"
        style={{ top, left }}
        onKeyDown={onCardKey}
      >
        <span className="text-meta text-fg-dim">
          {longLabel ? `Step ${step + 1} of ${total}` : `${step + 1} of ${total}`}
        </span>
        <p className="m-[0px] text-body text-fg">{text}</p>
        <div className="flex items-center justify-between gap-[8px]">
          <button
            type="button"
            className="h-target text-meta text-fg-dim hover:text-fg"
            onClick={onTurnOff}
          >
            Turn off tips
          </button>
          <div className="flex items-center gap-[8px]">
            {!last && (
              <button
                type="button"
                className="h-target text-meta text-fg-dim hover:text-fg"
                onClick={onNext}
              >
                Skip step
              </button>
            )}
            <button
              type="button"
              autoFocus
              className="h-target rounded-control border border-hairlineStrong px-[16px] text-body text-fg hover:bg-hover"
              onClick={onNext}
            >
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
