/**
 * File: useTipsController.ts
 * Path: src/renderer/src/features/tips/hooks/useTipsController.ts
 * Description: The one hook the tips screen part uses. Holds on/off and the seen list (saved on this
 *   machine), picks the one tip to show once a video is loaded and its control is on screen, steps
 *   through it, and replays the tips of the panels that are open. Never two at once.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { TIPS, type TipStep } from "../utils/tipRegistry";
import { findTarget } from "../utils/findTarget";
import {
  TIPS_ON_KEY,
  TIPS_SEEN_KEY,
  forgetOpen,
  markSeen,
  nextTip,
  normalizeSeen,
  type Seen,
} from "../utils/tipsSeen";

const present = (selector: string) =>
  typeof document !== "undefined" && !!document.querySelector(selector);

export function useTipsController(ready: boolean) {
  const [on, setOn] = useState<boolean>(
    () => readSetting<boolean>(TIPS_ON_KEY, true) !== false,
  );
  const [seen, setSeen] = useState<Seen>(() =>
    normalizeSeen(readSetting<unknown>(TIPS_SEEN_KEY, {})),
  );
  const [step, setStep] = useState(0);
  const [tick, setTick] = useState(0);
  // Help's "Show me in Clipr": one answer's steps run as tip cards on the real controls. Never saved as seen.
  const [tour, setTour] = useState<TipStep[] | null>(null);
  const [tourStep, setTourStep] = useState(0);
  const missing = useRef(0);

  // Panels open and close without telling us, so look again once a second.
  useEffect(() => {
    if (!ready || !(on || tour)) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ready, on, tour]);

  const tip = ready && !tour ? nextTip(TIPS, seen, on, present) : null;
  void tick;

  const endTour = useCallback(() => {
    setTour(null);
    setTourStep(0);
    // Focus comes back to the control Help was opened from.
    window.requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>("#ui-help-button")?.focus();
    });
  }, []);
  const startTour = useCallback((steps: TipStep[]) => {
    missing.current = 0;
    setTourStep(0);
    setTour(steps.length ? steps : null);
  }, []);

  // A step whose control is not on screen (a menu that did not open, a panel that is closed) is skipped after a moment.
  useEffect(() => {
    if (!tour) return;
    const s = tour[Math.min(tourStep, tour.length - 1)];
    if (findTarget(s.target, s.withText)) {
      missing.current = 0;
      return;
    }
    if (++missing.current < 3) return;
    missing.current = 0;
    if (tourStep + 1 < tour.length) setTourStep(tourStep + 1);
    else endTour();
  }, [tick, tour, tourStep, endTour]);

  const saveSeen = (next: Seen) => {
    setSeen(next);
    writeSetting(TIPS_SEEN_KEY, next);
  };
  const finish = useCallback(() => {
    if (tip) saveSeen(markSeen(seen, tip));
    setStep(0);
  }, [tip, seen]);
  const turnOff = useCallback(() => {
    setTour(null);
    setOn(false);
    writeSetting(TIPS_ON_KEY, false);
    setStep(0);
  }, []);
  const replay = useCallback(() => {
    setTour(null);
    setOn(true);
    writeSetting(TIPS_ON_KEY, true);
    setStep(0);
    saveSeen(forgetOpen(TIPS, seen, present));
  }, [seen]);

  const steps = tip?.steps ?? [];
  const current = Math.min(step, Math.max(0, steps.length - 1));
  const tc = tour ? Math.min(tourStep, tour.length - 1) : 0;
  return {
    on,
    replay,
    startTour,
    card: tour
      ? {
          tipId: "tour",
          longLabel: true,
          step: tc,
          total: tour.length,
          text: tour[tc].text,
          target: tour[tc].target,
          withText: tour[tc].withText,
          advanceOn: tour[tc].advanceOn,
          onNext: () => (tc + 1 < tour.length ? setTourStep(tc + 1) : endTour()),
          onBack: () => setTourStep(Math.max(0, tc - 1)),
          onDone: endTour,
          onTurnOff: turnOff,
        }
      : tip
      ? {
          tipId: tip.id,
          step: current,
          total: steps.length,
          text: steps[current].text,
          target: steps[current].target,
          advanceOn: steps[current].advanceOn,
          onNext: () =>
            current + 1 < steps.length ? setStep(current + 1) : finish(),
          onBack: () => setStep(Math.max(0, current - 1)),
          onDone: finish,
          onTurnOff: turnOff,
        }
      : null,
  };
}
