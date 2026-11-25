/**
 * File: useEntryActions.ts
 * Path: src/renderer/src/shared/hooks/useEntryActions.ts
 * Description: The row actions Export and History share for a clip already saved: show the file
 *   in Finder / File Explorer, and send it to the editor chosen in the Clip menu (when that is
 *   Save to folder, it shows the file instead, so the button always does something).
 */
import { useCallback } from "react";
import { runAfterCutting } from "../../features/handoff/components/EditorHandoff";
import { getClipDestination } from "../../features/player/hooks/useClipDestination";
import { useClipperContext } from "../../modules/clipper/hooks/ClipperContext";
import { usePanelHost } from "../../modules/layout/hooks/PanelHostContext";
import type { DownloadEntry } from "../utils/downloads";
import { planInEditor } from "../utils/inEditor";

export function useEntryActions() {
  const { revealDownload } = useClipperContext();
  const { editorHandoff } = usePanelHost();

  const show = useCallback((entry: DownloadEntry) => revealDownload(entry), [revealDownload]);

  const inEditor = useCallback(
    (entry: DownloadEntry) => {
      if (!entry.path) return;
      // The same path a new clip takes: the Clip-menu editor decides, not the stored setting.
      const plan = planInEditor(entry, editorHandoff, getClipDestination());
      if (!plan) {
        revealDownload(entry);
        return;
      }
      void runAfterCutting(plan.settings, plan.ctx);
    },
    [editorHandoff, revealDownload],
  );

  return { show, inEditor };
}
