/**
 * File: dialogOpen.ts
 * Path: src/renderer/src/shared/utils/dialogOpen.ts
 * Description: Whether a drawer or dialog is open over the workspace. Single-letter shortcuts (the timeline
 *   tool keys, M for a flag) stay quiet while one is, so nothing changes behind it.
 */
export function dialogOpen(root: Pick<Document, "querySelector"> = document): boolean {
  return root.querySelector('[role="dialog"], [aria-modal="true"]') !== null;
}
