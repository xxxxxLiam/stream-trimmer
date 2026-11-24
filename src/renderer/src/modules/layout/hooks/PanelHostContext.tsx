/**
 * File: PanelHostContext.tsx
 * Path: src/renderer/src/modules/layout/hooks/PanelHostContext.tsx
 * Description: What the shell hands to every panel, since a panel takes no props. The workspace
 *   screen provides it once; a panel reads it with usePanelHost(). Add a field here (and where it
 *   is provided in App.tsx) when a panel needs something only the screen owns.
 */
import { createContext, useContext } from "react";
import type { BankedClip } from "../../../shared/utils/bank";
import type { Segment } from "../../../shared/utils/segments";
import type { EditorHandoffProps } from "../../../features/handoff/components/EditorHandoff";

/** Where the day stands for the open campaign; the preview's end card reads it. */
export type DayState = {
  campaignName: string | null;
  /** The next source video with moments waiting, or null. */
  next: { title: string; waiting: number } | null;
  made: number;
  /** The campaign's clips a day, or null when none is set. */
  quota: number | null;
};

export type PanelHost = {
  /** Playhead, in seconds of the open video. */
  playhead: number;
  /** Make a clip from marked segments (Clip button). */
  cutSegments: (segments: Segment[]) => void;
  /** Make a clip from a waiting moment in Export (resolves true once the file is saved). */
  cutBanked: (clip: BankedClip, projectName?: string) => Promise<boolean>;
  /** The "after cutting" hand-off settings for the open campaign. */
  editorHandoff: EditorHandoffProps;
  /** Where the day stands, for the end card. */
  day: DayState;
  /** Open the next video that has moments waiting (Shift N). */
  onNextVideo: () => void;
  /** Open the Export panel, which is the bank. */
  onOpenBank: () => void;
  /** Go to the link box to open a video. */
  onOpenVideo: () => void;
  /** Open the Symbols and phrases window. */
  openSymbols: () => void;
};

const PanelHostContext = createContext<PanelHost | null>(null);

export const PanelHostProvider = PanelHostContext.Provider;

export function usePanelHost(): PanelHost {
  const host = useContext(PanelHostContext);
  if (!host) throw new Error("usePanelHost must be used inside the workspace screen");
  return host;
}
