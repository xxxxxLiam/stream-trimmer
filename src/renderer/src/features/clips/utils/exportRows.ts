/**
 * File: exportRows.ts
 * Path: src/renderer/src/features/clips/utils/exportRows.ts
 * Description: Pure helpers for the Export panel: which moments are waiting, which one is the
 *   suggested next, the row text on the board, and the Undo ring's drain.
 */
import type { BankedClip } from "../../../shared/utils/bank";
import { clipLength } from "../../../shared/utils/bank";
import { formatLength } from "../../../shared/utils/segments";

/** Undo lasts 8 seconds everywhere (decisions-current.md, "Undo length"). */
export const UNDO_SECONDS = 8;

/** The Undo ring's circle on the 36-unit board (radius 15). */
const RING_CIRCUMFERENCE = 94.2;

/** Moments still waiting to be made, in the order they were imported. */
export function waitingClips(clips: readonly BankedClip[]): BankedClip[] {
  return clips.filter((c) => c.status === "banked");
}

/** The suggested next: the best-rated waiting moment, or the first one when nothing is rated. */
export function suggestedNextId(waiting: readonly BankedClip[]): string | null {
  let best: BankedClip | null = null;
  for (const c of waiting) {
    if (!best || (c.rating ?? -1) > (best.rating ?? -1)) best = c;
  }
  return best?.id ?? null;
}

/** h:mm:ss as on the board ("1:12:04"). */
export function boardTime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "1:12:04–1:12:46 · 0:42"; joined clips show the first range and how many more. */
export function rangeLine(clip: BankedClip): string {
  const first = clip.segments[0];
  if (!first) return "";
  const more = clip.segments.length - 1;
  const head = `${boardTime(first.start)}–${boardTime(first.end)}`;
  return `${head}${more > 0 ? ` +${more}` : ""} · ${formatLength(clipLength(clip))}`;
}

export function ratingText(rating: number | undefined): string {
  return rating === undefined ? "" : rating.toFixed(1);
}

/** The Making row's second line: Preparing until bytes move, then the percentage. */
export function makingText(percent: number, phase: string): string {
  if (phase === "processing") return "Finishing up";
  const p = Math.floor(percent);
  return p > 0 ? `Making · ${p}%` : "Preparing";
}

export function undoText(secondsLeft: number): string {
  return `Undo · ${Math.max(0, Math.ceil(secondsLeft))} s left`;
}

/** stroke-dasharray for the Ice arc: full at 8 s left, empty at 0. */
export function undoRingDash(secondsLeft: number): string {
  const frac = Math.max(0, Math.min(1, secondsLeft / UNDO_SECONDS));
  return `${(RING_CIRCUMFERENCE * frac).toFixed(1)} ${RING_CIRCUMFERENCE}`;
}

/** The empty Export sentence (board 03.2.14), with the save-for-later key for this computer. */
export function emptyExportText(isMac: boolean): string {
  return `Nothing waiting. Mark a part and press ${isMac ? "⌘B" : "Ctrl B"} to save it for later, or paste moments from your sheet.`;
}
