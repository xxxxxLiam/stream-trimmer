/**
 * File: useSettingsState.ts
 * Path: src/renderer/src/features/settings/hooks/useSettingsState.ts
 * Description: Reads and writes the drawer's own preferences (app switches and per-campaign quota,
 *   extra seconds and languages) in the persisted settings store.
 */
import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import {
  APP_PREFS_KEY,
  AUTO_UPDATE_KEY,
  CAMPAIGN_PREFS_KEY,
  DEFAULT_CAMPAIGN_PREFS,
  PREFS_CHANGED_EVENT,
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

  // The new-campaign form writes a campaign's prefs from outside this hook; pick them up.
  useEffect(() => {
    const reread = () => setByCampaign(readSetting<Record<string, unknown>>(CAMPAIGN_PREFS_KEY, {}));
    window.addEventListener(PREFS_CHANGED_EVENT, reread);
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, reread);
  }, []);

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

  // Read by the updater in the main process, so it lives under its own setting; unset means on.
  const [autoUpdate, setAutoUpdateState] = useState<boolean>(() => readSetting<unknown>(AUTO_UPDATE_KEY, true) !== false);
  const setAutoUpdate = useCallback((on: boolean) => {
    setAutoUpdateState(on);
    writeSetting(AUTO_UPDATE_KEY, on);
  }, []);

  return { app, patchApp, autoUpdate, setAutoUpdate, prefsFor, patchCampaign };
}
