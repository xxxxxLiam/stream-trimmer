/**
 * File: CampaignContext.tsx
 * Path: src/context/CampaignContext.tsx
 * Description: Campaign model (BUILD-SPEC section 5) and provider SHELL. Phase A
 *   ships only the types and the empty first-run state. CRUD, persistence and the
 *   saveDir -> clipsDir/dataDir migration are owned by B4 (src/lib/campaigns.ts).
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** A source-video range already used by a published clip. Seconds. */
export type UsedRange = { start: number; end: number; clipId: string };

export type Campaign = {
  id: string;
  name: string;
  /** Length band, seconds. Shown under the stitched-length readout. */
  targetMinSec: number;
  targetMaxSec: number;
  hardMaxSec: number;
  /** e.g. "{prefix}-{videoId}-{nn}" */
  clipIdPattern: string;
  format: "mp4" | "mp3";
  quality: string;
  /** Where cut clips go (deliverables). */
  clipsDir: string;
  /** Where channel-export CSVs go (research). MUST differ from clipsDir. */
  dataDir: string;
  usedRanges: Record<string, UsedRange[]>;
};

export type CampaignState = {
  /** Empty on first run. Nothing is shipped or hardcoded. */
  campaigns: Campaign[];
  activeId: string | null;
  /** null until the user creates or selects one. */
  active: Campaign | null;
  // TODO(B4): replaced by campaigns agent. Phase A only needs read access
  // plus a selector so the header chip can render.
  setActiveId: (id: string | null) => void;
};

const CampaignContext = createContext<CampaignState | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  // TODO(B4): load from src/lib/campaigns.ts and persist; add create/update/remove.
  const [campaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const value = useMemo<CampaignState>(
    () => ({
      campaigns,
      activeId,
      active: campaigns.find((c) => c.id === activeId) ?? null,
      setActiveId,
    }),
    [campaigns, activeId],
  );

  return (
    <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignState {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaign must be used inside CampaignProvider");
  return ctx;
}
