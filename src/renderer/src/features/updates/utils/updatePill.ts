/**
 * File: updatePill.ts
 * Path: src/renderer/src/features/updates/utils/updatePill.ts
 * Description: What the top bar's update pill says for the main process's UpdateReady. "Restart to
 *   update" (mode restart), or on the unsigned Mac build "Get version <x>" that opens the installer
 *   download (mode download). Whether a clip is being made is the main process's call: a restart it
 *   during a clip answers { ok: true, waiting: true } and Clipr restarts by itself when the clips finish.
 */
import type { RestartToUpdateResult, UpdateReady } from "../../../../../common/types/updates";

export type UpdatePill =
  | { kind: "restart"; label: string }
  | { kind: "download"; label: string; url: string };

export function updatePillFor(ready: UpdateReady | null): UpdatePill | null {
  if (!ready) return null;
  if (ready.mode === "download") return { kind: "download", label: `Get version ${ready.version}`, url: ready.url };
  return { kind: "restart", label: "Restart to update" };
}

/** The sentence under a refused restart, or null when it worked. */
export function restartRefusal(result: RestartToUpdateResult): string | null {
  if (result.ok) return null;
  if (result.reason === "nothing-ready") return null;
  return "The update could not restart the app. It will install when you quit.";
}

/** The quiet pill while the new version downloads (no click: nothing to do yet). */
export function downloadingLabel(percent: number): string {
  if (!Number.isFinite(percent) || percent < 0) return "Downloading update";
  return `Downloading update ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}
