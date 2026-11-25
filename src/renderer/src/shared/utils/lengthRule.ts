/**
 * File: lengthRule.ts
 * Path: src/renderer/src/shared/utils/lengthRule.ts
 * Description: A campaign's optional clip length rule, said in words in the export bar. A clip that fits keeps
 *   the Ice length and reads "fits Acme's 0:30 to 1:00"; one outside it reads "14 s over Acme's 1:00" in plain
 *   text. Never red and never a block: the rule is the editor's to bend. No rule means "clip length".
 */
import { formatClock } from "./clock";

export type LengthRule = { min?: number; max?: number };
export type LengthVerdict = { state: "none" | "fits" | "out"; label: string };

/** The rule's two ends, or null when neither is set. A reversed pair is read the right way round. */
export function ruleOf(c: { lengthMinSec?: number; lengthMaxSec?: number } | null | undefined): LengthRule | null {
  if (!c || (!c.lengthMinSec && !c.lengthMaxSec)) return null;
  const a = c.lengthMinSec;
  const b = c.lengthMaxSec;
  if (a && b && a > b) return { min: b, max: a };
  return { min: a, max: b };
}

const gap = (n: number) => (n < 60 ? `${n} s` : formatClock(n));

export function lengthVerdict(totalSeconds: number, rule: LengthRule | null, campaignName: string): LengthVerdict {
  const total = Math.round(totalSeconds);
  if (!rule || total <= 0) return { state: "none", label: "clip length" };
  const who = `${campaignName}\u2019s`;
  if (rule.max !== undefined && total > rule.max) return { state: "out", label: `${gap(total - rule.max)} over ${who} ${formatClock(rule.max)}` };
  if (rule.min !== undefined && total < rule.min) return { state: "out", label: `${gap(rule.min - total)} under ${who} ${formatClock(rule.min)}` };
  const range =
    rule.min !== undefined && rule.max !== undefined
      ? `${formatClock(rule.min)} to ${formatClock(rule.max)}`
      : rule.min !== undefined
        ? `${formatClock(rule.min)} or more`
        : `up to ${formatClock(rule.max ?? 0)}`;
  return { state: "fits", label: `fits ${who} ${range}` };
}
