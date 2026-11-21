/**
 * File: CampaignContext.tsx
 * Path: src/context/CampaignContext.tsx
 * Description: Campaigns (BUILD-SPEC section 5): create, edit, remove, switch, and the
 *   used-ranges record. Persisted through the settings store, so they survive restarts.
 *   Also owns the two folders: clipsDir (cut clips) and dataDir (channel-export CSVs).
 *   With no campaign yet, the folders fall back to the global defaults, which the
 *   desktop app seeds from the old single saveDir (see electron/settingsStore.cjs).
 *   Pure logic lives in src/lib/campaigns.ts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addUsedRanges,
  countUsedRanges,
  createCampaign,
  defaultDataDir,
  nextClipId as nextId,
  normalizeCampaigns,
  removeCampaign,
  removeUsedRangesFor,
  resolveActiveId,
  sameFolder,
  updateCampaign,
  usedRangesFor,
  type Campaign,
  type CampaignInput,
  type UsedRange,
} from "../lib/campaigns";
import { readSetting, writeSetting } from "../lib/persist";

export type { Campaign, UsedRange } from "../lib/campaigns";

const KEY_CAMPAIGNS = "clipper.campaigns";
const KEY_ACTIVE = "clipper.activeCampaign";
const KEY_CLIPS = "clipper.clipsDir";
const KEY_DATA = "clipper.dataDir";
const KEY_DATA_OK = "clipper.dataDirConfirmed";

export type Folders = {
  clipsDir: string;
  dataDir: string;
  /** False while dataDir is a suggestion the user has not yet confirmed. */
  dataDirConfirmed: boolean;
};

export type CampaignState = {
  /** Empty on first run. Nothing is shipped or hardcoded. */
  campaigns: Campaign[];
  activeId: string | null;
  /** null until the user creates or selects one. */
  active: Campaign | null;
  setActiveId: (id: string | null) => void;
  create: (input: CampaignInput) => Campaign;
  update: (id: string, patch: Partial<Omit<Campaign, "id" | "usedRanges">>) => void;
  remove: (id: string) => void;
  /** Effective folders: the active campaign's, else the global defaults. */
  folders: Folders;
  /** Returns a problem to show, or null. Clips and Data may not be the same folder. */
  setClipsDir: (dir: string) => string | null;
  setDataDir: (dir: string) => string | null;
  /**
   * Open the system folder dialog, then apply the choice. Resolves to a problem to show
   * (e.g. same folder as the other one), or null. Desktop app only; otherwise a no-op.
   */
  pickClipsDir: () => Promise<string | null>;
  pickDataDir: () => Promise<string | null>;
  /** Accept the suggested data folder as it is. */
  confirmDataDir: () => void;
  /** Used ranges for a video under the active campaign. */
  usedFor: (videoId: string) => UsedRange[];
  /** The next free clip id for a video under the active campaign, or null with none. */
  nextClipId: (videoId: string, otherIds?: readonly string[]) => string | null;
  /**
   * Append ranges to a campaign's used ranges (the no-reuse record). Pass `campaignId` when
   * the cut started under one campaign and finished after a switch; defaults to the active one.
   */
  recordUse: (
    videoId: string,
    ranges: ReadonlyArray<{ start: number; end: number }>,
    clipId: string,
    campaignId?: string,
  ) => void;
  /** Take a clip's ranges back out. */
  forgetUse: (videoId: string, clipId: string) => void;
  usedCount: number;
};

const CampaignContext = createContext<CampaignState | null>(null);

function loadFolders(): Folders {
  const clips =
    readSetting<string>(KEY_CLIPS, "") || readSetting<string>("clipper.saveDir", "") || "";
  const data = readSetting<string>(KEY_DATA, "") || (clips ? defaultDataDir(clips) : "");
  return {
    clipsDir: clips,
    dataDir: data,
    dataDirConfirmed: readSetting<boolean>(KEY_DATA_OK, true) !== false,
  };
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(() =>
    normalizeCampaigns(readSetting<unknown>(KEY_CAMPAIGNS, [])),
  );
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    resolveActiveId(
      normalizeCampaigns(readSetting<unknown>(KEY_CAMPAIGNS, [])),
      readSetting<string | null>(KEY_ACTIVE, null),
    ),
  );
  const [defaults, setDefaults] = useState<Folders>(loadFolders);

  // Always-fresh copies for callbacks that must not go stale between renders.
  const campaignsRef = useRef(campaigns);
  campaignsRef.current = campaigns;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const commit = useCallback((next: Campaign[]) => {
    campaignsRef.current = next;
    setCampaigns(next);
    writeSetting(KEY_CAMPAIGNS, next);
    const resolved = resolveActiveId(next, activeIdRef.current);
    if (resolved !== activeIdRef.current) {
      activeIdRef.current = resolved;
      setActiveIdState(resolved);
      writeSetting(KEY_ACTIVE, resolved);
    }
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    const next = resolveActiveId(campaignsRef.current, id);
    activeIdRef.current = next;
    setActiveIdState(next);
    writeSetting(KEY_ACTIVE, next);
  }, []);

  const saveDefaults = useCallback((next: Folders) => {
    defaultsRef.current = next;
    setDefaults(next);
    writeSetting(KEY_CLIPS, next.clipsDir || null);
    writeSetting(KEY_DATA, next.dataDir || null);
    writeSetting(KEY_DATA_OK, next.dataDirConfirmed);
  }, []);

  const create = useCallback(
    (input: CampaignInput) => {
      const d = defaultsRef.current;
      const explicitData = input.dataDir !== undefined;
      const clipsDir = input.clipsDir ?? d.clipsDir;
      const { campaigns: next, campaign } = createCampaign(campaignsRef.current, {
        ...input,
        clipsDir,
        dataDir: input.dataDir ?? (d.dataDir || undefined),
      });
      commit(next);
      setActiveId(campaign.id);
      // A data folder we picked for them is a suggestion until they say so.
      if (!explicitData && !d.dataDir && campaign.dataDir) {
        saveDefaults({ ...d, dataDir: campaign.dataDir, dataDirConfirmed: false });
      }
      return campaign;
    },
    [commit, saveDefaults, setActiveId],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<Campaign, "id" | "usedRanges">>) => {
      commit(updateCampaign(campaignsRef.current, id, patch));
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => commit(removeCampaign(campaignsRef.current, id)),
    [commit],
  );

  const active = useMemo(
    () => campaigns.find((c) => c.id === activeId) ?? null,
    [campaigns, activeId],
  );

  const folders = useMemo<Folders>(
    () => ({
      clipsDir: active?.clipsDir || defaults.clipsDir,
      dataDir: active?.dataDir || defaults.dataDir,
      dataDirConfirmed: defaults.dataDirConfirmed,
    }),
    [active, defaults],
  );

  const setClipsDir = useCallback(
    (dir: string) => {
      const d = defaultsRef.current;
      const a = campaignsRef.current.find((c) => c.id === activeIdRef.current);
      const data = a?.dataDir || d.dataDir;
      if (sameFolder(dir, data)) return "Clips and Data need different folders.";
      if (a) commit(updateCampaign(campaignsRef.current, a.id, { clipsDir: dir }));
      // New campaigns start from the last folder chosen.
      saveDefaults({ ...d, clipsDir: dir, dataDir: d.dataDir || defaultDataDir(dir) });
      return null;
    },
    [commit, saveDefaults],
  );

  const setDataDir = useCallback(
    (dir: string) => {
      const d = defaultsRef.current;
      const a = campaignsRef.current.find((c) => c.id === activeIdRef.current);
      const clips = a?.clipsDir || d.clipsDir;
      if (sameFolder(dir, clips)) return "Clips and Data need different folders.";
      if (a) commit(updateCampaign(campaignsRef.current, a.id, { dataDir: dir }));
      saveDefaults({ ...d, dataDir: dir, dataDirConfirmed: true });
      return null;
    },
    [commit, saveDefaults],
  );

  const pickClipsDir = useCallback(async () => {
    const dir = await window.electronAPI?.pickDirectory();
    return dir ? setClipsDir(dir) : null;
  }, [setClipsDir]);

  const pickDataDir = useCallback(async () => {
    const dir = await window.electronAPI?.pickDirectory();
    return dir ? setDataDir(dir) : null;
  }, [setDataDir]);

  const confirmDataDir = useCallback(() => {
    const d = defaultsRef.current;
    saveDefaults({ ...d, dataDirConfirmed: true });
  }, [saveDefaults]);

  const usedFor = useCallback(
    (videoId: string) => usedRangesFor(active, videoId),
    [active],
  );

  const nextClipId = useCallback(
    (videoId: string, otherIds: readonly string[] = []) =>
      active ? nextId(active, videoId, otherIds) : null,
    [active],
  );

  const recordUse = useCallback(
    (
      videoId: string,
      ranges: ReadonlyArray<{ start: number; end: number }>,
      clipId: string,
      campaignId?: string,
    ) => {
      const id = campaignId ?? activeIdRef.current;
      const list = campaignsRef.current;
      const a = list.find((c) => c.id === id);
      if (!a) return;
      commit(list.map((c) => (c.id === a.id ? addUsedRanges(c, videoId, ranges, clipId) : c)));
    },
    [commit],
  );

  const forgetUse = useCallback(
    (videoId: string, clipId: string) => {
      const id = activeIdRef.current;
      const list = campaignsRef.current;
      commit(list.map((c) => (c.id === id ? removeUsedRangesFor(c, videoId, clipId) : c)));
    },
    [commit],
  );

  // Another tab or window may have written the settings; nothing to do on the desktop app
  // (one renderer state), and the browser fallback re-reads on focus.
  useEffect(() => {
    const onFocus = () => {
      if (window.electronAPI) return;
      const next = normalizeCampaigns(readSetting<unknown>(KEY_CAMPAIGNS, []));
      if (JSON.stringify(next) !== JSON.stringify(campaignsRef.current)) {
        campaignsRef.current = next;
        setCampaigns(next);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const value = useMemo<CampaignState>(
    () => ({
      campaigns,
      activeId,
      active,
      setActiveId,
      create,
      update,
      remove,
      folders,
      setClipsDir,
      setDataDir,
      pickClipsDir,
      pickDataDir,
      confirmDataDir,
      usedFor,
      nextClipId,
      recordUse,
      forgetUse,
      usedCount: countUsedRanges(active),
    }),
    [
      campaigns,
      activeId,
      active,
      setActiveId,
      create,
      update,
      remove,
      folders,
      setClipsDir,
      setDataDir,
      pickClipsDir,
      pickDataDir,
      confirmDataDir,
      usedFor,
      nextClipId,
      recordUse,
      forgetUse,
    ],
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaign(): CampaignState {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaign must be used inside CampaignProvider");
  return ctx;
}
