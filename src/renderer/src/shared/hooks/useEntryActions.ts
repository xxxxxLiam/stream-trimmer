/**
 * File: useEntryActions.ts
 * Path: src/renderer/src/shared/hooks/useEntryActions.ts
 * Description: The row actions Export and History share for a clip already saved: show the file
 *   in Finder / File Explorer, and send it to the editor chosen in the Clip menu (when none is
 *   chosen, it shows the file instead, so the button always does something).
 */
import { useCallback } from "react";
import { runAfterCutting } from "../../features/handoff/components/EditorHandoff";
import { useClipperContext } from "../../modules/clipper/hooks/ClipperContext";
import { usePanelHost } from "../../modules/layout/hooks/PanelHostContext";
import type { DownloadEntry } from "../utils/downloads";

export function useEntryActions() {
  const { revealDownload } = useClipperContext();
  const { editorHandoff } = usePanelHost();

  const show = useCallback((entry: DownloadEntry) => revealDownload(entry), [revealDownload]);

  const inEditor = useCallback(
    (entry: DownloadEntry) => {
      if (!entry.path) return;
      const settings = editorHandoff.settings;
      if (settings.afterCutting === "nothing" && !settings.openCapCut && !settings.capcutDropDir) {
        revealDownload(entry);
        return;
      }
      void runAfterCutting(settings, {
        campaignId: entry.campaignId ?? editorHandoff.campaignId,
        campaignName: entry.campaign ?? editorHandoff.campaignName,
        sourceTitle: entry.videoTitle ?? editorHandoff.sourceTitle,
        clipsDir: entry.dir ?? editorHandoff.clipsDir,
        clips: [
          {
            id: entry.clipId ?? entry.id,
            label: entry.label,
            path: entry.path,
            segments: entry.segments ?? [],
            sourceUrl: entry.videoId ? `https://www.youtube.com/watch?v=${entry.videoId}` : undefined,
            sourceTitle: entry.videoTitle || undefined,
            cutAt: entry.savedAt || undefined,
          },
        ],
      });
    },
    [editorHandoff, revealDownload],
  );

  return { show, inEditor };
}
