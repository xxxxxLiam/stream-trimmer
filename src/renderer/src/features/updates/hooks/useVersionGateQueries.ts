/**
 * File: useVersionGateQueries.ts
 * Path: src/renderer/src/features/updates/hooks/useVersionGateQueries.ts
 * Description: The minimum-version gate's answer from the main process, asked once at start. The app shows straight away;
 *   only a "blocked" answer ever changes anything. No answer, an error or an old preload means "not blocked".
 */
import { useEffect, useState } from "react";
import type { VersionGateStatus } from "../../../../../common/types/updates";

export function useVersionGateQueries(): VersionGateStatus | null {
  const [status, setStatus] = useState<VersionGateStatus | null>(null);
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.getVersionGate) return;
    let live = true;
    void api
      .getVersionGate()
      .then((s) => live && s?.blocked === true && typeof s.required === "string" && setStatus(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return status;
}
