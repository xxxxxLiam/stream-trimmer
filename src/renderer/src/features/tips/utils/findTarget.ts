/**
 * File: findTarget.ts
 * Path: src/renderer/src/features/tips/utils/findTarget.ts
 * Description: The real control a tip step points at: the first element matching the selector, or, when several
 *   match (the tabs of a strip, the items of a menu), the one whose text or label is `withText`.
 */
export function findTarget(selector: string, withText?: string): Element | null {
  if (!withText) return document.querySelector(selector);
  const want = withText.trim().toLowerCase();
  const same = (s: string | null | undefined) => (s ?? "").trim().toLowerCase() === want;
  return Array.from(document.querySelectorAll(selector)).find((e) => same(e.textContent) || same(e.getAttribute("aria-label"))) ?? null;
}
