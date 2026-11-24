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

export type PanelHost = {
  /** Playhead, in seconds of the open video. */
  playhead: number;
  /** Make a clip from marked segments (Clip button). */
  cutSegments: (segments: Segment[]) => void;
  /** Make a clip from a waiting moment in Export (resolves true once the file is saved). */
  cutBanked: (clip: BankedClip, projectName?: string) => Promise<boolean>;
  /** The "after cutting" hand-off settings for the open campaign. */
  editorHandoff: EditorHandoffProps;
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
