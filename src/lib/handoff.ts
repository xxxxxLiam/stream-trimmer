/**
 * File: handoff.ts
 * Path: src/lib/handoff.ts
 * Description: Pure formatters for the seven copy blocks (BUILD-SPEC section 9).
 *   Every timecode is the SOURCE video's, never the clip's. No em dash is ever
 *   emitted (user style rule): any U+2014 in input text becomes " - ".
 */

export interface HandoffSegment {
  start: number;
  end: number;
}

export interface HandoffLine {
  start: number;
  end: number;
  text: string;
  /** Optional per-line speaker label; falls back to the block's default. */
  speaker?: string;
}

/** Replace any em dash with a spaced hyphen, collapsing the spaces around it. */
export function stripEmDash(text: string): string {
  return text.replace(/\s*\u2014\s*/g, " - ");
}

/** One line of text: newlines collapsed, em dashes removed, trimmed. */
function oneLine(text: string): string {
  return stripEmDash(text.replace(/\s+/g, " ")).trim();
}

/** HH:MM:SS from seconds. Floors; hours may exceed two digits. */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Pull the 11-character video id out of any YouTube link (or a bare id). */
export function extractHandoffVideoId(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    if (!id) {
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => ["embed", "shorts", "v", "live"].includes(p));
      if (i >= 0) id = parts[i + 1] ?? null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/**
 * Canonical source link: https://www.youtube.com/watch?v=VIDEOID. Full
 * youtube.com form only, never youtu.be. list, index, t, start and every
 * other parameter are dropped. Null when no video id can be found.
 */
export function canonicalSourceUrl(input: string | null | undefined): string | null {
  const id = extractHandoffVideoId(input);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function validSegments(segments: readonly HandoffSegment[]): HandoffSegment[] {
  return segments.filter(
    (s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
  );
}

/** Block 2: whole transcript, `[HH:MM:SS] text` per line. */
export function formatTranscript(lines: readonly HandoffLine[]): string {
  return lines
    .map((l) => ({ tc: formatTimecode(l.start), text: oneLine(l.text) }))
    .filter((l) => l.text)
    .map((l) => `[${l.tc}] ${l.text}`)
    .join("\n");
}

/**
 * Lines that overlap any segment, grouped in segment order. A line touching
 * two segments is listed once, under the first.
 */
export function linesInSegments(
  lines: readonly HandoffLine[],
  segments: readonly HandoffSegment[],
): HandoffLine[] {
  const seen = new Set<HandoffLine>();
  const out: HandoffLine[] = [];
  for (const seg of validSegments(segments)) {
    for (const l of lines) {
      if (seen.has(l)) continue;
      if (l.end > seg.start && l.start < seg.end) {
        seen.add(l);
        out.push(l);
      }
    }
  }
  return out;
}

/** Block 3: transcript restricted to the current segments. */
export function formatSegmentTranscript(
  lines: readonly HandoffLine[],
  segments: readonly HandoffSegment[],
): string {
  return formatTranscript(linesInSegments(lines, segments));
}

/**
 * Block 4: script lines, `[SPEAKER, HH:MM:SS] text`, in segment order. The
 * speaker label is kept as given (commas included).
 */
export function formatScriptLines(
  lines: readonly HandoffLine[],
  segments: readonly HandoffSegment[],
  speaker = "SPEAKER",
): string {
  return linesInSegments(lines, segments)
    .map((l) => ({
      who: oneLine(l.speaker ?? speaker) || "SPEAKER",
      tc: formatTimecode(l.start),
      text: oneLine(l.text),
    }))
    .filter((l) => l.text)
    .map((l) => `[${l.who}, ${l.tc}] ${l.text}`)
    .join("\n");
}

/** Block 5: `00:01:12 to 00:01:30; 00:10:04 to 00:10:20`. */
export function formatDownloadRanges(segments: readonly HandoffSegment[]): string {
  return validSegments(segments)
    .map((s) => `${formatTimecode(s.start)} to ${formatTimecode(s.end)}`)
    .join("; ");
}

/** Block 6: `VIDEOID (video): <ranges> (CLIPID)`. */
export function formatUsedMaterial(
  videoId: string,
  segments: readonly HandoffSegment[],
  clipId: string,
): string {
  return `${videoId} (video): ${formatDownloadRanges(segments)} (${clipId})`;
}

export interface ClipIdContext {
  prefix?: string;
  videoId?: string | null;
  /** 1-based clip number within the video. */
  index: number;
}

export interface ClipIdResult {
  id: string;
  /** Tokens in the pattern that had no value. */
  unresolved: string[];
}

/**
 * Fill a campaign pattern such as `{prefix}-{videoId}-{nn}`.
 * Tokens: {prefix} {videoId} {nn} (two digits) {n}.
 */
export function buildClipId(pattern: string, ctx: ClipIdContext): ClipIdResult {
  const unresolved: string[] = [];
  const n = Math.max(1, Math.floor(ctx.index || 1));
  const values: Record<string, string | undefined> = {
    prefix: ctx.prefix?.trim() || undefined,
    videoId: ctx.videoId || undefined,
    nn: String(n).padStart(2, "0"),
    n: String(n),
  };
  const id = pattern.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = values[key];
    if (v === undefined) {
      unresolved.push(whole);
      return whole;
    }
    return v;
  });
  return { id: oneLine(id), unresolved };
}

/** Filesystem-safe filename for a clip id. */
export function buildClipFilename(clipId: string, ext = "mp4"): string {
  const safe = clipId
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  return `${safe || "clip"}.${ext.replace(/^\./, "")}`;
}

/** Block 7: clip id on the first line, filename on the second. */
export function formatClipIdAndFilename(clipId: string, ext = "mp4"): string {
  return `${clipId}\n${buildClipFilename(clipId, ext)}`;
}

export type HandoffBlockId =
  | "source"
  | "transcript"
  | "segment-transcript"
  | "script"
  | "ranges"
  | "used"
  | "clip-id";

export interface HandoffBlock {
  id: HandoffBlockId;
  label: string;
  note: string;
  text: string;
  /** False when the block cannot be produced yet; `reason` says why. */
  available: boolean;
  reason?: string;
}

export interface HandoffInput {
  /** Whatever link the user pasted; canonicalised here. */
  url?: string | null;
  videoId?: string | null;
  lines: readonly HandoffLine[];
  segments: readonly HandoffSegment[];
  speaker?: string;
  clipIdPattern?: string;
  clipPrefix?: string;
  /** 1-based number of this clip within the video. */
  clipIndex?: number;
  /** Use this id instead of generating one from the pattern. */
  clipId?: string | null;
  ext?: string;
}

export function buildHandoffBlocks(input: HandoffInput): HandoffBlock[] {
  const videoId = extractHandoffVideoId(input.videoId ?? "") ?? extractHandoffVideoId(input.url);
  const segs = validSegments(input.segments);
  const noSeg = segs.length === 0 ? "Add a segment first." : undefined;
  const noLines = input.lines.length === 0 ? "No transcript loaded." : undefined;
  const noId = videoId ? undefined : "No video id found in the link.";

  let clipId: string | null = input.clipId?.trim() || null;
  let clipReason: string | undefined;
  if (!clipId) {
    if (!input.clipIdPattern) {
      clipReason = "This campaign has no clip id pattern.";
    } else {
      const r = buildClipId(input.clipIdPattern, {
        prefix: input.clipPrefix,
        videoId,
        index: input.clipIndex ?? 1,
      });
      if (r.unresolved.length) clipReason = `No value for ${r.unresolved.join(", ")}.`;
      else clipId = r.id;
    }
  }

  const mk = (
    id: HandoffBlockId,
    label: string,
    note: string,
    text: string | null,
    reason: string | undefined,
  ): HandoffBlock => ({
    id,
    label,
    note,
    text: reason || text === null ? "" : text,
    available: !reason && text !== null && text !== "",
    reason: reason ?? (text === "" ? "Nothing to copy yet." : undefined),
  });

  return [
    mk("source", "Source link", "Canonical youtube.com link, no tracking.",
      videoId ? canonicalSourceUrl(videoId) : null, noId),
    mk("transcript", "Whole transcript", "Every line with its source timecode.",
      formatTranscript(input.lines), noLines),
    mk("segment-transcript", "Transcript, current segments", "Only the lines inside your segments.",
      formatSegmentTranscript(input.lines, segs), noLines ?? noSeg),
    mk("script", "Script lines, verbatim", "Speaker and source timecode, in segment order.",
      formatScriptLines(input.lines, segs, input.speaker), noLines ?? noSeg),
    mk("ranges", "Download ranges", "Source-video ranges, one clip.",
      formatDownloadRanges(segs), noSeg),
    mk("used", "Used-material line", "For the tracker: video, ranges, clip id.",
      clipId && videoId ? formatUsedMaterial(videoId, segs, clipId) : null,
      noId ?? noSeg ?? clipReason),
    mk("clip-id", "Clip id and filename", "From the campaign pattern.",
      clipId ? formatClipIdAndFilename(clipId, input.ext) : null, clipReason),
  ];
}

/**
 * Write text to the clipboard. Never throws and never fails silently: the
 * result says whether it worked so the caller can show a visible message.
 * Tries the async API first, then the legacy execCommand route.
 */
export async function writeClipboard(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) return { ok: true };
    }
  } catch {
    // reported below
  }
  return { ok: false, error: "The clipboard is not available. Select the text and press Cmd+C." };
}
