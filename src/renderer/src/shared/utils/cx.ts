/**
 * File: cx.ts
 * Path: src/renderer/src/shared/utils/cx.ts
 * Description: Joins class names, skipping falsy parts.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
