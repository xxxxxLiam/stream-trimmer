/**
 * File: ChannelExportContext.tsx
 * Path: src/context/ChannelExportContext.tsx
 * Description: Provides channel-exporter state, seeded from the clipper's destination/sign-in.
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  useChannelExport,
  type ChannelExportState,
} from "../hooks/useChannelExport";
import { useClipperContext } from "./ClipperContext";

const ChannelExportContext = createContext<ChannelExportState | null>(null);

export function ChannelExportProvider({ children }: { children: ReactNode }) {
  const { isElectron, saveDir, useBrowserCookies, cookieBrowser } =
    useClipperContext();
  const state = useChannelExport({
    isElectron,
    saveDir,
    cookiesFromBrowser: useBrowserCookies ? cookieBrowser : undefined,
  });
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
