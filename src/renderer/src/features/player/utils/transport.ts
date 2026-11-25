/**
 * File: transport.ts
 * Path: src/renderer/src/features/player/utils/transport.ts
 * Description: Pure rules for the Preview transport: speed cycle, the J K L keys, looping a
 *   (joined) clip, hover labels that carry their keys, and which end card shows.
 */
import type { Range } from "../../../shared/utils/segments";

export const SPEEDS = [1, 1.5, 2] as const;
export const STEP_SECONDS = 5;

export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return i < 0 ? SPEEDS[0] : SPEEDS[(i + 1) % SPEEDS.length];
}

/** `H:MM:SS`, as the board writes it (no leading zero on the hour). */
export function clockTime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${mm}:${ss}`;
}

export function stepTarget(current: number, by: number, duration: number): number {
  const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(0, current + by));
}

export type KeyAction =
  | { kind: "step"; by: number }
  | { kind: "shuttle"; dir: 1 | -1 }
  | { kind: "pause" }
  | { kind: "toggle" }
  | { kind: "loop" };

/** What a key does in the preview. `repeat` is true while the key is held down. */
export function keyAction(key: string, modifier: boolean, repeat: boolean): KeyAction | null {
  const k = key.toLowerCase();
  if (modifier) return k === "l" ? { kind: "loop" } : null;
  if (k === " ") return { kind: "toggle" };
  if (k === "k") return { kind: "pause" };
  if (k === "l") return repeat ? { kind: "shuttle", dir: 1 } : { kind: "step", by: STEP_SECONDS };
  if (k === "j") return repeat ? { kind: "shuttle", dir: -1 } : { kind: "step", by: -STEP_SECONDS };
  return null;
}

/**
 * Where to seek so playback stays inside the clip, or null when it is fine where it is.
 * Sections are in play order; the gap between them is skipped, the end wraps to the start.
 */
export function loopSeek(sections: readonly Range[], t: number): number | null {
  if (sections.length === 0) return null;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (t >= s.start && t < s.end) return null;
    if (t < s.start) return s.start;
    if (t >= s.end && i === sections.length - 1) return sections[0].start;
  }
  return null;
}

export type TransportButton = "play" | "back" | "forward" | "loop" | "speed" | "volume" | "fullscreen";

export function hoverLabel(button: TransportButton, mac: boolean): string {
  switch (button) {
    case "play":
      return "Play or pause  Space";
    case "back":
      return "Back 5 s · hold J to shuttle  J";
    case "forward":
      return "Forward 5 s · hold L to shuttle  L";
    case "loop":
      return `Loop the range  ${mac ? "⌘L" : "Ctrl L"}`;
    case "speed":
      return "Speed";
    case "volume":
      return "Volume";
    case "fullscreen":
      return "Full screen";
  }
}

export type EndCardInput = {
  next: { title: string; waiting: number } | null;
  made: number;
  quota: number | null;
};

export type EndCardKind = "next" | "done" | "nothing";

export function endCardKind({ next, made, quota }: EndCardInput): EndCardKind {
  if (next) return "next";
  if (quota !== null && quota > 0 && made >= quota) return "done";
  return "nothing";
}

/** Cmd on a Mac, Ctrl elsewhere; decides how the loop key is written. */
export function isMacLike(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
}

/**
 * Where the playhead sits inside a joined clip, counted in clip time: sections play in order with the
 * skipped parts left out. Before the first section it reads 0, in a gap it reads the end of the section
 * before it, and past the last it reads the total.
 */
export function clipPosition(sections: readonly Range[], t: number): { at: number; total: number } {
  const len = (s: Range) => Math.max(0, s.end - s.start);
  const total = sections.reduce((n, s) => n + len(s), 0);
  let offset = 0;
  for (const s of sections) {
    if (t >= s.start && t < s.end) return { at: offset + (t - s.start), total };
    offset += len(s);
  }
  // Not inside any section: everything that has already ended counts.
  return { at: sections.filter((s) => t >= s.end).reduce((n, s) => n + len(s), 0), total };
}

/** The inverse of clipPosition: the source time at `at` seconds into a joined clip. */
export function clipToVideo(sections: readonly Range[], at: number): number {
  let left = Math.max(0, at);
  for (const s of sections) {
    const len = Math.max(0, s.end - s.start);
    if (left < len) return s.start + left;
    left -= len;
  }
  const last = sections[sections.length - 1];
  return last ? last.end : 0;
}

const PRESSABLE_TAGS = ["BUTTON", "A", "SUMMARY", "INPUT", "TEXTAREA", "SELECT"];
const PRESSABLE_ROLES = ["button", "switch", "link", "checkbox", "radio", "tab", "menuitem", "menuitemradio", "menuitemcheckbox", "option", "slider"];

/** Space presses a focused button, switch, link, menu item or field; only elsewhere is it play and pause. */
export function spacePresses(el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName && PRESSABLE_TAGS.includes(el.tagName.toUpperCase())) return true;
  const role = el.getAttribute?.("role");
  return !!role && PRESSABLE_ROLES.includes(role);
}
