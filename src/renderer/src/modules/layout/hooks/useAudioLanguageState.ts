/**
 * File: useAudioLanguageState.ts
 * Path: src/renderer/src/modules/layout/hooks/useAudioLanguageState.ts
 * Description: Which audio languages the next Clip makes, remembered per campaign
 *   ("clipper.audioLanguages"). Stored as dub codes, plus "-<code>" for an unticked original.
 *   One shared store, so the export bar and the timeline's audio lanes always show the same ticks.
 */
import { useCallback, useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";

const KEY = "clipper.audioLanguages";
const NO_CAMPAIGN = "_";

let all: Record<string, string[]> | null = null;
const listeners = new Set<() => void>();

const current = () => (all ??= readSetting<Record<string, string[]>>(KEY, {}));
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function useAudioLanguageState(campaignId: string | null) {
  const id = campaignId ?? NO_CAMPAIGN;
  const selected = useSyncExternalStore(subscribe, () => current()[id]);
  const setSelected = useCallback(
    (next: string[]) => {
      all = { ...current(), [id]: next };
      writeSetting(KEY, all);
      listeners.forEach((fn) => fn());
    },
    [id],
  );
  return [selected, setSelected] as const;
}
