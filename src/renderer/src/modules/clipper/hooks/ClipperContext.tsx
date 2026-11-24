/**
 * File: ClipperContext.tsx
 * Path: src/renderer/src/modules/clipper/hooks/ClipperContext.tsx
 * Description: React context that exposes the useClipperController state to child components.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useClipperController, type ClipperState } from "./useClipperController";

const ClipperContext = createContext<ClipperState | null>(null);

export function ClipperProvider({ children }: { children: ReactNode }) {
  const state = useClipperController();
  return (
    <ClipperContext.Provider value={state}>{children}</ClipperContext.Provider>
  );
}

export function useClipperContext(): ClipperState {
  const ctx = useContext(ClipperContext);
  if (!ctx)
    throw new Error("useClipperContext must be used inside ClipperProvider");
  return ctx;
}