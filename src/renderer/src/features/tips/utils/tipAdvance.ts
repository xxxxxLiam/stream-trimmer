/**
 * File: tipAdvance.ts
 * Path: src/renderer/src/features/tips/utils/tipAdvance.ts
 * Description: Does a key press or a click count as doing what a tip step asks? A step with `advanceOn`
 *   waits for the real action (I, O, Clip) instead of Next. Pure, so the rule is testable.
 */
import type { TipStep } from "./tipRegistry";

type KeyLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "repeat"
>;

/** True for the key a step waits for. "Mod+Enter" is Cmd or Ctrl with Enter; a plain letter has no modifier. */
export function keyAdvances(step: TipStep, e: KeyLike): boolean {
  const keys = step.advanceOn?.keys;
  if (!keys || e.repeat || e.altKey) return false;
  const mod = e.metaKey || e.ctrlKey;
  return keys.some((k) =>
    k === "Mod+Enter"
      ? mod && e.key === "Enter"
      : !mod && e.key.toLowerCase() === k.toLowerCase(),
  );
}

/** True when the click landed on (or inside) the control the step waits for. */
export function clickAdvances(step: TipStep, target: Element | null): boolean {
  const sel = step.advanceOn?.click;
  return !!sel && !!target?.closest(sel);
}

/** A key typed into a field is never the action. */
export function typingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable)
  );
}
