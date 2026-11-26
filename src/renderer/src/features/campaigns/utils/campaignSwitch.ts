/**
 * File: campaignSwitch.ts
 * Path: src/renderer/src/features/campaigns/utils/campaignSwitch.ts
 * Description: When opening a video would change the active campaign (board 03.2.54): whether to ask first, and the words.
 *   Asked until the person has pressed Open once or ticked "Don't show this again"; after that it only switches.
 */
export type SwitchTab = { id: string; campaignId?: string };

/** The campaigns involved when opening `targetId` from `currentId` would change campaign, else null. */
export function campaignSwitchOf(
  tabs: readonly SwitchTab[],
  currentId: string,
  targetId: string,
  known: (campaignId: string) => boolean,
): { from: string; to: string } | null {
  if (targetId === currentId) return null;
  const from = tabs.find((t) => t.id === currentId)?.campaignId;
  const to = tabs.find((t) => t.id === targetId)?.campaignId;
  if (!from || !to || from === to || !known(from) || !known(to)) return null;
  return { from, to };
}

export const switchTitle = (to: string) => `Switch to ${to}?`;
export const switchLine = (video: string, to: string, from: string) =>
  `${video} is in ${to}. Opening it changes your active campaign from ${from} to ${to}.`;
export const SWITCH_SEEN_KEY = "clipper.campaignSwitchSeen";
