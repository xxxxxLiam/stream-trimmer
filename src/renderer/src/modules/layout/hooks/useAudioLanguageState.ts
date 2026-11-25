/**
 * File: useAudioLanguageState.ts
 * Path: src/renderer/src/modules/layout/hooks/useAudioLanguageState.ts
 * Description: Which audio languages the next Clip makes, remembered per campaign
 *   ("clipper.audioLanguages"). Stored as dub codes, plus "-<code>" for an unticked original.
 */
import { useCallback, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";

const KEY = "clipper.audioLanguages";
const NO_CAMPAIGN = "_";

export function useAudioLanguageState(campaignId: string | null) {
  const [all, setAll] = useState<Record<string, string[]>>(() => readSetting<Record<string, string[]>>(KEY, {}));
  const id = campaignId ?? NO_CAMPAIGN;
  const selected = all[id];
  const setSelected = useCallback(
    (next: string[]) => {
      setAll((prev) => {
        const merged = { ...prev, [id]: next };
        writeSetting(KEY, merged);
        return merged;
      });
    },
    [id],
  );
  return [selected, setSelected] as const;
}
