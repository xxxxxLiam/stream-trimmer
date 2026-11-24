/**
 * File: useSettingsState.ts
 * Path: src/renderer/src/features/settings/hooks/useSettingsState.ts
 * Description: Reads and writes the drawer's own preferences (app switches and per-campaign quota,
 *   extra seconds and languages) in the persisted settings store.
 */
import { useCallback, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import {
  APP_PREFS_KEY,
  CAMPAIGN_PREFS_KEY,
  DEFAULT_CAMPAIGN_PREFS,
  normalizeAppPrefs,
  normalizeCampaignPrefs,
  type AppPrefs,
  type CampaignPrefs,
} from "../utils/settingsPrefs";

export function useSettingsState() {
  const [app, setApp] = useState<AppPrefs>(() => normalizeAppPrefs(readSetting<unknown>(APP_PREFS_KEY, null)));
  const [byCampaign, setByCampaign] = useState<Record<string, unknown>>(() =>
    readSetting<Record<string, unknown>>(CAMPAIGN_PREFS_KEY, {}),
  );

  const patchApp = useCallback((patch: Partial<AppPrefs>) => {
    setApp((prev) => {
      const next = { ...prev, ...patch };
      writeSetting(APP_PREFS_KEY, next);
      return next;
    });
  }, []);

  const prefsFor = useCallback(
    (id: string | null): CampaignPrefs => (id ? normalizeCampaignPrefs(byCampaign[id]) : DEFAULT_CAMPAIGN_PREFS),
    [byCampaign],
  );

  const patchCampaign = useCallback((id: string, patch: Partial<CampaignPrefs>) => {
    setByCampaign((prev) => {
      const next = { ...prev, [id]: { ...normalizeCampaignPrefs(prev[id]), ...patch } };
      writeSetting(CAMPAIGN_PREFS_KEY, next);
      return next;
    });
  }, []);

  return { app, patchApp, prefsFor, patchCampaign };
}
