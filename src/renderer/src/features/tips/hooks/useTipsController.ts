/**
 * File: useTipsController.ts
 * Path: src/renderer/src/features/tips/hooks/useTipsController.ts
 * Description: The one hook the tips screen part uses. Holds on/off and the seen list (saved on this
 *   machine), picks the one tip to show once a video is loaded and its control is on screen, steps
 *   through it, and replays the tips of the panels that are open. Never two at once.
 */
import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { TIPS } from "../utils/tipRegistry";
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

  // Panels open and close without telling us, so look again once a second.
  useEffect(() => {
    if (!ready || !on) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ready, on]);

  const tip = ready ? nextTip(TIPS, seen, on, present) : null;
  void tick;

  const saveSeen = (next: Seen) => {
    setSeen(next);
    writeSetting(TIPS_SEEN_KEY, next);
  };
  const finish = useCallback(() => {
    if (tip) saveSeen(markSeen(seen, tip));
    setStep(0);
  }, [tip, seen]);
  const turnOff = useCallback(() => {
    setOn(false);
    writeSetting(TIPS_ON_KEY, false);
    setStep(0);
  }, []);
  const replay = useCallback(() => {
    setOn(true);
    writeSetting(TIPS_ON_KEY, true);
    setStep(0);
    saveSeen(forgetOpen(TIPS, seen, present));
  }, [seen]);

  const steps = tip?.steps ?? [];
  const current = Math.min(step, Math.max(0, steps.length - 1));
  return {
    on,
    replay,
    card: tip
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
