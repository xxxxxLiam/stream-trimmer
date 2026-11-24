/**
 * File: audioLanguages.ts
 * Path: src/renderer/src/shared/utils/audioLanguages.ts
 * Description: Which audio languages the next Clip makes, and the words for it in the bottom bar:
 *   "Makes 2 clips [Original + ES] to [folder]". Each ticked language is its own clip, named like
 *   the original plus its language tag ("Honest Version ES"). A video with no dubs has no choice.
 */

export type AudioTrackInfo = {
  language: string;
  /** "Spanish". */
  label: string;
  kind: "original" | "auto-dubbed" | "creator-dub";
};

/** What one ticked language makes. `language` is undefined for the original track. */
export type LanguagePlan = { language: string | undefined; suffix: string };

/** The dubs choice only exists when the video has a dub besides the original. */
export function hasDubTracks(tracks: readonly AudioTrackInfo[] | undefined): tracks is AudioTrackInfo[] {
  return !!tracks && tracks.some((t) => t.kind !== "original");
}

/** Short tag for a language code: "es" -> "ES", "pt-BR" -> "PT-BR". */
export function languageTag(language: string): string {
  return language.toUpperCase();
}

/**
 * The ticked languages that exist on this video, original first. Nothing ticked, or only
 * languages the video does not have, falls back to the original alone.
 */
export function ticked(tracks: readonly AudioTrackInfo[], selected: readonly string[] | undefined): AudioTrackInfo[] {
  if (!hasDubTracks(tracks)) return [];
  const wanted = new Set(selected ?? []);
  const hit = tracks.filter((t) => (t.kind === "original" ? true : wanted.has(t.language)));
  // The original is ticked by default; a user can untick it only while another language is ticked.
  const origin = tracks.find((t) => t.kind === "original");
  const dubs = hit.filter((t) => t.kind !== "original");
  if (!origin) return dubs.length ? dubs : tracks.slice(0, 1);
  const originalOff = wanted.has(`-${origin.language}`);
  if (originalOff && dubs.length) return dubs;
  return [origin, ...dubs];
}

/** What to make, one entry per clip. No dubs: one plain clip. */
export function planLanguages(tracks: readonly AudioTrackInfo[] | undefined, selected: readonly string[] | undefined): LanguagePlan[] {
  if (!hasDubTracks(tracks)) return [{ language: undefined, suffix: "" }];
  return ticked(tracks, selected).map((t) =>
    t.kind === "original" ? { language: undefined, suffix: "" } : { language: t.language, suffix: languageTag(t.language) },
  );
}

/** "Original", "Original + ES", or "3 languages". */
export function audioButtonLabel(tracks: readonly AudioTrackInfo[], selected: readonly string[] | undefined): string {
  const t = ticked(tracks, selected);
  if (t.length > 2) return `${t.length} languages`;
  return t.map((x) => (x.kind === "original" ? "Original" : languageTag(x.language))).join(" + ");
}

/** "Makes 2 clips" / "Makes 1 clip". */
export function makesText(count: number): string {
  return `Makes ${count} ${count === 1 ? "clip" : "clips"}`;
}

/** The file name a language's clip gets: the original keeps the plain name. */
export function nameForLanguage(clipId: string, plan: LanguagePlan): string {
  return plan.suffix ? `${clipId} ${plan.suffix}` : clipId;
}

/** Keep the user's ticks as stored words: dub codes, plus "-<code>" for an unticked original. */
export function toggleLanguage(
  tracks: readonly AudioTrackInfo[],
  selected: readonly string[] | undefined,
  language: string,
): string[] {
  const t = tracks.find((x) => x.language === language);
  if (!t) return [...(selected ?? [])];
  const cur = new Set(selected ?? []);
  const key = t.kind === "original" ? `-${t.language}` : t.language;
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  // With no dub ticked the original is the only thing to make, so it cannot stay unticked.
  const next = [...cur].filter((k) => !k.startsWith("-") || [...cur].some((c) => !c.startsWith("-")));
  return next;
}

/** The folder shortened from the left, "…/Clips/Acme", with the full path left for the tooltip. */
export function shortenPath(path: string, max = 28): string {
  const clean = path.replace(/\\/g, "/").replace(/^\/(Users|home)\/[^/]+/, "~");
  if (clean.length <= max) return clean;
  return `…${clean.slice(clean.length - (max - 1))}`;
}
