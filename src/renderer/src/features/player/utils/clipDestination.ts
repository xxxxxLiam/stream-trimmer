/**
 * File: clipDestination.ts
 * Path: src/renderer/src/features/player/utils/clipDestination.ts
 * Description: Where clips go. The Clip arrow menu is the only place an editor is chosen; the choice
 *   sticks and nothing is chosen for the user (Save to folder is the baseline). Also the reason
 *   Clip is dimmed, which shows on hover and on focus.
 */
import type { AfterCutting } from "../../../shared/utils/fcpxml";

export type ClipDestination = "folder" | "premiere" | "finalcut" | "resolve" | "capcut";

export const DESTINATIONS: readonly { id: ClipDestination; label: string }[] = [
  { id: "folder", label: "Save to folder" },
  { id: "premiere", label: "Premiere Pro" },
  { id: "finalcut", label: "Final Cut Pro" },
  { id: "resolve", label: "DaVinci Resolve" },
  { id: "capcut", label: "CapCut" },
];

/** The editors this system offers (Final Cut is not offered on Windows); undefined = all. */
export function availableDestinations(offered: readonly string[] | undefined) {
  return DESTINATIONS.filter((d) => d.id === "folder" || !offered || offered.includes(d.id));
}

export function normalizeDestination(raw: unknown, offered?: readonly string[]): ClipDestination {
  const hit = availableDestinations(offered).find((d) => d.id === raw);
  return hit ? hit.id : "folder";
}

/** Final Cut has its own pipeline (FCPXML); the other editors are opened with the saved clip. */
export function toAfterCutting(d: ClipDestination): AfterCutting {
  return d === "finalcut" ? "finalcut" : "nothing";
}

export function clipReason(s: { hasRange: boolean; segments: number; busy: boolean }): string | null {
  if (s.busy) return "A clip is being made. Clip is ready when it's done.";
  if (!s.hasRange && s.segments === 0) return "Set an end first: click the timeline or press O";
  return null;
}

type Section = { start: number; end: number };

/**
 * What Clip makes: the locked sections in order, then the part currently marked (if it is a real
 * range and not already the last locked section).
 */
export function clipSections(segments: readonly Section[], range: Section | null): Section[] {
  const out = segments.map((s) => ({ start: s.start, end: s.end }));
  const last = out[out.length - 1];
  if (range && range.end > range.start && !(last && last.start === range.start && last.end === range.end)) out.push({ ...range });
  return out;
}

export const sectionsLength = (s: readonly Section[]) => s.reduce((n, x) => n + Math.max(0, x.end - x.start), 0);

/** The editor to open with the saved clip, for the editors without a project pipeline. */
export function openInFor(d: ClipDestination): "premiere" | "resolve" | "capcut" | undefined {
  return d === "premiere" || d === "resolve" || d === "capcut" ? d : undefined;
}
