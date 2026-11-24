/**
 * File: useToolsStatusQueries.ts
 * Path: src/renderer/src/features/start/hooks/useToolsStatusQueries.ts
 * Description: Whether the download tools (yt-dlp, ffmpeg) are ready, being updated, or cannot be
 *   fixed. The engine has no status endpoint yet, so until it does this reports "ready" and the two
 *   other states are reached only through the `override` argument (tests, parity fixtures).
 *   When the Engine thread adds the endpoint, only this file changes.
 */
import { useCallback, useState } from "react";
import type { ToolsStatus } from "../utils/startUtils";

export function useToolsStatusQueries(override?: ToolsStatus) {
  const [status, setStatus] = useState<ToolsStatus>("ready");
  const retry = useCallback(() => setStatus("checking"), []);
  return { status: override ?? status, retry };
}
