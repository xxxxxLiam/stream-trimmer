/**
 * File: settingsPrefs.ts
 * Path: src/renderer/src/features/settings/utils/settingsPrefs.ts
 * Description: The settings the drawer owns that are not on the Campaign record: two app switches and,
 *   per campaign, clips a day, extra seconds at both ends and audio languages. Pure functions; the
 *   state hook stores the result. Anything unreadable falls back to the defaults.
 */

export type AppPrefs = { notifyQueueDone: boolean };

/** The ordinary setting the updater reads (Engine): unset means on. */
export const AUTO_UPDATE_KEY = "clipper.autoUpdate";
export type ExtraSeconds = 0 | 1 | 2;
export type CampaignPrefs = { extraSeconds: ExtraSeconds; languages: string[] };

/** Shown for a campaign with no quota yet. Clips a day itself is `Campaign.dailyQuota`, which the top bar reads. */
export { DEFAULT_DAILY_QUOTA } from "../../../shared/utils/campaigns";

export const APP_PREFS_KEY = "clipper.appPrefs";
export const CAMPAIGN_PREFS_KEY = "clipper.campaignPrefs";

export const DEFAULT_APP_PREFS: AppPrefs = { notifyQueueDone: true };
export const DEFAULT_CAMPAIGN_PREFS: CampaignPrefs = { extraSeconds: 1, languages: ["original"] };

export const MAX_CLIPS_PER_DAY = 99;
export const EXTRA_SECONDS_CHOICES: readonly ExtraSeconds[] = [0, 1, 2];

/** Audio languages a campaign can ask for, besides the original track. */
export const DUB_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
];

export function languageLabel(code: string): string {
  if (code === "original") return "Original";
  return DUB_LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

export function normalizeAppPrefs(raw: unknown): AppPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    notifyQueueDone: typeof r.notifyQueueDone === "boolean" ? r.notifyQueueDone : DEFAULT_APP_PREFS.notifyQueueDone,
  };
}

export function normalizeCampaignPrefs(raw: unknown): CampaignPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extra = EXTRA_SECONDS_CHOICES.find((n) => n === r.extraSeconds);
  const langs = Array.isArray(r.languages) ? r.languages.filter((l): l is string => typeof l === "string" && l !== "") : [];
  const unique = [...new Set(["original", ...langs])];
  return {
    extraSeconds: extra ?? DEFAULT_CAMPAIGN_PREFS.extraSeconds,
    languages: unique,
  };
}

/** One more or one fewer clip a day, kept between 1 and 99. */
export function stepClipsPerDay(n: number, delta: 1 | -1): number {
  return Math.min(MAX_CLIPS_PER_DAY, Math.max(1, n + delta));
}

/** Tick or untick a dub. Original is always on: a clip always has its own audio. */
export function toggleLanguage(list: readonly string[], code: string): string[] {
  if (code === "original") return [...list];
  return list.includes(code) ? list.filter((l) => l !== code) : [...list, code];
}

/** "3 clips a day · 1s extra at both ends" */
export function campaignSummary(quota: number, p: CampaignPrefs): string {
  return `${quota} clip${quota === 1 ? "" : "s"} a day · ${p.extraSeconds}s extra at both ends`;
}

/** "Languages: Original, Spanish", or null when the campaign only wants the original. */
export function languagesLine(p: CampaignPrefs): string | null {
  return p.languages.length > 1 ? `Languages: ${p.languages.map(languageLabel).join(", ")}` : null;
}

/** Fired after a campaign's prefs are written from outside the settings drawer (the new-campaign form). */
export const PREFS_CHANGED_EVENT = "clipr-campaign-prefs";

/** Writes one campaign's prefs straight to the store and tells any open drawer to re-read them. */
export function saveCampaignPrefs(
  id: string,
  patch: Partial<CampaignPrefs>,
  read: (key: string) => Record<string, unknown>,
  write: (key: string, value: unknown) => void,
): void {
  const all = read(CAMPAIGN_PREFS_KEY);
  write(CAMPAIGN_PREFS_KEY, { ...all, [id]: { ...normalizeCampaignPrefs(all[id]), ...patch } });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
}
