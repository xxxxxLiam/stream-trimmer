/**
 * File: audioTracks.ts
 * Path: src/main/features/engine/utils/audioTracks.ts
 * Description: Reads a video's audio tracks (language and original / auto-dubbed / creator-dub tag)
 *   from the info yt-dlp already fetched. yt-dlp lists each dub as its own audio format with a
 *   `language` code and a note like "Spanish (dubbed-auto)" or "English (original) (default)".
 *   Nothing here is verified against real YouTube; the shapes follow yt-dlp's extractor.
 */

export type AudioTrackKind = "original" | "auto-dubbed" | "creator-dub";

export interface AudioTrack {
  language: string;
  /** Human label from yt-dlp, e.g. "Spanish". */
  label: string;
  kind: AudioTrackKind;
}

interface InfoFormat {
  vcodec?: string | null;
  acodec?: string | null;
  language?: string | null;
  format_note?: string | null;
}

const isAudioOnly = (f: InfoFormat) =>
  (!f.vcodec || f.vcodec === "none") && !!f.acodec && f.acodec !== "none";

function kindOf(note: string): AudioTrackKind {
  if (/dubbed-auto|auto-dubbed/i.test(note)) return "auto-dubbed";
  if (/original|default/i.test(note)) return "original";
  return "creator-dub";
}

/** One entry per language, Original first. A video with no dubs yields at most the original. */
export function audioTracksOf(info: { formats?: InfoFormat[] | null }): AudioTrack[] {
  const seen = new Map<string, AudioTrack>();
  for (const f of Array.isArray(info.formats) ? info.formats : []) {
    if (!isAudioOnly(f) || !f.language) continue;
    const note = f.format_note ?? "";
    const kind = kindOf(note);
    const prev = seen.get(f.language);
    // An "original" note on any format of the language wins over a dub tag.
    if (prev && !(kind === "original" && prev.kind !== "original")) continue;
    seen.set(f.language, {
      language: f.language,
      label: note.replace(/\s*\(.*$/, "").trim() || f.language,
      kind,
    });
  }
  return [...seen.values()].sort((a, b) => +(b.kind === "original") - +(a.kind === "original"));
}

/** True only when there is something to choose: a dub besides the original. */
export const hasDubs = (tracks: readonly AudioTrack[]) => tracks.some((t) => t.kind !== "original");

/**
 * The language to ask yt-dlp for. A language the video doesn't have falls back to the original
 * (null = no filter), with `fellBack` set so the caller can say so in plain words.
 */
export function resolveAudioLanguage(
  wanted: string | undefined,
  tracks: readonly AudioTrack[],
): { language: string | null; fellBack: boolean } {
  if (!wanted) return { language: null, fellBack: false };
  const orig = tracks.find((t) => t.kind === "original");
  if (orig && orig.language === wanted) return { language: null, fellBack: false };
  if (tracks.some((t) => t.language === wanted)) return { language: wanted, fellBack: false };
  return { language: null, fellBack: true };
}

/** Appends the language filter to a yt-dlp audio selector's bracket list. */
export function audioSelector(language: string | null, extra = ""): string {
  return `bestaudio${language ? `[language=${language}]` : ""}${extra}`;
}
