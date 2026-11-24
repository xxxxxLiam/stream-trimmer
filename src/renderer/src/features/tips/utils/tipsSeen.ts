/**
 * File: tipsSeen.ts
 * Path: src/renderer/src/features/tips/utils/tipsSeen.ts
 * Description: Which tips were seen, and which one to show next. Pure: the caller reads the target
 *   check from the page. "Seen" records the version, so a newer version shows once again.
 */
import type { Tip } from "./tipRegistry";

export const TIPS_ON_KEY = "clipper.tips.on";
export const TIPS_SEEN_KEY = "clipper.tips.seen";

export type Seen = Record<string, number>;

export function normalizeSeen(raw: unknown): Seen {
  const out: Seen = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "number") out[k] = v;
  }
  return out;
}

export function isSeen(tip: Tip, seen: Seen): boolean {
  return (seen[tip.id] ?? 0) >= tip.version;
}

/** The first unseen tip whose first control is on screen; null when tips are off. */
export function nextTip(tips: readonly Tip[], seen: Seen, on: boolean, present: (selector: string) => boolean): Tip | null {
  if (!on) return null;
  return tips.find((t) => !isSeen(t, seen) && present(t.steps[0].target)) ?? null;
}

export function markSeen(seen: Seen, tip: Tip): Seen {
  return { ...seen, [tip.id]: tip.version };
}

/** Replay: forget the tips whose first control is on screen now (the open panels). */
export function forgetOpen(tips: readonly Tip[], seen: Seen, present: (selector: string) => boolean): Seen {
  const out = { ...seen };
  for (const t of tips) if (present(t.steps[0].target)) delete out[t.id];
  return out;
}
