/**
 * File: ChannelExportContext.tsx
 * Path: src/renderer/src/features/channelExport/hooks/ChannelExportContext.tsx
 * Description: Provides channel-exporter state, seeded from the clipper's destination/sign-in.
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  useChannelExportController,
  type ChannelExportState,
} from "./useChannelExportController";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";

const ChannelExportContext = createContext<ChannelExportState | null>(null);

export function ChannelExportProvider({ children }: { children: ReactNode }) {
  const { isElectron } = useClipperContext();
  // Exported CSVs go to the campaign's DATA folder, never the clips folder.
  const { folders } = useCampaign();
  const state = useChannelExportController({ isElectron, saveDir: folders.dataDir || null });
  return (
    <ChannelExportContext.Provider value={state}>
      {children}
    </ChannelExportContext.Provider>
  );
}

export function useChannelExportContext(): ChannelExportState {
  const ctx = useContext(ChannelExportContext);
  if (!ctx)
    throw new Error(
      "useChannelExportContext must be used inside ChannelExportProvider",
    );
  return ctx;
}
