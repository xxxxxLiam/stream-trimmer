/**
 * File: clipFailure.ts
 * Path: src/renderer/src/features/clips/utils/clipFailure.ts
 * Description: What a clip that failed says on its own Export row (Liam's cards, 24 Nov): the
 *   reason in error red, one plain line about what happens next, and the buttons that fit. No
 *   banner, dialog, toast or sound.
 */
export type ClipFailureKind = "stopped" | "disk" | "private";
export type FailureAction = "retry" | "copyDetails" | "changeFolder" | "showInBrowser" | "saveForLater";

export function classifyClipFailure(code: string | undefined): ClipFailureKind {
  if (code === "disk_full" || code === "save_folder_gone") return "disk";
  if (code === "private_video") return "private";
  return "stopped";
}

export function failureCopy(kind: ClipFailureKind, attempts: number): { reason: string; detail: string } {
  if (kind === "disk") {
    return { reason: "There isn't enough space to save it.", detail: "It waits here until it has somewhere to go." };
  }
  if (kind === "private") {
    return { reason: "This video is private, so it can't be downloaded.", detail: "Your range is kept." };
  }
  return {
    reason: "YouTube stopped the download.",
    detail: attempts < 2 ? "Clipr is updating its download tools and will try once more." : "Your range is kept.",
  };
}

/** Retry; after the retry also failed, Copy details joins it. */
export function failureActions(kind: ClipFailureKind, attempts: number): FailureAction[] {
  if (kind === "disk") return ["changeFolder"];
  if (kind === "private") return ["showInBrowser", "saveForLater"];
  return attempts >= 2 ? ["retry", "copyDetails"] : ["retry"];
}

/** R retries, but never while typing in a field and never with a modifier (⌘R is not used). */
export function isRetryKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: unknown }): boolean {
  if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = t?.tagName?.toUpperCase();
  return !(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable);
}
