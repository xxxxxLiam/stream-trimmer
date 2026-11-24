/**
 * File: useHistoryCache.ts
 * Path: src/renderer/src/features/downloads/hooks/useHistoryCache.ts
 * Description: How much room unfinished downloads take, and clearing them. Kept from the old
 *   saved-files panel: a failed cut resumes from these, so people need a way to free the space.
 */
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../../../shared/utils/clip";

export function useHistoryCache(refreshKey: unknown) {
  const [bytes, setBytes] = useState(0);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/cache/usage"));
      if (!res.ok) return;
      setBytes(((await res.json()) as { bytes: number }).bytes);
    } catch {
      setBytes(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const clear = useCallback(async () => {
    setClearing(true);
    try {
      await fetch(apiUrl("/api/cache/clear"), { method: "POST" });
    } catch {
      /* the usage line refreshes either way */
    } finally {
      setClearing(false);
      void refresh();
    }
  }, [refresh]);

  return { bytes, clearing, clear };
}
