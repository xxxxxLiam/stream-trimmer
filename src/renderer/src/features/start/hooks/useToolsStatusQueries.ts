/**
 * File: useToolsStatusQueries.ts
 * Path: src/renderer/src/features/start/hooks/useToolsStatusQueries.ts
 * Description: Whether the download tools (yt-dlp, ffmpeg) are ready, still being checked, or cannot
 *   be fixed, from the engine's GET /api/tools. It asks on mount, asks again every 1.5 s while the
 *   answer is "checking", and "Try again" asks once more. `override` pins a state for tests and
 *   parity fixtures.
 */
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../../../shared/utils/clip";
import { toolsStatusFrom, type ToolsStatus } from "../utils/startUtils";

export function useToolsStatusQueries(override?: ToolsStatus) {
  const [status, setStatus] = useState<ToolsStatus>("ready");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (override) return;
    let alive = true;
    let timer: number | undefined;
    const ask = async () => {
      let next: ToolsStatus = "ready";
      try {
        const res = await fetch(apiUrl("/api/tools"));
        if (res.ok) next = toolsStatusFrom(await res.json());
      } catch {
        // No engine to ask (a plain browser): do not block the screen.
      }
      if (!alive) return;
      setStatus(next);
      if (next === "checking") timer = window.setTimeout(ask, 1500);
    };
    void ask();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [override, attempt]);

  const retry = useCallback(() => {
    setStatus("checking");
    setAttempt((n) => n + 1);
  }, []);
  return { status: override ?? status, retry };
}
