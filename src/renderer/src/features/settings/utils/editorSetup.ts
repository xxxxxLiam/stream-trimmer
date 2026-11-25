/**
 * File: editorSetup.ts
 * Path: src/renderer/src/features/settings/utils/editorSetup.ts
 * Description: Picking an editor in the Clip arrow menu opens that editor's setup in the campaign's settings
 *   sidebar (Liam, 25 Nov), because it cannot be configured properly otherwise. It opens when the editor is not set
 *   up for this campaign and never again once it is, or once the user chose "Skip for now". Pure: no storage, no React.
 */
import { hasEditorPage } from "./editorSummary";

/** `startAt` prefix that opens Settings on a campaign's editor page. */
export const START_AT_EDITOR = "@editor:";
export const editorStartAt = (campaignId: string): string => `${START_AT_EDITOR}${campaignId}`;
export const editorStartCampaign = (startAt: string | null): string | null =>
  startAt?.startsWith(START_AT_EDITOR) ? startAt.slice(START_AT_EDITOR.length) : null;

/** Per campaign, the editors whose setup was already shown or skipped. */
export type SetupSeen = Record<string, string[]>;

export const wasSeen = (seen: SetupSeen, campaignId: string, editor: string): boolean => (seen[campaignId] ?? []).includes(editor);

export const markSeen = (seen: SetupSeen, campaignId: string, editor: string): SetupSeen =>
  wasSeen(seen, campaignId, editor) ? seen : { ...seen, [campaignId]: [...(seen[campaignId] ?? []), editor] };

/**
 * Whether choosing `editor` should open the setup. Final Cut is set up once it has a library; Premiere and Resolve
 * have nothing per campaign to set, so their page is shown once. CapCut and Save to folder have no page.
 */
export function needsEditorSetup(editor: string, s: { campaignId: string | null; fcpLibrary?: string; seen: SetupSeen }): boolean {
  if (!s.campaignId || !hasEditorPage(editor)) return false;
  if (wasSeen(s.seen, s.campaignId, editor)) return false;
  if (editor === "finalcut" && s.fcpLibrary) return false;
  return true;
}
