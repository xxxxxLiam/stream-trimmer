/**
 * File: useUpdateStatusEffects.ts
 * Path: src/renderer/src/features/updates/hooks/useUpdateStatusEffects.ts
 * Description: Follows the main process's update status (window.electronAPI.onUpdateStatus).
 */
import { useEffect, useState } from "react";
import type { UpdateStatusState } from "../utils/updatePill";

export function useUpdateStatusEffects(): UpdateStatusState {
  const [status, setStatus] = useState<UpdateStatusState>({ state: "idle" });
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.onUpdateStatus) return;
    return api.onUpdateStatus(setStatus);
  }, []);
  return status;
}
