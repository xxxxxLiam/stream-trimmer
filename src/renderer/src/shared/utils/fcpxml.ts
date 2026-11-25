/**
 * File: fcpxml.ts
 * Path: src/renderer/src/shared/utils/fcpxml.ts
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

import type { Look } from "../../../../common/utils/fcpLook";

/**
 * The FCPXML version this generator writes. When a project carries the user's
 * own look, the version of the export that look came from is written instead,
 * because that is the version the user's Final Cut is known to accept.
 */
export const FCPXML_VERSION = "1.10";

// ---------------------------------------------------------------------------
// Settings (the per-campaign "After cutting" choice)
// ---------------------------------------------------------------------------

/**
 * "premiere" was removed: Adobe documents that Premiere Pro cannot import
 * .fcpxml directly (it needs a paid third-party converter), so a send button
 * could never work. A stored "premiere" falls back to "nothing".
 */
export type AfterCutting = "nothing" | "reveal" | "finalcut";

export const AFTER_CUTTING_VALUES: readonly AfterCutting[] = ["nothing", "reveal", "finalcut"];

/** "look": the size and rate of the campaign's saved look (Engine reads it; until then the project is vertical). */
export type TimelineKind = "vertical" | "source" | "custom" | "look";

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

/** Vertical at the video's own frame rate: a 25 fps clip gets a 25 fps project, not a converted 30. */
export const DEFAULT_TIMELINE: TimelineFormat = {
  kind: "vertical",
  width: VERTICAL_SIZE.width,
  height: VERTICAL_SIZE.height,
  fps: "source",
};

export const DEFAULT_PROJECT_PATTERN = "{clipId} {label}";

export type EventNameSource = "campaign" | "source";

/**
 * How clips are laid out in the editor (Final Cut names are used here).
 * export: one event (the campaign's Event, "Export" if blank) with a folder per source video (the default).
 * video: one event per source video. day: one event per day with a folder per video. flat: one event, no folders.
 */
export type FcpLayout = "export" | "video" | "day" | "flat";
export const FCP_LAYOUTS: readonly FcpLayout[] = ["export", "video", "day", "flat"];
export const DEFAULT_FCP_LAYOUT: FcpLayout = "export";
/** Event name when the campaign's Event field is blank and the layout needs one. */
export const DEFAULT_EXPORT_EVENT = "Export";

export interface EditorHandoffSettings {
  afterCutting: AfterCutting;
  /** Set per cut from the Clip arrow menu (never stored): open this editor with the saved clip. */
  openIn?: "premiere" | "resolve" | "capcut";
  /** Where the FCPXML event name comes from. */
  eventName: EventNameSource;
  /** CapCut has no project import; this is just a folder it can browse. */
  capcutDropDir: string;
  /** Also launch CapCut after a cut (only meaningful when it is installed). */
  openCapCut: boolean;
  /**
   * Absolute path of the .fcpbundle the import must land in (or a file:// URL).
   * Blank means the document names no library and Final Cut picks its own.
   * Written as <import-options><option key="library location">, the only
   * mechanism Apple documents for import (the <library location> attribute is
   * export-only and ignored on import).
   */
  fcpLibrary: string;
  /** Event that holds the raw clip. Blank means use the campaign/source name. */
  mediaEvent: string;
  /** How clips are laid out in the editor. Default: one "Export" event with a folder per video. */
  layout?: FcpLayout;
  /** Event that holds the created projects. Blank means create no project. */
  projectEvent: string;
  /** Off by default: also create a project with the clip on its timeline. */
  createProject: boolean;
  /** Copy the user's own look (see look.ts) onto every project clip. */
  applyLook?: boolean;
  /** Text of a Final Cut XML export of one clip that already has the look on it. */
  lookXml?: string;
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
  layout: DEFAULT_FCP_LAYOUT,
  projectEvent: "",
  createProject: false,
  applyLook: false,
  lookXml: "",
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
    r.kind === "source" || r.kind === "custom" || r.kind === "vertical" || r.kind === "look" ? r.kind : "vertical";
  const fpsText = typeof r.fps === "string" ? r.fps.trim() : typeof r.fps === "number" ? String(r.fps) : "";
  let fps = DEFAULT_TIMELINE.fps;
  // D3-2, D4-2: a stored rate (the old default 30, or one picked in the old Frame rate list) cannot be seen or changed on the
  // Timeline switch, which says the rate follows the video, so for every kind but a custom size it is dropped. Custom keeps its own.
  if (kind === "custom" && fpsText !== "source" && parseRational(fpsText)) fps = fpsText;
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
    layout: FCP_LAYOUTS.includes(r.layout as FcpLayout) ? (r.layout as FcpLayout) : DEFAULT_FCP_LAYOUT,
    projectEvent: typeof r.projectEvent === "string" ? r.projectEvent : "",
    createProject: r.createProject === true,
    applyLook: r.applyLook === true,
    lookXml: typeof r.lookXml === "string" ? r.lookXml : "",
    // A blank pattern is kept as typed (so the field can be edited); naming falls back to the default.
    projectNamePattern:
      typeof r.projectNamePattern === "string" ? r.projectNamePattern : DEFAULT_PROJECT_PATTERN,
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

/**
 * How a send is laid out in Final Cut, in ONE place: today every clip of a campaign goes into one
 * event (the Event typed in the campaign's settings, else the campaign name) and each source video
 * is a keyword collection inside it (its title, without the commas that split a keyword list). A
 * layout setting switches this function; the sending code only calls it.
 */
export function importLayout(
  settings: { mediaEvent?: string },
  ctx: { campaignName?: string; sourceTitle?: string },
): { eventName: string; keyword: string } {
  return {
    eventName: resolveEventName({ from: "campaign", campaignName: (settings.mediaEvent ?? "").trim() || ctx.campaignName }),
    keyword: (ctx.sourceTitle ?? "").replace(/[,\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim(),
  };
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
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
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
  /** The source video's title: names its folder (or event) in the layouts that group by video. */
  sourceTitle?: string;
  /** When the clip was cut (ms since 1970): the day it belongs to in the per-day layout. */
  cutAt?: number;
  /** Keyword and keyword collection this clip gets in the event (see `importLayout`); blank for none. */
  keyword?: string;
  /** From ffprobe on this exact file. */
  media: MediaInfo;
}

/** Clip name: the id plus its label, joined with a plain hyphen. */
export function clipName(clip: Pick<FcpClip, "id" | "label">): string {
  // One name everywhere: the clip's own (its file's name, no extension, no id prefix).
  const label = (clip.label ?? "").trim().replace(/\.(mp4|mp3|mov|m4a)$/i, "");
  return label || clip.id;
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
  /** The user's own Final Cut look, copied onto every project clip. */
  look?: Look;
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

/**
 * The frame size and rate a clip's timeline uses. A rate of "source" (the default) follows the video, for
 * every kind. Kind "look" uses the look's own size and rate when the look has them, else it is vertical.
 */
export function resolveTimeline(
  fmt: TimelineFormat,
  media: MediaInfo,
  look?: Look["format"],
): { width: number; height: number; fps: Rational } {
  const rate = fmt.fps === "source" ? null : parseRational(fmt.fps);
  const fps = rate ? snapFrameRate(rate) : media.fps;
  if (fmt.kind === "look" && look) {
    const lookRate = parseRational(look.fps);
    return { width: look.width, height: look.height, fps: lookRate ? snapFrameRate(lookRate) : fps };
  }
  if (fmt.kind === "source") return { width: media.width, height: media.height, fps };
  if (fmt.kind === "custom") return { width: fmt.width, height: fmt.height, fps };
  return { ...VERTICAL_SIZE, fps };
}

/**
 * The value for the "library location" import option: the file:// URL of the
 * .fcpbundle itself (a path or a URL is accepted; no trailing slash). Relative
 * paths throw, so a typo can never become a silent wrong-library import.
 */
export function libraryLocation(library: string): string {
  const t = library.trim();
  if (!t) return "";
  const url = /^file:\/\//i.test(t) ? t : fileUrl(t);
  return url.replace(/\/+$/, "");
}

/** The local path behind a library setting (path or file:// URL), for existence checks. */
export function libraryPath(library: string): string {
  const url = libraryLocation(library);
  if (!url) return "";
  try {
    return decodeURIComponent(url.replace(/^file:\/\//i, ""));
  } catch {
    return url.replace(/^file:\/\//i, "");
  }
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface FcpxmlInput {
  /**
   * The event that holds the raw clips. With `layout` it is the campaign's own Event field and may be
   * blank (the layout then falls back: "Export", or "Clips" for the flat layout).
   */
  eventName: string;
  /** How events and folders are laid out. Omitted: one event named `eventName` (the old behaviour). */
  layout?: FcpLayout;
  clips: FcpClip[];
  /** .fcpbundle path or file:// URL. Omitted: no import-options, Final Cut decides. */
  library?: string;
  /** Present: also create one project per clip in its own event. */
  project?: FcpxmlProject;
}

// ---------------------------------------------------------------------------
// Layouts: events and per-video folders
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "25 Nov 2026", in the clipper's own time zone. */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface VideoGroup {
  /** Unique name inside one document: the video title, "Video 2" when it has none, " 2" when two share one. */
  name: string;
  /** Clip indexes, in order. */
  indexes: number[];
}

/** Group clips by source video (its link, else its title), keeping first-seen order. */
export function groupByVideo(clips: Pick<FcpClip, "sourceUrl" | "sourceTitle">[]): VideoGroup[] {
  const groups: (VideoGroup & { key: string })[] = [];
  const names = new Set<string>();
  clips.forEach((c, i) => {
    const key = (c.sourceUrl ?? "").trim() || (c.sourceTitle ?? "").trim() || "?";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const base = noEmDash((c.sourceTitle ?? "").trim()).replace(/\s+/g, " ") || `Video ${groups.length + 1}`;
      let name = base;
      for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
      names.add(name);
      g = { key, name, indexes: [] };
      groups.push(g);
    }
    g.indexes.push(i);
  });
  return groups.map(({ name, indexes }) => ({ name, indexes }));
}

/** A keyword value: commas separate keywords in Final Cut, so a title's own comma becomes a space. */
export const keywordText = (name: string) => name.replace(/,/g, " ").replace(/\s+/g, " ").trim();

function legacyEvents(
  mediaEvent: string,
  projectEvent: string,
  mediaItems: string[],
  projectItems: string[],
  hasProject: boolean,
  collections: string[] = [],
): string[] {
  const merged = hasProject && projectEvent.trim() === mediaEvent.trim();
  const events: string[] = [
    `    <event name="${attrText(mediaEvent)}">`,
    ...collections,
    ...mediaItems,
    ...(merged ? projectItems : []),
    `    </event>`,
  ];
  if (hasProject && !merged) {
    events.push(`    <event name="${attrText(projectEvent)}">`, ...projectItems, `    </event>`);
  }
  return events;
}

/**
 * Events for a layout. Raw clips get a keyword per video, which Final Cut shows as a keyword
 * collection. A project cannot carry keywords (the DTD gives <project> only a <sequence>), so each
 * video's projects are gathered by a smart collection that names them, next to the raw-clips folder.
 */
function laidOutEvents(o: {
  layout: FcpLayout;
  eventName: string;
  groups: VideoGroup[];
  clips: FcpClip[];
  mediaItems: string[];
  projectItems: string[];
  projectNames: string[];
}): string[] {
  const hasProjects = o.projectItems.length > 0;
  const body = (g: VideoGroup, withFolder: boolean): string[] => [
    ...(withFolder ? [`      <keyword-collection name="${attrText(keywordText(g.name))}"/>`] : []),
    ...(withFolder && hasProjects
      ? [
          // Named exactly like the keyword collection, and matching by the video's name (written into each
          // project's note), so a later import of another clip from the same video joins it.
          `      <smart-collection name="${attrText(keywordText(g.name))}" match="any">`,
          `        <match-text rule="includes" scope="notes" value="${attrText(keywordText(g.name))}"/>`,
          `      </smart-collection>`,
        ]
      : []),
    ...g.indexes.flatMap((i) => [o.mediaItems[i], ...(hasProjects ? [o.projectItems[i]] : [])]),
  ];
  const event = (name: string, lines: string[]) => [`    <event name="${attrText(name)}">`, ...lines, `    </event>`];

  switch (o.layout) {
    case "flat":
      return event(
        o.eventName.trim() || DEFAULT_EXPORT_EVENT,
        o.groups.flatMap((g) => body(g, false)),
      );
    case "video":
      return o.groups.flatMap((g) => event(g.name, body(g, false)));
    case "day": {
      const days: { name: string; groups: VideoGroup[] }[] = [];
      for (const g of o.groups) {
        // A video's clips may span days: each day gets its own part of the group.
        const byDay = new Map<string, number[]>();
        g.indexes.forEach((i) => {
          const day = dayLabel(o.clips[i].cutAt ?? Date.now());
          byDay.set(day, [...(byDay.get(day) ?? []), i]);
        });
        for (const [day, indexes] of byDay) {
          let d = days.find((x) => x.name === day);
          if (!d) days.push((d = { name: day, groups: [] }));
          d.groups.push({ name: g.name, indexes });
        }
      }
      return days.flatMap((d) =>
        event(
          d.name,
          d.groups.flatMap((g) => body(g, true)),
        ),
      );
    }
    default:
      return event(
        o.eventName.trim() || DEFAULT_EXPORT_EVENT,
        o.groups.flatMap((g) => body(g, true)),
      );
  }
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
          `width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>`,
      });
    }
    return id;
  };

  const projectNames = input.project ? resolveProjectNames(input.clips, input.project) : [];
  const layout = input.layout;
  const groups = layout ? groupByVideo(input.clips) : [];
  const folders = layout === "export" || layout === "day";
  const videoOf = new Map<number, string>();
  groups.forEach((g) => g.indexes.forEach((i) => videoOf.set(i, g.name)));
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
        `format="${formatId}" tcFormat="NDF">` + (notes ? `
        <note>${xmlEscape(noEmDash(notes))}</note>` : "") +
        (folders && videoOf.has(index)
          ? `\n        <keyword start="0s" duration="${duration}" value="${attrText(keywordText(videoOf.get(index) as string))}"/>`
          : !layout && clip.keyword?.trim()
            ? `\n        <keyword start="0s" duration="${duration}" value="${attrText(clip.keyword ?? "")}"/>`
          : "") +
        `
      </asset-clip>`,
    );

    if (input.project) {
      const tl = resolveTimeline(input.project.timeline, m, input.project.look?.format);
      const tlFormat = formatFor(tl.width, tl.height, tl.fps);
      // Whole timeline frames, rounded down, so the clip never overruns its media.
      const assetSec = (frames * m.fps.den) / m.fps.num;
      const tlFrames = secondsToFrames(assetSec, tl.fps);
      if (tlFrames < 1) throw new Error(`${clip.id}: the file is shorter than one timeline frame`);
      const tlDuration = formatTime(tlFrames, tl.fps);
      const lookClip = input.project.look?.clip;
      const seq =
        ` tcStart="0s" tcFormat="NDF"` +
        (m.audioChannels ? ` audioLayout="${m.audioChannels === 1 ? "mono" : "stereo"}"` : "") +
        (m.audioRate ? ` audioRate="${m.audioRate}"` : "");
      projectItems.push(
        [
          `      <project name="${attrText(projectNames[index])}">`,
          `        <sequence format="${tlFormat}" duration="${tlDuration}"${seq}>`,
          // The video's name, so the video's smart collection finds this project (layouts A and C).
          ...(folders && videoOf.has(index) ? [`          <note>${xmlEscape(keywordText(videoOf.get(index) as string))}</note>`] : []),
          `          <spine>`,
          `            <asset-clip ref="${assetId}" offset="0s" name="${name}" start="0s" ` +
            `duration="${tlDuration}" tcFormat="NDF"` +
            (lookClip
              ? `>${notes ? `\n              <note>${xmlEscape(noEmDash(notes))}</note>` : ""}\n${lookClip}\n            </asset-clip>`
              : note("            ")),
          `          </spine>`,
          `        </sequence>`,
          `      </project>`,
        ].join("\n"),
      );
    }
  });

  const collections = [...new Set(input.clips.map((c) => (c.keyword ?? "").trim()).filter(Boolean))].map(
    (k) => `      <keyword-collection name="${attrText(k)}"/>`,
  );
  const events: string[] = layout
    ? laidOutEvents({
        layout,
        eventName: input.eventName,
        groups,
        clips: input.clips,
        mediaItems,
        projectItems,
        projectNames,
      })
    : legacyEvents(input.eventName, input.project?.eventName ?? "", mediaItems, projectItems, !!input.project, collections);

  const location = libraryLocation(input.library ?? "");
  // Apple's import shape: import-options first (the DTD requires it before
  // resources), then resources, then bare events. If nothing exists at the
  // location Final Cut creates a library there, so callers check it first.
  // The DTD lists format and asset under one <resources>; formats first so each
  // asset's format reference resolves in document order.
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    ``,
    `<fcpxml version="${input.project?.look?.version ?? FCPXML_VERSION}">`,
    ...(location
      ? [
          `  <import-options>`,
          `    <option key="library location" value="${xmlEscape(location)}"/>`,
          `  </import-options>`,
        ]
      : []),
    `  <resources>`,
    ...formats.map((f) => f.xml),
    ...assets,
    ...(input.project?.look?.effects ?? []),
    `  </resources>`,
    ...events.map((l) => l.slice(2)),
    `</fcpxml>`,
    ``,
  ].join("\n");
}

/** A filename for the document: event name made safe, with the extension. */
export function fcpxmlFilename(eventName: string, clipId?: string): string {
  const clean = (t: string) =>
    noEmDash(t)
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "");
  const MAX = 80;
  const clip = clipId ? clean(clipId).slice(0, MAX) : "";
  // The clip's name is the part that tells two documents apart, so it is what survives the cut: the Event name
  // gives way, never the clip (a long Event name used to push every clip's name off the end).
  const event = clean(eventName).slice(0, clip ? Math.max(0, MAX - clip.length - 1) : MAX).trim();
  const safe = [event, clip].filter(Boolean).join(" ").trim();
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
  /** The source video's title (its folder or event in the layouts that group by video). */
  sourceTitle?: string;
  /** When the clip was cut, ms since 1970 (its day in the per-day layout). */
  cutAt?: number;
  /** Keyword and keyword collection this clip gets in the event (see `importLayout`). */
  keyword?: string;
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
  options: {
    library?: string;
    project?: FcpxmlProject;
    /** How events and folders are laid out; see FcpLayout. Omitted: one event named `eventName`. */
    layout?: FcpLayout;
    /**
     * Required when `library` is set. Final Cut CREATES a library when nothing
     * exists at the location, so a typo would silently spawn a stray one; the
     * build is refused instead. Receives the local path of the .fcpbundle.
     */
    libraryExists?: (localPath: string) => Promise<boolean>;
  } = {},
): Promise<SessionResult> {
  const libraryText = (options.library ?? "").trim();
  if (libraryText) {
    const local = libraryPath(libraryText); // throws on a relative path
    if (!options.libraryExists) {
      throw new Error("The library could not be checked, so nothing was sent. Clear the Library field or use the desktop app.");
    }
    if (!(await options.libraryExists(local))) {
      throw new Error(
        `There is no library at ${local}. Final Cut would create a new one there, so nothing was sent. Check the path, or clear the Library field.`,
      );
    }
  }
  const ready: FcpClip[] = [];
  const skipped: SessionResult["skipped"] = [];
  for (const clip of clips) {
    try {
      const media = parseProbe(await probe(clip.path));
      const candidate: FcpClip = { ...clip, media };
      // Building the clip alone surfaces anything that makes it unusable (shorter than a
      // frame of the file or of the timeline). That is this clip's problem, not the batch's.
      buildFcpxml({ eventName, clips: [candidate], project: options.project, layout: options.layout });
      ready.push(candidate);
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
    xml: buildFcpxml({ eventName, clips: ready, library: options.library, project: options.project, layout: options.layout }),
    // One clip per document is named for the clip, so a later send never overwrites an earlier file.
    filename: fcpxmlFilename(options.layout ? eventName.trim() || DEFAULT_EXPORT_EVENT : eventName, ready.length === 1 ? ready[0].id : undefined),
    included: ready.length,
    projectNames: options.project ? resolveProjectNames(ready, options.project) : [],
    skipped,
  };
}
