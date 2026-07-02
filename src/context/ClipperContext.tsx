/**
 * File: ClipperContext.tsx
 * Path: src/context/ClipperContext.tsx
 * Description: React context that exposes the useClipper state to child components.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useClipper, type ClipperState } from "../hooks/useClipper";

const ClipperContext = createContext<ClipperState | null>(null);

export function ClipperProvider({ children }: { children: ReactNode }) {
  const state = useClipper();
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