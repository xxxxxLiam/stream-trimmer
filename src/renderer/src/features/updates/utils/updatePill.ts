/**
 * File: updatePill.ts
 * Path: src/renderer/src/features/updates/utils/updatePill.ts
 * Description: What the top bar's update pill says and does for each update status. Only a ready
 *   update shows a pill: "Restart to update" (installs on quit), or on the unsigned Mac build
 *   "Get version <x>", which opens the installer download. It never restarts while a clip is
 *   being made. This is the one place that reads the update payload; if the shape changes, edit here.
 */
import type { UpdateStatusPayload } from "../../../../../common/ipc/electronApi";

export type UpdateStatusState = UpdateStatusPayload | { state: "idle" };

export type UpdatePill =
  | { kind: "restart"; label: string; disabledReason?: string }
  | { kind: "download"; label: string; url: string };

export function updatePillFor(status: UpdateStatusState, clipBeingMade: boolean): UpdatePill | null {
  if (status.state === "ready") {
    return {
      kind: "restart",
      label: "Restart to update",
      ...(clipBeingMade ? { disabledReason: "Finish the clip being made first. The update installs when you quit." } : {}),
    };
  }
  if (status.state === "manual") {
    return { kind: "download", label: status.version ? `Get version ${status.version}` : "Get the new version", url: status.url };
  }
  return null;
}
