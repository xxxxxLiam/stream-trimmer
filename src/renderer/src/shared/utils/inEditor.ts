/**
 * File: inEditor.ts
 * Path: src/renderer/src/shared/utils/inEditor.ts
 * Description: What "In editor" on a saved clip does: with Save to folder chosen in the Clip menu it
 *   shows the file; with an editor chosen it sends that clip the way a new clip is sent.
 */
import { settingsWithDestination, type ClipDestination } from "../../features/player/utils/clipDestination";
import type { HandoffContext } from "../../features/handoff/components/EditorHandoff";
import type { DownloadEntry } from "./downloads";
import type { EditorHandoffSettings } from "./fcpxml";

export type InEditorHost = {
  settings: EditorHandoffSettings;
  campaignId: string | null;
  campaignName?: string;
  sourceTitle?: string;
  clipsDir?: string;
};

/** Null: just show the file. Otherwise the settings and context to send the clip with. */
export function planInEditor(
  entry: DownloadEntry,
  host: InEditorHost,
  destination: ClipDestination,
): { settings: EditorHandoffSettings; ctx: HandoffContext } | null {
  if (!entry.path || destination === "folder") return null;
  return {
    settings: settingsWithDestination(host.settings, destination),
    ctx: {
      campaignId: entry.campaignId ?? host.campaignId,
      campaignName: entry.campaign ?? host.campaignName,
      sourceTitle: entry.videoTitle ?? host.sourceTitle,
      clipsDir: entry.dir ?? host.clipsDir,
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
    },
  };
}
