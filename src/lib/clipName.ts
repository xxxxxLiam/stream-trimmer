/**
 * File: clipName.ts
 * Path: src/lib/clipName.ts
 * Description: The one rule for a clip's name. Exactly two words, letters and numbers only (a
 *   hyphen or apostrophe may sit between letters inside a word). The same name is the saved
 *   file's name and the Final Cut project's name, so nothing a file name cannot hold is ever
 *   allowed in. Pure: no storage, no React.
 */

const WORD = /^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u;
const DISALLOWED = /[^\p{L}\p{N}'’\- ]/gu;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

export type NameProblem = { line: number; name: string; reason: string };

/** Trimmed, with runs of spaces made single. */
export function tidyName(raw: string | null | undefined): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

export function sameName(a: string, b: string): boolean {
  return tidyName(a).toLowerCase() === tidyName(b).toLowerCase();
}

export function validateClipName(raw: string | null | undefined): NameCheck {
  const name = tidyName(raw);
  if (!name) {
    return { ok: false, reason: "This clip has no name. Every clip needs a name of exactly two words" };
  }
  const bad = [...new Set(name.match(DISALLOWED) ?? [])];
  if (bad.length > 0) {
    return {
      ok: false,
      reason: `"${name}" has characters that are not allowed: ${bad.join(" ")}. Use letters and numbers only`,
    };
  }
  const words = name.split(" ");
  if (words.length !== 2) {
    return {
      ok: false,
      reason: `"${name}" is ${words.length} ${words.length === 1 ? "word" : "words"}. A name must be exactly two`,
    };
  }
  if (!words.every((w) => WORD.test(w))) {
    return { ok: false, reason: `"${name}": a hyphen or apostrophe must sit between two letters` };
  }
  return { ok: true, name };
}

/**
 * Checks every clip in a paste before anything is stored: the name rule, names repeated inside
 * the paste, and names already in the bank. A clip that is re-imported under its own id is not a
 * duplicate of itself. One problem per line, in line order.
 */
export function checkNames(
  clips: ReadonlyArray<{ line: number; id: string | null; label: string }>,
  existing: ReadonlyArray<{ id: string; name: string }> = [],
): NameProblem[] {
  const problems = new Map<number, NameProblem>();
  const byName = new Map<string, Array<{ line: number; name: string }>>();

  for (const c of clips) {
    const check = validateClipName(c.label);
    if (!check.ok) {
      problems.set(c.line, { line: c.line, name: tidyName(c.label), reason: check.reason });
      continue;
    }
    const key = check.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), { line: c.line, name: check.name }]);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const lines = group.map((g) => g.line);
    for (const g of group) {
      const others = lines.filter((l) => l !== g.line).join(", ");
      problems.set(g.line, {
        line: g.line,
        name: g.name,
        reason: `"${g.name}" is also the name on line ${others}. Every name must be different`,
      });
    }
  }

  for (const c of clips) {
    if (problems.has(c.line)) continue;
    const check = validateClipName(c.label);
    if (!check.ok) continue;
    const clash = existing.find(
      (e) => sameName(e.name, check.name) && !(c.id && e.id.toLowerCase() === c.id.toLowerCase()),
    );
    if (clash) {
      problems.set(c.line, {
        line: c.line,
        name: check.name,
        reason: `"${check.name}" is already in the bank as ${clash.id}. Every name must be different`,
      });
    }
  }

  return [...problems.values()].sort((a, b) => a.line - b.line);
}
