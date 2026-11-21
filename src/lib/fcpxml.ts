/**
 * File: fcpxml.ts
 * Path: src/lib/fcpxml.ts
 * Description: Pure FCPXML generator for handing finished clips to an editor
 *   (BUILD-SPEC section 11c). Targets FCPXML 1.10, the version Apple's current
 *   "Document Type Definition" page documents (developer.apple.com/documentation/
 *   professional-video-applications/document-type-definition). Final Cut Pro
 *   rejects a document that does not match the DTD, so every element and
 *   attribute emitted here is one that DTD declares, in the order it declares.
 *
 *   Time values are rational seconds ("1001/30000s"), never decimal seconds, and
 *   are derived from the frame rate probed off the real file. The format block
 *   (frameDuration, width, height) is likewise taken from ffprobe, never assumed.
 *
 *   Nothing here touches the disk or a process: callers hand in the ffprobe
 *   output. No em dash is emitted (user style rule).
 */

/** The FCPXML version this generator writes. */
export const FCPXML_VERSION = "1.10";

// ---------------------------------------------------------------------------
// Settings (the per-campaign "After cutting" choice)
// ---------------------------------------------------------------------------

export type AfterCutting = "nothing" | "reveal" | "finalcut" | "premiere";

export const AFTER_CUTTING_VALUES: readonly AfterCutting[] = [
  "nothing",
  "reveal",
  "finalcut",
  "premiere",
];

export type TimelineKind = "vertical" | "source" | "custom";

export interface TimelineFormat {
  kind: TimelineKind;
  /** Used by "custom" (the vertical preset fixes 1080x1920). */
  width: number;
  height: number;
  /** An explicit rate such as "30" or "29.97", or "source" (match source only). */
  fps: string;
}

export const VERTICAL_SIZE = { width: 1080, height: 1920 } as const;

/** Rates offered in the UI; any parseable rate is accepted when stored. */
export const FRAME_RATE_CHOICES: readonly string[] = [
  "23.976",
  "24",
  "25",
  "29.97",
  "30",
  "50",
  "59.94",
  "60",
];

export const DEFAULT_TIMELINE: TimelineFormat = {
  kind: "vertical",
  width: VERTICAL_SIZE.width,
  height: VERTICAL_SIZE.height,
  fps: "30",
};

export const DEFAULT_PROJECT_PATTERN = "{clipId} {label}";

export type EventNameSource = "campaign" | "source";

export interface EditorHandoffSettings {
  afterCutting: AfterCutting;
  /** Where the FCPXML event name comes from. */
  eventName: EventNameSource;
  /** CapCut has no project import; this is just a folder it can browse. */
  capcutDropDir: string;
  /** Also launch CapCut after a cut (only meaningful when it is installed). */
  openCapCut: boolean;
  /**
   * Absolute path of the .fcpbundle the import must land in (or a file:// URL).
   * Blank means the document names no library and Final Cut picks its own.
   * With many libraries open this is the only safe way to target one.
   */
  fcpLibrary: string;
  /** Event that holds the raw clip. Blank means use the campaign/source name. */
  mediaEvent: string;
  /** Event that holds the created projects. Blank means create no project. */
  projectEvent: string;
  /** Off by default: also create a project with the clip on its timeline. */
  createProject: boolean;
  /** Tokens: {clipId} {label} {campaign} {source}. */
  projectNamePattern: string;
  timelineFormat: TimelineFormat;
}

export const DEFAULT_EDITOR_SETTINGS: EditorHandoffSettings = {
  afterCutting: "nothing",
  eventName: "campaign",
  capcutDropDir: "",
  openCapCut: false,
  fcpLibrary: "",
  mediaEvent: "",
  projectEvent: "",
  createProject: false,
  projectNamePattern: DEFAULT_PROJECT_PATTERN,
  timelineFormat: DEFAULT_TIMELINE,
};

function dimension(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 16 && n <= 16384 ? n : fallback;
}

/** Coerce a stored timeline format; a bad value falls back to vertical 1080x1920 at 30. */
export function normalizeTimeline(raw: unknown): TimelineFormat {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: TimelineKind =
    r.kind === "source" || r.kind === "custom" || r.kind === "vertical" ? r.kind : "vertical";
  const fpsText = typeof r.fps === "string" ? r.fps.trim() : typeof r.fps === "number" ? String(r.fps) : "";
  let fps = DEFAULT_TIMELINE.fps;
  if (fpsText === "source" && kind === "source") fps = "source";
  else if (fpsText !== "source" && parseRational(fpsText)) fps = fpsText;
  return {
    kind,
    width: dimension(r.width, VERTICAL_SIZE.width),
    height: dimension(r.height, VERTICAL_SIZE.height),
    fps,
  };
}

/** Coerce anything stored (older versions, hand edits) into valid settings. */
export function normalizeEditorSettings(raw: unknown): EditorHandoffSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    afterCutting: AFTER_CUTTING_VALUES.includes(r.afterCutting as AfterCutting)
      ? (r.afterCutting as AfterCutting)
      : DEFAULT_EDITOR_SETTINGS.afterCutting,
    eventName: r.eventName === "source" ? "source" : "campaign",
    capcutDropDir: typeof r.capcutDropDir === "string" ? r.capcutDropDir : "",
    openCapCut: r.openCapCut === true,
    fcpLibrary: typeof r.fcpLibrary === "string" ? r.fcpLibrary.trim() : "",
    mediaEvent: typeof r.mediaEvent === "string" ? r.mediaEvent : "",
    projectEvent: typeof r.projectEvent === "string" ? r.projectEvent : "",
    createProject: r.createProject === true,
    projectNamePattern:
      typeof r.projectNamePattern === "string" && r.projectNamePattern.trim()
        ? r.projectNamePattern
        : DEFAULT_PROJECT_PATTERN,
    timelineFormat: normalizeTimeline(r.timelineFormat),
  };
}

/** The event name: campaign name or source title, with a plain fallback. */
export function resolveEventName(opts: {
  from: EventNameSource;
  campaignName?: string;
  sourceTitle?: string;
}): string {
  const pick = opts.from === "source" ? opts.sourceTitle : opts.campaignName;
  const other = opts.from === "source" ? opts.campaignName : opts.sourceTitle;
  const name = (pick ?? "").trim() || (other ?? "").trim();
  return name || "Clips";
}

// ---------------------------------------------------------------------------
// Rational time
// ---------------------------------------------------------------------------

export interface Rational {
  num: number;
  den: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function reduce(r: Rational): Rational {
  const g = gcd(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

/** Parse "30000/1001", "25", "29.97". Returns null when not a positive rate. */
export function parseRational(text: unknown): Rational | null {
  if (typeof text === "number") {
    return Number.isFinite(text) && text > 0 ? decimalToRational(text) : null;
  }
  if (typeof text !== "string") return null;
  const t = text.trim();
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    return num > 0 && den > 0 ? reduce({ num, den }) : null;
  }
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n > 0 ? decimalToRational(n) : null;
}

function decimalToRational(n: number): Rational {
  if (Number.isInteger(n)) return { num: n, den: 1 };
  // Only reached for a plain decimal such as "29.97": scale to an integer ratio.
  const scale = 1000;
  return reduce({ num: Math.round(n * scale), den: scale });
}

/** Broadcast rates that ffprobe and ffmpeg report in rounded or odd forms. */
const NTSC_RATES: Rational[] = [
  { num: 24000, den: 1001 },
  { num: 30000, den: 1001 },
  { num: 48000, den: 1001 },
  { num: 60000, den: 1001 },
  { num: 120000, den: 1001 },
];

/**
 * Snap a rate to the exact NTSC rational when it is within rounding distance of
 * one (so "29.97" or "2997/100" becomes 30000/1001). Anything else is returned
 * as given.
 */
export function snapFrameRate(rate: Rational): Rational {
  const value = rate.num / rate.den;
  for (const ntsc of NTSC_RATES) {
    if (Math.abs(value - ntsc.num / ntsc.den) < 0.01) return ntsc;
  }
  return reduce(rate);
}

/** "1001/30000s" for a frame, "300300/30000s" for 300 frames at 29.97. */
export function formatTime(frames: number, fps: Rational): string {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frame count must be a whole number, got ${frames}`);
  }
  if (frames === 0) return "0s";
  return `${frames * fps.den}/${fps.num}s`;
}

/** Whole frames in `seconds`, rounded down so a clip never runs past its media. */
export function secondsToFrames(seconds: number, fps: Rational): number {
  // The small epsilon keeps 10.0s at 30000/1001 from losing a frame to float error.
  return Math.max(0, Math.floor((seconds * fps.num) / fps.den + 1e-6));
}

// ---------------------------------------------------------------------------
// Probing: ffprobe JSON, or ffmpeg -i text when ffprobe is not installed
// ---------------------------------------------------------------------------

export interface MediaInfo {
  width: number;
  height: number;
  /** Frames per second as an exact rational, e.g. 30000/1001. */
  fps: Rational;
  durationSec: number;
  hasAudio: boolean;
  /** FCPXML audioRate token ("48k"), only when it is one the DTD allows. */
  audioRate?: string;
  audioChannels?: number;
}

export class ProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeError";
  }
}

const AUDIO_RATES: Record<number, string> = {
  32000: "32k",
  44100: "44.1k",
  48000: "48k",
  88200: "88.2k",
  96000: "96k",
  176400: "176.4k",
  192000: "192k",
};

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function isQuarterTurn(deg: number): boolean {
  const d = ((Math.round(deg) % 180) + 180) % 180;
  return d === 90;
}

type FfStream = Record<string, unknown>;

/** Build MediaInfo from `ffprobe -print_format json -show_streams -show_format`. */
export function parseFfprobe(json: unknown): MediaInfo {
  const root = (json && typeof json === "object" ? json : {}) as {
    streams?: FfStream[];
    format?: Record<string, unknown>;
  };
  const streams = Array.isArray(root.streams) ? root.streams : [];
  const video = streams.find((s) => {
    const disposition = (s.disposition ?? {}) as Record<string, unknown>;
    return s.codec_type === "video" && disposition.attached_pic !== 1;
  });
  if (!video) throw new ProbeError("ffprobe found no video stream in this file");

  let width = num(video.width);
  let height = num(video.height);
  if (!(width > 0) || !(height > 0)) {
    throw new ProbeError("ffprobe did not report a frame size for this file");
  }

  let rotation = num((video.tags as Record<string, unknown> | undefined)?.rotate);
  const sideData = Array.isArray(video.side_data_list) ? video.side_data_list : [];
  for (const item of sideData) {
    const r = num((item as Record<string, unknown>).rotation);
    if (Number.isFinite(r)) rotation = r;
  }
  if (Number.isFinite(rotation) && isQuarterTurn(rotation)) {
    [width, height] = [height, width];
  }

  const rate =
    parseRational(video.avg_frame_rate) ?? parseRational(video.r_frame_rate);
  if (!rate) throw new ProbeError("ffprobe did not report a frame rate for this file");

  const durationSec = [num(root.format?.duration), num(video.duration)].find(
    (d) => d > 0,
  );
  if (!durationSec) throw new ProbeError("ffprobe did not report a duration for this file");

  const audio = streams.find((s) => s.codec_type === "audio");
  const sampleRate = audio ? num(audio.sample_rate) : NaN;
  const channels = audio ? num(audio.channels) : NaN;
  return {
    width,
    height,
    fps: snapFrameRate(rate),
    durationSec,
    hasAudio: Boolean(audio),
    audioRate: AUDIO_RATES[sampleRate],
    audioChannels: channels > 0 ? channels : undefined,
  };
}

/**
 * Fallback for machines with no ffprobe: parse the stream summary `ffmpeg -i`
 * prints to stderr. ffmpeg rounds the frame rate ("29.97 fps"), so the rate is
 * accepted only when it is a whole number or a standard NTSC rate. Anything
 * else is refused rather than guessed.
 */
export function parseFfmpegInfo(stderr: string): MediaInfo {
  const text = String(stderr);
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!dur) throw new ProbeError("ffmpeg did not report a duration for this file");
  const durationSec = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);

  const videoLine = text
    .split("\n")
    .find((l) => /Stream #.*Video:/.test(l) && !/attached pic/.test(l));
  if (!videoLine) throw new ProbeError("ffmpeg found no video stream in this file");
  const size = /(?<![\w])(\d{2,5})x(\d{2,5})(?![\w])/.exec(videoLine);
  const fpsMatch = /([\d.]+)\s*fps/.exec(videoLine);
  if (!size) throw new ProbeError("ffmpeg did not report a frame size for this file");
  if (!fpsMatch) throw new ProbeError("ffmpeg did not report a frame rate for this file");

  let width = Number(size[1]);
  let height = Number(size[2]);
  const rot = /rotation of\s*(-?[\d.]+)\s*degrees/.exec(text);
  if (rot && isQuarterTurn(Number(rot[1]))) [width, height] = [height, width];

  const approx = Number(fpsMatch[1]);
  const snapped = snapFrameRate(decimalToRational(approx));
  const exactNtsc = NTSC_RATES.some((n) => n.num === snapped.num && n.den === snapped.den);
  if (!exactNtsc && !Number.isInteger(approx)) {
    throw new ProbeError(
      `The frame rate (${fpsMatch[1]} fps) cannot be read exactly without ffprobe`,
    );
  }
  const fps = exactNtsc ? snapped : { num: approx, den: 1 };

  const audioLine = text.split("\n").find((l) => /Stream #.*Audio:/.test(l));
  let audioRate: string | undefined;
  let audioChannels: number | undefined;
  if (audioLine) {
    const hz = /(\d+)\s*Hz/.exec(audioLine);
    if (hz) audioRate = AUDIO_RATES[Number(hz[1])];
    if (/\bmono\b/.test(audioLine)) audioChannels = 1;
    else if (/\bstereo\b/.test(audioLine)) audioChannels = 2;
    else {
      const n = /(\d+)\s*channels/.exec(audioLine);
      if (n) audioChannels = Number(n[1]);
    }
  }
  return {
    width,
    height,
    fps,
    durationSec,
    hasAudio: Boolean(audioLine),
    audioRate,
    audioChannels,
  };
}

/** What the main process returns from its probe call. */
export type RawProbe =
  | { kind: "ffprobe"; json: unknown }
  | { kind: "ffmpeg"; text: string };

export function parseProbe(raw: RawProbe): MediaInfo {
  return raw.kind === "ffprobe" ? parseFfprobe(raw.json) : parseFfmpegInfo(raw.text);
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

/** Remove characters XML 1.0 cannot carry (control chars, lone surrogates). */
function stripInvalidXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** Escape for an attribute value or text node. Quotes are escaped for both. */
export function xmlEscape(text: string): string {
  return stripInvalidXml(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Em dashes are never emitted. */
function noEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, " - ");
}

/** Newlines inside an attribute would be normalised away by XML; use a space. */
function attrText(text: string): string {
  return xmlEscape(noEmDash(text).replace(/\s+/g, " ").trim());
}

/**
 * Absolute path to a file:// URL. Every byte outside the unreserved set is
 * percent-encoded (including apostrophes, parentheses and non-Latin text, as
 * UTF-8), so the URL survives XML and Final Cut's parser unchanged.
 */
export function fileUrl(absPath: string): string {
  const win = /^[A-Za-z]:[\\/]/.exec(absPath);
  const unix = absPath.startsWith("/");
  if (!win && !unix) {
    throw new Error(`Cannot make a file URL from a relative path: ${absPath}`);
  }
  const p = absPath.replace(/\\/g, "/");
  const encoded = p
    .split("/")
    .map((seg, i) =>
      win && i === 0
        ? seg
        : encodeURIComponent(seg).replace(
            /[!'()*]/g,
            (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
          ),
    )
    .join("/");
  return win ? `file:///${encoded}` : `file://${encoded}`;
}

// ---------------------------------------------------------------------------
// Metadata text
// ---------------------------------------------------------------------------

/** HH:MM:SS, with .mmm only when the time is not a whole second. */
export function sourceTimecode(seconds: number): string {
  const total = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const ms = Math.round(total * 1000);
  const whole = Math.floor(ms / 1000);
  const frac = ms % 1000;
  const hh = String(Math.floor(whole / 3600)).padStart(2, "0");
  const mm = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const ss = String(whole % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}${frac ? "." + String(frac).padStart(3, "0") : ""}`;
}

export interface FcpSegment {
  start: number;
  end: number;
}

export interface FcpClip {
  /** The clip id, e.g. "M-aBcDeFg-05". */
  id: string;
  label?: string;
  /** Absolute path of the finished file. */
  path: string;
  /** Source-video ranges that were joined into this one file, in order. */
  segments: FcpSegment[];
  /** Canonical source link for this clip's video. */
  sourceUrl?: string;
  /** Exact project name typed for this clip; wins over the campaign pattern. */
  projectName?: string;
  /** From ffprobe on this exact file. */
  media: MediaInfo;
}

/** Clip name: the id plus its label, joined with a plain hyphen. */
export function clipName(clip: Pick<FcpClip, "id" | "label">): string {
  const label = (clip.label ?? "").trim();
  return label ? `${clip.id} - ${label}` : clip.id;
}

/** Notes: the source link, then every segment's SOURCE timecodes in order. */
export function clipNotes(clip: Pick<FcpClip, "sourceUrl" | "segments">): string {
  const lines: string[] = [];
  if (clip.sourceUrl) lines.push(`Source: ${clip.sourceUrl}`);
  if (clip.segments.length > 0) {
    const ranges = clip.segments
      .map((s) => `${sourceTimecode(s.start)} to ${sourceTimecode(s.end)}`)
      .join("; ");
    lines.push(
      clip.segments.length > 1
        ? `Source timecodes (${clip.segments.length} segments, joined in this order): ${ranges}`
        : `Source timecodes: ${ranges}`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Project names, timeline and library targeting
// ---------------------------------------------------------------------------

export interface FcpxmlProject {
  /** Event that will hold the projects. */
  eventName: string;
  namePattern: string;
  timeline: TimelineFormat;
  campaignName?: string;
  sourceTitle?: string;
}

/** Name for one project: the clip's own override, else the pattern filled in. */
export function projectNameFor(
  clip: Pick<FcpClip, "id" | "label" | "projectName">,
  pattern: string,
  ctx: { campaignName?: string; sourceTitle?: string } = {},
): string {
  const own = (clip.projectName ?? "").replace(/\s+/g, " ").trim();
  if (own) return noEmDash(own);
  const values: Record<string, string> = {
    clipId: clip.id,
    label: (clip.label ?? "").trim(),
    campaign: (ctx.campaignName ?? "").trim(),
    source: (ctx.sourceTitle ?? "").trim(),
  };
  const filled = (pattern.trim() || DEFAULT_PROJECT_PATTERN)
    .replace(/\{(clipId|label|campaign|source)\}/g, (_m, k: string) => values[k] ?? "")
    .replace(/\s+/g, " ")
    // An empty token leaves its separator dangling ("M-01 -"); trim those ends.
    .replace(/^[\s\-:|,]+|[\s\-:|,]+$/g, "");
  return noEmDash(filled) || clip.id;
}

/**
 * Names for every project in a batch. A repeated name gets " 2", " 3" so one
 * document never holds two projects Final Cut might merge or overwrite.
 */
export function resolveProjectNames(
  clips: Pick<FcpClip, "id" | "label" | "projectName">[],
  project: Pick<FcpxmlProject, "namePattern" | "campaignName" | "sourceTitle">,
): string[] {
  const seen = new Set<string>();
  return clips.map((c) => {
    const base = projectNameFor(c, project.namePattern, project);
    let name = base;
    for (let n = 2; seen.has(name); n++) name = `${base} ${n}`;
    seen.add(name);
    return name;
  });
}

/** The frame size and rate a clip's timeline uses; never inherits unless asked to. */
export function resolveTimeline(
  fmt: TimelineFormat,
  media: MediaInfo,
): { width: number; height: number; fps: Rational } {
  const rate = fmt.fps === "source" ? null : parseRational(fmt.fps);
  const fps = rate ? snapFrameRate(rate) : media.fps;
  if (fmt.kind === "source") return { width: media.width, height: media.height, fps };
  if (fmt.kind === "custom") return { width: fmt.width, height: fmt.height, fps };
  return { ...VERTICAL_SIZE, fps };
}

/**
 * `location` for <library>: a .fcpbundle path or a file:// URL. Directories get
 * a trailing slash, the way Final Cut writes its own. Relative paths throw, so
 * a typo can never become a silent wrong-library import.
 */
export function libraryLocation(library: string): string {
  const t = library.trim();
  if (!t) return "";
  const url = /^file:\/\//i.test(t) ? t : fileUrl(t);
  return url.endsWith("/") ? url : url + "/";
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface FcpxmlInput {
  /** The event that holds the raw clips. */
  eventName: string;
  clips: FcpClip[];
  /** .fcpbundle path or file:// URL. Omitted: no `location`, Final Cut decides. */
  library?: string;
  /** Present: also create one project per clip in its own event. */
  project?: FcpxmlProject;
}

/**
 * One FCPXML document. Every clip becomes ONE asset plus an asset-clip in the
 * media event; with `project`, each clip also gets a project in the project
 * event whose timeline references that same asset (not a copy). Clips sharing a
 * frame size and rate share one <format>. If both events share a name they are
 * merged into one, since two same-named events would be ambiguous.
 */
export function buildFcpxml(input: FcpxmlInput): string {
  if (input.clips.length === 0) throw new Error("There are no clips to export");

  const formats: { id: string; xml: string }[] = [];
  const formatIds = new Map<string, string>();
  const formatFor = (width: number, height: number, fps: Rational): string => {
    const frameDuration = formatTime(1, fps);
    const key = `${width}x${height}@${frameDuration}`;
    let id = formatIds.get(key);
    if (!id) {
      id = `r${formatIds.size + 1}`;
      formatIds.set(key, id);
      formats.push({
        id,
        xml:
          `    <format id="${id}" frameDuration="${frameDuration}" ` +
          `width="${width}" height="${height}"/>`,
      });
    }
    return id;
  };

  const projectNames = input.project ? resolveProjectNames(input.clips, input.project) : [];
  const assets: string[] = [];
  const mediaItems: string[] = [];
  const projectItems: string[] = [];

  input.clips.forEach((clip, index) => {
    const m = clip.media;
    const formatId = formatFor(m.width, m.height, m.fps);
    const frames = secondsToFrames(m.durationSec, m.fps);
    if (frames < 1) throw new Error(`${clip.id}: the file is shorter than one frame`);
    const duration = formatTime(frames, m.fps);
    const assetId = `a${index + 1}`;
    const name = attrText(clipName(clip));

    const audioAttrs = m.hasAudio
      ? ` hasAudio="1" audioSources="1"` +
        (m.audioChannels ? ` audioChannels="${m.audioChannels}"` : "") +
        (m.audioRate ? ` audioRate="${m.audioRate}"` : "")
      : "";
    assets.push(
      `    <asset id="${assetId}" name="${name}" start="0s" duration="${duration}" ` +
        `hasVideo="1" format="${formatId}"${audioAttrs}>\n` +
        `      <media-rep kind="original-media" src="${xmlEscape(fileUrl(clip.path))}"/>\n` +
        `    </asset>`,
    );

    const notes = clipNotes(clip);
    const note = (pad: string) =>
      notes ? `>\n${pad}  <note>${xmlEscape(noEmDash(notes))}</note>\n${pad}</asset-clip>` : "/>";
    mediaItems.push(
      `      <asset-clip ref="${assetId}" name="${name}" start="0s" duration="${duration}" ` +
        `format="${formatId}" tcFormat="NDF"${note("      ")}`,
    );

    if (input.project) {
      const tl = resolveTimeline(input.project.timeline, m);
      const tlFormat = formatFor(tl.width, tl.height, tl.fps);
      // Whole timeline frames, rounded down, so the clip never overruns its media.
      const assetSec = (frames * m.fps.den) / m.fps.num;
      const tlFrames = secondsToFrames(assetSec, tl.fps);
      if (tlFrames < 1) throw new Error(`${clip.id}: the file is shorter than one timeline frame`);
      const tlDuration = formatTime(tlFrames, tl.fps);
      const seq =
        ` tcStart="0s" tcFormat="NDF"` +
        (m.audioChannels ? ` audioLayout="${m.audioChannels === 1 ? "mono" : "stereo"}"` : "") +
        (m.audioRate ? ` audioRate="${m.audioRate}"` : "");
      projectItems.push(
        [
          `      <project name="${attrText(projectNames[index])}">`,
          `        <sequence format="${tlFormat}" duration="${tlDuration}"${seq}>`,
          `          <spine>`,
          `            <asset-clip ref="${assetId}" offset="0s" name="${name}" start="0s" ` +
            `duration="${tlDuration}" tcFormat="NDF"${note("            ")}`,
          `          </spine>`,
          `        </sequence>`,
          `      </project>`,
        ].join("\n"),
      );
    }
  });

  const mediaEvent = input.eventName;
  const projectEvent = input.project?.eventName ?? "";
  const merged = !!input.project && projectEvent.trim() === mediaEvent.trim();
  const events: string[] = [
    `    <event name="${attrText(mediaEvent)}">`,
    ...mediaItems,
    ...(merged ? projectItems : []),
    `    </event>`,
  ];
  if (input.project && !merged) {
    events.push(`    <event name="${attrText(projectEvent)}">`, ...projectItems, `    </event>`);
  }

  const location = libraryLocation(input.library ?? "");
  // The DTD lists format and asset under one <resources>; formats first so each
  // asset's format reference resolves in document order.
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    ``,
    `<fcpxml version="${FCPXML_VERSION}">`,
    `  <resources>`,
    ...formats.map((f) => f.xml),
    ...assets,
    `  </resources>`,
    location ? `  <library location="${xmlEscape(location)}">` : `  <library>`,
    ...events,
    `  </library>`,
    `</fcpxml>`,
    ``,
  ].join("\n");
}

/** A filename for the document: event name made safe, with the extension. */
export function fcpxmlFilename(eventName: string): string {
  const safe = noEmDash(eventName)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
  return `${safe || "Clips"}.fcpxml`;
}

// ---------------------------------------------------------------------------
// Session batch: probe every file, then emit ONE document
// ---------------------------------------------------------------------------

export interface SessionClip {
  id: string;
  label?: string;
  path: string;
  segments: FcpSegment[];
  sourceUrl?: string;
  /** Exact project name for this clip, overriding the campaign pattern. */
  projectName?: string;
}

export interface SessionResult {
  xml: string;
  filename: string;
  included: number;
  /** Project names in the document, in clip order; empty when none were created. */
  projectNames: string[];
  /** Clips left out, each with the plain-words reason. Never silent. */
  skipped: { id: string; reason: string }[];
}

/**
 * Probe each finished file and build one document for the whole session. A clip
 * whose file cannot be probed is reported and left out; it never aborts the
 * rest. `probe` is injected so this stays free of Electron.
 */
export async function buildSessionFcpxml(
  clips: SessionClip[],
  eventName: string,
  probe: (path: string) => Promise<RawProbe>,
  options: { library?: string; project?: FcpxmlProject } = {},
): Promise<SessionResult> {
  const ready: FcpClip[] = [];
  const skipped: SessionResult["skipped"] = [];
  for (const clip of clips) {
    try {
      const media = parseProbe(await probe(clip.path));
      ready.push({ ...clip, media });
    } catch (err) {
      skipped.push({
        id: clip.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (ready.length === 0) {
    const why = skipped[0]?.reason ?? "There are no clips to export";
    throw new Error(why);
  }
  return {
    xml: buildFcpxml({ eventName, clips: ready, library: options.library, project: options.project }),
    filename: fcpxmlFilename(eventName),
    included: ready.length,
    projectNames: options.project ? resolveProjectNames(ready, options.project) : [],
    skipped,
  };
}
