/**
 * File: useUpdateStatusEffects.ts
 * Path: src/renderer/src/features/updates/hooks/useUpdateStatusEffects.ts
 * Description: The ready update, from the main process: asked once at start (a window that opens
 *   late still sees it) and then pushed; plus the download percent while it runs.
 */
import { useEffect, useState } from "react";
import type { UpdateReady } from "../../../../../common/types/updates";

/** The ready update, and while one is still coming down, how far along it is (whole percent), else null. */
export function useUpdateStatusEffects(): { ready: UpdateReady | null; downloading: number | null } {
  const [ready, setReady] = useState<UpdateReady | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.onUpdateReady) return;
    let live = true;
    void api.getUpdateReady?.().then((r) => live && r && setReady(r));
    const off = api.onUpdateReady(setReady);
    // F-16: the download's progress arrives on its own channel; without this nothing shows while it runs.
    const offStatus = api.onUpdateStatus?.((s) => {
      setDownloading(s.state === "downloading" ? Math.max(0, Math.min(100, Math.round(s.percent))) : null);
    });
    return () => {
      live = false;
      off();
      offStatus?.();
    };
  }, []);
  return { ready, downloading };
}
