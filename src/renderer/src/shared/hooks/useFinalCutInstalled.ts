/**
 * File: useFinalCutInstalled.ts
 * Path: src/renderer/src/shared/hooks/useFinalCutInstalled.ts
 * Description: True on a Mac with Final Cut Pro installed. Add to Final Cut and Select clips are hidden everywhere else.
 */
import { useEffect, useState } from "react";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function useFinalCutInstalled(): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if (!IS_MAC) return;
    let live = true;
    void window.electronAPI?.editor?.installed().then((r) => live && setInstalled(Boolean(r.apps?.finalcut)));
    return () => {
      live = false;
    };
  }, []);
  return IS_MAC && installed;
}
