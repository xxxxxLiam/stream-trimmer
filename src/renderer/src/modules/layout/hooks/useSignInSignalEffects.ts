/**
 * File: useSignInSignalEffects.ts
 * Path: src/renderer/src/modules/layout/hooks/useSignInSignalEffects.ts
 * Description: The bottom bar's sign-in signal from the main process: true when no browser sign-in
 *   works and clips would come out at 360p. False until the browser sweep reports, so nothing
 *   flashes at launch.
 */
import { useEffect, useState } from "react";

export function useSignInSignalEffects(): boolean {
  const [low, setLow] = useState(false);
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.onSignInSignal) return;
    let live = true;
    void api.getSignInSignal?.().then((s) => live && setLow(s.lowQualityWithoutSignIn));
    const off = api.onSignInSignal((s) => setLow(s.lowQualityWithoutSignIn));
    return () => {
      live = false;
      off();
    };
  }, []);
  return low;
}
