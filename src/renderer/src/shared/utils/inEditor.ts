/**
 * File: inEditor.ts
 * Path: src/renderer/src/shared/utils/inEditor.ts
 * Description: What "In editor" on a saved clip does: with Save to folder chosen in the Clip menu it
 *   shows the file; with an editor chosen it sends that clip the way a new clip is sent.
 */
import { settingsWithDestination, type ClipDestination } from "../../features/player/utils/clipDestination";
import type { HandoffContext } from "../../features/handoff/components/EditorHandoff";
import type { DownloadEntry } from "./downloads";
import { DEFAULT_EDITOR_SETTINGS, type EditorHandoffSettings } from "./fcpxml";

export type InEditorHost = {
  settings: EditorHandoffSettings;
  campaignId: string | null;
  campaignName?: string;
  sourceTitle?: string;
  clipsDir?: string;
  /** Any campaign's Final Cut settings, so a clip goes out with its own campaign's library, event and layout. */
  settingsFor?: (campaignId: string) => EditorHandoffSettings;
};

/** Null: just show the file. Otherwise the settings and context to send the clip with. */
export function planInEditor(
  entry: DownloadEntry,
  host: InEditorHost,
  destination: ClipDestination,
): { settings: EditorHandoffSettings; ctx: HandoffContext } | null {
  if (!entry.path || destination === "folder") return null;
  // The clip's own campaign decides, never the active one: a Nova clip reopened while Acme is open goes
  // to Nova's library and event.
  const other = Boolean(entry.campaignId) && entry.campaignId !== host.campaignId;
  const own = other ? (host.settingsFor?.(entry.campaignId as string) ?? DEFAULT_EDITOR_SETTINGS) : host.settings;
  return {
    settings: settingsWithDestination(own, destination),
    ctx: {
      campaignId: entry.campaignId ?? host.campaignId,
      campaignName: entry.campaign ?? (other ? undefined : host.campaignName),
      sourceTitle: entry.videoTitle ?? host.sourceTitle,
      clipsDir: entry.dir ?? host.clipsDir,
      clips: [
        {
          // One name: the saved file's own, so Final Cut shows "Hook" and not "A-01 - Hook.mp4".
          id: entry.label.replace(/\.[^.]+$/, "").trim() || (entry.clipId ?? entry.id),
          label: undefined,
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
