/**
 * File: useHandoffNotice.ts
 * Path: src/renderer/src/features/clips/hooks/useHandoffNotice.ts
 * Description: The editor handoff of the clip just made, as the Export panel shows it: the notice
 *   (a failure or "opened the editor and showed the file"), Show in folder, and Send to another
 *   editor. The answer comes from the handoff module; nothing else listens for it.
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  getAfterCuttingOutcome,
  runAfterCutting,
  subscribeAfterCutting,
} from "../../handoff/components/EditorHandoff";
import { settingsWithDestination, type ClipDestination } from "../../player/utils/clipDestination";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { getDownloads } from "../../../shared/utils/downloads";
import { handoffNoticeFor } from "../utils/handoffNotice";

export function useHandoffNotice(campaignId: string | null) {
  const { revealDownload } = useClipperContext();
  const answer = useSyncExternalStore(subscribeAfterCutting, getAfterCuttingOutcome, getAfterCuttingOutcome);
  const notice = handoffNoticeFor(answer, campaignId);

  const showInFolder = useCallback(() => {
    const path = notice?.clipPath;
    if (!path) return;
    const entry = getDownloads().find((d) => d.path === path);
    if (entry) revealDownload(entry);
    else void window.electronAPI?.editor?.reveal(path);
  }, [notice, revealDownload]);

  const sendTo = useCallback(
    (destination: ClipDestination) => {
      if (!answer) return;
      void runAfterCutting(settingsWithDestination(answer.settings, destination), answer.ctx);
    },
    [answer],
  );

  return { handoffNotice: notice, showInFolder, sendTo };
}
