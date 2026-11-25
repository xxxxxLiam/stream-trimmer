/**
 * File: clipFailure.ts
 * Path: src/renderer/src/features/clips/utils/clipFailure.ts
 * Description: What a clip that failed says on its own Export row (Liam's cards, 24 Nov): the
 *   reason in error red, one plain line about what happens next, and the buttons that fit. No
 *   banner, dialog, toast or sound.
 */
import type { ClipRowState } from "../../../../../common/types/clipRowState";
import { RETRY_SENTENCE } from "../../../../../common/types/clipRowState";
import { ROOM_REASON, roomDetail } from "../../../shared/utils/freeSpace";

export type ClipFailureKind = "stopped" | "disk" | "private" | "offline" | "toolong" | "signin" | "expired" | "age" | "members" | "drivegone" | "norights" | "removed" | "refused" | "ratelimited" | "format" | "tools";
export type FailureAction = "retry" | "copyDetails" | "changeFolder" | "showInBrowser" | "saveForLater" | "signIn" | "showFolder";

/** What a plain "the network is down" failure looks like in the engine's message (no YouTube error involved). */
const OFFLINE = /no internet|offline|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|getaddrinfo|network is unreachable|name resolution|unable to connect|timed out|connection (?:reset|refused|timed out)/i;

/** The engine refuses a joined clip over the cap with this sentence (segments.ts). */
const TOO_LONG = /capped at \d+ seconds|up to 10 minutes/i;

/** The engine's words for a 403 or a failed fetch of the media itself (it has no code of its own). */
const REFUSED = /refused the media request|HTTP Error 403|403 Forbidden/i;

/** The engine's words for a folder that refuses writes (permission), as against one that is gone. */
const NOT_ALLOWED = /can['’]t write|permission|not allowed|read-only/i;

export function classifyClipFailure(code: string | undefined, message?: string): ClipFailureKind {
  if (message && TOO_LONG.test(message)) return "toolong";
  if (code === "disk_full") return "disk";
  // The folder cannot be used: a missing folder or unplugged drive, or one that refuses writes (the engine's words tell them apart).
  if (code === "folder_not_writable" || (code === "save_folder_gone" && message && NOT_ALLOWED.test(message))) return "norights";
  if (code === "save_folder_gone") return "drivegone";
  if (code === "private_video") return "private"; // the code decides: the engine's one sentence says "private or members-only", so words cannot tell them apart
  if (code === "sign_in_needed" || code === "age_restricted") return "age";
  if (code === "members_only") return "members";
  if (code === "bot_check") return "signin";
  // YouTube rejected the saved sign-in (the engine sends the stale-session row, or its pre-flight twin).
  if (code === "stale_session" || code === "YOUTUBE_AUTH_REQUIRED") return "expired";
  if (code === "video_unavailable" || code === "video_removed") return "removed";
  if (code === "access_refused") return "refused";
  if (code === "rate_limited") return "ratelimited";
  if (code === "format_unavailable") return "format";
  if (code === "tools_missing") return "tools";
  if (code === "network_dropped") return "offline";
  if (message && REFUSED.test(message)) return "refused";
  // Only a failure with no code of its own and a network cause in its words is "offline".
  if (!code && message && OFFLINE.test(message)) return "offline";
  return "stopped";
}

/** The engine's row state wins over the code: it knows whether the one retry was spent. */
export function rowFailure(row: ClipRowState): { kind: ClipFailureKind; attempts: number; reason?: string; retrying?: boolean; final?: boolean } {
  if (row.state === "no-space") return { kind: "disk", attempts: 1 };
  if (row.state === "cannot-download") {
    return row.kind === "other"
      ? { kind: "private", attempts: 1, reason: row.reason }
      : { kind: "private", attempts: 1 };
  }
  // Only a row that says the engine IS retrying may promise it; a plain failure promises nothing. A final row
  // carries the engine's own plain sentence, and it is final: nothing more is coming, so Copy details joins.
  if (row.state === "failed-final") return { kind: "stopped", attempts: 1, reason: row.reason, final: true };
  return { kind: "stopped", attempts: 1, reason: row.reason, ...(row.retrying ? { retrying: true } : {}) };
}

/** While the engine updates its tools and tries once more, the Making row says so. */
export const isRetryingNote = (note: string): boolean => note === RETRY_SENTENCE;

export function failureCopy(
  kind: ClipFailureKind,
  attempts: number,
  reasonOverride?: string,
  retrying = false,
  room?: { neededMb: number; freeMb: number },
  campaign?: string,
): { reason: string; detail: string } {
  // The engine's sentence may lack its full stop; the detail follows it on the same line.
  const ov = reasonOverride && !/[.!?]$/.test(reasonOverride.trim()) ? `${reasonOverride.trim()}.` : reasonOverride;
  if (kind === "disk" && room) return { reason: ov ?? ROOM_REASON, detail: roomDetail(room) };
  if (kind === "disk") {
    return { reason: ov ?? "There isn’t enough space to save it.", detail: "It waits here until it has somewhere to go." };
  }
  const folder = campaign ? `${campaign}’s folder` : "your clips folder";
  if (kind === "drivegone") return { reason: `The drive with ${folder} isn’t connected.`, detail: "Plug it back in and it carries on by itself, or pick another folder." };
  if (kind === "norights") return { reason: `Clipr isn’t allowed to save in ${folder}.`, detail: "Pick another folder, or give Clipr access to this one." };
  if (kind === "age") return { reason: "YouTube only shows this video to signed-in adults.", detail: "Sign in once and it tries again by itself. Your range is kept." };
  if (kind === "members") return { reason: "Only members of this channel can download it.", detail: "Your range is kept." };
  if (kind === "toolong") return { reason: "Clips can be up to 10 minutes.", detail: "Shorten it and clip again." };
  if (kind === "offline") {
    return { reason: "No internet connection.", detail: attempts < 2 ? "Check your connection, then Retry." : "" };
  }
  if (kind === "private") {
    return { reason: ov ?? "This video is private, so it can’t be downloaded.", detail: "Your range is kept." };
  }
  if (kind === "expired") return { reason: "YouTube ended your sign-in.", detail: "Sign in again, then Retry. Your range is kept." };
  if (kind === "signin") return { reason: "YouTube wants you signed in for this video.", detail: "Sign in, then Retry. Your range is kept." };
  if (kind === "removed") return { reason: "This video was removed or isn’t available.", detail: "Your range is kept." };
  if (kind === "refused") return { reason: ov ?? "YouTube refused the download for this video.", detail: attempts < 2 ? "Try again in a moment." : "" };
  // "Will try once more" is said only when the engine really is about to (retrying:true).
  if (kind === "ratelimited") return { reason: ov ?? "YouTube is asking Clipr to slow down.", detail: "Try again in a few minutes." };
  if (kind === "format") return { reason: ov ?? "That quality isn’t available for this video.", detail: "Pick another quality, then Retry." };
  if (kind === "tools") return { reason: ov ?? "Clipr’s download tools are missing.", detail: "Restart Clipr, then Retry." };
  // The engine's own plain sentence when it sent one; "will try once more" only when it really is retrying.
  return { reason: ov ?? "YouTube stopped the download.", detail: retrying ? RETRY_SENTENCE : "" };
}

/** Retry; after the retry also failed, Copy details joins it. */
export function failureActions(kind: ClipFailureKind, attempts: number, final = false, signedIn = true): FailureAction[] {
  if (kind === "disk" || kind === "drivegone") return ["changeFolder"];
  // Copy details joins only if the problem stays.
  if (kind === "norights") return attempts >= 2 ? ["changeFolder", "showFolder", "copyDetails"] : ["changeFolder", "showFolder"];
  if (kind === "age") return ["signIn", "saveForLater"];
  if (kind === "members") return signedIn ? ["showInBrowser", "saveForLater"] : ["signIn", "showInBrowser", "saveForLater"];
  if (kind === "private" || kind === "removed") return ["showInBrowser", "saveForLater"];
  if (kind === "toolong") return [];
  if (kind === "signin" || kind === "expired") return attempts >= 2 ? ["signIn", "retry", "copyDetails"] : ["signIn", "retry"];
  // The rest get Retry (no engine retry is promised), with Copy details once the Retry also failed. A kind with
  // no sentence of its own (the engine's words stand in) has Copy details at once when the engine says final.
  const generic = kind === "stopped" || kind === "refused" || kind === "ratelimited" || kind === "format" || kind === "tools";
  return attempts >= 2 || (final && generic) ? ["retry", "copyDetails"] : ["retry"];
}

/** R retries, but never while typing in a field and never with a modifier (⌘R is not used). */
export function isRetryKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: unknown }): boolean {
  if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = t?.tagName?.toUpperCase();
  return !(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable);
}

/**
 * A cut that stopped because the connection went has its own quiet row and carries on when it is back. After
 * three tries in a row the machine still says it is online, so something else is wrong and the failure row with
 * Retry is the honest one.
 */
export function isWaitingForConnection(kind: ClipFailureKind, failuresInARow: number, onLine: boolean): boolean {
  return kind === "offline" && !(failuresInARow >= 3 && onLine);
}
