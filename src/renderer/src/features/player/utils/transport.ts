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

/** clockTime with tenths when the time has them ("1:12:04.3"): what a freely dragged handle shows. */
export function clockTimePrecise(seconds: number): string {
  const t = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 10) / 10) : 0;
  const tenth = Math.round((t - Math.floor(t)) * 10);
  return tenth === 0 ? clockTime(t) : `${clockTime(t)}.${tenth}`;
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

/** How early (seconds) before a section's end the jump to the next one is made, since the playhead is read every 200 ms. */
export const SECTION_LEAD = 0.25;

/**
 * A joined clip (two or more sections with gaps) plays only its sections: while playing, reaching a section's
 * end jumps over the gap to the next section's start; after the last one it wraps to the first when looping
 * and otherwise stops there. Before the first section or inside a gap it jumps forward to the next start.
 * One picked range (saved or not) plays alone the same way: play starts at its start and stops at its end.
 * Null when playback is fine where it is, and with no section at all (the whole video plays).
 */
export function joinedStep(
  sections: readonly Range[],
  t: number,
  loop: boolean,
): { kind: "seek"; to: number } | { kind: "stop"; at: number } | null {
  if (sections.length < 1) return null;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (t < s.start) return { kind: "seek", to: s.start };
    if (t < s.end - SECTION_LEAD) return null;
    if (t < s.end) {
      const next = sections[i + 1];
      if (next) return { kind: "seek", to: next.start };
      return loop ? { kind: "seek", to: sections[0].start } : { kind: "stop", at: s.end };
    }
    // At or past this section's end: the next one decides (or, after the last, loop or stop).
    if (i === sections.length - 1) return loop ? { kind: "seek", to: sections[0].start } : { kind: "stop", at: s.end };
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

/** Where Space means something else: typing in a field, flipping a switch or box, choosing in a menu or list. */
const PRESSABLE_TAGS = ["INPUT", "TEXTAREA", "SELECT", "SUMMARY"];
const PRESSABLE_ROLES = ["textbox", "searchbox", "combobox", "listbox", "switch", "checkbox", "radio", "menuitem", "menuitemradio", "menuitemcheckbox", "option"];

/**
 * Space is play and pause from anywhere (Liam, 25 Nov): on a panel row, a tool, a tab, a plain button or the
 * timeline too. Only where Space means something else does it keep that: a text field, a switch, box or radio,
 * and a menu or list choice.
 */
export function spacePresses(el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName && PRESSABLE_TAGS.includes(el.tagName.toUpperCase())) return true;
  const role = el.getAttribute?.("role");
  return !!role && PRESSABLE_ROLES.includes(role);
}
