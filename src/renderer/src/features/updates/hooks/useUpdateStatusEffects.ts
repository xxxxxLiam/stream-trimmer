/**
 * File: useUpdateStatusEffects.ts
 * Path: src/renderer/src/features/updates/hooks/useUpdateStatusEffects.ts
 * Description: The ready update, from the main process: asked once at start (a window that opens
 *   late still sees it) and then pushed.
 */
import { useEffect, useState } from "react";
import type { UpdateReady } from "../../../../../common/types/updates";

export function useUpdateStatusEffects(): UpdateReady | null {
  const [ready, setReady] = useState<UpdateReady | null>(null);
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.onUpdateReady) return;
    let live = true;
    void api.getUpdateReady?.().then((r) => live && r && setReady(r));
    const off = api.onUpdateReady(setReady);
    return () => {
      live = false;
      off();
    };
  }, []);
  return ready;
}
