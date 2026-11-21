/**
 * File: diagnostics.ts
 * Path: src/lib/diagnostics.ts
 * Description: Per-failure diagnostics. Decides whether a failure is the user's to fix or the
 *   developer's, redacts credentials and identity from engine output, and builds the scoped
 *   plain-text report that "Copy diagnostics" puts on the clipboard. Pure: no I/O, no clock,
 *   no environment reads. Everything it needs is passed in.
 */
import { formatDownloadRanges } from "./handoff";

// ---------------------------------------------------------------------------
// Classifier. ONE place. Unknown means the developer, never the user.
// ---------------------------------------------------------------------------

export type FailureKind = "userFixable" | "needsDeveloper";

/**
 * The seven user-fixable rows of the failure table, by the `code` the engine sends.
 * `YOUTUBE_AUTH_REQUIRED` is the same stale or missing session row, sent from the
 * pre-flight check before any download starts.
 *
 * This is an allow-list on purpose. A failure is the user's only if it is named here.
 */
export const USER_FIXABLE_CODES: readonly string[] = Object.freeze([
  "stale_session",
  "private_video",
  "network_dropped",
  "out_point_past_end",
  "save_folder_gone",
  "disk_full",
  "engine_behind",
  "YOUTUBE_AUTH_REQUIRED",
]);

/**
 * `userFixable` only for an exact match on a known code. A missing code, a code this
 * build has never heard of, a non-string: all `needsDeveloper`.
 */
export function classifyFailureKind(code: unknown): FailureKind {
  return typeof code === "string" && USER_FIXABLE_CODES.includes(code)
    ? "userFixable"
    : "needsDeveloper";
}

/** True when the failure should offer Copy diagnostics. */
export function needsDeveloper(code: unknown): boolean {
  return classifyFailureKind(code) === "needsDeveloper";
}

// ---------------------------------------------------------------------------
// Redactor
// ---------------------------------------------------------------------------

export interface RedactOptions {
  /** The user's home directory as the engine sees it, e.g. /Users/sam or C:\Users\Sam. */
  homeDir?: string | null;
}

interface RedactionRule {
  id: string;
  apply: (text: string, opts: RedactOptions) => string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Query or fragment parameter names whose values are never worth keeping. */
const SENSITIVE_PARAM_EXACT = new Set(["s", "ip", "si", "n"]);
const SENSITIVE_PARAM_CONTAINS =
  /sig|token|secret|key|auth|pass|session|cookie|credential|pot|sid|visitor|ticket/i;

function isSensitiveParam(name: string): boolean {
  const n = name.toLowerCase();
  return SENSITIVE_PARAM_EXACT.has(n) || SENSITIVE_PARAM_CONTAINS.test(n);
}

/** Each rule is independent and single-line, so any one can be disabled in a test. */
export const REDACTION_RULES: readonly RedactionRule[] = [
  {
    // Lines that quote the cookies file itself: the Netscape header and its rows.
    id: "cookie-file-contents",
    apply: (t) =>
      t
        .replace(/^.*Netscape HTTP Cookie File.*$/gim, "[cookie data removed]")
        .replace(
          /(?:#HttpOnly_)?\.?[\w.-]+[ \t]+(?:TRUE|FALSE)[ \t]+\S*[ \t]+(?:TRUE|FALSE)[ \t]+\d+[ \t]+.*$/gim,
          "[cookie data removed]",
        ),
  },
  {
    // Cookie, Set-Cookie and Authorization headers, whatever wraps them.
    id: "auth-headers",
    apply: (t) =>
      t.replace(
        /\b((?:set-)?cookie|authorization|proxy-authorization)(\s*[:=]\s*)[^\n]*/gi,
        "$1$2<redacted>",
      ),
  },
  {
    // `--cookies <path>` and `--cookies=<path>`, quoted or not.
    id: "cookies-flag",
    apply: (t) =>
      t.replace(
        /--cookies(?:=|[ \t]+)(?:"[^"\n]*"|'[^'\n]*'|[^\n]*?\.(?:txt|jar|sqlite)\b|\S+)/g,
        "--cookies <redacted>",
      ),
  },
  {
    // The same path as an options object: "cookies":"/path/yt-cookies.txt".
    id: "cookies-option",
    apply: (t) =>
      t.replace(/(["']?cookies["']?\s*:\s*)(?:"[^"\n]*"|'[^'\n]*')/gi, '$1"<redacted>"'),
  },
  {
    // Any other mention of a cookies file by path.
    id: "cookie-file-path",
    apply: (t) =>
      t.replace(
        /(?<![^\s"'=(])(?:~|[A-Za-z]:)?[\\/][^\n"']*?cookies?[\w.-]*\.(?:txt|jar|sqlite)\b/gi,
        "<cookies file>",
      ),
  },
  {
    // Signed URLs: strip the values of token-like and signature-like parameters.
    id: "url-secrets",
    apply: (t) =>
      t.replace(/https?:\/\/[^\s"'<>]+/gi, (url) =>
        url.replace(/([?&#;])([^=&#;\s]+)=([^&#;\s]*)/g, (m, sep: string, name: string) =>
          isSensitiveParam(name) ? `${sep}${name}=REDACTED` : m,
        ),
      ),
  },
  {
    // PO tokens and the other identity-bearing values yt-dlp accepts or prints.
    id: "po-token",
    apply: (t) =>
      t
        .replace(
          /(po[_ -]?tokens?|visitor[_ -]?data|data[_ -]?sync[_ -]?id|access[_ -]?token|refresh[_ -]?token|api[_ -]?key)(\s*[=:]\s*)[^\s"';,&]+/gi,
          "$1$2<redacted>",
        )
        .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer <redacted>"),
  },
  {
    // The home directory, wherever it appears: first the exact one we were told,
    // then the usual shapes in case it was spelled differently inside engine output.
    id: "home-dir",
    apply: (t, opts) => {
      let out = t;
      const home = (opts.homeDir ?? "").trim().replace(/[\\/]+$/, "");
      if (home.length > 1) {
        const parts = home.split(/[\\/]+/).filter(Boolean).map(escapeRe);
        const lead = /^[\\/]/.test(home) ? "[\\\\/]" : "";
        const spelled = lead + parts.join("[\\\\/]+");
        out = out.replace(new RegExp(`${spelled}(?![\\w-])`, "gi"), "~");
      }
      return out
        .replace(/(?<![\w-])[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, "~")
        .replace(/(?<![\w~-])\/(?:Users|home)\/[^/\s"']+/g, "~");
    },
  },
  {
    id: "email",
    apply: (t) => t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>"),
  },
];

/**
 * Removes credentials and identity from free text. `disabled` exists so tests can prove each
 * rule is load-bearing; production callers never pass it.
 */
export function redact(
  text: string,
  opts: RedactOptions = {},
  disabled: ReadonlySet<string> = new Set(),
): string {
  let out = String(text ?? "");
  for (const rule of REDACTION_RULES) {
    if (!disabled.has(rule.id)) out = rule.apply(out, opts);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

/** What the engine attaches to a failure so the renderer can describe that one run. */
export interface FailureDiagnostics {
  jobId?: string;
  appVersion?: string;
  platform?: string;
  osRelease?: string;
  arch?: string;
  homeDir?: string;
  ytDlpVersion?: string | null;
  ffmpegVersion?: string | null;
  /** Engine stderr for this run only, oldest first. */
  stderrTail?: string[];
  /** Log lines that carry this run's job id, oldest first. */
  logLines?: string[];
}

export interface FailureAttempt {
  operation?: string;
  videoId?: string | null;
  segments?: ReadonlyArray<{ start: number; end: number }>;
  format?: string;
  quality?: string;
}

export interface BundleInput {
  code?: string | null;
  message?: string | null;
  attempt?: FailureAttempt;
  diagnostics?: FailureDiagnostics | null;
  /** Injected so the builder stays pure. */
  now: Date;
}

export const MAX_BUNDLE_CHARS = 16_000;
export const MAX_STDERR_LINES = 100;
export const MAX_LOG_LINES = 200;
const MAX_LINE_CHARS = 400;
const MAX_MESSAGE_CHARS = 1_200;

/** Short, stable, non-secret id so a report can be referred to later. FNV-1a, 6 hex digits. */
export function failureId(parts: ReadonlyArray<string | number | null | undefined>): string {
  let h = 0x811c9dc5;
  for (const ch of parts.map((p) => String(p ?? "")).join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/** Progress chatter is noise in a bug report. */
const PROGRESS_LINE = /^\s*(?:\[download\]\s+\d+(?:\.\d+)?%|frame=|size=\s)/;

function cleanLines(lines: readonly string[] | undefined, opts: RedactOptions, max: number): string[] {
  const kept: string[] = [];
  for (const raw of lines ?? []) {
    for (const piece of String(raw).split(/\r?\n|\r/)) {
      if (!piece.trim() || PROGRESS_LINE.test(piece)) continue;
      kept.push(clip(redact(piece, opts).trimEnd(), MAX_LINE_CHARS));
    }
  }
  return kept.slice(-max);
}

/**
 * Builds the scoped report. Everything user-controlled is redacted before it is
 * truncated, so a cut can never land in the middle of an unredacted secret.
 */
export function buildDiagnosticsBundle(input: BundleInput): string {
  const d = input.diagnostics ?? {};
  const opts: RedactOptions = { homeDir: d.homeDir };
  const r = (s: string | null | undefined, fallback = "unknown") =>
    s ? redact(String(s), opts).replace(/\s+/g, " ").trim() || fallback : fallback;

  const iso = input.now.toISOString();
  const id = failureId([iso, input.code, d.jobId, input.message]);
  const a = input.attempt ?? {};
  const ranges = a.segments?.length ? formatDownloadRanges(a.segments) : "";
  const attempted = [
    a.operation || "download",
    a.videoId ? `video ${a.videoId}` : "",
    ranges ? `ranges ${ranges}` : "",
    a.format ? `format ${a.format}` : "",
    a.quality ? `quality ${a.quality}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const message = clip(
    redact(String(input.message ?? "").trim(), opts).replace(/\s+/g, " "),
    MAX_MESSAGE_CHARS,
  );

  const header = [
    "Clipper diagnostics",
    `Failure id: ${id}`,
    `Time: ${iso}`,
    `App: ${r(d.appVersion)}`,
    `OS: ${r(d.platform)} ${r(d.osRelease, "")} ${r(d.arch, "")}`.replace(/\s+/g, " ").trim(),
    `yt-dlp: ${r(d.ytDlpVersion)}`,
    `ffmpeg: ${r(d.ffmpegVersion)}`,
    `Job: ${r(d.jobId)}`,
    `Attempted: ${attempted}`,
    `Error code: ${r(input.code, "none")}`,
    `Error message: ${message || "none"}`,
  ].join("\n");

  let stderr = cleanLines(d.stderrTail, opts, MAX_STDERR_LINES);
  let logs = cleanLines(d.logLines, opts, MAX_LOG_LINES);
  let droppedStderr = 0;
  let droppedLogs = 0;

  const render = (): string => {
    const parts = [header];
    parts.push(
      `\n--- engine stderr, this run only (${stderr.length} lines${droppedStderr ? `, ${droppedStderr} earlier omitted` : ""}) ---`,
      stderr.length ? stderr.join("\n") : "(none captured)",
    );
    parts.push(
      `\n--- log lines for job ${r(d.jobId)} (${logs.length} lines${droppedLogs ? `, ${droppedLogs} earlier omitted` : ""}) ---`,
      logs.length ? logs.join("\n") : "(none captured)",
    );
    return parts.join("\n");
  };

  // Over budget: drop the oldest line from whichever section is longer in characters.
  let text = render();
  while (text.length > MAX_BUNDLE_CHARS && (stderr.length || logs.length)) {
    const sErr = stderr.reduce((n, l) => n + l.length + 1, 0);
    const sLog = logs.reduce((n, l) => n + l.length + 1, 0);
    if (sErr >= sLog && stderr.length) {
      stderr = stderr.slice(1);
      droppedStderr++;
    } else if (logs.length) {
      logs = logs.slice(1);
      droppedLogs++;
    } else {
      stderr = stderr.slice(1);
      droppedStderr++;
    }
    text = render();
  }
  return text.length > MAX_BUNDLE_CHARS ? text.slice(0, MAX_BUNDLE_CHARS) : text;
}

/** Wraps the report in a fenced block that survives being pasted into a chat. */
export function fenceForClipboard(text: string): string {
  let fence = "```";
  while (text.includes(fence)) fence += "`";
  return `${fence}text\n${text}\n${fence}`;
}
